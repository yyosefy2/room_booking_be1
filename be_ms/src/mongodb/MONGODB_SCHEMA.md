# MongoDB Schema Documentation

## Overview

This document describes the MongoDB database schema for the room booking system. The system uses Mongoose ODM for schema definition, validation, and relationships.

## Collections

### 1. Users Collection

Stores user account information with authentication credentials.

**Schema:**
```javascript
{
  _id: ObjectId,
  email: String (unique, required, indexed),
  password_hash: String (required, hidden by default),
  name: String (optional),
  role: String (enum: ['user', 'admin'], default: 'user'),
  is_active: Boolean (default: true, indexed),
  created_at: Date (immutable),
  updated_at: Date
}
```

**Indexes:**
- `email` (unique)
- `is_active`

**Validations:**
- Email format validation
- Password hash required
- Name max length: 100 characters

**Virtual Fields:**
- `bookings`: References all bookings made by the user

**Instance Methods:**
- `toPublicJSON()`: Returns sanitized user data without sensitive information

**Static Methods:**
- `findActive()`: Find all active users

---

### 2. Rooms Collection

Stores information about bookable rooms/spaces.

**Schema:**
```javascript
{
  _id: ObjectId,
  name: String (required, indexed),
  description: String (optional, max 1000 chars),
  location: String (required, indexed),
  floor: Number (min: 0),
  capacity: Number (required, min: 1, max: 1000),
  price_cents: Number (required, min: 0, integer),
  amenities: [String],
  images: [String],
  is_active: Boolean (default: true, indexed),
  created_at: Date (immutable),
  updated_at: Date
}
```

**Indexes:**
- `name`
- `location`
- `is_active`
- Compound: `{ location: 1, is_active: 1 }`
- Compound: `{ capacity: 1, is_active: 1 }`

**Validations:**
- Name required, max 100 characters
- Location required, max 200 characters
- Capacity must be between 1-1000
- Price must be non-negative integer (cents)

**Virtual Fields:**
- `availability`: References all availability records for the room
- `price_dollars`: Computed field returning price in dollars

**Instance Methods:**
- `toPublicJSON()`: Returns formatted room data

**Static Methods:**
- `findActive()`: Find all active rooms

---

### 3. Availability Collection

Tracks day-by-day availability for each room.

**Schema:**
```javascript
{
  _id: ObjectId,
  room_id: ObjectId (ref: 'Room', required, indexed),
  date: Date (required, normalized to midnight UTC, indexed),
  total_units: Number (required, min: 0, integer),
  available_units: Number (required, min: 0, integer),
  created_at: Date (immutable),
  updated_at: Date
}
```

**Indexes:**
- `room_id`
- `date`
- Compound unique: `{ room_id: 1, date: 1 }` (prevents duplicates)
- Compound: `{ date: 1, available_units: 1 }`
- Compound: `{ room_id: 1, date: 1, available_units: 1 }`

**Validations:**
- Room ID must be valid ObjectId
- Date must be normalized to midnight UTC
- Available units cannot exceed total units
- Both units must be non-negative integers

**Relationships:**
- `room_id` references `Room._id`

**Pre-save Hooks:**
- Validates that `available_units <= total_units`

**Static Methods:**
- `findByRoomAndDateRange(roomId, startDate, endDate)`: Find availability for a room in date range
- `checkAvailability(roomId, startDate, endDate, quantity)`: Check if booking is possible

---

### 4. Bookings Collection

Stores room booking records.

**Schema:**
```javascript
{
  _id: ObjectId,
  user_id: ObjectId (ref: 'User', required, indexed),
  room_id: ObjectId (ref: 'Room', required, indexed),
  start_date: Date (required, indexed),
  end_date: Date (required, indexed),
  quantity: Number (default: 1, min: 1, max: 100, integer),
  total_price_cents: Number (required, min: 0, integer),
  status: String (enum: ['pending', 'confirmed', 'cancelled', 'completed'], indexed),
  cancellation_reason: String (optional, max 500 chars),
  cancelled_at: Date,
  notes: String (optional, max 1000 chars),
  created_at: Date (immutable, indexed),
  updated_at: Date
}
```

**Indexes:**
- `user_id`
- `room_id`
- `start_date`
- `end_date`
- `status`
- `created_at`
- Compound: `{ user_id: 1, created_at: -1 }`
- Compound: `{ room_id: 1, start_date: 1, end_date: 1 }`
- Compound: `{ start_date: 1, end_date: 1, status: 1 }`
- Compound: `{ status: 1, created_at: -1 }`

**Validations:**
- End date must be after start date
- Quantity must be between 1-100
- Total price must be non-negative integer
- Status must be one of: pending, confirmed, cancelled, completed

**Virtual Fields:**
- `nights`: Computed number of nights (end_date - start_date)
- `total_price_dollars`: Computed price in dollars

**Relationships:**
- `user_id` references `User._id`
- `room_id` references `Room._id`

**Pre-save Hooks:**
- Validates that `end_date > start_date`

**Instance Methods:**
- `cancel(reason)`: Cancel the booking and restore availability
- `toPublicJSON()`: Returns formatted booking data

**Static Methods:**
- `findActiveByUser(userId)`: Find all active bookings for a user
- `findByDateRange(startDate, endDate, status)`: Find bookings in date range
- `checkOverlap(roomId, startDate, endDate, excludeBookingId)`: Check for overlapping bookings

---

## Relationships Diagram

```
┌─────────────┐
│    User     │
│   (_id)     │
└──────┬──────┘
       │
       │ 1:N
       │
       ▼
┌─────────────┐      N:1      ┌─────────────┐
│   Booking   │ ───────────► │    Room     │
│  (user_id)  │              │   (_id)     │
│  (room_id)  │              └──────┬──────┘
└─────────────┘                     │
                                    │ 1:N
                                    │
                                    ▼
                            ┌──────────────┐
                            │ Availability │
                            │  (room_id)   │
                            └──────────────┘
```

## Data Consistency Mechanisms

### 1. Preventing Double Bookings

- **Distributed Lock**: Uses Redis to acquire locks on room resources during booking
- **Transactions**: Uses MongoDB transactions to ensure atomic operations
- **Availability Check**: Verifies available_units >= quantity before booking
- **Atomic Decrement**: Uses `$inc` operator to atomically decrement availability

### 2. Date Normalization

- All dates are normalized to midnight UTC to prevent time-based inconsistencies
- Utility function `normalizeDate(date)` ensures consistent date handling
- Validation enforces that dates in Availability collection are normalized

### 3. Transaction Flow (Booking)

```
1. Acquire Redis lock for room
2. Start MongoDB transaction
3. Verify room exists and is active
4. Calculate total price
5. For each date in range:
   - Check available_units >= quantity
   - Atomically decrement available_units
   - Abort if insufficient availability
6. Create booking record
7. Commit transaction
8. Release Redis lock
```

### 4. Cancellation Flow

```
1. Start MongoDB transaction
2. Verify booking exists and can be cancelled
3. Check cancellation policy (24 hours notice)
4. For each date in booking range:
   - Atomically increment available_units
5. Update booking status to 'cancelled'
6. Commit transaction
```

## Indexing Strategy

### Query Optimization

**Common Queries:**

1. **Search available rooms by date range**
   - Uses: `{ date: 1, available_units: 1 }` on Availability
   - Uses: `{ location: 1, is_active: 1 }` on Room for filtering

2. **Get user's bookings**
   - Uses: `{ user_id: 1, created_at: -1 }` on Booking

3. **Get room bookings by date**
   - Uses: `{ room_id: 1, start_date: 1, end_date: 1 }` on Booking

4. **Check booking conflicts**
   - Uses: `{ room_id: 1, date: 1, available_units: 1 }` on Availability

5. **Admin reports by status**
   - Uses: `{ status: 1, created_at: -1 }` on Booking

### Index Maintenance

Indexes are automatically created on application startup via `ensureIndexes()` function.

## Utility Functions

### `initializeAvailability(roomId, totalUnits, startDate, endDate)`
Creates availability records for a room across a date range.

**Usage:**
```javascript
const startDate = new Date('2025-01-01');
const endDate = new Date('2025-12-31');
await initializeAvailability(roomId, 5, startDate, endDate);
```

### `normalizeDate(date)`
Normalizes a date to midnight UTC.

**Usage:**
```javascript
const normalized = normalizeDate(new Date());
// Returns: 2025-11-27T00:00:00.000Z
```

### `getDateRange(startDate, endDate)`
Returns array of dates between start and end (inclusive).

**Usage:**
```javascript
const dates = getDateRange(new Date('2025-11-27'), new Date('2025-11-29'));
// Returns: [2025-11-27, 2025-11-28, 2025-11-29]
```

## Database Seeding

A seed script is provided to populate the database with sample data:

```bash
node src/seed.js
```

**Seeds:**
- 3 users (1 admin, 2 regular users)
- 6 rooms with various capacities
- 90 days of availability for each room
- 2 sample bookings

**Sample Credentials:**
- Admin: `admin@example.com` / `Admin123!`
- User: `john.doe@example.com` / `User123!`
- User: `jane.smith@example.com` / `User123!`

## Best Practices

### 1. Always Use Transactions for Bookings
```javascript
const session = await mongoose.startSession();
try {
  await session.startTransaction();
  // ... perform operations
  await session.commitTransaction();
} catch (error) {
  await session.abortTransaction();
  throw error;
} finally {
  session.endSession();
}
```

### 2. Use Date Normalization
```javascript
const startDate = normalizeDate(new Date(req.body.start_date));
```

### 3. Populate References for Complete Data
```javascript
const booking = await Booking.findById(id)
  .populate('user_id', 'email name')
  .populate('room_id', 'name location capacity');
```

### 4. Use Instance Methods for Business Logic
```javascript
// Good
await booking.cancel('User request');

// Avoid
booking.status = 'cancelled';
await booking.save();
```

### 5. Leverage Static Methods for Queries
```javascript
const bookings = await Booking.findActiveByUser(userId);
const availability = await Availability.findByRoomAndDateRange(roomId, start, end);
```

## Performance Considerations

1. **Index Coverage**: Most queries are covered by compound indexes
2. **Selective Population**: Only populate required fields to reduce data transfer
3. **Date Range Optimization**: Indexes on date fields enable efficient range queries
4. **Aggregation Pipeline**: Room search uses aggregation for efficient joins
5. **Connection Pooling**: Mongoose automatically manages connection pooling

## Migration Notes

When adding new fields or changing schema:

1. Update the schema definition in `mongodb.js`
2. Add appropriate indexes
3. Create a migration script if needed
4. Run `ensureIndexes()` to create new indexes
5. Update API endpoints and validation schemas
6. Update documentation

## Monitoring & Maintenance

### Recommended Monitoring

- Query performance (use MongoDB Profiler)
- Index usage (use `db.collection.getIndexes()` and `explain()`)
- Transaction abort rates
- Lock contention on booking operations
- Availability data integrity

### Maintenance Tasks

- Periodically archive old bookings (completed > 1 year)
- Clean up old availability records (past dates)
- Monitor and optimize slow queries
- Ensure indexes are being used effectively

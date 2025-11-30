# Room Booking System - Quick Reference

This quick reference describes how to run the backend locally using the repo's Docker Compose files and the API routes exposed by the current codebase.

Note: the backend API is mounted under `/api/v1` and the server listens on port `4000` by default.

## Quick Start

### Start (project root -> `be_ms`)
```powershell
cd .\be_ms
docker-compose up -d --build
```

### Stop and remove containers (project-level)
```powershell
cd .\be_ms
docker-compose down --remove-orphans
```

### Stop and remove containers + volumes (clears data)
```powershell
cd .\be_ms
docker-compose down --volumes --remove-orphans
```

---

## Useful Docker commands (PowerShell)

```powershell
# Show running containers for the compose project
cd .\be_ms
docker-compose ps

# Follow backend logs
docker-compose logs -f --tail=200 app

# Rebuild & restart only the app service
docker-compose up -d --build app

# Run a command inside the app container
docker-compose exec -T app node scripts/smoke-test.js
```

---

## NPM / project scripts

```powershell
# Start server (production image uses this)
npm start

# Local dev (if you have nodemon configured)
npm run dev

# Run the seeding script from the project root
node src/mongodb/seed.js
```

---

## Base URL

```
http://localhost:4000
```

### Health check

```
GET /alive
# Response: {"status":"alive"}
```

---

## Authentication

Register and login routes live under `/api/v1/users`.

#### Register

```
POST /api/v1/users/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "YourPass123",
  "name": "Full Name"
}
```

#### Login

```
POST /api/v1/users/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "YourPass123"
}

# Response: { "token": "<jwt>", "user": {...} }
```

---

## Rooms

All room endpoints use the `/api/v1/rooms` prefix.

#### Search rooms

```
GET /api/v1/rooms/search?start=YYYY-MM-DD&end=YYYY-MM-DD

# Query params used by the backend: `start` and `end` (YYYY-MM-DD)
```

#### Room details

```
GET /api/v1/rooms/:id
```

#### Room availability

```
GET /api/v1/rooms/:id/availability?start=YYYY-MM-DD&end=YYYY-MM-DD
```

---

## Bookings

Create and manage bookings under `/api/v1/booking` and `/api/v1/bookings`.

#### Create booking

```
POST /api/v1/booking
Authorization: Bearer <token>
Content-Type: application/json
Idempotency-Key: <optional-key>

{
  "room_id": "<room ObjectId>",
  "start_date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD",
  "quantity": 1,
  "notes": "optional"
}
```

#### Get user's bookings

```
GET /api/v1/bookings
Authorization: Bearer <token>
```

#### Get booking by id

```
GET /api/v1/bookings/:id
Authorization: Bearer <token>
```

#### Cancel booking

```
PATCH /api/v1/bookings/:id/cancel
Authorization: Bearer <token>
Content-Type: application/json

{ "reason": "optional reason" }
```

---

## cURL examples

```bash
# Register
curl -X POST http://localhost:4000/api/v1/users/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test12345","name":"Test"}'

# Login
curl -X POST http://localhost:4000/api/v1/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test12345"}'

# Search rooms
curl "http://localhost:4000/api/v1/rooms/search?start=2025-12-01&end=2025-12-02" \
  -H "Authorization: Bearer <TOKEN>"

# Create booking
curl -X POST http://localhost:4000/api/v1/booking \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Idempotency-Key: smoke-123" \
  -d '{"room_id":"<ROOM_ID>","start_date":"2025-12-01","end_date":"2025-12-02","quantity":1}'
```

---

## Direct DB access (compose project)

```powershell
cd .\be_ms
# Mongo shell (inside mongo container)
docker-compose exec -T mongo mongosh --quiet

# Redis CLI
docker-compose exec -T redis redis-cli
```

---

## Environment variables (examples)

```
# in docker-compose env or .env
PORT=4000
NODE_ENV=production
MONGO_URL=mongodb://mongo:27017/room_booking
REDIS_URL=redis://redis:6379
JWT_SECRET=your_jwt_secret
```

---

## Quick troubleshooting

- If the backend can't reach Mongo/Redis: `docker-compose ps` and `docker-compose logs app`.
- To wipe project data: `cd be_ms; docker-compose down --volumes --remove-orphans`.

---

End of quick reference.

### 1. Start System
```bash
docker compose -f docker-compose.dev.yml up -d --build
```

### 2. Seed Data
```bash
docker compose exec backend npm run seed
```

### 3. Test Authentication
```bash
# Register
curl -X POST http://localhost:4000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test123","name":"Tester"}'

# Login (save the token)
curl -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test123"}'
```

### 4. Test Booking Flow
```bash
# Search rooms
curl "http://localhost:4000/rooms/search?start_date=2025-12-10&end_date=2025-12-15"

# Create booking with the room_id from search results
curl -X POST http://localhost:4000/bookings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"room_id":"ROOM_ID","start_date":"2025-12-10","end_date":"2025-12-15","guest_count":2}'

# View bookings
curl http://localhost:4000/bookings -H "Authorization: Bearer YOUR_TOKEN"
```

---

## File Structure Reference

```
room_booking_be/
├── docker-compose.yml           # Production compose
├── docker-compose.dev.yml       # Development compose
├── package.json                 # Root package file
├── ARCHITECTURE.md              # Full architecture docs
├── QUICK_REFERENCE.md          # This file
│
└── be_ms/                       # Backend microservice
    ├── Dockerfile               # Container definition
    ├── package.json             # Backend dependencies
    ├── README.md                # Source code structure
    │
    ├── config/
    │   ├── config.json          # Application config
    │   └── schema.json          # Request validation schemas
    │
    └── src/
        ├── server.js            # Entry point
        ├── api.js               # API routes & logic
        │
        ├── mongodb/
        │   ├── index.js         # Schemas & models
        │   ├── seed.js          # Database seeding
        │   ├── dbUtils.js       # Maintenance utilities
        │   └── MONGODB_SCHEMA.md # Schema documentation
        │
        └── redis/
            └── index.js         # Redis connection & utilities
```

---

## Configuration Files

### config/config.json
```json
{
  "server": { "port": 4000 },
  "jwt": { "secret": "...", "expiresIn": "7d" },
  "database": {
    "mongodb": { "url": "..." },
    "redis": { "url": "..." }
  },
  "security": {
    "bcrypt": { "saltRounds": 10 },
    "rateLimit": { "windowMs": 60000, "max": 200 }
  }
}
```

### config/schema.json
Contains JSON Schema definitions for:
- RegisterRequest
- LoginRequest
- BookingRequest
- SearchRoomsQuery

---

## Rate Limiting

- **Window**: 60 seconds
- **Max Requests**: 200 per window
- **Response**: 429 Too Many Requests when exceeded

---

## Data Validation Rules

### Dates
- Format: `YYYY-MM-DD`
- Start date: Cannot be in the past
- End date: Must be after start date
- Max booking duration: 365 days

### Room Search
- start_date: Required
- end_date: Required
- capacity: Optional, minimum 1
- location: Optional, string

### Booking
- room_id: Required, valid ObjectId
- start_date: Required, valid date
- end_date: Required, valid date
- guest_count: Required, >= 1
- notes: Optional, max 500 characters

### User Registration
- email: Required, valid email format
- password: Required, min 6 characters
- name: Optional, max 100 characters

---

## Useful MongoDB Queries

```javascript
// Find available rooms for a date range
db.availability.aggregate([
  { $match: { date: { $gte: ISODate("2025-12-01"), $lte: ISODate("2025-12-05") } } },
  { $group: { _id: "$room_id", available_days: { $sum: { $cond: ["$is_available", 1, 0] } } } },
  { $match: { available_days: 5 } }
])

// Find user's active bookings
db.bookings.find({ user_id: ObjectId("..."), status: "active" })

// Room booking statistics
db.bookings.aggregate([
  { $group: { _id: "$room_id", total_bookings: { $sum: 1 }, total_revenue: { $sum: "$total_price_cents" } } },
  { $sort: { total_bookings: -1 } }
])
```

---

## Security Best Practices

### In Production
- [ ] Change JWT_SECRET to a strong random value
- [ ] Enable MongoDB authentication
- [ ] Enable Redis authentication
- [ ] Use HTTPS/TLS
- [ ] Set up firewall rules
- [ ] Regular security updates
- [ ] Monitor logs for suspicious activity
- [ ] Implement backup strategy

### Environment Security
```bash
# Never commit secrets to git
echo ".env" >> .gitignore

# Use strong passwords
# Use environment variables for secrets
# Rotate JWT secrets periodically
```

---

## Backup & Restore

### Backup
```bash
# MongoDB backup
docker compose exec mongodb mongodump --out=/backup --db=bookingdb
docker cp room-booking-mongodb:/backup ./backup-$(date +%Y%m%d)

# Redis backup
docker compose exec redis redis-cli SAVE
docker cp room-booking-redis:/data/dump.rdb ./redis-backup-$(date +%Y%m%d).rdb
```

### Restore
```bash
# MongoDB restore
docker cp ./backup room-booking-mongodb:/backup
docker compose exec mongodb mongorestore --db=bookingdb /backup/bookingdb

# Redis restore
docker cp ./dump.rdb room-booking-redis:/data/dump.rdb
docker compose restart redis
```

---

## Support & Documentation

- **Full Architecture**: See `ARCHITECTURE.md`
- **Schema Details**: See `be_ms/src/mongodb/MONGODB_SCHEMA.md`
- **Source Structure**: See `be_ms/README.md`
- **API Schemas**: See `be_ms/config/schema.json`

---

**Version:** 1.0.0  
**Last Updated:** November 27, 2025

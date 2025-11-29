const mongoose = require('mongoose');
const config = require('../../config/config.json');

// Holds runtime info about the connected MongoDB server
const serverInfo = {
  transactionsSupported: false,
};

/* CONFIG */
const MONGO_URL = process.env.MONGO_URL || config.database.mongodb.url;

// ---------------------- MONGOOSE CONNECTION ----------------------
const connectDB = async () => {
  try {
    await mongoose.connect(MONGO_URL, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log('MongoDB connected successfully');
        
    // Ensure indexes are created
    await ensureIndexes();

    // Detect whether server supports transactions (replica set or mongos)
    try {
      const admin = mongoose.connection.db.admin();
      let info;
      try {
        info = await admin.command({ hello: 1 });
      } catch (e) {
        // fallback for older servers
        info = await admin.command({ ismaster: 1 });
      }

      // logicalSessionTimeoutMinutes indicates session support; setName means replica set; msg === 'isdbgrid' indicates mongos
      if (info && info.logicalSessionTimeoutMinutes != null && (info.setName || info.msg === 'isdbgrid')) {
        serverInfo.transactionsSupported = true;
      } else {
        serverInfo.transactionsSupported = false;
      }

      console.log('MongoDB transactions supported:', serverInfo.transactionsSupported);
    } catch (e) {
      console.warn('Could not determine MongoDB transaction support:', e && e.message);
      serverInfo.transactionsSupported = false;
    }
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

// Connect to MongoDB
connectDB();

// ---------------------- USER SCHEMA ----------------------
const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    validate: {
      validator: function(v) {
        return /^[\w-]+(\.[\w-]+)*@([\w-]+\.)+[a-zA-Z]{2,7}$/.test(v);
      },
      message: props => `${props.value} is not a valid email address`,
    },
    index: true,
  },
  password_hash: {
    type: String,
    required: [true, 'Password hash is required'],
    select: false, // Don't include in queries by default
  },
  name: {
    type: String,
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters'],
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user',
  },
  is_active: {
    type: Boolean,
    default: true,
    index: true,
  },
  created_at: {
    type: Date,
    default: Date.now,
    immutable: true,
  },
  updated_at: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
});

// Virtual for user's bookings
UserSchema.virtual('bookings', {
  ref: 'Booking',
  localField: '_id',
  foreignField: 'user_id',
});

// Instance method to get public user data
UserSchema.methods.toPublicJSON = function() {
  return {
    id: this._id,
    email: this.email,
    name: this.name,
    role: this.role,
    created_at: this.created_at,
  };
};

// Static method to find active users
UserSchema.statics.findActive = function() {
  return this.find({ is_active: true });
};

// ---------------------- ROOM SCHEMA ----------------------
const RoomSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Room name is required'],
    trim: true,
    maxlength: [100, 'Room name cannot exceed 100 characters'],
    index: true,
  },
  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters'],
  },
  location: {
    type: String,
    trim: true,
    required: [true, 'Location is required'],
    maxlength: [200, 'Location cannot exceed 200 characters'],
    index: true,
  },
  floor: {
    type: Number,
    min: [0, 'Floor must be non-negative'],
  },
  capacity: {
    type: Number,
    required: [true, 'Capacity is required'],
    min: [1, 'Capacity must be at least 1'],
    max: [1000, 'Capacity cannot exceed 1000'],
  },
  price_cents: {
    type: Number,
    required: [true, 'Price is required'],
    min: [0, 'Price cannot be negative'],
    validate: {
      validator: Number.isInteger,
      message: 'Price must be an integer (cents)',
    },
  },
  amenities: [{
    type: String,
    trim: true,
  }],
  images: [{
    type: String,
    trim: true,
  }],
  is_active: {
    type: Boolean,
    default: true,
    index: true,
  },
  created_at: {
    type: Date,
    default: Date.now,
    immutable: true,
  },
  updated_at: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
});

// Compound index for location and active status queries
RoomSchema.index({ location: 1, is_active: 1 });

// Compound index for capacity-based searches
RoomSchema.index({ capacity: 1, is_active: 1 });

// Virtual for room's availability records
RoomSchema.virtual('availability', {
  ref: 'Availability',
  localField: '_id',
  foreignField: 'room_id',
});

// Virtual for price in dollars
RoomSchema.virtual('price_dollars').get(function() {
  return (this.price_cents / 100).toFixed(2);
});

// Instance method to format room data
RoomSchema.methods.toPublicJSON = function() {
  return {
    id: this._id,
    name: this.name,
    description: this.description,
    location: this.location,
    floor: this.floor,
    capacity: this.capacity,
    price_cents: this.price_cents,
    price_dollars: this.price_dollars,
    amenities: this.amenities,
    images: this.images,
    is_active: this.is_active,
  };
};

// Static method to find available rooms
RoomSchema.statics.findActive = function() {
  return this.find({ is_active: true });
};

// ---------------------- AVAILABILITY SCHEMA ----------------------
const AvailabilitySchema = new mongoose.Schema({
  room_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: [true, 'Room ID is required'],
    index: true,
  },
  date: {
    type: Date,
    required: [true, 'Date is required'],
    index: true,
    validate: {
      validator: function(v) {
        // Store dates at midnight UTC
        return v.getUTCHours() === 0 && v.getUTCMinutes() === 0 && 
                       v.getUTCSeconds() === 0 && v.getUTCMilliseconds() === 0;
      },
      message: 'Date must be normalized to midnight UTC',
    },
  },
  total_units: {
    type: Number,
    required: [true, 'Total units is required'],
    min: [0, 'Total units cannot be negative'],
    validate: {
      validator: Number.isInteger,
      message: 'Total units must be an integer',
    },
  },
  available_units: {
    type: Number,
    required: [true, 'Available units is required'],
    min: [0, 'Available units cannot be negative'],
    validate: {
      validator: Number.isInteger,
      message: 'Available units must be an integer',
    },
  },
  created_at: {
    type: Date,
    default: Date.now,
    immutable: true,
  },
  updated_at: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
});

// Compound unique index to prevent duplicate availability records
AvailabilitySchema.index({ room_id: 1, date: 1 }, { unique: true });

// Compound index for date range queries
AvailabilitySchema.index({ date: 1, available_units: 1 });

// Compound index for room availability queries
AvailabilitySchema.index({ room_id: 1, date: 1, available_units: 1 });

// Validation to ensure available_units <= total_units
AvailabilitySchema.pre('save', function() {
  if (this.available_units > this.total_units) {
    throw new Error('Available units cannot exceed total units');
  }
});

// Static method to find availability for a room in a date range
AvailabilitySchema.statics.findByRoomAndDateRange = function(roomId, startDate, endDate) {
  return this.find({
    room_id: roomId,
    date: { $gte: startDate, $lte: endDate },
  }).sort({ date: 1 });
};

// Static method to check if booking is possible
AvailabilitySchema.statics.checkAvailability = async function(roomId, startDate, endDate, quantity) {
  const availabilityRecords = await this.findByRoomAndDateRange(roomId, startDate, endDate);
    
  if (availabilityRecords.length === 0) {
    return { available: false, reason: 'No availability data' };
  }
    
  const unavailableDates = availabilityRecords.filter(
    record => record.available_units < quantity,
  );
    
  if (unavailableDates.length > 0) {
    return {
      available: false,
      reason: 'Insufficient availability',
      unavailable_dates: unavailableDates.map(r => r.date),
    };
  }
    
  return { available: true };
};

// ---------------------- BOOKING SCHEMA ----------------------
const BookingSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true,
  },
  room_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: [true, 'Room ID is required'],
    index: true,
  },
  start_date: {
    type: Date,
    required: [true, 'Start date is required'],
    index: true,
  },
  end_date: {
    type: Date,
    required: [true, 'End date is required'],
    index: true,
  },
  quantity: {
    type: Number,
    default: 1,
    min: [1, 'Quantity must be at least 1'],
    max: [100, 'Quantity cannot exceed 100'],
    validate: {
      validator: Number.isInteger,
      message: 'Quantity must be an integer',
    },
  },
  total_price_cents: {
    type: Number,
    required: [true, 'Total price is required'],
    min: [0, 'Price cannot be negative'],
    validate: {
      validator: Number.isInteger,
      message: 'Price must be an integer (cents)',
    },
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'cancelled', 'completed'],
    default: 'confirmed',
    index: true,
  },
  cancellation_reason: {
    type: String,
    trim: true,
    maxlength: [500, 'Cancellation reason cannot exceed 500 characters'],
  },
  cancelled_at: {
    type: Date,
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [1000, 'Notes cannot exceed 1000 characters'],
  },
  created_at: {
    type: Date,
    default: Date.now,
    immutable: true,
    index: true,
  },
  updated_at: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
});

// Compound indexes for efficient queries
BookingSchema.index({ user_id: 1, created_at: -1 });
BookingSchema.index({ room_id: 1, start_date: 1, end_date: 1 });
BookingSchema.index({ start_date: 1, end_date: 1, status: 1 });
BookingSchema.index({ status: 1, created_at: -1 });

// Validation to ensure end_date > start_date
BookingSchema.pre('save', function() {
  if (this.end_date <= this.start_date) {
    throw new Error('End date must be after start date');
  }
});

// Virtual for number of nights
BookingSchema.virtual('nights').get(function() {
  return Math.ceil((this.end_date - this.start_date) / (1000 * 60 * 60 * 24));
});

// Virtual for price in dollars
BookingSchema.virtual('total_price_dollars').get(function() {
  return (this.total_price_cents / 100).toFixed(2);
});

// Instance method to cancel booking
BookingSchema.methods.cancel = async function(reason) {
  if (this.status === 'cancelled') {
    throw new Error('Booking is already cancelled');
  }
    
  this.status = 'cancelled';
  this.cancellation_reason = reason;
  this.cancelled_at = new Date();
    
  await this.save();
    
  // Restore availability (should be done in a transaction in production)
  return this;
};

// Instance method to format booking data
BookingSchema.methods.toPublicJSON = function() {
  return {
    id: this._id,
    user_id: this.user_id,
    room_id: this.room_id,
    start_date: this.start_date,
    end_date: this.end_date,
    quantity: this.quantity,
    nights: this.nights,
    total_price_cents: this.total_price_cents,
    total_price_dollars: this.total_price_dollars,
    status: this.status,
    notes: this.notes,
    created_at: this.created_at,
  };
};

// Static method to find active bookings for a user
BookingSchema.statics.findActiveByUser = function(userId) {
  return this.find({
    user_id: userId,
    status: { $in: ['pending', 'confirmed'] },
  })
    .populate('room_id', 'name location capacity')
    .sort({ start_date: 1 });
};

// Static method to find bookings by date range
BookingSchema.statics.findByDateRange = function(startDate, endDate, status = null) {
  const query = {
    $or: [
      { start_date: { $gte: startDate, $lte: endDate } },
      { end_date: { $gte: startDate, $lte: endDate } },
      { start_date: { $lte: startDate }, end_date: { $gte: endDate } },
    ],
  };
    
  if (status) {
    query.status = status;
  }
    
  return this.find(query)
    .populate('user_id', 'email name')
    .populate('room_id', 'name location')
    .sort({ start_date: 1 });
};

// Static method to check for overlapping bookings (prevent double booking)
BookingSchema.statics.checkOverlap = async function(roomId, startDate, endDate, excludeBookingId = null) {
  const query = {
    room_id: roomId,
    status: { $in: ['pending', 'confirmed'] },
    $or: [
      { start_date: { $lt: endDate }, end_date: { $gt: startDate } },
    ],
  };
    
  if (excludeBookingId) {
    query._id = { $ne: excludeBookingId };
  }
    
  const overlapping = await this.find(query);
  return overlapping.length > 0;
};

// ---------------------- MODELS ----------------------
const User = mongoose.model('User', UserSchema);
const Room = mongoose.model('Room', RoomSchema);
const Availability = mongoose.model('Availability', AvailabilitySchema);
const Booking = mongoose.model('Booking', BookingSchema);

// ---------------------- INDEX MANAGEMENT ----------------------
async function ensureIndexes() {
  try {
    await User.createIndexes();
    await Room.createIndexes();
    await Availability.createIndexes();
    await Booking.createIndexes();
    console.log('Database indexes created successfully');
  } catch (error) {
    console.error('Error creating indexes:', error);
  }
}

// ---------------------- UTILITY FUNCTIONS ----------------------
/**
 * Initialize availability records for a room
 * @param {ObjectId} roomId - Room ID
 * @param {Number} totalUnits - Total units available per day
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 */
async function initializeAvailability(roomId, totalUnits, startDate, endDate) {
  const availabilityRecords = [];
  const currentDate = new Date(startDate);
  currentDate.setUTCHours(0, 0, 0, 0);
    
  const finalDate = new Date(endDate);
  finalDate.setUTCHours(0, 0, 0, 0);
    
  while (currentDate <= finalDate) {
    availabilityRecords.push({
      room_id: roomId,
      date: new Date(currentDate),
      total_units: totalUnits,
      available_units: totalUnits,
    });
    currentDate.setDate(currentDate.getDate() + 1);
  }
    
  try {
    await Availability.insertMany(availabilityRecords, { ordered: false });
    console.log(`Initialized ${availabilityRecords.length} availability records for room ${roomId}`);
  } catch (error) {
    // Ignore duplicate key errors (11000)
    if (error.code !== 11000) {
      throw error;
    }
  }
}

/**
 * Normalize date to midnight UTC
 * @param {Date} date - Date to normalize
 * @returns {Date} Normalized date
 */
function normalizeDate(date) {
  const normalized = new Date(date);
  normalized.setUTCHours(0, 0, 0, 0);
  return normalized;
}

/**
 * Get date range array
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Date[]} Array of dates
 */
function getDateRange(startDate, endDate) {
  const dates = [];
  const current = normalizeDate(startDate);
  const end = normalizeDate(endDate);
    
  while (current <= end) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
    
  return dates;
}

// ---------------------- EXPORTS ----------------------
module.exports = {
  mongoose,
  User,
  Room,
  Availability,
  Booking,
  ensureIndexes,
  initializeAvailability,
  normalizeDate,
  getDateRange,
  serverInfo,
};

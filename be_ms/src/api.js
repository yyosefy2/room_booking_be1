const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const config = require('../config/config.json');
const schema = require('../config/schema.json');
const { mongoose, User, Room, Availability, Booking, normalizeDate, getDateRange, serverInfo } = require('./mongodb');
const { acquireLock, releaseLock, getIdempotencyKey, setIdempotencyKey } = require('./redis');

const app = express();

// Allow all origins by reflecting the request origin — keeps credentials working
const corsOptions = {
  origin: true, // reflect request origin
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(bodyParser.json());

/* CONFIG */
const JWT_SECRET = process.env.JWT_SECRET || config.jwt.secret;

// ---------------------- JSON SCHEMA VALIDATION ----------------------
const ajv = new Ajv({ allErrors: true, removeAdditional: true });
addFormats(ajv);

// Add custom format for objectId
ajv.addFormat('objectId', {
  type: 'string',
  validate: (str) => /^[0-9a-fA-F]{24}$/.test(str),
});

// Compile validators from schema
const validators = {
  register: ajv.compile(schema.definitions.RegisterRequest),
  login: ajv.compile(schema.definitions.LoginRequest),
  booking: ajv.compile(schema.definitions.BookingRequest),
  searchRooms: ajv.compile(schema.definitions.SearchRoomsQuery),
};

// Format validation errors into user-friendly messages
function formatValidationErrors(errors) {
  return errors.map(err => {
    const field = err.instancePath.replace(/^\//g, '') || err.params.missingProperty;
    switch (err.keyword) {
    case 'required':
      return `${err.params.missingProperty} is required`;
    case 'type':
      return `${field} must be of type ${err.params.type}`;
    case 'format':
      return `${field} must be a valid ${err.params.format}`;
    case 'minLength':
      return `${field} must be at least ${err.params.limit} characters`;
    case 'minimum':
      return `${field} must be at least ${err.params.limit}`;
    case 'pattern':
      return `${field} format is invalid`;
    default:
      return err.message;
    }
  });
}

// Validation middleware factory
function validate(validatorName) {
  return (req, res, next) => {
    const validator = validators[validatorName];
    const data = req.method === 'GET' ? req.query : req.body;
        
    if (!validator(data)) {
      const errors = formatValidationErrors(validator.errors);
      return res.status(400).send({ 
        error: 'Validation failed', 
        details: errors,
      });
    }
    next();
  };
}

// Custom validation for date ranges
function validateDateRange(req, res, next) {
  const { start_date, end_date } = req.body;
  if (start_date && end_date) {
    const start = new Date(start_date);
    const end = new Date(end_date);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
        
    if (start < now) {
      return res.status(400).send({ error: 'Start date cannot be in the past' });
    }
    if (end < start) {
      return res.status(400).send({ error: 'End date must be after start date' });
    }
    if ((end - start) / (1000 * 60 * 60 * 24) > 365) {
      return res.status(400).send({ error: 'Booking period cannot exceed 365 days' });
    }
  }
  next();
}

// Custom validation for search date range
function validateSearchDateRange(req, res, next) {
  const { start, end } = req.query;
  if (start && end) {
    const startDate = new Date(start);
    const endDate = new Date(end);
        
    if (endDate < startDate) {
      return res.status(400).send({ error: 'End date must be after start date' });
    }
    if ((endDate - startDate) / (1000 * 60 * 60 * 24) > 365) {
      return res.status(400).send({ error: 'Search period cannot exceed 365 days' });
    }
  }
  next();
}

// ---------------------- RATE LIMIT ----------------------
app.use(rateLimit({ 
  windowMs: config.security.rateLimit.windowMs, 
  max: config.security.rateLimit.max, 
}));

// ---------------------- AUTH MIDDLEWARE ----------------------
function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h) return res.status(401).send({ error: 'Missing token' });

  const token = h.split(' ')[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).send({ error: 'Invalid token' });
  }
}

// ---------------------- REGISTER ----------------------
app.post('/api/v1/users/register', validate('register'), (req, res, next) => {
  const { password } = req.body;
    
  // Additional password strength validation
  if (password.length < 8) {
    return res.status(400).send({ error: 'Password must be at least 8 characters long' });
  }
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    return res.status(400).send({ error: 'Password must contain uppercase, lowercase, and numbers' });
  }
  next();
}, async (req, res) => {
  const { email, password, name } = req.body;

  try {
    const hash = await bcrypt.hash(password, config.security.bcrypt.saltRounds);

    const user = await User.create({
      email,
      password_hash: hash,
      name: name || null,
    });

    const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, {
      expiresIn: config.jwt.expiresIn,
    });

    res.status(201).send({ token, user: user.toPublicJSON() });
  } catch (err) {
    if (err.code === 11000)
      return res.status(409).send({ error: 'User exists' });
    if (err.name === 'ValidationError') {
      return res.status(400).send({ error: err.message });
    }

    console.error(err);
    res.status(500).send({ error: 'server error' });
  }
});

// ---------------------- LOGIN ----------------------
app.post('/api/v1/users/login', validate('login'), async (req, res) => {
  const { email, password } = req.body;

  try {
    // Include password_hash in query since it's excluded by default
    const user = await User.findOne({ email, is_active: true }).select('+password_hash');
    if (!user) return res.status(401).send({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).send({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user._id, email: user.email, role: user.role }, JWT_SECRET, {
      expiresIn: config.jwt.expiresIn,
    });

    res.send({
      token,
      user: user.toPublicJSON(),
    });
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: 'server error' });
  }
});

// ---------------------- SEARCH ROOMS ----------------------
app.get('/api/v1/rooms/search', auth, validate('searchRooms'), validateSearchDateRange, async (req, res) => {
  const { start, end } = req.query;

  try {
    const startDate = normalizeDate(new Date(start));
    const endDate = normalizeDate(new Date(end));

    // Aggregate availability with active rooms only
    const rooms = await Availability.aggregate([
      {
        $match: {
          date: { $gte: startDate, $lte: endDate },
          available_units: { $gt: 0 },
        },
      },
      {
        $group: {
          _id: '$room_id',
          minAvailable: { $min: '$available_units' },
          totalDays: { $sum: 1 },
        },
      },
      {
        $match: { minAvailable: { $gt: 0 } },
      },
      {
        $lookup: {
          from: 'rooms',
          localField: '_id',
          foreignField: '_id',
          as: 'room',
        },
      },
      { $unwind: '$room' },
      {
        $match: {
          'room.is_active': true,
        },
      },
      {
        $project: {
          id: '$room._id',
          name: '$room.name',
          description: '$room.description',
          location: '$room.location',
          floor: '$room.floor',
          capacity: '$room.capacity',
          price_cents: '$room.price_cents',
          amenities: '$room.amenities',
          images: '$room.images',
          available_units: '$minAvailable',
          free_units: '$minAvailable',
          available_days: '$totalDays',
        },
      },
      { $sort: { location: 1, name: 1 } },
    ]);

    res.send(rooms);
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: 'server error' });
  }
});

// ---------------------- BOOKING ----------------------
app.post('/api/v1/booking', auth, validate('booking'), validateDateRange, (req, res, next) => {
  const { quantity } = req.body;
  const qty = parseInt(quantity || 1, 10);
    
  if (qty < 1) {
    return res.status(400).send({ error: 'Quantity must be at least 1' });
  }
  if (qty > 100) {
    return res.status(400).send({ error: 'Quantity cannot exceed 100' });
  }
  next();
}, async (req, res) => {
  const { room_id, start_date, end_date, quantity, notes } = req.body;
  const userId = req.user.id;
  const userEmail = req.user.email || null;
  const qty = parseInt(quantity || 1, 10);

  // Redis idempotency
  const idemKey = req.header('Idempotency-Key') || null;
  if (idemKey) {
    const prev = await getIdempotencyKey(idemKey);
    if (prev) return res.status(200).send({ id: prev, idempotent: true });
  }

  // Redis lock
  const lockKey = `lock:room:${room_id}`;
  const token = uuidv4();
  const lock = await acquireLock(lockKey, token, config.booking.lockTimeout);
  if (!lock) return res.status(423).send({ error: 'Resource busy' });

  // Start a session only if server supports transactions
  const session = serverInfo && serverInfo.transactionsSupported ? await mongoose.startSession() : null;

  try {
    if (session) await session.startTransaction();

    let contactEmail = req.body.contact_email || null;
    if (contactEmail) {
      if (String(contactEmail).toLowerCase() !== String(userEmail).toLowerCase()) {
        if (session) await session.abortTransaction();
        return res.status(403).send({ error: 'contact_email must match authenticated user email' });
      }
    } else {
      contactEmail = userEmail;
    }

    // Verify room exists and is active
    const roomFindQ = Room.findOne({ _id: room_id, is_active: true });
    if (session) roomFindQ.session(session);
    const room = await roomFindQ;
    if (!room) {
      if (session) await session.abortTransaction();
      return res.status(404).send({ error: 'Room not found or inactive' });
    }

    const startDate = normalizeDate(new Date(start_date));
    const endDate = normalizeDate(new Date(end_date));
    const days = getDateRange(startDate, endDate);

    // Calculate total price
    const nights = days.length;
    const totalPrice = room.price_cents * nights * qty;

    // Decrement availability for each day
    for (const date of days) {
      let q = Availability.updateOne(
        {
          room_id: room_id,
          date,
          available_units: { $gte: qty },
        },
        { $inc: { available_units: -qty } },
      );
      if (session) q = q.session(session);

      const updated = await q;

      if (updated.modifiedCount === 0) {
        if (session) await session.abortTransaction();
        return res
          .status(409)
          .send({ error: `Insufficient availability for date ${date.toISOString().split('T')[0]}` });
      }
    }

    // Create booking with calculated price
    const createOpts = session ? { session } : undefined;
    // Verify contact_email belongs to authenticated user, or default to user's email
    // let contactEmail = req.body.contact_email || null;
    // if (contactEmail) {
    //   if (String(contactEmail).toLowerCase() !== String(userEmail).toLowerCase()) {
    //     if (session) await session.abortTransaction();
    //     return res.status(403).send({ error: 'contact_email must match authenticated user email' });
    //   }
    // } else {
    //   contactEmail = userEmail;
    // }

    const booking = await Booking.create(
      [
        {
          user_id: userId,
          room_id,
          start_date: startDate,
          end_date: endDate,
          quantity: qty,
          total_price_cents: totalPrice,
          status: 'confirmed',
          notes: notes || null,
          contact_email: contactEmail,
        },
      ],
      createOpts,
    );

    if (session) await session.commitTransaction();

    if (idemKey) {
      await setIdempotencyKey(idemKey, booking[0]._id.toString(), config.booking.idempotencyTTL);
    }

    // Populate room and user details
    const populatedBooking = await Booking.findById(booking[0]._id)
      .populate('room_id', 'name location capacity price_cents')
      .populate('user_id', 'email name');

    res.status(201).send({ booking: populatedBooking.toPublicJSON() });
  } catch (err) {
    console.error(err);
    if (session) await session.abortTransaction();
        
    if (err.name === 'ValidationError') {
      return res.status(400).send({ error: err.message });
    }
    if (err.name === 'CastError') {
      return res.status(400).send({ error: 'Invalid room ID format' });
    }
        
    res.status(500).send({ error: 'server error' });
  } finally {
    if (session) session.endSession();
    await releaseLock(lockKey, token);
  }
});

// ---------------------- GET USER BOOKINGS ----------------------
app.get('/api/v1/bookings', auth, async (req, res) => {
  try {
    const { status, start_date, end_date } = req.query;
    const userId = req.user.id;

    let query = { user_id: userId };

    // Filter by status if provided
    if (status) {
      query.status = status;
    }

    // Filter by date range if provided
    if (start_date || end_date) {
      query.$or = [];
      if (start_date && end_date) {
        const start = normalizeDate(new Date(start_date));
        const end = normalizeDate(new Date(end_date));
        query.$or.push(
          { start_date: { $gte: start, $lte: end } },
          { end_date: { $gte: start, $lte: end } },
          { start_date: { $lte: start }, end_date: { $gte: end } },
        );
      } else if (start_date) {
        const start = normalizeDate(new Date(start_date));
        query.$or.push({ start_date: { $gte: start } });
      } else if (end_date) {
        const end = normalizeDate(new Date(end_date));
        query.$or.push({ end_date: { $lte: end } });
      }
    }

    const bookings = await Booking.find(query)
      .populate('room_id', 'name location capacity price_cents amenities images')
      .sort({ start_date: -1, created_at: -1 });

    res.send({
      bookings: bookings.map(b => b.toPublicJSON()),
    });
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: 'server error' });
  }
});

// ---------------------- GET BOOKING BY ID ----------------------
app.get('/api/v1/bookings/:id', auth, async (req, res) => {
  try {
    const bookingId = req.params.id;
    const userId = req.user.id;

    const booking = await Booking.findOne({ _id: bookingId, user_id: userId })
      .populate('room_id', 'name description location floor capacity price_cents amenities images')
      .populate('user_id', 'email name');

    if (!booking) {
      return res.status(404).send({ error: 'Booking not found' });
    }

    res.send({ booking: booking.toPublicJSON() });
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).send({ error: 'Invalid booking ID format' });
    }
    console.error(err);
    res.status(500).send({ error: 'server error' });
  }
});

module.exports = app;

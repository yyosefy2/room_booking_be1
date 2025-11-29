/**
 * Database Seeding Script
 * 
 * This script initializes the database with sample data for development and testing.
 * It creates users, rooms, and availability records for the next 90 days.
 * 
 * Usage: node src/seed.js
 */

const bcrypt = require('bcryptjs');
const config = require('../../config/config.json');
const { mongoose, User, Room, Availability, Booking, initializeAvailability } = require('./index');

const MONGO_URL = process.env.MONGO_URL || config.database.mongodb.url;

async function waitForDb({ retries = 6, delay = 5000, timeoutMS = 30000 } = {}) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      if (mongoose.connection.readyState === 1) {
        return;
      }
      await mongoose.connect(MONGO_URL, { serverSelectionTimeoutMS: timeoutMS, socketTimeoutMS: 45000 });
      if (mongoose.connection.readyState === 1) return;
    } catch (err) {
      console.log(`[seed] DB connect attempt ${attempt} failed: ${err && err.message}`);
    }
    if (attempt < retries) {
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('Timeout waiting for MongoDB connection in seed script');
}

const SALT_ROUNDS = config.security.bcrypt.saltRounds;

// Sample data
const sampleUsers = [
  {
    email: 'admin@example.com',
    password: 'Admin123!',
    name: 'Admin User',
    role: 'admin',
  },
  {
    email: 'john.doe@example.com',
    password: 'User123!',
    name: 'John Doe',
    role: 'user',
  },
  {
    email: 'jane.smith@example.com',
    password: 'User123!',
    name: 'Jane Smith',
    role: 'user',
  },
];

const sampleRooms = [
  {
    name: 'Executive Conference Room A',
    description: 'Spacious conference room perfect for executive meetings and presentations',
    location: 'Building A, 5th Floor',
    floor: 5,
    capacity: 20,
    price_cents: 15000, // $150/day
    amenities: ['Projector', 'Whiteboard', 'Video Conference', 'WiFi', 'Coffee Machine'],
    images: ['https://example.com/room-a-1.jpg'],
    total_units: 1,
  },
  {
    name: 'Small Meeting Room B1',
    description: 'Cozy meeting room ideal for small team discussions',
    location: 'Building B, 2nd Floor',
    floor: 2,
    capacity: 6,
    price_cents: 5000, // $50/day
    amenities: ['Whiteboard', 'WiFi', 'TV Screen'],
    images: ['https://example.com/room-b1-1.jpg'],
    total_units: 2,
  },
  {
    name: 'Large Training Room C',
    description: 'Multi-purpose training room with flexible seating arrangements',
    location: 'Building C, 3rd Floor',
    floor: 3,
    capacity: 50,
    price_cents: 25000, // $250/day
    amenities: ['Projector', 'Sound System', 'Whiteboard', 'WiFi', 'Podium', 'Tables & Chairs'],
    images: ['https://example.com/room-c-1.jpg'],
    total_units: 1,
  },
  {
    name: 'Focus Room D',
    description: 'Private room for focused work or 1-on-1 meetings',
    location: 'Building A, 3rd Floor',
    floor: 3,
    capacity: 2,
    price_cents: 3000, // $30/day
    amenities: ['Desk', 'WiFi', 'Monitor'],
    images: ['https://example.com/room-d-1.jpg'],
    total_units: 5,
  },
  {
    name: 'Innovation Lab E',
    description: 'Modern collaboration space with standing desks and brainstorming tools',
    location: 'Building B, 4th Floor',
    floor: 4,
    capacity: 15,
    price_cents: 18000, // $180/day
    amenities: ['Whiteboard Walls', 'WiFi', 'Standing Desks', 'Creative Tools', 'Snacks'],
    images: ['https://example.com/room-e-1.jpg'],
    total_units: 1,
  },
];

/**
 * Clear existing data from database
 */
async function clearDatabase() {
  console.log('Clearing existing data...');
  await User.deleteMany({});
  await Room.deleteMany({});
  await Availability.deleteMany({});
  await Booking.deleteMany({});
  console.log('Database cleared successfully');
}

/**
 * Seed users
 */
async function seedUsers() {
  console.log('\nSeeding users...');
  const users = [];

  for (const userData of sampleUsers) {
    const password_hash = await bcrypt.hash(userData.password, SALT_ROUNDS);
        
    const user = await User.create({
      email: userData.email,
      password_hash,
      name: userData.name,
      role: userData.role,
    });

    users.push(user);
    console.log(`✓ Created user: ${user.email} (${user.role})`);
  }

  return users;
}

/**
 * Seed rooms
 */
async function seedRooms() {
  console.log('\nSeeding rooms...');
  const rooms = [];

  for (const roomData of sampleRooms) {
    const { total_units, ...roomFields } = roomData;
        
    const room = await Room.create(roomFields);
        
    rooms.push({ room, total_units });
    console.log(`✓ Created room: ${room.name} (${total_units} units)`);
  }

  return rooms;
}

/**
 * Seed availability for the next N days
 */
async function seedAvailability(rooms, days = 90) {
  console.log(`\nSeeding availability for next ${days} days...`);
    
  const startDate = new Date();
  startDate.setUTCHours(0, 0, 0, 0);
    
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + days);

  for (const { room, total_units } of rooms) {
    await initializeAvailability(room._id, total_units, startDate, endDate);
    console.log(`✓ Initialized availability for room: ${room.name}`);
  }
}

/**
 * Create sample bookings
 */
async function seedBookings(users, rooms) {
  console.log('\nSeeding sample bookings...');
    
  // Create a few sample bookings for testing
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
    
  const dayAfter = new Date(tomorrow);
  dayAfter.setDate(dayAfter.getDate() + 1);
    
  const nextWeek = new Date(tomorrow);
  nextWeek.setDate(nextWeek.getDate() + 7);
    
  const endNextWeek = new Date(nextWeek);
  endNextWeek.setDate(endNextWeek.getDate() + 2);

  const sampleBookings = [
    {
      user_id: users[1]._id, // John Doe
      room_id: rooms[0].room._id, // Executive Conference Room A
      start_date: tomorrow,
      end_date: dayAfter,
      quantity: 1,
      total_price_cents: rooms[0].room.price_cents,
      status: 'confirmed',
      notes: 'Team meeting',
    },
    {
      user_id: users[2]._id, // Jane Smith
      room_id: rooms[1].room._id, // Small Meeting Room B1
      start_date: nextWeek,
      end_date: endNextWeek,
      quantity: 1,
      total_price_cents: rooms[1].room.price_cents * 3,
      status: 'confirmed',
      notes: 'Project workshop',
    },
  ];

  for (const bookingData of sampleBookings) {
    const booking = await Booking.create(bookingData);
        
    // Decrement availability
    const current = new Date(bookingData.start_date);
    while (current <= bookingData.end_date) {
      await Availability.updateOne(
        {
          room_id: bookingData.room_id,
          date: new Date(current),
        },
        { $inc: { available_units: -bookingData.quantity } },
      );
      current.setDate(current.getDate() + 1);
    }
        
    console.log(`✓ Created booking: ${booking._id}`);
  }
}

/**
 * Main seeding function
 */
async function seed() {
  try {
    console.log('='.repeat(50));
    console.log('DATABASE SEEDING SCRIPT');
    console.log('='.repeat(50));

    // Wait for DB connection with retries
    await waitForDb({ retries: 12, delay: 5000, timeoutMS: 30000 });

    // Clear existing data
    await clearDatabase();

    // Seed data
    const users = await seedUsers();
    const rooms = await seedRooms();
    await seedAvailability(rooms);
    await seedBookings(users, rooms);

    console.log('\n' + '='.repeat(50));
    console.log('SEEDING COMPLETED SUCCESSFULLY!');
    console.log('='.repeat(50));
    console.log('\nSample credentials:');
    console.log('Admin: admin@example.com / Admin123!');
    console.log('User: john.doe@example.com / User123!');
    console.log('User: jane.smith@example.com / User123!');
    console.log('='.repeat(50));

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error seeding database:', error);
    process.exit(1);
  }
}

// Run the seeding script
seed();

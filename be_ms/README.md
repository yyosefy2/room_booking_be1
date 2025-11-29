# Source Code Structure

## Directory Organization

```
src/
├── mongodb/              # MongoDB related files
│   ├── index.js         # Schema definitions, models, and MongoDB utilities
│   ├── seed.js          # Database seeding script
│   └── dbUtils.js       # Database maintenance and utilities
│
├── redis/               # Redis related files
│   └── index.js         # Redis connection and utilities (locks, idempotency)
│
├── api.js               # Express API routes and endpoints
└── server.js            # Application entry point
```

## File Descriptions

### MongoDB Files (`src/mongodb/`)

**`index.js`** (formerly `mongodb.js`)
- Mongoose schema definitions for Users, Rooms, Availability, Bookings
- Model exports
- Database connection management
- Virtual fields and instance methods
- Static methods for common queries
- Index definitions
- Utility functions: `normalizeDate()`, `getDateRange()`, `initializeAvailability()`

**`seed.js`**
- Database seeding script
- Creates sample users, rooms, and availability
- Populates test data for development
- Run with: `npm run seed`

**`dbUtils.js`**
- Database health checks
- Index management
- Collection statistics
- Data cleanup utilities
- Consistency verification
- Available commands: check, indexes, stats, verify, cleanup, ensure-availability, all

### Redis Files (`src/redis/`)

**`index.js`** (formerly `redis.js`)
- Redis client connection
- Distributed locking mechanism (`acquireLock`, `releaseLock`)
- Idempotency key management (`getIdempotencyKey`, `setIdempotencyKey`)
- Lock utilities for preventing race conditions during bookings

### Application Files

**`api.js`**
- Express application setup
- API route definitions
- Authentication middleware
- Request validation
- Business logic for endpoints:
  - User registration and login
  - Room searching
  - Booking creation, retrieval, and cancellation
  - Room availability checking

**`server.js`**
- Application entry point
- Server initialization
- Port configuration
- Error handling middleware

## Import Examples

### Importing MongoDB utilities:
```javascript
const { mongoose, User, Room, Availability, Booking } = require("./mongodb");
const { normalizeDate, getDateRange } = require("./mongodb");
```

### Importing Redis utilities:
```javascript
const { acquireLock, releaseLock, getIdempotencyKey, setIdempotencyKey } = require("./redis");
```

## Running Scripts

All scripts work from the project root:

```bash
# Start the server
npm start

# Seed the database
npm run seed

# Database utilities
npm run db:check
npm run db:indexes
npm run db:stats
npm run db:verify
npm run db:cleanup
npm run db:ensure-availability
npm run db:all
```

## Module Resolution

Node.js automatically resolves `require("./mongodb")` to `./mongodb/index.js` and `require("./redis")` to `./redis/index.js`, making imports clean and organized.

## Enabling MongoDB Transactions Locally

By default, MongoDB transactions require the server to be running as a replica set (or through `mongos`). For local development you can enable transactions by starting a single-node replica set:

PowerShell example:

```powershell
# Start mongod with a data directory and replica set name (run in separate shell)
mongod --dbpath C:\data\db --replSet rs0 --bind_ip 127.0.0.1

# In another shell, initiate the replica set via the mongo shell
mongo --eval "rs.initiate()"
```

After this, restart the application and the server will detect that transactions are supported. If transactions are not available the app will automatically fall back to non-transactional behavior (atomicity guarantees will be weaker).

## Docker Compose (recommended for dev)

This repository includes a `Dockerfile` and `docker-compose.yml` which brings up a MongoDB single-node replica set, runs the seed script, and starts the app.

Run the following from the `be_ms` directory:

```powershell
docker-compose up --build
```

Alternatively use the included npm helper (runs compose and follows logs):

```powershell
npm run docker:compose:all
```

If you only want to build and start detached, use:

```powershell
npm run docker:compose:up
```

Notes:
- The compose file uses `mongo:6.0` and starts it with `--replSet rs0` so transactions are available.
- The app service waits for Mongo to be healthy, initiates the replica set (`INIT_REPLSET=1`), runs the database seed (`RUN_SEED=1`), then starts the server.

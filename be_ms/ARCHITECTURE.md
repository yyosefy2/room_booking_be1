# Room Booking System - Architecture Documentation

## Table of Contents
1. [System Overview](#system-overview)
2. [Architecture Design](#architecture-design)
3. [Technology Stack](#technology-stack)
4. [System Components](#system-components)
5. [Docker Infrastructure](#docker-infrastructure)
6. [Data Flow](#data-flow)
7. [API Design](#api-design)
8. [Security Architecture](#security-architecture)
9. [Deployment](#deployment)

---

## System Overview

The Room Booking System is a microservices-based backend application designed to manage room reservations, user authentication, and availability tracking. The system provides a RESTful API for room search, booking, and user management operations.

### Key Features
- User registration and authentication (JWT-based)
- Room search and filtering by date, capacity, and location
- Real-time availability tracking
- Concurrent booking prevention with distributed locking
- Idempotency support for safe retries
- Rate limiting and input validation
- Database seeding and maintenance utilities

---

## Architecture Design

### Microservices Architecture
The system follows a microservices pattern with the following characteristics:

```
┌─────────────────────────────────────────────────────────────┐
│                        Client Layer                          │
│                   (Web/Mobile Applications)                  │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP/REST
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                     API Gateway Layer                        │
│                   (Express.js Backend)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │    Auth      │  │   Booking    │  │    Room      │     │
│  │   Routes     │  │   Routes     │  │   Routes     │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└──────────┬───────────────────┬────────────────────┬─────────┘
           │                   │                    │
           ▼                   ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   MongoDB       │  │     Redis       │  │  JSON Schema    │
│   Database      │  │     Cache       │  │   Validation    │
│                 │  │  & Locking      │  │                 │
│ • Users         │  │ • Locks         │  │ • Request       │
│ • Rooms         │  │ • Idempotency   │  │   Validation    │
│ • Availability  │  │ • Sessions      │  │ • Type Safety   │
│ • Bookings      │  │                 │  │                 │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

### Design Principles
- **Separation of Concerns**: Each module handles specific functionality
- **Stateless API**: No server-side session state (JWT tokens)
- **Distributed Locking**: Redis-based locks prevent race conditions
- **Idempotency**: Safe request retries with Redis-backed idempotency keys
- **Data Validation**: JSON Schema validation for all inputs
- **Health Monitoring**: Built-in health checks and monitoring endpoints

---

## Technology Stack

### Core Technologies
| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| Runtime | Node.js | 18.x | JavaScript runtime |
| Framework | Express.js | 4.x | Web framework |
| Database | MongoDB | 6.x | Document database (configured as single-node replica set to support transactions)
| Cache/Lock | Redis | 7.x | In-memory data store |
| ODM | Mongoose | 6/7 compatible | MongoDB object modeling |
| Container | Docker | Engine compatible | Containerization |
| Orchestration | Docker Compose | v2 CLI (compose v1 format) | Local multi-container orchestration |

### Key Libraries
| Library | Purpose |
|---------|---------|
| `bcrypt` | Password hashing |
| `jsonwebtoken` | JWT authentication |
| `express-rate-limit` | API rate limiting |
| `ajv` + `ajv-formats` | JSON schema validation |
| `ioredis` | Redis client |
| `uuid` | Unique ID generation |
| `nodemon` | Development auto-reload |

---

## System Components

### 1. Backend Service (`be_ms/`)

#### API Layer (`src/api.js`)
- **Authentication**: Registration, login, JWT validation
- **Room Management**: Search, listing, availability queries
- **Booking Operations**: Create, view, cancel bookings
- **Middleware**: Validation, authentication, rate limiting
- **Error Handling**: Global error handler with logging

#### Server (`src/server.js`)
- Express server initialization
- Route registration
- Health check endpoint (`/alive`)
- Error middleware setup

#### MongoDB Module (`src/mongodb/`)
- **Schema Definitions**: Users, Rooms, Availability, Bookings
- **Database Connection**: Mongoose connection management
- **Utilities**: Date normalization, availability initialization
- **Maintenance**: Database utilities for health checks and cleanup
- **Seeding**: Test data population scripts

#### Redis Module (`src/redis/`)
- **Connection Management**: Redis client setup
- **Distributed Locking**: Acquire/release locks for concurrent operations
- **Idempotency**: Request deduplication with TTL keys
- **Session Storage**: Future support for session management

#### Configuration (`config/`)
- **config.json**: Server, database, and security settings
- **schema.json**: JSON schema definitions for request validation

---

## Docker Infrastructure

### Container Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Docker Network                            │
│                (room-booking-network)                        │
│                                                              │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   │
│  │   MongoDB    │   │    Redis     │   │   Backend    │   │
│  │  Container   │   │  Container   │   │  Container   │   │
│  │              │   │              │   │              │   │
│  │  Port: 27017 │   │  Port: 6379  │   │  Port: 4000  │   │
│  │              │   │              │   │              │   │
│  │  Health: ✓   │   │  Health: ✓   │   │  Health: ✓   │   │
│  └──────┬───────┘   └──────┬───────┘   └──────┬───────┘   │
│         │                  │                  │            │
│         ▼                  ▼                  ▼            │
│  ┌──────────────────────────────────────────────────┐     │
│  │           Persistent Volumes                      │     │
│  │  • mongodb_data (Database files)                 │     │
│  │  • redis_data (Cache persistence)                │     │
│  └──────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

### Dockerfile (`be_ms/Dockerfile`)
```dockerfile
# Multi-stage build potential, currently single-stage
FROM node:18-alpine       # Lightweight base image
WORKDIR /app              # Set working directory
COPY package*.json ./     # Copy dependency files
RUN npm ci --only=production  # Install production deps
COPY . .                  # Copy application code
EXPOSE 4000               # Expose API port
CMD ["npm", "start"]      # Start application
```

**Key Features:**
- Alpine Linux base for minimal image size
- Production-only dependencies
- No development tools in production image
- Health check compatible

### Docker Compose Files

#### Production (`docker-compose.yml`)
```yaml
services:
  mongo:
    - Uses official `mongo:6.0` image started with `--replSet rs0` (single-node replica set)
    - Persistent volume mounted at `/data/db`
    - Health check uses a ping via `mongosh`/`mongo`

  mongo-init:
    - Helper service used to call `rs.initiate()` against `mongo` so the replset is configured

  redis:
    - Uses official `redis:7` image
    - Optional persistent volume for Redis data

  app:
    - Builds from repository `Dockerfile` and is exposed on port `4000`
    - Environment: `MONGO_URL`, `REDIS_URL`, `RUN_SEED=1` (for seeding behavior), `INIT_REPLSET=1` (when used)
    - Entrypoint waits for mongo + replset, runs seed (if enabled) then starts the server
```

**Features:**
- Service dependencies with health checks
- Automatic restart policies
- Named volumes for data persistence
- Isolated bridge network
- Production environment settings

#### Development (`docker-compose.dev.yml`)
```yaml
Additional features for development:
  - Hot-reload with nodemon
  - Source code volume mounts
  - Config file volume mounts
  - Separate dev volumes and network
  - Development-specific containers
```

**Development Advantages:**
- Code changes reflect immediately (no rebuild)
- Easier debugging with mounted volumes
- Separate data from production
- Uses `npm run dev` for auto-restart

### Docker Commands

```bash
# Production deployment
docker compose up -d --build

# Development deployment
docker compose -f docker-compose.dev.yml up -d --build

# View logs
docker compose logs -f backend

# Stop services
docker compose down

# Reset (remove volumes)
docker compose down -v

# Check service health
docker compose ps
```

---

## Data Flow

### Authentication Flow
```
1. User Registration
   Client → POST /auth/register → Validate → Hash Password → Save User → Return JWT

2. User Login
   Client → POST /auth/login → Validate → Check Password → Generate JWT → Return Token

3. Protected Request
   Client (with JWT) → Middleware → Verify JWT → Attach User → Route Handler
```

### Booking Flow
```
1. Search Available Rooms
   Client → GET /rooms/search?dates → Query MongoDB → Return Available Rooms

2. Create Booking
   Client → POST /bookings → Validate → Check Idempotency Key
   → Acquire Redis Lock → Check Availability → Create Booking
   → Update Availability → Release Lock → Return Booking

3. Cancel Booking
   Client → DELETE /bookings/:id → Verify Ownership → Acquire Lock
   → Cancel Booking → Restore Availability → Release Lock → Confirm
```

### Concurrent Request Handling
```
Request 1 ─┐
           ├→ Acquire Lock → Process → Release Lock
Request 2 ─┤     ↓
           │   Wait...
Request 3 ─┘     ↓
              Acquire Lock → Process → Release Lock
```

---

## API Design

### Endpoint Structure

```
/api/v1/users
  POST   /register        - Create new user account
  POST   /login           - Authenticate and get JWT token

/api/v1/rooms
  GET    /search         - Search rooms with date range (start/end query params)
  GET    /:id            - Get room details
  GET    /:id/availability - Get room availability in a date range

/api/v1/booking
  POST   /               - Create new booking

/api/v1/bookings
  GET    /               - Get user's bookings
  GET    /:id            - Get booking details
  PATCH  /:id/cancel     - Cancel booking (updates booking status and restores availability)

/alive
  GET    /               - Health check endpoint
```

### Request/Response Format

**Standard Success Response:**
```json
{
  "data": { ... },
  "message": "Success message"
}
```

**Standard Error Response:**
```json
{
  "error": "Error message",
  "details": ["validation error 1", "validation error 2"]
}
```

### HTTP Status Codes
- `200 OK` - Successful GET, DELETE
- `201 Created` - Successful POST
- `400 Bad Request` - Validation errors
- `401 Unauthorized` - Missing/invalid JWT
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `409 Conflict` - Booking conflict
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server errors

---

## Security Architecture

### Authentication & Authorization
- **JWT Tokens**: Stateless authentication with 7-day expiration
- **Password Hashing**: bcrypt with configurable salt rounds (10)
- **Token Validation**: Middleware validates JWT on protected routes
- **Role-Based Access**: User and admin roles (future expansion)

### Input Validation
- **JSON Schema**: All requests validated against strict schemas
- **Type Checking**: Enforce correct data types
- **Format Validation**: Email, date, ObjectId formats
- **Range Validation**: Min/max values, string lengths
- **Sanitization**: Remove additional properties

### Rate Limiting
```javascript
{
  windowMs: 60000,    // 1 minute window
  max: 200            // 200 requests per window
}
```

### Concurrency Protection
- **Distributed Locks**: Redis-based locks for booking operations
- **Lock Timeout**: 10-second automatic release
- **Idempotency Keys**: 24-hour TTL for duplicate prevention
- **Optimistic Locking**: Mongoose version keys

### Data Protection
- **Password Storage**: Never store plain text passwords
- **Sensitive Data**: Exclude password_hash from API responses
- **Environment Variables**: Secret keys from environment
- **Connection Security**: MongoDB and Redis password protection (recommended)

---

## Deployment

### Environment Variables (examples)

```bash
# Application
PORT=4000
NODE_ENV=production

# Database (service name used in docker-compose)
MONGO_URL=mongodb://mongo:27017/room_booking

# Redis
REDIS_URL=redis://redis:6379

# JWT
JWT_SECRET=your_jwt_secret
```

### Production Deployment Steps

1. **Prerequisites**
   ```bash
   # Install Docker and Docker Compose
   docker --version
   docker compose version
   ```

2. **Configuration**
   ```bash
   # Create environment file (optional)
   cp .env.example .env
   # Edit .env with production values
   ```

3. **Build and Deploy**
   ```bash
   # Build and start all services
   docker compose up -d --build
   
   # Check service status
   docker compose ps
   
   # View logs
   docker compose logs -f
   ```

4. **Initialize Database**
   ```bash
   # Seed database with initial data (optional)
   docker compose exec backend npm run seed
   
   # Verify database health
   docker compose exec backend npm run db:check
   ```

5. **Health Verification**
   ```bash
   # Check API health
   curl http://localhost:4000/alive
   
   # Should return: {"status":"alive"}
   ```

### Development Deployment

```bash
# Start development environment
docker compose -f docker-compose.dev.yml up -d --build

# Watch logs
docker compose -f docker-compose.dev.yml logs -f backend

# Code changes auto-reload via nodemon
```

### Scaling Considerations

**Horizontal Scaling:**
- Backend service can scale horizontally (multiple instances)
- Redis provides distributed locking across instances
- MongoDB supports replica sets for high availability

**Load Balancing:**
- Add nginx/HAProxy in front of backend instances
- Use Docker Swarm or Kubernetes for orchestration

**Database Scaling:**
- MongoDB replica sets for read scaling
- Sharding for large datasets
- Redis cluster for high availability

### Monitoring & Maintenance

```bash
# Database utilities
npm run db:check           # Health check
npm run db:stats           # Collection statistics
npm run db:indexes         # Index information
npm run db:verify          # Data consistency check
npm run db:cleanup         # Remove old/invalid data
npm run db:all             # Run all checks

# Container management
docker compose logs -f     # Follow logs
docker compose ps          # Service status
docker stats               # Resource usage
docker compose restart backend  # Restart service
```

### Backup Strategy

```bash
# MongoDB backup
docker compose exec mongodb mongodump --out=/backup
docker cp room-booking-mongodb:/backup ./backup

# Redis backup (RDB snapshot)
docker compose exec redis redis-cli BGSAVE
```

### Troubleshooting

**Backend won't start:**
- Check if MongoDB and Redis are healthy
- Verify environment variables
- Check logs: `docker compose logs backend`

**Connection errors:**
- Ensure all services are on the same network
- Verify service names in connection strings
- Check firewall rules

**Performance issues:**
- Monitor with `docker stats`
- Check database indexes: `npm run db:indexes`
- Review application logs for slow queries

---

## Future Enhancements

### Planned Features
- [ ] Admin dashboard for room management
- [ ] Email notifications for bookings
- [ ] Payment integration
- [ ] Room calendar view
- [ ] Booking modifications
- [ ] Multi-day booking optimization
- [ ] Reporting and analytics
- [ ] Real-time availability updates (WebSocket)

### Technical Improvements
- [ ] API documentation (Swagger/OpenAPI)
- [ ] Automated testing (Jest/Mocha)
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Logging aggregation (ELK stack)
- [ ] Metrics collection (Prometheus)
- [ ] Distributed tracing
- [ ] GraphQL API option
- [ ] Caching layer for search results

---

## Additional Resources

- [MongoDB Schema Documentation](./be_ms/src/mongodb/MONGODB_SCHEMA.md)
- [Source Code Structure](./be_ms/README.md)
- [Quick Reference Guide](./QUICK_REFERENCE.md)
- [API Schema Definitions](./be_ms/config/schema.json)

---

**Last Updated:** November 27, 2025  
**Version:** 1.0.0  
**Maintainer:** Development Team

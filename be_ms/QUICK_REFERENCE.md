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
# Quick Reference — API Only

This file documents only the API endpoints implemented in `be_ms/src/api.js`.

Base URL: `http://localhost:4000`

All routes are under the `/api/v1` prefix.

1) Register

POST /api/v1/users/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "YourPass123",
  "name": "Full Name"
}

Success: 201 Created — returns `{ token, user }`.

2) Login

POST /api/v1/users/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "YourPass123"
}

Success: 200 — returns `{ token, user }`.

3) Search rooms

GET /api/v1/rooms/search?start=YYYY-MM-DD&end=YYYY-MM-DD
Authorization: Bearer <token>

Query params:
- `start` (required) — start date (YYYY-MM-DD)
- `end` (required) — end date (YYYY-MM-DD)

Success: 200 — returns an array of available rooms with `available_units` and `available_days`.

4) Create booking

POST /api/v1/booking
Authorization: Bearer <token>
Content-Type: application/json
Idempotency-Key: <optional-key>

Body:
{
  "room_id": "<room ObjectId>",
  "start_date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD",
  "quantity": 1,
  "notes": "optional",
  "contact_email": "optional (must match authenticated user if provided)"
}

Success: 201 — returns `{ booking: <booking object> }`.

Errors:
- 400 Validation errors
- 401 Missing/invalid token
- 403 contact_email mismatch
- 409 Insufficient availability
- 423 Resource busy (lock)

Notes:
- The server enforces availability per day and uses a Redis lock to serialize booking attempts per room. Provide an `Idempotency-Key` for safe client retries.

Example cURL (search + booking):

```bash
# Search
curl "http://localhost:4000/api/v1/rooms/search?start=2025-12-01&end=2025-12-02" \
  -H "Authorization: Bearer <TOKEN>"

# Create booking
curl -X POST http://localhost:4000/api/v1/booking \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Idempotency-Key: mykey-123" \
  -d '{"room_id":"<ROOM_ID>","start_date":"2025-12-01","end_date":"2025-12-02","quantity":1,"contact_email":"user@example.com"}'
```

This file intentionally documents only the routes implemented in `be_ms/src/api.js`.

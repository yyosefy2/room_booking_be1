#!/bin/sh
set -e

# Clean POSIX entrypoint: wait for Mongo TCP, wait for replset readiness, optionally run seed, then exec app.

echo "[entrypoint] Parsing MONGO_URL..."
MONGO_HOSTPORT="${MONGO_URL:-mongodb://mongodb:27017}"

MONGO_HOST=""
MONGO_PORT=""
if echo "$MONGO_HOSTPORT" | grep -q "mongodb://"; then
  MONGO_HOST=$(echo "$MONGO_HOSTPORT" | sed -E 's#mongodb://([^/:]+):?([0-9]*).*#\1#')
  MONGO_PORT=$(echo "$MONGO_HOSTPORT" | sed -E 's#mongodb://([^/:]+):?([0-9]*).*#\2#')
fi

MONGO_HOST=${MONGO_HOST:-mongodb}
MONGO_PORT=${MONGO_PORT:-27017}

echo "[entrypoint] Waiting for MongoDB at $MONGO_HOST:$MONGO_PORT..."
if [ -f ./scripts/wait-for-tcp.js ]; then
  node ./scripts/wait-for-tcp.js "$MONGO_HOST" "$MONGO_PORT" 60
else
  COUNT=0
  while ! nc -z "$MONGO_HOST" "$MONGO_PORT" 2>/dev/null; do
    COUNT=$((COUNT+1))
    if [ "$COUNT" -gt 60 ]; then
      echo "[entrypoint] timeout waiting for $MONGO_HOST:$MONGO_PORT"
      exit 1
    fi
    echo "[entrypoint] waiting for $MONGO_HOST:$MONGO_PORT... ($COUNT)"
    sleep 1
  done
fi

echo "[entrypoint] MongoDB reachable"

# Wait for replset readiness (server reports session support) before seeding. This helps ensure mongoose can connect.
if [ -f ./scripts/wait-for-replset.js ]; then
  echo "[entrypoint] Waiting for replica set readiness before seeding (60s)"
  node ./scripts/wait-for-replset.js "$MONGO_HOST" "$MONGO_PORT" 60 || true
fi

if [ "${RUN_SEED}" = "true" ] || [ "${RUN_SEED}" = "1" ]; then
  echo "[entrypoint] RUN_SEED enabled - running seed script"
  if [ -f ./src/mongodb/seed.js ]; then
    echo "[entrypoint] Running mongodb seed: node src/mongodb/seed.js"
    node ./src/mongodb/seed.js || {
      echo "[entrypoint] mongodb seed failed" >&2
    }
  else
    npm run seed || {
      echo "[entrypoint] npm seed failed" >&2
    }
  fi
fi

echo "[entrypoint] Starting app: $@"
exec "$@"
#!/bin/sh
set -e

# Simple entrypoint: wait for MongoDB host:port to be available before starting.
# Optionally run seed when RUN_SEED=true

echo "[entrypoint] Parsing MONGO_URL..."
MONGO_HOSTPORT="${MONGO_URL:-mongodb://mongodb:27017}"

# Extract host and port (supports simple mongodb://host:port/DB)
MONGO_HOST=""
MONGO_PORT=""

if echo "$MONGO_HOSTPORT" | grep -q "mongodb://"; then
  MONGO_HOST=$(echo "$MONGO_HOSTPORT" | sed -E 's#mongodb://([^/:]+):?([0-9]*).*#\1#')
  MONGO_PORT=$(echo "$MONGO_HOSTPORT" | sed -E 's#mongodb://([^/:]+):?([0-9]*).*#\2#')
fi

# Fallback defaults
MONGO_HOST=${MONGO_HOST:-mongodb}
MONGO_PORT=${MONGO_PORT:-27017}

echo "[entrypoint] Waiting for MongoDB at $MONGO_HOST:$MONGO_PORT..."

# Wait for TCP port to be open. Prefer node helper if present.
if [ -f ./scripts/wait-for-tcp.js ]; then
  node ./scripts/wait-for-tcp.js "$MONGO_HOST" "$MONGO_PORT" 60
else
  COUNT=0
  while ! nc -z "$MONGO_HOST" "$MONGO_PORT" 2>/dev/null; do
    COUNT=$((COUNT+1))
    if [ "$COUNT" -gt 60 ]; then
      echo "[entrypoint] timeout waiting for $MONGO_HOST:$MONGO_PORT"
      exit 1
    fi
    echo "[entrypoint] waiting for $MONGO_HOST:$MONGO_PORT... ($COUNT)"
    sleep 1
  done
fi

echo "[entrypoint] MongoDB reachable"

# Attempt to initiate replica set (prefer mongosh) by using a one-shot init service (mongo-init)
# If a replset isn't ready yet, wait until the server reports session support before running seed.
if [ -f ./scripts/wait-for-replset.js ]; then
  echo "[entrypoint] Waiting for replica set readiness before seeding (60s)"
  node ./scripts/wait-for-replset.js "$MONGO_HOST" "$MONGO_PORT" 60 || true
fi

# Run seed (if requested)
if [ "${RUN_SEED}" = "true" ] || [ "${RUN_SEED}" = "1" ]; then
  echo "[entrypoint] RUN_SEED enabled - running seed script"
  if [ -f ./src/mongodb/seed.js ]; then
    echo "[entrypoint] Running mongodb seed: node src/mongodb/seed.js"
    node ./src/mongodb/seed.js || {
      echo "[entrypoint] mongodb seed failed" >&2
    }
  else
    npm run seed || {
      echo "[entrypoint] npm seed failed" >&2
    }
  fi
fi

echo "[entrypoint] Starting app: $@"
exec "$@"
#!/bin/sh
set -e

# Simple entrypoint: wait for MongoDB host:port to be available before starting.
# Optionally run seed when RUN_SEED=true

echo "[entrypoint] Parsing MONGO_URL..."
MONGO_HOSTPORT="${MONGO_URL:-mongodb://mongodb:27017}" 

# Extract host and port (supports simple mongodb://host:port/DB)
REGEX='mongodb://\([^/:]*\)[:]?\([0-9]*\)'
MONGO_HOST=""
MONGO_PORT=""

if echo "$MONGO_HOSTPORT" | grep -q "mongodb://"; then
  # naive parse
  MONGO_HOST=$(echo "$MONGO_HOSTPORT" | sed -E 's#mongodb://([^/:]+):?([0-9]*).*#\1#')
  MONGO_PORT=$(echo "$MONGO_HOSTPORT" | sed -E 's#mongodb://([^/:]+):?([0-9]*).*#\2#')
fi

# Fallback defaults
MONGO_HOST=${MONGO_HOST:-mongodb}
MONGO_PORT=${MONGO_PORT:-27017}

echo "[entrypoint] Waiting for MongoDB at $MONGO_HOST:$MONGO_PORT..."

# Use node helper if available, otherwise try netcat (not present in alpine), so loop with /dev/tcp if supported
    until (command -v mongosh >/dev/null 2>&1 && mongosh --host $MONGO_HOST --eval "rs.status()" --quiet >/dev/null 2>&1) || (command -v mongo >/dev/null 2>&1 && mongo --host $MONGO_HOST --eval "rs.status()" >/dev/null 2>&1); do
  node ./scripts/wait-for-tcp.js "$MONGO_HOST" "$MONGO_PORT" 60
else
  # fallback: try until port open
  COUNT=0
  while ! nc -z "$MONGO_HOST" "$MONGO_PORT" 2>/dev/null; do
    COUNT=$((COUNT+1))
    if [ "$COUNT" -gt 60 ]; then
      echo "[entrypoint] timeout waiting for $MONGO_HOST:$MONGO_PORT"
      exit 1
    fi
    echo "[entrypoint] waiting for $MONGO_HOST:$MONGO_PORT... ($COUNT)"
    sleep 1
  done
fi

echo "[entrypoint] MongoDB reachable"

if [ "${RUN_SEED}" = "true" ] || [ "${RUN_SEED}" = "1" ]; then
  echo "[entrypoint] RUN_SEED enabled - running seed script"
  # Prefer running the mongodb-specific seed file if present
  if [ -f ./src/mongodb/seed.js ]; then
    echo "[entrypoint] Running mongodb seed: node src/mongodb/seed.js"
    node ./src/mongodb/seed.js || {
      echo "[entrypoint] mongodb seed failed" >&2
    }
  else
    npm run seed || {
    if command -v mongosh >/dev/null 2>&1; then
      mongosh --host $MONGO_HOST --eval "if(rs.status().ok !== 1){ rs.initiate(); }" --quiet || true
    else
      mongo --host $MONGO_HOST --eval "if(rs.status().ok !== 1){ rs.initiate(); }" || true
    fi
      echo "[entrypoint] npm seed failed" >&2
    }
  fi
fi

echo "[entrypoint] Starting app: $@"
exec "$@"

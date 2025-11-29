const Redis = require('ioredis');
const config = require('../../config/config.json');

/* CONFIG */
const REDIS_URL = process.env.REDIS_URL || config.database.redis.url;

// Create Redis client
const redis = new Redis(REDIS_URL);

// Light-weight startup health check
redis.ping()
  .then(res => {
    console.log('[redis] connected:', res);
  })
  .catch(err => {
    console.error('[redis] connection error:', err && err.message ? err.message : err);
  });

async function checkRedis() {
  try {
    const res = await redis.ping();
    return res === 'PONG';
  } catch (e) {
    return false;
  }
}

// Redis utility functions

/**
 * Get idempotency key from Redis
 * @param {string} key - Idempotency key
 * @returns {Promise<string|null>} Previous result or null
 */
async function getIdempotencyKey(key) {
  return await redis.get(`idem:${key}`);
}

/**
 * Set idempotency key in Redis
 * @param {string} key - Idempotency key
 * @param {string} value - Value to store
 * @param {number} ttl - TTL in seconds
 */
async function setIdempotencyKey(key, value, ttl) {
  await redis.set(`idem:${key}`, value, 'EX', ttl);
}

/**
 * Acquire a distributed lock
 * @param {string} lockKey - Lock key
 * @param {string} token - Unique token for this lock
 * @param {number} timeout - Lock timeout in milliseconds
 * @returns {Promise<boolean>} True if lock acquired
 */
async function acquireLock(lockKey, token, timeout) {
  const result = await redis.set(lockKey, token, 'PX', timeout, 'NX');
  return result !== null;
}

/**
 * Release a distributed lock
 * @param {string} lockKey - Lock key
 * @param {string} token - Token that was used to acquire the lock
 */
async function releaseLock(lockKey, token) {
  const currentToken = await redis.get(lockKey);
  if (currentToken === token) {
    await redis.del(lockKey);
  }
}

/**
 * Get a value from Redis
 * @param {string} key - Key to get
 * @returns {Promise<string|null>}
 */
async function get(key) {
  return await redis.get(key);
}

/**
 * Set a value in Redis
 * @param {string} key - Key to set
 * @param {string} value - Value to set
 * @param {number} ttl - Optional TTL in seconds
 */
async function set(key, value, ttl) {
  if (ttl) {
    await redis.set(key, value, 'EX', ttl);
  } else {
    await redis.set(key, value);
  }
}

/**
 * Delete a key from Redis
 * @param {string} key - Key to delete
 */
async function del(key) {
  await redis.del(key);
}

module.exports = {
  redis,
  getIdempotencyKey,
  setIdempotencyKey,
  acquireLock,
  releaseLock,
  get,
  set,
  del,
  checkRedis,
};

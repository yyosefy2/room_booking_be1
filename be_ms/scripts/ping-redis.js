const Redis = require('ioredis');
const url = process.env.REDIS_URL || 'redis://redis:6379';
const r = new Redis(url);

r.ping()
  .then(res => {
    console.log('PING-REPLY', res);
  })
  .catch(err => {
    console.error('PING-ERROR', err.message || err);
    process.exit(2);
  })
  .finally(() => r.quit());

// concurrent-booking-test.js
// Simulate multiple concurrent booking attempts for the same room to demonstrate locking/idempotency.
// Usage: NODE_OPTIONS=--openssl-legacy-provider node concurrent-booking-test.js

async function run() {
  const base = process.env.BASE_URL || 'http://localhost:4000';
  const parallel = parseInt(process.env.PARALLEL || '5', 10);
  console.log('CONCURRENT BOOKING TEST: base=', base, 'parallel=', parallel);

  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setUTCHours(0,0,0,0);
  const dayAfter = new Date(tomorrow);
  dayAfter.setDate(dayAfter.getDate() + 1);
  const fmt = d => d.toISOString().split('T')[0];

  try {
    // 1) Register a user
    const email = `concurrent${Date.now()}@example.com`;
    const password = 'ConcTest123!';
    const reg = await fetch(`${base}/api/v1/users/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name: 'Concurrent Tester' }),
    });
    if (!reg.ok) throw new Error('Register failed: ' + await reg.text());
    const tok = (await reg.json()).token;
    console.log('Registered user', email);

    // 2) Search for rooms
    const searchUrl = new URL(`${base}/api/v1/rooms/search`);
    searchUrl.searchParams.set('start', fmt(tomorrow));
    searchUrl.searchParams.set('end', fmt(dayAfter));
    const sr = await fetch(searchUrl.toString(), { method: 'GET', headers: { Authorization: `Bearer ${tok}` } });
    if (!sr.ok) throw new Error('Search failed: ' + await sr.text());
    const rooms = await sr.json();
    if (!Array.isArray(rooms) || rooms.length === 0) throw new Error('No rooms found');
    const room = rooms[0];
    const roomId = room.id || room._id;
    console.log('Selected room', roomId, 'free_units:', room.free_units || room.available_units || '?');

    // 3) Launch concurrent booking attempts
    const results = [];
    const attempts = [];
    for (let i = 0; i < parallel; i++) {
      const attempt = (async (i) => {
        try {
          const idem = `concurrent-${Date.now()}-${i}`;
          const res = await fetch(`${base}/api/v1/booking`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${tok}`,
              'Idempotency-Key': idem,
            },
            body: JSON.stringify({ room_id: roomId, start_date: fmt(tomorrow), end_date: fmt(dayAfter), quantity: 1, contact_email: email }),
          });
          const text = await res.text();
          let body;
          try { body = JSON.parse(text); } catch (e) { body = text; }
          return { ok: res.ok, status: res.status, body };
        } catch (err) {
          return { ok: false, status: null, body: String(err && err.message ? err.message : err) };
        }
      })(i);
      attempts.push(attempt);
    }

    const settled = await Promise.all(attempts);
    let success = 0, conflict = 0, other = 0;
    settled.forEach((r, idx) => {
      if (r.ok) success++;
      else if (r.status === 409) conflict++;
      else other++;
      console.log(`Attempt ${idx}: status=${r.status} ok=${r.ok} body=${JSON.stringify(r.body)}`);
    });

    console.log('\nRESULTS: total=', parallel, 'success=', success, 'conflict=', conflict, 'other=', other);
    process.exitCode = 0;
    return;
  } catch (err) {
    console.error('TEST ERROR:', err && err.stack ? err.stack : err);
    process.exitCode = 2;
    return;
  }
}

run();

// Simple smoke test: register user -> search rooms -> create booking
// Requires Node 18+ (global fetch)

async function run() {
  const base = process.env.BASE_URL || 'http://localhost:4000';
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setUTCHours(0,0,0,0);
  const dayAfter = new Date(tomorrow);
  dayAfter.setDate(dayAfter.getDate() + 1);

  const fmt = d => d.toISOString().split('T')[0];
  try {
    console.log('1) Registering a new user');
    const email = `smoke${Date.now()}@example.com`;
    const password = 'Smoke123!';
    const registerRes = await fetch(`${base}/api/v1/users/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name: 'Smoke Tester' }),
    });
    const registerJson = await registerRes.json();
    if (!registerRes.ok) throw new Error(`Register failed: ${registerRes.status} ${JSON.stringify(registerJson)}`);
    const token = registerJson.token;
    console.log('→ Registered:', email);

    console.log('2) Searching rooms');
    const searchUrl = new URL(`${base}/api/v1/rooms/search`);
    searchUrl.searchParams.set('start', fmt(tomorrow));
    searchUrl.searchParams.set('end', fmt(dayAfter));

    const searchRes = await fetch(searchUrl.toString(), {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    const rooms = await searchRes.json();
    if (!searchRes.ok) throw new Error(`Search failed: ${searchRes.status} ${JSON.stringify(rooms)}`);
    if (!Array.isArray(rooms) || rooms.length === 0) throw new Error('No rooms returned from search');
    const room = rooms[0];
    console.log(`→ Found ${rooms.length} rooms, picking first: ${room.id || room._id}`);

    console.log('3) Creating booking');
    const bookingRes = await fetch(`${base}/api/v1/booking`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'Idempotency-Key': `smoke-${Date.now()}` },
      body: JSON.stringify({ room_id: room.id || room._id, start_date: fmt(tomorrow), end_date: fmt(dayAfter), quantity: 1 }),
    });
    const bookingJson = await bookingRes.json();
    if (!bookingRes.ok) throw new Error(`Booking failed: ${bookingRes.status} ${JSON.stringify(bookingJson)}`);

    console.log('→ Booking created successfully:', bookingJson.booking && bookingJson.booking.id ? bookingJson.booking.id : bookingJson.booking);
    console.log('\nSMOKE TEST PASSED');
    process.exit(0);
  } catch (err) {
    console.error('\nSMOKE TEST FAILED:', err && err.message ? err.message : err);
    process.exit(2);
  }
}

run();

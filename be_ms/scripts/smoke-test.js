// Simple smoke test: register user -> search rooms -> create booking
// Requires Node 18+ (global fetch)

async function run() {
  const base = process.env.BASE_URL || 'http://localhost:4000';
  console.log('SMOKE: using base URL ->', base);
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
    let registerRes;
    try {
      registerRes = await fetch(`${base}/api/v1/users/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name: 'Smoke Tester' }),
      });
    } catch (err) {
      console.error('Register fetch error:', err && err.stack ? err.stack : err);
      throw new Error('fetch failed');
    }
    const registerText = await registerRes.text();
    let registerJson;
    try { registerJson = JSON.parse(registerText); } catch (e) { registerJson = registerText; }
    console.log('Register response status:', registerRes.status, 'body:', registerJson);
    if (!registerRes.ok) throw new Error(`Register failed: ${registerRes.status} ${JSON.stringify(registerJson)}`);
    const token = registerJson.token;
    console.log('→ Registered:', email);

    console.log('2) Searching rooms');
    const searchUrl = new URL(`${base}/api/v1/rooms/search`);
    searchUrl.searchParams.set('start', fmt(tomorrow));
    searchUrl.searchParams.set('end', fmt(dayAfter));

    let searchRes;
    try {
      searchRes = await fetch(searchUrl.toString(), {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      console.error('Search fetch error:', err && err.stack ? err.stack : err);
      throw new Error('fetch failed');
    }
    const searchText = await searchRes.text();
    let rooms;
    try { rooms = JSON.parse(searchText); } catch (e) { rooms = searchText; }
    console.log('Search response status:', searchRes.status, 'body:', rooms);
    if (!searchRes.ok) throw new Error(`Search failed: ${searchRes.status} ${JSON.stringify(rooms)}`);
    if (!Array.isArray(rooms) || rooms.length === 0) throw new Error('No rooms returned from search');
    const room = rooms[0];
    console.log(`→ Found ${rooms.length} rooms, picking first: ${room.id || room._id}`);

    console.log('3) Creating booking');
    let bookingRes;
    try {
      bookingRes = await fetch(`${base}/api/v1/booking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'Idempotency-Key': `smoke-${Date.now()}` },
        body: JSON.stringify({ room_id: room.id || room._id, start_date: fmt(tomorrow), end_date: fmt(dayAfter), quantity: 1, contact_email: email }),
      });
    } catch (err) {
      console.error('Booking fetch error:', err && err.stack ? err.stack : err);
      throw new Error('fetch failed');
    }
    const bookingText = await bookingRes.text();
    let bookingJson;
    try { bookingJson = JSON.parse(bookingText); } catch (e) { bookingJson = bookingText; }
    console.log('Booking response status:', bookingRes.status, 'body:', bookingJson);
    if (!bookingRes.ok) throw new Error(`Booking failed: ${bookingRes.status} ${JSON.stringify(bookingJson)}`);

    console.log('→ Booking created successfully:', bookingJson.booking && bookingJson.booking.id ? bookingJson.booking.id : bookingJson.booking);
    console.log('\nSMOKE TEST PASSED');
    process.exitCode = 0;
    return;
  } catch (err) {
    console.error('\nSMOKE TEST FAILED:', err && err.message ? err.message : err);
    process.exitCode = 2;
    return;
  }
}

run();

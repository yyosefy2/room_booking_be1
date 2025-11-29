const { MongoClient } = require('mongodb');

const host = process.argv[2] || 'mongo';
const port = parseInt(process.argv[3], 10) || 27017;
const timeoutSeconds = parseInt(process.argv[4], 10) || 180;

const url = `mongodb://${host}:${port}`;

async function wait() {
  const start = Date.now();
  while (true) {
    try {
      const client = new MongoClient(url, { serverSelectionTimeoutMS: 2000 });
      await client.connect();
      const admin = client.db().admin();
      let info;
      try {
        info = await admin.command({ hello: 1 });
      } catch (e) {
        info = await admin.command({ ismaster: 1 });
      }
      await client.close();

      // Prefer to check replSetGetStatus for a PRIMARY member
      try {
        const status = await admin.command({ replSetGetStatus: 1 });
        if (status && Array.isArray(status.members)) {
          const primary = status.members.find(m => m.stateStr === 'PRIMARY');
          if (primary) {
            console.log('[wait-for-replset] PRIMARY elected:', primary.name);
            await client.close();
            process.exit(0);
          }
        }
      } catch (e) {
        // not yet a replset or not ready; fallback to hello check below
      }

      // fallback: success if logicalSessionTimeoutMinutes present and setName or mongos
      if (info && info.logicalSessionTimeoutMinutes != null && (info.setName || info.msg === 'isdbgrid')) {
        console.log('[wait-for-replset] replset/mongos ready (hello)');
        await client.close();
        process.exit(0);
      }
    } catch (err) {
      // ignore and retry
    }

    if ((Date.now() - start) / 1000 > timeoutSeconds) {
      console.error('[wait-for-replset] timeout waiting for replset readiness');
      process.exit(2);
    }

    await new Promise(r => setTimeout(r, 1000));
  }
}

wait();

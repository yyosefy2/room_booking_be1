const net = require('net');

function waitFor(host, port, timeoutSeconds = 60) {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    function tryConnect() {
      const socket = new net.Socket();
      socket.setTimeout(2000);
      socket.on('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.on('error', () => {
        socket.destroy();
        if ((Date.now() - start) / 1000 > timeoutSeconds) {
          reject(new Error('timeout'));
        } else {
          setTimeout(tryConnect, 500);
        }
      });
      socket.on('timeout', () => {
        socket.destroy();
        if ((Date.now() - start) / 1000 > timeoutSeconds) {
          reject(new Error('timeout'));
        } else {
          setTimeout(tryConnect, 500);
        }
      });
      socket.connect(port, host);
    }

    tryConnect();
  });
}

const host = process.argv[2] || 'mongodb';
const port = parseInt(process.argv[3], 10) || 27017;
const timeout = parseInt(process.argv[4], 10) || 60;

console.log(`[wait-for-tcp] waiting for ${host}:${port} (timeout ${timeout}s)`);
waitFor(host, port, timeout)
  .then(() => {
    console.log('[wait-for-tcp] host is reachable');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[wait-for-tcp] timeout waiting for host');
    process.exit(2);
  });

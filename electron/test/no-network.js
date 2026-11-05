// Loaded into every unit-test process (package.json "test"): a non-loopback connect fails at once, as if offline,
// so no test can hang on, or pay for, a real API, even with real keys in .env. Loopback (local ws/http servers) works.
import net from 'node:net';
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const a = Array.isArray(args[0]) ? args[0][0] : args[0];
  const host = typeof a === 'object' && a ? (a.path ? 'localhost' : a.host) : typeof args[1] === 'string' ? args[1] : undefined;
  if (host && !/^(localhost|127\.\d+\.\d+\.\d+|::1|\[::1\])$/.test(host)) {
    process.stderr.write(`[no-network] blocked ${host} in ${process.argv[1]}\n`);
    process.nextTick(() => this.destroy(Object.assign(new Error(`no network in unit tests (${host})`), { code: 'ENETUNREACH' })));
    return this;
  }
  return connect.apply(this, args);
};

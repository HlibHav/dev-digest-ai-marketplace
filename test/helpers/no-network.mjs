// Preload with `node --import`. Any attempt to reach the network throws.
// Process-level proof for AC-9: Node cannot be sandboxed off the network portably.
import dns from 'node:dns';
import { syncBuiltinESMExports } from 'node:module';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';

const blocked = (what) => () => {
  throw new Error(`network access blocked in tests: ${what}`);
};

globalThis.fetch = async () => {
  throw new Error('network access blocked in tests: fetch');
};
for (const name of ['request', 'get']) {
  http[name] = blocked(`http.${name}`);
  https[name] = blocked(`https.${name}`);
}
net.connect = blocked('net.connect');
net.createConnection = blocked('net.createConnection');
net.Socket.prototype.connect = blocked('net.Socket.connect');
tls.connect = blocked('tls.connect');
for (const name of ['lookup', 'resolve', 'resolve4', 'resolve6']) {
  dns[name] = blocked(`dns.${name}`);
  if (dns.promises?.[name]) dns.promises[name] = blocked(`dns.promises.${name}`);
}

// Make named ESM imports (`import { lookup } from 'node:dns'`) see the patched functions too.
syncBuiltinESMExports();

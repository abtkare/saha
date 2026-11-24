// وكيل صغير يسجّل كل طلب يصل من Expo Go (المسار والترويسات والرد) قبل تمريره للموقع — للتشخيص في CI فقط.
import http from 'node:http';
const [listen, target] = [Number(process.argv[2] ?? 8098), Number(process.argv[3] ?? 8097)];
http.createServer((req, res) => {
  const t = Date.now();
  const up = http.request({ host: '127.0.0.1', port: target, path: req.url, method: req.method, headers: req.headers }, (r) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.url} → ${r.statusCode} ${r.headers['content-type'] ?? ''} ${Date.now() - t}ms | ua=${req.headers['user-agent'] ?? ''} accept=${req.headers.accept ?? ''} platform=${req.headers['expo-platform'] ?? ''}`);
    res.writeHead(r.statusCode ?? 502, r.headers);
    r.pipe(res);
  });
  up.on('error', (e) => { console.log(`ERR ${req.url} ${e.message}`); res.writeHead(502); res.end(); });
  req.pipe(up);
}).on('upgrade', (req, socket) => {
  console.log(`${new Date().toISOString()} UPGRADE ${req.url} (websocket — لا يوجد في الموقع)`);
  socket.destroy();
}).listen(listen, '0.0.0.0', () => console.log(`proxy ${listen} → ${target}`));

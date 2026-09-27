// Tiny static server for dist/ on localhost only (no dependencies). Used for the kiosk launch
// (a stable http://localhost origin lets Chrome remember the camera permission) and by the tests.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const port = Number(process.env.PORT || 4178);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname !== '/' && url.pathname !== '/index.html') {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
    return;
  }
  try {
    const body = await readFile(path.join(root, 'index.html'));
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end('run "npm run build" first');
  }
});
server.listen(port, '127.0.0.1', () => console.log(`Beep Cars on http://localhost:${port}/`));

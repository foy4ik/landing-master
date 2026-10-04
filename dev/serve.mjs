// Dev static server with gzip (mimics a real host). Usage: node serve.mjs <dir> <port>
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain', '.xml': 'application/xml' };
export function serve(dir, port) {
  const root = path.resolve(dir);
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(root, p);
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    const ext = path.extname(f);
    const h = { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable' };
    const data = fs.readFileSync(f);
    if (/\.(html|css|js|svg|json|xml|txt)$/.test(ext) && /gzip/.test(req.headers['accept-encoding'] || '')) {
      h['Content-Encoding'] = 'gzip';
      res.writeHead(200, h); return res.end(zlib.gzipSync(data));
    }
    res.writeHead(200, h); res.end(data);
  });
  return new Promise((r) => server.listen(port, '127.0.0.1', () => r(server)));
}
if (process.argv[1] === import.meta.filename) {
  await serve(process.argv[2] || '..', Number(process.argv[3] || 8080));
  console.log('serving on', process.argv[3] || 8080);
}

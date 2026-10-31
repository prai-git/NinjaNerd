/* Dev server for manual validation. `npm run serve` — or `npm run serve -- 8010`.

   WHY NOT `python3 -m http.server`. That is what the README used to suggest, and it sends
   `Last-Modified` with no `Cache-Control`, so a browser reuses a cached lesson script. Lesson
   scripts are injected with `createElement('script')`, and those are served from cache even on
   a hard reload. The owner re-reported an already-fixed defect twice because of it, and both
   times the file on disk and the bytes on the wire were correct — the browser simply never
   asked. This server refuses to be cached, so a manual validation is always of the code that
   is actually there.

   Serves app/ only, which is the same thing GitHub Pages publishes. Node-only on purpose: the
   project carries no Python dependencies. */
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { join, normalize, extname } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'app');
const PORT = Number(process.argv[2]) || 8000;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

createServer((req, res) => {
  // Strip the query string, then normalise — `..` must not escape app/.
  const raw = decodeURIComponent(req.url.split('?')[0]);
  const rel = normalize(raw).replace(/^(\.\.[/\\])+/, '');
  let file = join(ROOT, rel);
  try {
    if (statSync(file).isDirectory()) file = join(file, 'index.html');
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end(`404 ${rel}`);
    return;
  }
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('403'); return; }
  res.writeHead(200, {
    'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
    // The whole point. No Last-Modified and no ETag either, so there is nothing to revalidate.
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
    Expires: '0',
  });
  createReadStream(file).pipe(res);
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Serving app/ at http://127.0.0.1:${PORT}/  (no-store: nothing is cached)`);
});

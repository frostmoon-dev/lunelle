// Tiny zero-dependency static server for local development.
// Usage: npm start   (then open http://localhost:5173)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.env.PORT ?? 5173);
const allowed = ['web', 'src'];

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};

const server = createServer(async (req, res) => {
  try {
    let urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (urlPath === '/') urlPath = '/web/index.html';
    const filePath = normalize(join(root, urlPath));
    const top = filePath.slice(root.length + 1).split(sep)[0];
    if (!filePath.startsWith(root + sep) || !allowed.includes(top)) {
      res.writeHead(404).end('Not found');
      return;
    }
    const info = await stat(filePath).catch(() => null);
    if (!info || !info.isFile()) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': types[extname(filePath)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(await readFile(filePath));
  } catch (err) {
    res.writeHead(500).end('Server error');
    console.error(err);
  }
});

server.listen(port, () => {
  console.log(`Lunelle running at http://localhost:${port}`);
  console.log('Press Ctrl+C to stop.');
});

const http = require('http');
const path = require('path');
const fs = require('fs/promises');
const url = require('url');
const api = require('./lib/api');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

function getMime(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME[ext] || 'application/octet-stream';
}

async function serveStatic(req, res, pathname) {
  // Normalize path
  let requestedPath = pathname;
  if (requestedPath === '/') {
    requestedPath = '/index.html';
  }

  // Prevent directory traversal
  const safePath = path.normalize(path.join(PUBLIC_DIR, requestedPath));
  if (!safePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  try {
    const stat = await fs.stat(safePath);
    if (stat.isDirectory()) {
      // Serve index.html inside directory if exists
      const indexPath = path.join(safePath, 'index.html');
      const indexStat = await fs.stat(indexPath).catch(() => null);
      if (indexStat && indexStat.isFile()) {
        const content = await fs.readFile(indexPath);
        res.writeHead(200, { 'Content-Type': getMime(indexPath) });
        res.end(content);
        return;
      }
      throw new Error('Not found');
    } else if (stat.isFile()) {
      const content = await fs.readFile(safePath);
      res.writeHead(200, { 'Content-Type': getMime(safePath) });
      res.end(content);
      return;
    } else {
      throw new Error('Not a file');
    }
  } catch (err) {
    // If the request was for a .html file, return 404 page
    if (requestedPath.endsWith('.html')) {
      const notFoundPath = path.join(PUBLIC_DIR, '404.html');
      try {
        const content = await fs.readFile(notFoundPath);
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(content);
        return;
      } catch (e) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
        return;
      }
    }

    // For non-html requests, return 404 plain
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  }
}

const server = http.createServer((req, res) => {
  // Simple CORS and common headers for API consumers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsed = url.parse(req.url, true);
  const pathname = decodeURIComponent(parsed.pathname);

  if (pathname.startsWith('/api/')) {
    api.handle(req, res);
  } else {
    // static file serving for everything else
    serveStatic(req, res, pathname);
  }
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
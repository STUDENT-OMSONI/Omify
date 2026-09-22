const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const ROOT = path.resolve(__dirname);


const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.opus': 'audio/ogg',
  '.wav': 'audio/wav',
};

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url);
  let pathname = parsedUrl.pathname || '/';
  try {
    pathname = decodeURIComponent(pathname);
  } catch (e) {
    // Keep raw if decode fails
  }

  if (pathname === '/') {
    pathname = '/index.html';
  }

  // Prevent path traversal
  let safePath = path.normalize(path.join(ROOT, pathname));
  if (!safePath.startsWith(ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  // Robust path resolution: handles single-encoded, double-encoded (%20 vs space), or case differences
  function resolveFilePath(targetPath) {
    if (fs.existsSync(targetPath)) return targetPath;

    // 1. Try decoding any remaining %XX (handles %2520 -> %20 -> space)
    let decoded = targetPath;
    let attempts = 0;
    while (decoded.includes('%') && attempts < 5) {
      attempts++;
      try {
        const next = decodeURIComponent(decoded);
        if (next === decoded) break;
        decoded = next;
        if (fs.existsSync(decoded)) return decoded;
      } catch (e) {
        break;
      }
    }

    // 2. Try case-insensitive and unquoted match in parent directory
    try {
      const dir = path.dirname(decoded);
      const base = path.basename(decoded).toLowerCase();
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        const match = files.find(f => f.toLowerCase() === base);
        if (match) return path.join(dir, match);

        const unquotedBase = base.replace(/['"]/g, '');
        const unquotedMatch = files.find(f => f.toLowerCase().replace(/['"]/g, '') === unquotedBase);
        if (unquotedMatch) return path.join(dir, unquotedMatch);
      }
    } catch (e) {}

    return targetPath;
  }

  safePath = resolveFilePath(safePath);

  fs.stat(safePath, (err, stats) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found: ' + pathname);
      return;
    }

    if (stats.isDirectory()) {
      const indexPath = path.join(safePath, 'index.html');
      fs.stat(indexPath, (err2, stats2) => {
        if (!err2 && stats2.isFile()) {
          serveFile(req, res, indexPath, stats2);
        } else {
          res.writeHead(403, { 'Content-Type': 'text/plain' });
          res.end('Directory listing disabled');
        }
      });
      return;
    }

    serveFile(req, res, safePath, stats);
  });
});

function serveFile(req, res, filePath, stats) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const range = req.headers.range;

  // Always disable caching for instant updates in development
  const baseHeaders = {
    'Content-Type': contentType,
    'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
  };

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;

    if (start >= stats.size || end >= stats.size || start > end) {
      res.writeHead(416, {
        'Content-Range': `bytes */${stats.size}`,
        ...baseHeaders,
      });
      res.end();
      return;
    }

    const chunksize = end - start + 1;
    const file = fs.createReadStream(filePath, { start, end });
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${stats.size}`,
      'Content-Length': chunksize,
      ...baseHeaders,
    });
    file.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': stats.size,
      ...baseHeaders,
    });
    fs.createReadStream(filePath).pipe(res);
  }
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Omify High-Performance Streaming Server running at http://localhost:${PORT}/`);
});

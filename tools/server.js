#!/usr/bin/env node
/**
 * 零依赖静态文件服务器（仅用于本地开发/运行本项目）
 * 用法：node tools/server.js [port] [rootDir]
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const port = Number(process.argv[2]) || 8080;
const rootDir = path.resolve(process.argv[3] || path.join(__dirname, '..'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (pathname === '/') pathname = '/index.html';

  const filePath = path.join(rootDir, path.normalize(pathname).replace(/^(\.\.[\/\\])+/, ''));

  // 防止目录穿越
  if (!filePath.startsWith(rootDir)) {
    res.writeHead(403);
    res.end('403 Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found: ' + pathname);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
});

server.listen(port, () => {
  console.log('');
  console.log('  中国象棋服务已启动');
  console.log('  ------------------------------------');
  console.log(`  根目录: ${rootDir}`);
  console.log(`  地址:   http://localhost:${port}`);
  console.log('  按 Ctrl+C 停止');
  console.log('');
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n  端口 ${port} 已被占用，请换一个端口：`);
    console.error(`    node tools/server.js ${port + 1}\n`);
  } else {
    console.error(e);
  }
  process.exit(1);
});

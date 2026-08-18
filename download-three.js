/**
 * 下载 three.min.js 到 public/js/vendor/ 目录。
 * 适用场景：服务器可访问互联网，但局域网客户端无法访问 CDN。
 *
 * 运行：node download-three.js
 */
'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');

const CDN_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';
const DEST = path.join(__dirname, 'public', 'js', 'vendor', 'three.min.js');

function get(url, redirects) {
  redirects = redirects || 0;
  if (redirects > 5) {
    console.error('重定向次数过多，下载失败');
    process.exit(1);
  }
  https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      res.resume();
      get(new URL(res.headers.location, url).toString(), redirects + 1);
      return;
    }
    if (res.statusCode !== 200) {
      console.error('下载失败，HTTP 状态码：', res.statusCode);
      res.resume();
      process.exit(1);
    }
    const file = fs.createWriteStream(DEST);
    res.pipe(file);
    file.on('finish', () => {
      file.close();
      console.log('下载完成：', DEST);
    });
  }).on('error', (err) => {
    console.error('下载出错：', err.message);
    console.error('可手动下载：', CDN_URL);
    process.exit(1);
  });
}

fs.mkdirSync(path.dirname(DEST), { recursive: true });
console.log('开始下载 Three.js ...');
get(CDN_URL);

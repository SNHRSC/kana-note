/* かなノート service worker: ใช้งานออฟไลน์ได้หลังเปิดครั้งแรก */
const CACHE = 'kananote-v2';
const ASSETS = ['./', './index.html', './css/style.css', './js/data.js', './js/game.js', './js/app.js',
  './manifest.webmanifest', './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // ฟอนต์จาก Google: ใช้ของในแคชก่อน แล้วอัปเดตเบื้องหลัง
  if (url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com') {
    e.respondWith(caches.open(CACHE).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  // ไฟล์ของแอป: ดึงจากเน็ตก่อน (ได้เวอร์ชันล่าสุด) ถ้าออฟไลน์ใช้แคช
  e.respondWith(fetch(req).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return r; })
    .catch(() => caches.match(req).then(r => r || caches.match('./index.html'))));
});

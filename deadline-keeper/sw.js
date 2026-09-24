/**
 * 기한지킴이 서비스 워커
 * - 앱 파일: 먼저 캐시에서 열고 뒤에서 새 버전을 받아 둔다 (오프라인에서도 실행)
 * - CDN(Tailwind, 글꼴, Tesseract.js): 한 번 받은 뒤 캐시에서 제공
 * 앱 파일을 바꿔 배포할 때는 VERSION을 올린다.
 */
const VERSION = 'dk-v2';
const APP_SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/ocr-parser.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];
const CDN_HOSTS = ['cdn.tailwindcss.com', 'cdn.jsdelivr.net'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !CDN_HOSTS.includes(url.hostname)) return;

  // 캐시에 있으면 바로 쓰고, 네트워크로 새 버전을 받아 캐시를 갱신한다
  event.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: sameOrigin });
      const network = fetch(req)
        .then((res) => {
          if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached || (req.mode === 'navigate' ? cache.match('./index.html') : undefined));
      return cached || network;
    })
  );
});

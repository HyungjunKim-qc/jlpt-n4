// JLPT N4 학습지도 서비스 워커 — 앱 파일은 네트워크 우선(업데이트 반영), 음성은 캐시 우선(오프라인)
const VER = 'n4-app-0928a70b08';
const AUDIO = 'n4-audio';
const FONTS = 'n4-fonts';
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png", "./favicon.png", "./data/w01.js", "./data/w02.js", "./data/w03.js", "./data/w04.js", "./data/w05.js", "./data/w06.js", "./data/w07.js", "./data/w08.js", "./data/w09.js", "./data/w10.js", "./data/w11.js", "./data/w12.js"];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VER).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => k.startsWith('n4-app-') && k !== VER).map(k => caches.delete(k))
  )).then(() => self.clients.claim()));
});

async function rangeFrom(req, res) {
  const range = req.headers.get('range');
  if (!range) return res;
  const buf = await res.arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
  let start = m[1] ? +m[1] : 0, end = m[2] ? +m[2] : buf.byteLength - 1;
  if (!m[1] && m[2]) { start = buf.byteLength - +m[2]; end = buf.byteLength - 1; }
  end = Math.min(end, buf.byteLength - 1);
  return new Response(buf.slice(start, end + 1), { status: 206, headers: {
    'Content-Type': 'audio/mpeg', 'Content-Range': `bytes ${start}-${end}/${buf.byteLength}`,
    'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes' } });
}

async function audioResponse(req) {
  const url = req.url.split('#')[0];
  const cache = await caches.open(AUDIO);
  let res = await cache.match(url, { ignoreSearch: true });
  if (!res) {
    const net = await fetch(url);
    if (!net.ok) return net;
    await cache.put(url, net.clone());
    res = net;
  }
  return rangeFrom(req, res);
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin !== location.origin) {
    if (/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) {
      e.respondWith(caches.open(FONTS).then(c => c.match(req).then(hit => hit || fetch(req).then(res => { c.put(req, res.clone()); return res; }))));
    }
    return;
  }
  if (u.pathname.includes('/audio/')) { e.respondWith(audioResponse(req)); return; }
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VER).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())))
  );
});

/* EduNote 서비스워커 — network-first (staleness 방지판)
 * 온라인이면 항상 네트워크 최신본을 표시 → 새 배포 즉시 반영.
 * 오프라인일 때만 마지막 캐시로 폴백. 외부(Firebase/gstatic/폰트)는 캐시하지 않음.
 */
var CACHE = 'edunote-v1';
var SHELL = ['./', './index.html'];

self.addEventListener('install', function (e) {
  self.skipWaiting(); // 새 워커 즉시 대기 해제
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(SHELL).catch(function(){}); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== CACHE; })
                              .map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;                 // 쓰기/콜러블 등은 패스
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;  // 외부(Firebase 등) 캐시 안 함

  // 동일 출처 GET: 네트워크 우선, 성공 시 캐시 갱신, 실패 시 캐시→index.html 폴백
  e.respondWith(
    fetch(req)
      .then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function(){});
        return res;
      })
      .catch(function () {
        return caches.match(req).then(function (m) {
          return m || caches.match('./index.html');
        });
      })
  );
});

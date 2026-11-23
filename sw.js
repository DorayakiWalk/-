// 大空海 Service Worker（アプリとして保存できるようにするための最小構成）
// ゲーム本体はキャッシュせず、常にネットワークから最新を取得する（更新が即反映される）
self.addEventListener('install', (event) => { self.skipWaiting(); });
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', (event) => { event.respondWith(fetch(event.request)); });

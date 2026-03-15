const CACHE_NAME = 'jero-calendar-v8.9.16';

// キャッシュすべき最新のモジュールパス群
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './css/style.css',
    './js/main.js',
    './js/jero_core.js',
    './assets/lib/pdfjs/pdf.min.js',
    './assets/lib/pdfjs/pdf.worker.min.js',
    './manifest.json'
];

// インストール時に全ファイルをキャッシュへ格納
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    // 新しいService Workerを即座に待機状態からアクティブにする
    self.skipWaiting();
});

// アクティベート時に古いバージョンのキャッシュを焼き払う
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('🗑 古いキャッシュを消去:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// 通信傍受：Stale-while-revalidate（キャッシュを返しつつ裏で更新）
self.addEventListener('fetch', (event) => {
    // GETリクエスト以外（APIへのPOST等）はスルーしてブラウザに任せる
    if (event.request.method !== 'GET') return;
    
    // Google API通信などはService Workerでキャッシュさせない
    const url = new URL(event.request.url);
    if (url.origin !== location.origin) return;

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            const fetchPromise = fetch(event.request).then((networkResponse) => {
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, networkResponse.clone());
                });
                return networkResponse;
            }).catch(() => {
                // オフライン時は何もしない（エラーを出さない）
            });
            
            // キャッシュがあれば即座に返し、無ければネットワークへ取りに行く
            return cachedResponse || fetchPromise;
        })
    );
});

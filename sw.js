/**
 * Service Worker для «ЭлектроСправка» (PWA)
 * Версия: v1.9.5
 * Полная поддержка офлайн-режима на iOS Safari (WebClip/PWA) и Android Chrome.
 */

const CACHE_NAME = 'elektrospravka-v1.9.5';
const FONT_CACHE_NAME = 'elektrospravka-fonts-v1';

// Базовые ресурсы приложения для предварительного кэширования
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './favicon.ico',
  './data/questions.js',
  './data/questions.json',
  './icons/logo.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-96.png',
  './icons/favicon-32.png',
  './icons/icon.svg'
];

// 1. Установка Service Worker — надежное кэширование каждого ассета
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      console.log('[SW] Кэширование ресурсов приложения для офлайн-режима...');

      // Кэшируем каждый ресурс индивидуально через Promise.allSettled,
      // чтобы сбой одного второстепенного ассета не блокировал весь офлайн на iOS
      await Promise.allSettled(
        PRECACHE_ASSETS.map(async (url) => {
          try {
            const response = await fetch(url, { cache: 'reload' });
            if (response.ok) {
              await cache.put(url, response);
            }
          } catch (err) {
            console.warn('[SW] Предупреждение кэширования ресурса:', url, err);
          }
        })
      );

      // Принудительно пропускаем ожидание для немедленной готовности
      await self.skipWaiting();
    })()
  );
});

// 2. Активация и удаление устаревших версий кэша
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== FONT_CACHE_NAME) {
            console.log('[SW] Удаление устаревшего кэша:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
      // Немедленный захват управления всеми открытыми вкладками/клиентами
      await self.clients.claim();
    })()
  );
});

// Слушатель сообщений для принудительной активации
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// 3. Перехват сетевых запросов (Cache-First с резервной навигацией для iOS)
self.addEventListener('fetch', (event) => {
  // Обрабатываем только GET запросы по протоколам http(s)
  if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) return;

  const url = new URL(event.request.url);

  // Обработка внешних шрифтов Google Fonts и иконок Material Symbols
  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
    event.respondWith(
      (async () => {
        const fontCache = await caches.open(FONT_CACHE_NAME);
        const cached = await fontCache.match(event.request);
        if (cached) return cached;

        try {
          const networkResponse = await fetch(event.request);
          if (networkResponse && networkResponse.status === 200) {
            fontCache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        } catch {
          return cached || new Response('', { status: 200, headers: { 'Content-Type': 'text/css' } });
        }
      })()
    );
    return;
  }

  // Обработка локальных ресурсов приложения
  event.respondWith(
    (async () => {
      // 1. Попытка прямого сопоставления в кэше с игнорированием URL-параметров
      let cachedResponse = await caches.match(event.request, { ignoreSearch: true });

      // 2. Для навигационных запросов (переход по URL / открытие PWA с домашнего экрана iOS)
      if (!cachedResponse && event.request.mode === 'navigate') {
        cachedResponse = await caches.match('./index.html') 
                      || await caches.match('index.html')
                      || await caches.match('./')
                      || await caches.match('/');
      }

      // Если ресурс найден в кэше — отдаем его мгновенно
      if (cachedResponse) {
        return cachedResponse;
      }

      // 3. Если ресурса нет в кэше — пытаемся загрузить из сети
      try {
        const networkResponse = await fetch(event.request);
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      } catch (networkError) {
        // 4. Офлайн-обработка: для навигационных запросов возвращаем index.html из кэша
        if (event.request.mode === 'navigate') {
          const fallback = await caches.match('./index.html') 
                        || await caches.match('index.html')
                        || await caches.match('./')
                        || await caches.match('/');
          if (fallback) return fallback;
        }
        throw networkError;
      }
    })()
  );
});

const CACHE = "rechnungsapp-v11";

const urls = [
"./",
"index.html",
"style.css",
"fixes.css",
"app.js",
"pdf-footer-fix.js",
"zugferd-footer-layout.js",
"manifest.json",
"assets/fussnote.svg",
"icons/pwa-icon-192.png",
"icons/pwa-icon-512.png",
"icons/pwa-icon-maskable-512.png"
];

self.addEventListener("install", e=>{
e.waitUntil(
caches.open(CACHE).then(cache=>cache.addAll(urls))
);
});

self.addEventListener("fetch", e=>{
e.respondWith(
caches.match(e.request).then(r=>r || fetch(e.request))
);
});

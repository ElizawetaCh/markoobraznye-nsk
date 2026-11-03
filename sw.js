/* Network-first HTML, cache static files; shared content comes from Supabase. */
const VERSION='mnsk-issues-demo-v29-shared-content';
const BASE=new URL('./',self.registration.scope).href;
const STATIC=['./','./index.html','./style.css','./app.js','./merch-data.js','./photos-data.js','./content.js','./admin.js','./social-qr.js','./install.js','./vendor/supabase.js','./assets/sakura-evening.webp','./assets/sakura-branches.svg','./assets/club-logo-official-hq.svg','./assets/admin-mikhail.webp','./assets/admin-irina.webp','./assets/admin-ekaterina.webp','./manifest.webmanifest','./icon-192-v3.png','./icon-512-v3.png'];
self.addEventListener('install',ev=>ev.waitUntil(caches.open(VERSION).then(c=>c.addAll(STATIC)).then(()=>self.skipWaiting())));
self.addEventListener('activate',ev=>ev.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',ev=>{
 if(ev.request.method!=='GET'||new URL(ev.request.url).origin!==self.location.origin)return;
 ev.respondWith(fetch(ev.request).then(response=>{
   if(response.ok&&new URL(ev.request.url).pathname.startsWith(new URL(BASE).pathname)){const copy=response.clone();caches.open(VERSION).then(c=>c.put(ev.request,copy));}
   return response;
 }).catch(()=>caches.match(ev.request).then(c=>c||caches.match('./index.html'))));
});
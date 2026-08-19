const CACHE = "salary-manager-v3.8.7-calendar-r8";
const SCOPE = self.registration.scope;
const SHELL_KEY = new URL("__salary_manager_app_shell__", SCOPE).href;
const STATIC_CORE = [
  "./config.js",
  "./manifest.webmanifest",
  "./manifests/gold.webmanifest",
  "./manifests/silver.webmanifest",
  "./manifests/green-segments.webmanifest",
  "./manifests/orbit.webmanifest",
  "./manifests/half-silver.webmanifest",
  "./manifests/coin-deep.webmanifest",
  "./manifests/coin-clean.webmanifest",
  "./icons/choice/gold.png",
  "./icons/choice/gold-180.png",
  "./icons/choice/gold-192.png",
  "./icons/choice/gold-512.png",
  "./icons/choice/silver.png",
  "./icons/choice/silver-180.png",
  "./icons/choice/silver-192.png",
  "./icons/choice/silver-512.png",
  "./icons/choice/green-segments.png",
  "./icons/choice/green-segments-180.png",
  "./icons/choice/green-segments-192.png",
  "./icons/choice/green-segments-512.png",
  "./icons/choice/orbit.png",
  "./icons/choice/orbit-180.png",
  "./icons/choice/orbit-192.png",
  "./icons/choice/orbit-512.png",
  "./icons/choice/half-silver.png",
  "./icons/choice/half-silver-180.png",
  "./icons/choice/half-silver-192.png",
  "./icons/choice/half-silver-512.png",
  "./icons/choice/coin-deep.png",
  "./icons/choice/coin-deep-180.png",
  "./icons/choice/coin-deep-192.png",
  "./icons/choice/coin-deep-512.png",
  "./icons/choice/coin-clean.png",
  "./icons/choice/coin-clean-180.png",
  "./icons/choice/coin-clean-192.png",
  "./icons/choice/coin-clean-512.png",
];

function sameOrigin(url) { return url.origin === self.location.origin; }
function inScope(url) { return sameOrigin(url) && url.href.startsWith(SCOPE); }

function offlinePage() {
  return new Response(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>مدير الراتب</title><body style="font-family:system-ui;background:#f3efe7;color:#173331;display:grid;place-items:center;min-height:100vh;margin:0"><main style="max-width:520px;padding:28px;text-align:center"><h2>تعذر تحميل مدير الراتب مؤقتًا</h2><p>بياناتك المحلية لم تُحذف. تأكد من الاتصال بالإنترنت ثم أعد فتح التطبيق.</p><button onclick="location.reload()" style="border:0;border-radius:14px;padding:12px 18px;background:#14756c;color:white;font-weight:700">إعادة المحاولة</button></main></body></html>`, {
    status: 503,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }
  });
}

async function fetchFreshShell() {
  const url = new URL("./index.html", SCOPE);
  url.searchParams.set("__app_shell", Date.now());
  const response = await fetch(url.href, { cache: "no-store", redirect: "follow" });
  if (!response || !response.ok) throw new Error("Shell HTTP " + (response ? response.status : "no-response"));
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  const body = await response.text();
  if (!contentType.includes("text/html") || !body.includes('id="appVersionFooter"')) throw new Error("Invalid app shell response");
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.delete("location");
  headers.set("cache-control", "no-store");
  return new Response(body, { status: 200, headers });
}

async function refreshShell(cache) {
  const clean = await fetchFreshShell();
  if (cache) await cache.put(SHELL_KEY, clean.clone()).catch(() => {});
  return clean;
}

async function cacheStatic(cache) {
  if (!cache) return;
  for (const relative of STATIC_CORE) {
    try {
      const url = new URL(relative, SCOPE);
      url.searchParams.set("__static", Date.now());
      const response = await fetch(url.href, { cache: "no-store", redirect: "follow" });
      if (response && response.ok) await cache.put(new URL(relative, SCOPE).href, response.clone());
    } catch (_) {}
  }
}

async function safeNavigation(request) {
  let cache = null;
  try { cache = await caches.open(CACHE); } catch (_) {}
  if (cache) {
    try {
      const shell = await cache.match(SHELL_KEY);
      if (shell) return shell;
    } catch (_) {}
  }
  try { return await refreshShell(cache); }
  catch (_) {
    try {
      const response = await fetch(request, { cache: "no-store", redirect: "follow" });
      if (response) return response;
    } catch (_) {}
    return offlinePage();
  }
}

async function safeStatic(request) {
  let cache = null;
  try { cache = await caches.open(CACHE); } catch (_) {}
  if (cache) {
    try {
      const hit = await cache.match(request);
      if (hit) return hit;
    } catch (_) {}
  }
  try {
    const response = await fetch(request);
    if (response && cache && (response.ok || response.type === "opaque")) cache.put(request, response.clone()).catch(() => {});
    return response || new Response("", { status: 504 });
  } catch (_) {
    return new Response("", { status: 504, statusText: "Offline" });
  }
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    let cache = null;
    try { cache = await caches.open(CACHE); } catch (_) {}
    await Promise.allSettled([refreshShell(cache), cacheStatic(cache)]);
    // Keep the new worker waiting until the user explicitly approves the update.
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.filter(key => key.startsWith("salary-manager-v") && key !== CACHE).map(key => caches.delete(key)));
    } catch (_) {}
    await self.clients.claim();
  })());
});

self.addEventListener("message", event => {
  if (event.data && event.data.type === "SKIP_WAITING") { self.skipWaiting(); return; }
  if (event.data && event.data.type === "REFRESH_APP_SHELL") {
    const port = event.ports && event.ports[0];
    event.waitUntil((async () => {
      try {
        const cache = await caches.open(CACHE);
        await refreshShell(cache);
        await cacheStatic(cache);
        if (port) port.postMessage({ ok: true });
      } catch (error) {
        if (port) port.postMessage({ ok: false, error: String(error && error.message || error) });
      }
    })());
  }
});

self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) { try { data = { body: event.data ? event.data.text() : "" }; } catch (_) {} }
  event.waitUntil((async () => {
    const tag = data.tag || "salary-manager-alert";
    // Ensure one visible notification per release/tag in this installed app.
    try {
      const existing = await self.registration.getNotifications({ tag });
      for (const notification of existing) notification.close();
    } catch (_) {}
    await self.registration.showNotification(data.title || "مدير الراتب", {
      body: data.body || "لديك إشعار جديد.",
      icon: data.icon || "./icons/choice/gold-192.png",
      badge: data.badge || "./icons/choice/gold-192.png",
      tag,
      renotify: false,
      data: { url: data.url || "./" }
    });
  })());
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "./", SCOPE).href;
  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (client.url.startsWith(SCOPE)) {
        await client.focus();
        try { if ("navigate" in client) await client.navigate(target); } catch (_) {}
        return;
      }
    }
    await clients.openWindow(target);
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (sameOrigin(url) && url.pathname.startsWith("/api/")) return;
  if (inScope(url) && (url.searchParams.has("__update_check") || url.searchParams.has("__sw_recovery") || url.searchParams.has("__app_shell") || url.searchParams.has("__static") || url.searchParams.has("__updated"))) return;
  if (!inScope(url)) return;
  const scopePath = new URL(SCOPE).pathname.replace(/\/$/, "");
  const isNavigation = request.mode === "navigate" || url.pathname === scopePath + "/" || url.pathname === scopePath + "/index.html";
  if (isNavigation) { event.respondWith(safeNavigation(request)); return; }
  event.respondWith(safeStatic(request));
});

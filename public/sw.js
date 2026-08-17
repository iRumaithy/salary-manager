const CACHE = "salary-manager-v3.2.2";
const SCOPE = self.registration.scope;
const SHELL_KEY = new URL("__salary_manager_app_shell__", SCOPE).href;
const STATIC_CORE = ["./config.js", "./manifest.webmanifest", "./icons/icon-180.png", "./icons/icon-192.png", "./icons/icon-512.png"];

function sameOrigin(url) { return url.origin === self.location.origin; }
function inScope(url) { return sameOrigin(url) && url.href.startsWith(SCOPE); }

async function normalizedResponse(response) {
  const body = await response.arrayBuffer();
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.delete("location");
  headers.set("cache-control", "no-store");
  return new Response(body, { status: 200, statusText: "OK", headers });
}

async function fetchFreshShell() {
  const url = new URL("./", SCOPE);
  url.searchParams.set("__app_shell", Date.now());
  const response = await fetch(url.href, { cache: "no-store", redirect: "follow" });
  if (!response.ok) throw new Error("Shell HTTP " + response.status);
  return normalizedResponse(response);
}

async function refreshShell(cache) {
  const clean = await fetchFreshShell();
  await cache.put(SHELL_KEY, clean.clone());
  return clean;
}

async function cacheStatic(cache) {
  for (const relative of STATIC_CORE) {
    try {
      const url = new URL(relative, SCOPE);
      url.searchParams.set("__static", Date.now());
      const response = await fetch(url.href, { cache: "no-store", redirect: "follow" });
      if (response.ok) await cache.put(new URL(relative, SCOPE).href, response.clone());
    } catch (_) {}
  }
}

self.addEventListener("install", event => {
  // Manual-update policy: do not call skipWaiting here.
  // The installed version remains active until the user explicitly chooses Update now.
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.allSettled([refreshShell(cache), cacheStatic(cache)]);
  })());
});

self.addEventListener("message", event => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }
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

self.addEventListener("activate", event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("salary-manager-v") && key !== CACHE).map(key => caches.delete(key)))),
    self.clients.claim()
  ]));
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // API calls are always live and never cached.
  if (sameOrigin(url) && url.pathname.startsWith("/api/")) return;
  // Update probes bypass the installed shell so a newer server version can be detected.
  if (inScope(url) && (url.searchParams.has("__update_check") || url.searchParams.has("__sw_recovery") || url.searchParams.has("__app_shell") || url.searchParams.has("__static"))) return;
  if (!inScope(url)) return;

  const scopePath = new URL(SCOPE).pathname.replace(/\/$/, "");
  const isNavigation = request.mode === "navigate" || url.pathname === scopePath + "/" || url.pathname === scopePath + "/index.html";
  if (isNavigation) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      let shell = await cache.match(SHELL_KEY);
      if (shell) return shell;
      try { return await refreshShell(cache); }
      catch (_) {
        const response = await fetch(request, { cache: "no-store", redirect: "follow" });
        return normalizedResponse(response);
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(request);
    if (hit) return hit;
    const response = await fetch(request);
    if (response.ok || response.type === "opaque") cache.put(request, response.clone()).catch(() => {});
    return response;
  })());
});

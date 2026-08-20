import { DurableObject } from "cloudflare:workers";
import { buildPushPayload } from "@block65/webcrypto-web-push";

const VERSION = "3.8.8";
const RELEASE_ID = "3.8.8-security-r1";
const UPDATE_SIGNAL_VERSION = "3.8.8\u200B";
const PREVIOUS_PUBLISHED_VERSION = "3.8.6";
const PREVIOUS_RELEASE_ID = "3.8.6";
const ACCIDENTAL_PREPUBLISH_RELEASE_IDS = new Set([
  "3.8.7",
  "3.8.7-r3",
  "3.8.7-calendar-r5",
  "3.8.7-calendar-r6",
  "3.8.7-calendar-r7",
  "3.8.7-calendar-r8",
  "3.8.7-calendar-r9",
  "3.8.7-calendar-r10",
  "3.8.7-calendar-r11",
  "3.8.7-wallet-r12",
  "3.8.7-wallet-r13",
  "3.8.7-wallet-r14",
  "3.8.7-wallet-r15",
  "3.8.7-wallet-r16"
]);
const SESSION_MS = 10 * 365 * 24 * 60 * 60 * 1000;
const PBKDF2_ITERATIONS = 100000;
const AUTH_NAME = "__salary_manager_auth_v311__";
const SESSION_COOKIE_NAME = "__salary_manager_session";
const ICON_CHOICES = new Set(["gold", "silver", "green-segments", "orbit", "half-silver", "coin-deep", "coin-clean"]);
function normalizeIconChoice(value) {
  const id = String(value || "").toLowerCase().replace(/[^a-z0-9-]/g, "");
  return ICON_CHOICES.has(id) ? id : "gold";
}
function manifestResponse(url) {
  const icon = normalizeIconChoice(url.searchParams.get("icon"));
  const body = {
    name: "مدير الراتب الشهري",
    short_name: "مدير الراتب",
    description: "إدارة الراتب والأقساط والمدفوعات الثابتة والمصروفات مع مزامنة آمنة بالحساب.",
    lang: "ar",
    dir: "rtl",
    start_url: "./",
    scope: "./",
    display: "standalone",
    background_color: "#f3efe7",
    theme_color: "#123f3b",
    icons: [
      { src: `./icons/choice/${icon}-192.png`, sizes: "192x192", type: "image/png", purpose: "any maskable" },
      { src: `./icons/choice/${icon}-512.png`, sizes: "512x512", type: "image/png", purpose: "any maskable" }
    ]
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/manifest+json; charset=utf-8", "cache-control": "no-store" }
  });
}
function baseHeaders(extra = {}) {
  return { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra };
}
function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: baseHeaders(extra) });
}
function b64(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function unb64(s) {
  s = String(s || "").replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const raw = atob(s);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
function randomToken(n = 32) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b64(b);
}
async function sha256(value) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || "")));
  return b64(new Uint8Array(d));
}
async function hmacSha256(secret, value) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(String(secret || "")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(String(value || "")));
  return b64(new Uint8Array(signature));
}
async function createSyncTicket(env, user) {
  const expiresAt = Date.now() + 2 * 60 * 1000;
  const payload = b64(new TextEncoder().encode(JSON.stringify({
    accountId: user.accountId,
    userId: user.id,
    expiresAt,
    nonce: randomToken(8)
  })));
  const signature = await hmacSha256(String(env.AUTH_PEPPER || ""), payload);
  return { ticket: payload + "." + signature, expiresAt };
}
async function verifySyncTicket(env, ticket) {
  const parts = String(ticket || "").split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const expected = await hmacSha256(String(env.AUTH_PEPPER || ""), parts[0]);
  if (!safeEqual(expected, parts[1])) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(unb64(parts[0])));
    if (!payload?.accountId || !payload?.userId || Number(payload.expiresAt || 0) < Date.now()) return null;
    return payload;
  } catch (_) {
    return null;
  }
}
async function passwordHash(password, salt, pepper = "", iterations = PBKDF2_ITERATIONS) {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey(
    "raw",
    enc.encode(String(password || "") + "\0" + String(pepper || "")),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: unb64(salt), iterations: Math.max(10000, Math.min(100000, Math.round(Number(iterations) || PBKDF2_ITERATIONS))) },
    base,
    256
  );
  return b64(new Uint8Array(bits));
}
function safeEqual(a, b) {
  const aa = new TextEncoder().encode(String(a || ""));
  const bb = new TextEncoder().encode(String(b || ""));
  if (aa.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i];
  return diff === 0;
}
function normUsername(v) { return String(v || "").trim().toLowerCase(); }
function normEmail(v) { return String(v || "").trim().toLowerCase(); }
function validUsername(v) { return /^[a-zA-Z0-9._-]{3,32}$/.test(String(v || "")); }
function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || "")) && String(v || "").length <= 160; }
function validPassword(v) {
  const s = String(v || "");
  return s.length >= 10 && s.length <= 200 && /[A-Za-z\u0600-\u06FF]/.test(s) && /\d/.test(s);
}
function authStub(env) { return env.SALARY_STORE.get(env.SALARY_STORE.idFromName(AUTH_NAME)); }
function accountStub(env, accountId) {
  const clean = String(accountId || "").replace(/[^A-Za-z0-9_-]/g, "");
  if (!clean) throw new Error("Invalid account");
  return env.SALARY_STORE.get(env.SALARY_STORE.idFromName("account:" + clean));
}
function bearerToken(request) {
  const h = request.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}
function requestAuthToken(request) {
  return bearerToken(request) || cookieValue(request, SESSION_COOKIE_NAME);
}
function allowedOrigin(request, env) {
  const origin = request.headers.get("origin") || "";
  if (!origin) return "";
  const current = new URL(request.url).origin;
  const defaults = [current, "https://irumaithy.github.io", "http://localhost:8787", "http://127.0.0.1:8787"];
  const configured = String(env.ALLOWED_ORIGINS || "").split(",").map(x => x.trim()).filter(Boolean);
  return [...defaults, ...configured].includes(origin) ? origin : "";
}
function corsHeaders(request, env) {
  const origin = allowedOrigin(request, env);
  return origin ? {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "vary": "Origin",
    "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
    "access-control-allow-headers": "content-type,authorization,x-salary-manager-app",
    "access-control-max-age": "86400"
  } : {};
}
function apiJson(request, env, body, status = 200, extra = {}) {
  return json(body, status, { ...corsHeaders(request, env), ...extra });
}
function apiJsonWithCookies(request, env, body, status = 200, cookies = [], extra = {}) {
  const headers = new Headers(baseHeaders({ ...corsHeaders(request, env), ...extra }));
  for (const cookie of cookies) if (cookie) headers.append("set-cookie", cookie);
  return new Response(JSON.stringify(body), { status, headers });
}
function sessionCookie(token) {
  const maxAge = Math.floor(SESSION_MS / 1000);
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(String(token || ""))}; Path=/; Max-Age=${maxAge}; Secure; HttpOnly; SameSite=Lax`;
}
function clearSessionCookie() {
  return `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax`;
}
function clearOwnerPreviewCookie() {
  return `__sm_owner_preview=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax`;
}
async function internal(env, path, body = {}) {
  const r = await authStub(env).fetch(new Request("https://auth" + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  }));
  let data = null;
  try { data = await r.json(); } catch (_) {}
  return { response: r, body: data };
}
async function requireAuth(request, env, { admin = false } = {}) {
  const token = requestAuthToken(request);
  if (!token) return { ok: false, response: apiJson(request, env, { ok: false, error: "AUTH_REQUIRED" }, 401) };
  const { body } = await internal(env, "/auth/session", { token });
  if (!body?.ok) return { ok: false, response: apiJson(request, env, { ok: false, error: "AUTH_REQUIRED" }, 401) };
  if (admin && body.user?.role !== "super_admin") return { ok: false, response: apiJson(request, env, { ok: false, error: "FORBIDDEN" }, 403) };
  return { ok: true, token, session: body.session, user: body.user };
}

function cookieValue(request, name) {
  const raw = String(request.headers.get("cookie") || "");
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return "";
}

async function ownerPreviewCookie(env, user) {
  if (!user?.id || user?.role !== "super_admin" || !String(env.AUTH_PEPPER || "")) return "";
  const userId = String(user.id);
  const signature = await hmacSha256(String(env.AUTH_PEPPER), "owner-preview:" + userId);
  const value = encodeURIComponent(userId + "." + signature);
  return `__sm_owner_preview=${value}; Path=/; Max-Age=2592000; Secure; HttpOnly; SameSite=Lax`;
}

async function hasValidOwnerPreviewCookie(request, env) {
  const raw = cookieValue(request, "__sm_owner_preview");
  const dot = raw.indexOf(".");
  if (dot <= 0 || !String(env.AUTH_PEPPER || "")) return false;
  const userId = raw.slice(0, dot);
  const signature = raw.slice(dot + 1);
  const expected = await hmacSha256(String(env.AUTH_PEPPER), "owner-preview:" + userId);
  return safeEqual(signature, expected);
}

async function optionalAuth(request, env) {
  const token = requestAuthToken(request);
  if (!token) return null;
  try {
    const { body } = await internal(env, "/auth/session", { token });
    return body?.ok ? body : null;
  } catch (_) {
    return null;
  }
}

async function getReleaseState(env, subject = "") {
  const { body } = await internal(env, "/auth/system/release-state", {
    version: VERSION,
    releaseId: RELEASE_ID,
    previousVersion: PREVIOUS_PUBLISHED_VERSION,
    previousReleaseId: PREVIOUS_RELEASE_ID,
    subject
  });
  return body || {
    stagedVersion: VERSION,
    stagedReleaseId: RELEASE_ID,
    publishedVersion: PREVIOUS_PUBLISHED_VERSION,
    publishedReleaseId: PREVIOUS_RELEASE_ID,
    published: false
  };
}

async function handleApi(request, env, url) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  if (request.headers.get("origin") && !allowedOrigin(request, env)) return apiJson(request, env, { ok: false, error: "ORIGIN_NOT_ALLOWED" }, 403);

  const p = url.pathname;
  if (p === "/api/health") {
    const release = await getReleaseState(env, url.origin);
    return apiJson(request, env, {
      ok: true,
      version: VERSION,
      storage: "Cloudflare Durable Objects",
      auth: "PBKDF2-SHA256",
      release: {
        stagedVersion: release.stagedVersion || VERSION,
        stagedReleaseId: release.stagedReleaseId || RELEASE_ID,
        publishedVersion: release.publishedVersion || PREVIOUS_PUBLISHED_VERSION,
        publishedReleaseId: release.publishedReleaseId || PREVIOUS_RELEASE_ID,
        published: Boolean(release.published)
      }
    });
  }
  if (p === "/api/auth/status" && request.method === "GET") {
    const { body } = await internal(env, "/auth/status");
    return apiJson(request, env, { ok: true, ...(body || {}), version: VERSION, config: { ownerBootstrapConfigured: Boolean(String(env.OWNER_BOOTSTRAP_TOKEN || "")), authPepperConfigured: Boolean(String(env.AUTH_PEPPER || "")) } });
  }

  if (p === "/api/update/status" && request.method === "GET") {
    const auth = await optionalAuth(request, env);
    const release = await getReleaseState(env, url.origin);
    const isOwner = auth?.user?.role === "super_admin";
    const publicPublishedVersion = String(release.publishedVersion || PREVIOUS_PUBLISHED_VERSION);
    const rawPublicReleaseId = String(release.publishedReleaseId || PREVIOUS_RELEASE_ID);
    const publicPublishedReleaseId = publicPublishedVersion === PREVIOUS_PUBLISHED_VERSION
      ? PREVIOUS_RELEASE_ID
      : rawPublicReleaseId;
    const displayTargetVersion = isOwner ? String(release.stagedVersion || VERSION) : publicPublishedVersion;
    const targetReleaseId = isOwner ? String(release.stagedReleaseId || RELEASE_ID) : publicPublishedReleaseId;
    // البنايات القديمة من 3.8.7 كانت تقارن رقم الإصدار فقط. محرف غير مرئي يجعلها ترى تحديثًا جديدًا مع بقاء الرقم ظاهرًا 3.8.7.
    const targetVersion = targetReleaseId === RELEASE_ID ? UPDATE_SIGNAL_VERSION : displayTargetVersion;
    return apiJson(request, env, {
      ok: true,
      role: isOwner ? "owner" : "user",
      targetVersion,
      targetReleaseId,
      stagedVersion: String(release.stagedVersion || VERSION),
      stagedReleaseId: String(release.stagedReleaseId || RELEASE_ID),
      publishedVersion: publicPublishedVersion,
      publishedReleaseId: publicPublishedReleaseId,
      published: publicPublishedReleaseId === String(release.stagedReleaseId || RELEASE_ID),
      stagedAt: release.stagedAt || null,
      publishedAt: release.publishedAt || null
    });
  }

  if (p === "/api/admin/release-status" && request.method === "GET") {
    const a = await requireAuth(request, env, { admin: true });
    if (!a.ok) return a.response;
    const { response, body } = await internal(env, "/auth/admin/release-status", { token: a.token, version: VERSION, releaseId: RELEASE_ID, previousVersion: PREVIOUS_PUBLISHED_VERSION, previousReleaseId: PREVIOUS_RELEASE_ID, subject: url.origin });
    return apiJson(request, env, body || { ok: false }, response.status);
  }

  if (p === "/api/admin/publish-update" && request.method === "POST") {
    const a = await requireAuth(request, env, { admin: true });
    if (!a.ok) return a.response;
    const { response, body } = await internal(env, "/auth/admin/publish-update", { token: a.token, version: VERSION, releaseId: RELEASE_ID, previousVersion: PREVIOUS_PUBLISHED_VERSION, previousReleaseId: PREVIOUS_RELEASE_ID, subject: url.origin });
    return apiJson(request, env, body || { ok: false }, response.status);
  }

  if (p === "/api/admin/test-update-push" && request.method === "POST") {
    const a = await requireAuth(request, env, { admin: true });
    if (!a.ok) return a.response;
    const { response, body } = await internal(env, "/auth/admin/test-update-push", { token: a.token, subject: url.origin });
    return apiJson(request, env, body || { ok: false }, response.status);
  }

  if (["/api/auth/register", "/api/auth/login", "/api/auth/bootstrap-owner", "/api/auth/forgot", "/api/auth/reset-with-code"].includes(p) && request.method === "POST") {
    if (!String(env.AUTH_PEPPER || "") && p !== "/api/auth/forgot") return apiJson(request, env, { ok: false, error: "AUTH_PEPPER_NOT_CONFIGURED", detail: "AUTH_PEPPER is missing from Worker runtime bindings" }, 503);
    const b = await request.json().catch(() => ({}));
    let path = p.replace("/api", "");
    if (p === "/api/auth/bootstrap-owner") {
      const expected = String(env.OWNER_BOOTSTRAP_TOKEN || "");
      if (!expected) return apiJson(request, env, { ok: false, error: "OWNER_BOOTSTRAP_TOKEN_NOT_CONFIGURED", detail: "OWNER_BOOTSTRAP_TOKEN is missing from Worker runtime bindings" }, 503);
      if (!safeEqual(expected, String(b.bootstrapToken || ""))) return apiJson(request, env, { ok: false, error: "INVALID_BOOTSTRAP_TOKEN" }, 403);
      path = "/auth/register";
      b.superAdmin = true;
      b.bootstrapAllowed = true;
    }
    const { response, body } = await internal(env, path, { ...b, pepper: String(env.AUTH_PEPPER || ""), ip: request.headers.get("cf-connecting-ip") || "", origin: new URL(request.url).origin });
    if (p === "/api/auth/forgot") return apiJson(request, env, { ok: true }, response.ok ? 200 : response.status || 400);
    const cookies = [];
    if (body?.token) cookies.push(sessionCookie(body.token));
    const ownerCookie = await ownerPreviewCookie(env, body?.user);
    if (ownerCookie) cookies.push(ownerCookie);
    else cookies.push(clearOwnerPreviewCookie());
    return apiJsonWithCookies(request, env, body || { ok: false, error: "AUTH_FAILED" }, response.status || 400, cookies);
  }

  if (p === "/api/auth/browser-handoff" && request.method === "POST") {
    const a = await requireAuth(request, env);
    if (!a.ok) return a.response;
    const b = await request.json().catch(() => ({}));
    const { response, body } = await internal(env, "/auth/browser-handoff/create", { token: a.token, deviceLabel: b.deviceLabel });
    if (!response.ok) return apiJson(request, env, body || { ok: false }, response.status);
    // Preview access is intentionally never exported as a bearer token.
    // The staged build is available only while the current server-verified session belongs to the owner.
    return apiJson(request, env, { ...(body || { ok: true }) }, response.status);
  }
  if (p === "/api/auth/browser-handoff/consume" && request.method === "POST") {
    const b = await request.json().catch(() => ({}));
    const { response, body } = await internal(env, "/auth/browser-handoff/consume", { handoff: b.handoff, deviceLabel: b.deviceLabel });
    const cookies = [];
    if (body?.token) cookies.push(sessionCookie(body.token));
    const ownerCookie = await ownerPreviewCookie(env, body?.user);
    if (ownerCookie) cookies.push(ownerCookie);
    else cookies.push(clearOwnerPreviewCookie());
    return apiJsonWithCookies(request, env, body || { ok: false }, response.status, cookies);
  }

  if (p === "/api/push/status" && request.method === "GET") {
    const endpoint = String(url.searchParams.get("endpoint") || "");
    const auth = await optionalAuth(request, env);
    const { response, body } = await internal(env, "/auth/push/status", { subject: url.origin, endpoint, userId: auth?.user?.id || "" });
    return apiJson(request, env, body || { ok: false }, response.status);
  }
  if (p === "/api/push/subscribe" && request.method === "POST") {
    const b = await request.json().catch(() => ({}));
    const auth = await optionalAuth(request, env);
    const { response, body } = await internal(env, "/auth/push/subscribe", {
      subscription: b.subscription,
      deviceLabel: b.deviceLabel,
      appVersion: b.appVersion,
      userId: auth?.user?.id || "",
      role: auth?.user?.role || "user",
      subject: url.origin
    });
    return apiJson(request, env, body || { ok: false }, response.status);
  }
  if (p === "/api/push/unsubscribe" && request.method === "POST") {
    const b = await request.json().catch(() => ({}));
    const { response, body } = await internal(env, "/auth/push/unsubscribe", { endpoint: b.endpoint });
    return apiJson(request, env, body || { ok: false }, response.status);
  }
  if (p === "/api/push/test-self" && request.method === "POST") {
    const b = await request.json().catch(() => ({}));
    const auth = await optionalAuth(request, env);
    const { response, body } = await internal(env, "/auth/push/test-self", {
      endpoint: b.endpoint,
      userId: auth?.user?.id || "",
      subject: url.origin
    });
    return apiJson(request, env, body || { ok: false }, response.status);
  }

  if (p === "/api/sync-ticket" && request.method === "POST") {
    if (!String(env.AUTH_PEPPER || "")) return apiJson(request, env, { ok: false, error: "AUTH_PEPPER_NOT_CONFIGURED" }, 503);
    const a = await requireAuth(request, env);
    if (!a.ok) return a.response;
    const created = await createSyncTicket(env, a.user);
    return apiJson(request, env, { ok: true, ...created });
  }

  if (p === "/api/sync" && request.method === "GET") {
    if (String(request.headers.get("upgrade") || "").toLowerCase() !== "websocket") {
      return apiJson(request, env, { ok: false, error: "WEBSOCKET_REQUIRED" }, 426);
    }
    if (!String(env.AUTH_PEPPER || "")) return apiJson(request, env, { ok: false, error: "AUTH_PEPPER_NOT_CONFIGURED" }, 503);
    const verified = await verifySyncTicket(env, url.searchParams.get("ticket"));
    if (!verified) return apiJson(request, env, { ok: false, error: "AUTH_REQUIRED" }, 401);
    const proxyRequest = new Request("https://account/data/live", { method: "GET", headers: request.headers });
    return accountStub(env, verified.accountId).fetch(proxyRequest);
  }

  if (p === "/api/auth/session" && request.method === "GET") {
    const a = await requireAuth(request, env);
    if (!a.ok) return a.response;
    const cookies = [sessionCookie(a.token)];
    const ownerCookie = await ownerPreviewCookie(env, a.user);
    if (ownerCookie) cookies.push(ownerCookie);
    else cookies.push(clearOwnerPreviewCookie());
    return apiJsonWithCookies(request, env, { ok: true, token: a.token, user: a.user, session: a.session }, 200, cookies);
  }
  if (p === "/api/auth/logout" && request.method === "POST") {
    const token = requestAuthToken(request);
    if (token) await internal(env, "/auth/logout", { token });
    return apiJsonWithCookies(request, env, { ok: true }, 200, [
      clearSessionCookie(),
      clearOwnerPreviewCookie()
    ]);
  }
  if (p === "/api/auth/change-password" && request.method === "POST") {
    if (!env.AUTH_PEPPER) return apiJson(request, env, { ok: false, error: "AUTH_PEPPER_NOT_CONFIGURED" }, 503);
    const a = await requireAuth(request, env);
    if (!a.ok) return a.response;
    const b = await request.json().catch(() => ({}));
    const { response, body } = await internal(env, "/auth/change-password", { token: a.token, currentPassword: b.currentPassword, newPassword: b.newPassword, pepper: String(env.AUTH_PEPPER || "") });
    return apiJson(request, env, body || { ok: false }, response.status);
  }

  if (p === "/api/app-lock/request-reset" && request.method === "POST") {
    const a = await requireAuth(request, env);
    if (!a.ok) return a.response;
    const { response, body } = await internal(env, "/auth/app-lock/request-reset", { token: a.token, origin: url.origin });
    return apiJson(request, env, body || { ok: false }, response.status);
  }
  if (p === "/api/app-lock/cancel-reset" && request.method === "POST") {
    const a = await requireAuth(request, env);
    if (!a.ok) return a.response;
    const { response, body } = await internal(env, "/auth/app-lock/cancel-reset", { token: a.token });
    return apiJson(request, env, body || { ok: false }, response.status);
  }

  if (p === "/api/admin/push-status" && request.method === "GET") {
    const a = await requireAuth(request, env, { admin: true });
    if (!a.ok) return a.response;
    const { response, body } = await internal(env, "/auth/admin/push-status", { token: a.token, subject: new URL(request.url).origin });
    return apiJson(request, env, body || { ok: false }, response.status);
  }
  if (p === "/api/admin/push-subscribe" && request.method === "POST") {
    const a = await requireAuth(request, env, { admin: true });
    if (!a.ok) return a.response;
    const b = await request.json().catch(() => ({}));
    const { response, body } = await internal(env, "/auth/admin/push-subscribe", { token: a.token, subscription: b.subscription, deviceLabel: b.deviceLabel, subject: new URL(request.url).origin });
    return apiJson(request, env, body || { ok: false }, response.status);
  }
  if (p === "/api/admin/push-unsubscribe" && request.method === "POST") {
    const a = await requireAuth(request, env, { admin: true });
    if (!a.ok) return a.response;
    const b = await request.json().catch(() => ({}));
    const { response, body } = await internal(env, "/auth/admin/push-unsubscribe", { token: a.token, endpoint: b.endpoint });
    return apiJson(request, env, body || { ok: false }, response.status);
  }

  if (p === "/api/admin/users" && request.method === "GET") {
    const a = await requireAuth(request, env, { admin: true });
    if (!a.ok) return a.response;
    const { response, body } = await internal(env, "/auth/admin/users", { token: a.token });
    return apiJson(request, env, body || { ok: false }, response.status);
  }
  if (p === "/api/admin/reset-code" && request.method === "POST") {
    if (!env.AUTH_PEPPER) return apiJson(request, env, { ok: false, error: "AUTH_PEPPER_NOT_CONFIGURED" }, 503);
    const a = await requireAuth(request, env, { admin: true });
    if (!a.ok) return a.response;
    const b = await request.json().catch(() => ({}));
    const { response, body } = await internal(env, "/auth/admin/reset-code", { token: a.token, userId: b.userId, pepper: String(env.AUTH_PEPPER || "") });
    return apiJson(request, env, body || { ok: false }, response.status);
  }
  if (p === "/api/admin/user-status" && request.method === "POST") {
    const a = await requireAuth(request, env, { admin: true });
    if (!a.ok) return a.response;
    const b = await request.json().catch(() => ({}));
    const { response, body } = await internal(env, "/auth/admin/status", { token: a.token, userId: b.userId, status: b.status });
    return apiJson(request, env, body || { ok: false }, response.status);
  }
  if (p === "/api/admin/logout-user" && request.method === "POST") {
    const a = await requireAuth(request, env, { admin: true });
    if (!a.ok) return a.response;
    const b = await request.json().catch(() => ({}));
    const { response, body } = await internal(env, "/auth/admin/logout-user", { token: a.token, userId: b.userId });
    return apiJson(request, env, body || { ok: false }, response.status);
  }
  if (p === "/api/admin/reset-app-lock" && request.method === "POST") {
    const a = await requireAuth(request, env, { admin: true });
    if (!a.ok) return a.response;
    const b = await request.json().catch(() => ({}));
    const { response, body } = await internal(env, "/auth/admin/reset-app-lock", { token: a.token, userId: b.userId });
    return apiJson(request, env, body || { ok: false }, response.status);
  }

  if (p === "/api/data" && request.method === "GET") {
    const a = await requireAuth(request, env);
    if (!a.ok) return a.response;
    const r = await accountStub(env, a.user.accountId).fetch("https://account/data/get");
    const body = await r.json().catch(() => ({ ok: false }));
    return apiJson(request, env, body, r.status);
  }
  if (p === "/api/data" && request.method === "PUT") {
    const a = await requireAuth(request, env);
    if (!a.ok) return a.response;
    const raw = await request.text();
    if (raw.length > 1500000) return apiJson(request, env, { ok: false, error: "DATA_TOO_LARGE" }, 413);
    const r = await accountStub(env, a.user.accountId).fetch(new Request("https://account/data/put", { method: "POST", headers: { "content-type": "application/json" }, body: raw }));
    const body = await r.json().catch(() => ({ ok: false }));
    return apiJson(request, env, body, r.status);
  }

  return apiJson(request, env, { ok: false, error: "NOT_FOUND" }, 404);
}

export class SalaryStore extends DurableObject {
  constructor(ctx, env) { super(ctx, env); this.ctx = ctx; this.env = env; }
  async audit(type, details = {}) {
    try { await this.ctx.storage.put(`audit:${Date.now()}:${crypto.randomUUID()}`, { type, at: Date.now(), ...details }); } catch (_) {}
  }
  async publicUser(u) {
    return u ? { id: u.id, username: u.username, email: u.email, role: u.role, status: u.status, accountId: u.accountId, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt || null, appLockResetVersion: Number(u.appLockResetVersion || 0) } : null;
  }
  async createSession(user, deviceLabel = "") {
    const token = randomToken(32);
    const hash = await sha256(token);
    const now = Date.now();
    const session = { id: crypto.randomUUID(), userId: user.id, accountId: user.accountId, createdAt: now, lastSeenAt: now, expiresAt: now + SESSION_MS, deviceLabel: String(deviceLabel || "").slice(0, 80) };
    await this.ctx.storage.put(`session:${hash}`, session);
    return { token, session };
  }
  async getSession(token, touch = true) {
    if (!token) return null;
    const hash = await sha256(token);
    const key = `session:${hash}`;
    const session = await this.ctx.storage.get(key);
    if (!session || Number(session.expiresAt || 0) < Date.now()) return null;
    const user = await this.ctx.storage.get(`user:${session.userId}`);
    if (!user || user.status !== "active") return null;
    if (touch && Date.now() - Number(session.lastSeenAt || 0) > 30 * 86400000) {
      session.lastSeenAt = Date.now();
      session.expiresAt = Date.now() + SESSION_MS;
      await this.ctx.storage.put(key, session);
    }
    return { hash, key, session, user };
  }
  async revokeUserSessions(userId) {
    const sessions = await this.ctx.storage.list({ prefix: "session:" });
    const keys = [];
    for (const [k, s] of sessions.entries()) if (s?.userId === userId) keys.push(k);
    if (keys.length) await this.ctx.storage.delete(keys);
  }
  async resolveUserId(login) {
    const raw = String(login || "").trim();
    if (!raw) return null;
    return await this.ctx.storage.get(raw.includes("@") ? `email:${normEmail(raw)}` : `username:${normUsername(raw)}`);
  }
  async ensureVapid(subject = "") {
    let vapid = await this.ctx.storage.get("push:vapid");
    if (vapid?.publicKey && vapid?.privateKey) return vapid;
    const keyPair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"]
    );
    const publicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey));
    const privateJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
    vapid = {
      subject: String(subject || "https://salary-manager.alromaithi-3bo0d.workers.dev").slice(0, 240),
      publicKey: b64(publicRaw),
      privateKey: String(privateJwk.d || ""),
      createdAt: Date.now()
    };
    if (!vapid.privateKey) throw new Error("Unable to export VAPID private key");
    await this.ctx.storage.put("push:vapid", vapid);
    return vapid;
  }
  async sendPushToPrefix(prefix, payloadData, subject = "") {
    const vapid = await this.ensureVapid(subject);
    const subscriptions = await this.ctx.storage.list({ prefix });
    if (!subscriptions.size) return { sent: 0, failed: 0, removed: 0, subscriptionCount: 0, statusCounts: {} };
    const message = { data: JSON.stringify(payloadData), options: { ttl: 86400, urgency: "high" } };
    let sent = 0, failed = 0, removed = 0;
    const statusCounts = {};
    for (const [key, record] of subscriptions.entries()) {
      const subscription = record?.subscription;
      if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
        await this.ctx.storage.delete(key);
        removed += 1;
        failed += 1;
        statusCounts.invalid = (statusCounts.invalid || 0) + 1;
        continue;
      }
      try {
        const requestInit = await buildPushPayload(message, subscription, vapid);
        const response = await fetch(subscription.endpoint, requestInit);
        const statusKey = String(response.status || 0);
        statusCounts[statusKey] = (statusCounts[statusKey] || 0) + 1;
        if (response.ok || response.status === 201) sent += 1;
        else failed += 1;
        if (response.status === 404 || response.status === 410) {
          await this.ctx.storage.delete(key);
          removed += 1;
        }
      } catch (error) {
        failed += 1;
        statusCounts.exception = (statusCounts.exception || 0) + 1;
        console.error("Push delivery failed", prefix, error);
      }
    }
    return { sent, failed, removed, subscriptionCount: subscriptions.size, statusCounts };
  }

  async sendOwnerReleasePush(payloadData, subject = "") {
    const ownerSpecific = await this.ctx.storage.list({ prefix: "push:owner:" });
    const general = await this.ctx.storage.list({ prefix: "push:all:" });
    const records = new Map();
    for (const [key, record] of ownerSpecific.entries()) {
      const endpoint = record?.subscription?.endpoint;
      if (endpoint) records.set(endpoint, { key, record });
    }
    for (const [key, record] of general.entries()) {
      if (record?.role !== "super_admin") continue;
      const endpoint = record?.subscription?.endpoint;
      if (endpoint && !records.has(endpoint)) records.set(endpoint, { key, record });
    }
    if (!records.size) return { sent: 0, removed: 0, subscriptionCount: 0 };
    const vapid = await this.ensureVapid(subject);
    const message = { data: JSON.stringify(payloadData), options: { ttl: 86400, urgency: "high" } };
    let sent = 0, removed = 0;
    for (const { key, record } of records.values()) {
      const subscription = record?.subscription;
      try {
        const requestInit = await buildPushPayload(message, subscription, vapid);
        const response = await fetch(subscription.endpoint, requestInit);
        if (response.ok || response.status === 201) sent += 1;
        if (response.status === 404 || response.status === 410) { await this.ctx.storage.delete(key); removed += 1; }
      } catch (error) { console.error("Owner release push failed", error); }
    }
    return { sent, removed, subscriptionCount: records.size };
  }

  async ensureReleaseState(version, previousVersion, subject = "", notifyOwner = false, releaseId = "", previousReleaseId = "") {
    // الإصدارات تُعرض للمستخدم برقم VERSION، بينما RELEASE_ID يميز بناءً جديدًا حتى لو بقي رقم الإصدار نفسه.
    version = String(version || VERSION).slice(0, 30);
    releaseId = String(releaseId || version || RELEASE_ID).slice(0, 80);
    previousVersion = String(previousVersion || PREVIOUS_PUBLISHED_VERSION).slice(0, 30);
    previousReleaseId = String(previousReleaseId || previousVersion || PREVIOUS_RELEASE_ID).slice(0, 80);

    let publishedVersion = String(await this.ctx.storage.get("release:publishedVersion") || "");
    if (!publishedVersion) {
      publishedVersion = previousVersion;
      await this.ctx.storage.put("release:publishedVersion", publishedVersion);
    }
    let publishedReleaseId = String(await this.ctx.storage.get("release:publishedReleaseId") || "");
    if (!publishedReleaseId) {
      publishedReleaseId = previousReleaseId;
      await this.ctx.storage.put("release:publishedReleaseId", publishedReleaseId);
    }

    // Repair any inconsistent pre-publish state created by earlier 3.8.7 staging builds.
    // Public users must remain on the canonical 3.8.6 release until the owner explicitly publishes 3.8.7.
    const hasAccidentalReleaseId = ACCIDENTAL_PREPUBLISH_RELEASE_IDS.has(publishedReleaseId);
    const previousVersionHasWrongReleaseId =
      publishedVersion === PREVIOUS_PUBLISHED_VERSION && publishedReleaseId !== PREVIOUS_RELEASE_ID;
    const currentVersionWasAccidentallyPublished =
      publishedVersion === VERSION && hasAccidentalReleaseId;
    if (previousVersionHasWrongReleaseId || currentVersionWasAccidentallyPublished) {
      const fromVersion = publishedVersion;
      const fromReleaseId = publishedReleaseId;
      publishedVersion = PREVIOUS_PUBLISHED_VERSION;
      publishedReleaseId = PREVIOUS_RELEASE_ID;
      await this.ctx.storage.put("release:publishedVersion", publishedVersion);
      await this.ctx.storage.put("release:publishedReleaseId", publishedReleaseId);
      await this.ctx.storage.delete("release:publishedAt");
      await this.ctx.storage.put("push:lastUpdateVersion", publishedVersion);
      await this.ctx.storage.put("push:lastUpdateReleaseId", publishedReleaseId);
      await this.audit("release-published-state-repaired", { fromVersion, fromReleaseId, toVersion: publishedVersion, toReleaseId: publishedReleaseId });
    }

    let stagedVersion = String(await this.ctx.storage.get("release:stagedVersion") || "");
    let stagedReleaseId = String(await this.ctx.storage.get("release:stagedReleaseId") || "");
    let stagedAt = Number(await this.ctx.storage.get("release:stagedAt") || 0);
    let previewToken = String(await this.ctx.storage.get("release:previewToken") || "");

    if (stagedReleaseId !== releaseId) {
      stagedVersion = version;
      stagedReleaseId = releaseId;
      stagedAt = Date.now();
      previewToken = randomToken(18);
      await this.ctx.storage.put("release:stagedVersion", stagedVersion);
      await this.ctx.storage.put("release:stagedReleaseId", stagedReleaseId);
      await this.ctx.storage.put("release:stagedAt", stagedAt);
      await this.ctx.storage.put("release:previewToken", previewToken);
      await this.ctx.storage.delete("release:ownerNotifiedVersion");
      await this.ctx.storage.delete("release:ownerNotifiedReleaseId");
      await this.ctx.storage.delete("release:ownerLastPushResult");
    } else {
      if (stagedVersion !== version) {
        stagedVersion = version;
        await this.ctx.storage.put("release:stagedVersion", stagedVersion);
      }
      if (!previewToken) {
        previewToken = randomToken(18);
        await this.ctx.storage.put("release:previewToken", previewToken);
      }
    }

    const published = publishedReleaseId === stagedReleaseId;
    let ownerNotification = await this.ctx.storage.get("release:ownerLastPushResult");
    if (notifyOwner && !published) {
      const notifiedReleaseId = String(await this.ctx.storage.get("release:ownerNotifiedReleaseId") || "");
      if (notifiedReleaseId !== stagedReleaseId) {
        const result = await this.sendOwnerReleasePush({
          title: "تحديث جديد بانتظار المراجعة · مدير الراتب",
          body: `يوجد تحديث جديد للإصدار ${stagedVersion}. افتح إدارة المستخدمين وراجعه قبل نشره للمستخدمين.`,
          icon: "./icons/choice/gold-192.png",
          badge: "./icons/choice/gold-192.png",
          url: "./?open=admin",
          tag: `salary-manager-owner-review-${stagedReleaseId}`
        }, subject);
        ownerNotification = { ...result, releaseId: stagedReleaseId, at: Date.now() };
        await this.ctx.storage.put("release:ownerLastPushResult", ownerNotification);
        // لا نعتبره مُبلّغًا إلا إذا وصل فعليًا إلى جهاز واحد على الأقل؛ بذلك يمكن إعادة المحاولة بعد إعادة ربط اشتراك الجهاز عند الدخول.
        if (Number(result.sent || 0) > 0) await this.ctx.storage.put("release:ownerNotifiedReleaseId", stagedReleaseId);
      }
    }
    return {
      stagedVersion,
      stagedReleaseId,
      publishedVersion,
      publishedReleaseId,
      published,
      stagedAt: stagedAt || null,
      publishedAt: Number(await this.ctx.storage.get("release:publishedAt") || 0) || null,
      previewToken,
      ownerNotification: ownerNotification || null
    };
  }

  async sendOwnerResetPush(user, origin = "") {
    try {
      const vapid = await this.ctx.storage.get("push:vapid");
      if (!vapid?.publicKey || !vapid?.privateKey) return;
      const subscriptions = await this.ctx.storage.list({ prefix: "push:owner:" });
      if (!subscriptions.size) return;
      const payloadData = {
        title: "طلب إعادة تعيين كلمة المرور",
        body: "طلب المستخدم " + String(user?.username || "أحد المستخدمين") + " رمزًا لإعادة تعيين كلمة المرور.",
        icon: "./icons/choice/gold-192.png",
        badge: "./icons/choice/gold-192.png",
        url: "./?open=admin",
        tag: "salary-password-reset"
      };
      const message = { data: JSON.stringify(payloadData), options: { ttl: 3600, urgency: "high" } };
      for (const [key, record] of subscriptions.entries()) {
        const subscription = record?.subscription;
        if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
          await this.ctx.storage.delete(key);
          continue;
        }
        try {
          const requestInit = await buildPushPayload(message, subscription, vapid);
          const response = await fetch(subscription.endpoint, requestInit);
          if (response.status === 404 || response.status === 410) await this.ctx.storage.delete(key);
        } catch (error) {
          console.error("Owner reset push failed", error);
        }
      }
    } catch (error) {
      console.error("Owner reset push setup failed", error);
    }
  }

  async sendOwnerAppLockResetPush(user, origin = "") {
    try {
      const vapid = await this.ctx.storage.get("push:vapid");
      if (!vapid?.publicKey || !vapid?.privateKey) return;
      const subscriptions = await this.ctx.storage.list({ prefix: "push:owner:" });
      if (!subscriptions.size) return;
      const payloadData = {
        title: "طلب إعادة تعيين قفل التطبيق",
        body: "طلب المستخدم " + String(user?.username || "أحد المستخدمين") + " إلغاء رمز قفل مدير الراتب.",
        icon: "./icons/choice/gold-192.png",
        badge: "./icons/choice/gold-192.png",
        url: "./?open=admin",
        tag: "salary-app-lock-reset"
      };
      const message = { data: JSON.stringify(payloadData), options: { ttl: 3600, urgency: "high" } };
      for (const [key, record] of subscriptions.entries()) {
        const subscription = record?.subscription;
        if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
          await this.ctx.storage.delete(key);
          continue;
        }
        try {
          const requestInit = await buildPushPayload(message, subscription, vapid);
          const response = await fetch(subscription.endpoint, requestInit);
          if (response.status === 404 || response.status === 410) await this.ctx.storage.delete(key);
        } catch (error) {
          console.error("Owner app-lock reset push failed", error);
        }
      }
    } catch (error) {
      console.error("Owner app-lock reset push setup failed", error);
    }
  }

  async authFetch(request, url) {
    const p = url.pathname;
    const b = await request.json().catch(() => ({}));
    const pepper = String(b.pepper || this.env.AUTH_PEPPER || "");
    if (p === "/auth/status") {
      const meta = await this.ctx.storage.get("meta");
      const users = await this.ctx.storage.list({ prefix: "user:" });
      return json({ ok: true, ownerReady: !!meta?.ownerUserId, userCount: users.size, bootstrapRequired: !meta?.ownerUserId });
    }
    if (p === "/auth/register") {
      const meta = (await this.ctx.storage.get("meta")) || {};
      const superAdmin = !!b.superAdmin;
      if (superAdmin && meta.ownerUserId) return json({ ok: false, error: "OWNER_ALREADY_EXISTS" }, 409);
      if (superAdmin && !b.bootstrapAllowed) return json({ ok: false, error: "BOOTSTRAP_REQUIRED" }, 403);
      if (!superAdmin && !meta.ownerUserId) return json({ ok: false, error: "OWNER_SETUP_REQUIRED" }, 409);
      const username = String(b.username || "").trim(), email = String(b.email || "").trim(), password = String(b.password || "");
      const un = normUsername(username), em = normEmail(email);
      if (!validUsername(username)) return json({ ok: false, error: "INVALID_USERNAME" }, 400);
      if (!validEmail(email)) return json({ ok: false, error: "INVALID_EMAIL" }, 400);
      if (!validPassword(password)) return json({ ok: false, error: "WEAK_PASSWORD" }, 400);
      if (await this.ctx.storage.get(`username:${un}`)) return json({ ok: false, error: "USERNAME_EXISTS" }, 409);
      if (await this.ctx.storage.get(`email:${em}`)) return json({ ok: false, error: "EMAIL_EXISTS" }, 409);
      const id = crypto.randomUUID(), accountId = crypto.randomUUID(), salt = randomToken(18), now = Date.now();
      const user = { id, username, email, usernameNormalized: un, emailNormalized: em, role: superAdmin ? "super_admin" : "user", status: "active", accountId, passwordSalt: salt, passwordHash: await passwordHash(password, salt, pepper), passwordIterations: PBKDF2_ITERATIONS, createdAt: now, lastLoginAt: now, failedLoginCount: 0, lockUntil: 0 };
      await this.ctx.storage.put(`user:${id}`, user);
      await this.ctx.storage.put(`username:${un}`, id);
      await this.ctx.storage.put(`email:${em}`, id);
      if (superAdmin) { meta.ownerUserId = id; meta.createdAt = meta.createdAt || now; await this.ctx.storage.put("meta", meta); }
      const created = await this.createSession(user, b.deviceLabel);
      await this.audit(superAdmin ? "owner-bootstrap" : "register", { userId: id });
      return json({ ok: true, token: created.token, session: created.session, user: await this.publicUser(user) });
    }
    if (p === "/auth/login") {
      const id = await this.resolveUserId(b.login);
      if (!id) return json({ ok: false, error: "INVALID_CREDENTIALS" }, 401);
      const user = await this.ctx.storage.get(`user:${id}`);
      if (!user || user.status !== "active") return json({ ok: false, error: user?.status === "suspended" ? "ACCOUNT_SUSPENDED" : "INVALID_CREDENTIALS" }, 403);
      if (user.lockUntil && user.lockUntil > Date.now()) return json({ ok: false, error: "TRY_LATER" }, 429);
      const h = await passwordHash(String(b.password || ""), user.passwordSalt, pepper, user.passwordIterations || PBKDF2_ITERATIONS);
      if (!safeEqual(h, user.passwordHash)) {
        user.failedLoginCount = Number(user.failedLoginCount || 0) + 1;
        if (user.failedLoginCount >= 8) { user.lockUntil = Date.now() + 2 * 60 * 1000; user.failedLoginCount = 0; }
        await this.ctx.storage.put(`user:${id}`, user);
        return json({ ok: false, error: "INVALID_CREDENTIALS" }, 401);
      }
      user.failedLoginCount = 0; user.lockUntil = 0; user.lastLoginAt = Date.now();
      await this.ctx.storage.put(`user:${id}`, user);
      const created = await this.createSession(user, b.deviceLabel);
      await this.audit("login", { userId: id });
      return json({ ok: true, token: created.token, session: created.session, user: await this.publicUser(user) });
    }
    if (p === "/auth/session") {
      const found = await this.getSession(String(b.token || ""));
      if (!found) return json({ ok: false, error: "AUTH_REQUIRED" }, 401);
      return json({ ok: true, session: found.session, user: await this.publicUser(found.user) });
    }
    if (p === "/auth/browser-handoff/create") {
      const found = await this.getSession(String(b.token || ""));
      if (!found) return json({ ok: false, error: "AUTH_REQUIRED" }, 401);
      const handoff = randomToken(32);
      const hash = await sha256(handoff);
      const expiresAt = Date.now() + 10 * 60 * 1000;
      await this.ctx.storage.put(`handoff:${hash}`, { userId: found.user.id, createdAt: Date.now(), expiresAt, remainingUses: 3 });
      await this.audit("browser-handoff-create", { userId: found.user.id });
      return json({ ok: true, handoff, expiresAt });
    }
    if (p === "/auth/browser-handoff/consume") {
      const handoff = String(b.handoff || "");
      if (!handoff) return json({ ok: false, error: "INVALID_HANDOFF" }, 400);
      const key = `handoff:${await sha256(handoff)}`;
      const record = await this.ctx.storage.get(key);
      if (!record || Number(record.expiresAt || 0) < Date.now()) {
        if (record) await this.ctx.storage.delete(key);
        return json({ ok: false, error: "INVALID_HANDOFF" }, 400);
      }
      const uses = Math.max(1, Number(record.remainingUses || 1));
      if (uses <= 1) await this.ctx.storage.delete(key);
      else { record.remainingUses = uses - 1; await this.ctx.storage.put(key, record); }
      const user = await this.ctx.storage.get(`user:${record.userId}`);
      if (!user || user.status !== "active") return json({ ok: false, error: "AUTH_REQUIRED" }, 401);
      const created = await this.createSession(user, b.deviceLabel || "Browser handoff");
      await this.audit("browser-handoff-consume", { userId: user.id });
      return json({ ok: true, token: created.token, session: created.session, user: await this.publicUser(user) });
    }
    if (p === "/auth/logout") {
      const found = await this.getSession(String(b.token || ""), false);
      if (found) await this.ctx.storage.delete(found.key);
      return json({ ok: true });
    }
    if (p === "/auth/change-password") {
      const found = await this.getSession(String(b.token || ""));
      if (!found) return json({ ok: false, error: "AUTH_REQUIRED" }, 401);
      if (!validPassword(b.newPassword)) return json({ ok: false, error: "WEAK_PASSWORD" }, 400);
      const old = await passwordHash(String(b.currentPassword || ""), found.user.passwordSalt, pepper, found.user.passwordIterations || PBKDF2_ITERATIONS);
      if (!safeEqual(old, found.user.passwordHash)) return json({ ok: false, error: "INVALID_CREDENTIALS" }, 401);
      const salt = randomToken(18);
      found.user.passwordSalt = salt;
      found.user.passwordHash = await passwordHash(String(b.newPassword), salt, pepper);
      found.user.passwordIterations = PBKDF2_ITERATIONS;
      await this.ctx.storage.put(`user:${found.user.id}`, found.user);
      await this.audit("password-change", { userId: found.user.id });
      return json({ ok: true });
    }
    if (p === "/auth/forgot") {
      const id = await this.resolveUserId(b.login);
      if (id) {
        const user = await this.ctx.storage.get(`user:${id}`);
        const old = await this.ctx.storage.get(`reset:${id}`) || {};
        await this.ctx.storage.put(`reset:${id}`, { ...old, userId: id, requestedAt: Date.now(), requestedIp: String(b.ip || "").slice(0, 80) });
        await this.audit("reset-request", { userId: id });
        if (user) await this.sendOwnerResetPush(user, b.origin);
      }
      return json({ ok: true });
    }
    if (p === "/auth/reset-with-code") {
      if (!validPassword(b.newPassword)) return json({ ok: false, error: "WEAK_PASSWORD" }, 400);
      const id = await this.resolveUserId(b.login);
      if (!id) return json({ ok: false, error: "INVALID_RESET_CODE" }, 400);
      const rec = await this.ctx.storage.get(`reset:${id}`);
      const code = String(b.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (!rec?.codeHash || Number(rec.expiresAt || 0) < Date.now()) return json({ ok: false, error: "INVALID_RESET_CODE" }, 400);
      const codeHash = await sha256(code + "\0" + pepper);
      if (!safeEqual(codeHash, rec.codeHash)) return json({ ok: false, error: "INVALID_RESET_CODE" }, 400);
      const user = await this.ctx.storage.get(`user:${id}`);
      if (!user || user.status !== "active") return json({ ok: false, error: "ACCOUNT_SUSPENDED" }, 403);
      const salt = randomToken(18);
      user.passwordSalt = salt;
      user.passwordHash = await passwordHash(String(b.newPassword), salt, pepper);
      user.passwordIterations = PBKDF2_ITERATIONS;
      user.failedLoginCount = 0; user.lockUntil = 0;
      await this.ctx.storage.put(`user:${id}`, user);
      await this.ctx.storage.delete(`reset:${id}`);
      await this.revokeUserSessions(id);
      await this.audit("reset-complete", { userId: id });
      return json({ ok: true });
    }

    if (p === "/auth/system/release-state") {
      const state = await this.ensureReleaseState(b.version, b.previousVersion, b.subject, Boolean(b.notifyOwner), b.releaseId, b.previousReleaseId);
      return json({ ok: true, ...state });
    }

    if (p === "/auth/push/status") {
      const vapid = await this.ensureVapid(b.subject);
      const endpoint = String(b.endpoint || "");
      const subscribed = endpoint ? !!(await this.ctx.storage.get("push:all:" + await sha256(endpoint))) : false;
      const subscriptions = await this.ctx.storage.list({ prefix: "push:all:" });
      const userId = String(b.userId || "");
      let accountSubscribed = false;
      if (userId) {
        for (const record of subscriptions.values()) {
          if (String(record?.userId || "") === userId) { accountSubscribed = true; break; }
        }
      }
      return json({ ok: true, publicKey: vapid.publicKey, subscriptionCount: subscriptions.size, subscribed, accountSubscribed });
    }
    if (p === "/auth/push/subscribe") {
      const subscription = b.subscription;
      if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) return json({ ok: false, error: "INVALID_PUSH_SUBSCRIPTION" }, 400);
      await this.ensureVapid(b.subject);
      const key = "push:all:" + await sha256(subscription.endpoint);
      const existing = await this.ctx.storage.get(key);
      const record = {
        subscription,
        deviceLabel: String(b.deviceLabel || "User device").slice(0, 100),
        appVersion: String(b.appVersion || "").slice(0, 30),
        userId: String(b.userId || existing?.userId || "").slice(0, 80),
        role: b.role === "super_admin" || existing?.role === "super_admin" ? "super_admin" : "user",
        createdAt: Number(existing?.createdAt || Date.now()),
        updatedAt: Date.now()
      };
      await this.ctx.storage.put(key, record);
      if (record.role === "super_admin") {
        // Keep an owner-specific copy for password-reset alerts and staged-release notifications.
        await this.ctx.storage.put("push:owner:" + await sha256(subscription.endpoint), {
          subscription,
          ownerUserId: record.userId,
          deviceLabel: record.deviceLabel,
          createdAt: record.createdAt,
          updatedAt: Date.now()
        });
      }
      const last = await this.ctx.storage.get("push:lastUpdateVersion");
      if (!last && b.appVersion) await this.ctx.storage.put("push:lastUpdateVersion", String(b.appVersion).slice(0, 30));
      const subscriptions = await this.ctx.storage.list({ prefix: "push:all:" });
      return json({ ok: true, subscriptionCount: subscriptions.size });
    }
    if (p === "/auth/push/unsubscribe") {
      const endpoint = String(b.endpoint || "");
      if (endpoint) await this.ctx.storage.delete("push:all:" + await sha256(endpoint));
      return json({ ok: true });
    }
    if (p === "/auth/push/test-self") {
      const endpoint = String(b.endpoint || "");
      if (!endpoint) return json({ ok: false, error: "INVALID_PUSH_SUBSCRIPTION" }, 400);
      const key = "push:all:" + await sha256(endpoint);
      const record = await this.ctx.storage.get(key);
      if (!record?.subscription) return json({ ok: false, error: "PUSH_NOT_SUBSCRIBED" }, 404);
      const requestedUserId = String(b.userId || "");
      if (requestedUserId && record.userId && String(record.userId) !== requestedUserId) return json({ ok: false, error: "FORBIDDEN" }, 403);
      const vapid = await this.ensureVapid(b.subject);
      const payloadData = {
        title: "اختبار إشعارات مدير الراتب ✓",
        body: "الإشعارات الخارجية تعمل على هذا الجهاز. سيصلك إشعار التحديث بعد اعتماد المالك للإصدار.",
        icon: "./icons/choice/gold-192.png",
        badge: "./icons/choice/gold-192.png",
        url: "./",
        tag: "salary-manager-self-test"
      };
      const message = { data: JSON.stringify(payloadData), options: { ttl: 300, urgency: "high" } };
      try {
        const requestInit = await buildPushPayload(message, record.subscription, vapid);
        const response = await fetch(record.subscription.endpoint, requestInit);
        if (response.status === 404 || response.status === 410) await this.ctx.storage.delete(key);
        const sent = response.ok || response.status === 201 ? 1 : 0;
        await this.audit("push-self-test", { userId: record.userId || requestedUserId || "", sent, status: response.status });
        return json({ ok: sent > 0, sent, status: response.status, removed: response.status === 404 || response.status === 410 ? 1 : 0 }, sent > 0 ? 200 : 502);
      } catch (error) {
        console.error("Self push test failed", error);
        await this.audit("push-self-test", { userId: record.userId || requestedUserId || "", sent: 0, status: "exception" });
        return json({ ok: false, sent: 0, status: "exception", error: "PUSH_DELIVERY_FAILED" }, 502);
      }
    }
    if (p === "/auth/system/broadcast-update") {
      // Backward-compatible alias: new versions are staged for the owner first.
      const state = await this.ensureReleaseState(b.version, b.previousVersion || PREVIOUS_PUBLISHED_VERSION, b.subject, false, b.releaseId || RELEASE_ID, b.previousReleaseId || PREVIOUS_RELEASE_ID);
      return json({ ok: true, staged: true, ...state });
    }

    const admin = await this.getSession(String(b.token || ""));
    if (p === "/auth/app-lock/request-reset") {
      const found = await this.getSession(String(b.token || ""));
      if (!found) return json({ ok: false, error: "AUTH_REQUIRED" }, 401);
      found.user.appLockResetRequestedAt = Date.now();
      await this.ctx.storage.put(`user:${found.user.id}`, found.user);
      await this.audit("app-lock-reset-request", { userId: found.user.id });
      if (found.user.role !== "super_admin") await this.sendOwnerAppLockResetPush(found.user, b.origin);
      return json({ ok: true, requestedAt: found.user.appLockResetRequestedAt });
    }
    if (p === "/auth/app-lock/cancel-reset") {
      const found = await this.getSession(String(b.token || ""));
      if (!found) return json({ ok: false, error: "AUTH_REQUIRED" }, 401);
      found.user.appLockResetRequestedAt = 0;
      await this.ctx.storage.put(`user:${found.user.id}`, found.user);
      await this.audit("app-lock-reset-cancel", { userId: found.user.id });
      return json({ ok: true });
    }
    if (p.startsWith("/auth/admin/") && admin?.user?.role !== "super_admin") return json({ ok: false, error: "FORBIDDEN" }, 403);
    if (p === "/auth/admin/push-status") {
      const vapid = await this.ensureVapid(b.subject);
      const subscriptions = await this.ctx.storage.list({ prefix: "push:owner:" });
      return json({ ok: true, publicKey: vapid.publicKey, subscriptionCount: subscriptions.size });
    }
    if (p === "/auth/admin/push-subscribe") {
      const subscription = b.subscription;
      if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) return json({ ok: false, error: "INVALID_PUSH_SUBSCRIPTION" }, 400);
      await this.ensureVapid(b.subject);
      const hash = await sha256(subscription.endpoint);
      const key = "push:owner:" + hash;
      const ownerRecord = {
        subscription,
        ownerUserId: admin.user.id,
        deviceLabel: String(b.deviceLabel || "Owner device").slice(0, 100),
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      await this.ctx.storage.put(key, ownerRecord);
      const existingAll = await this.ctx.storage.get("push:all:" + hash);
      await this.ctx.storage.put("push:all:" + hash, {
        subscription,
        deviceLabel: ownerRecord.deviceLabel,
        appVersion: String(existingAll?.appVersion || VERSION),
        userId: admin.user.id,
        role: "super_admin",
        createdAt: Number(existingAll?.createdAt || ownerRecord.createdAt),
        updatedAt: Date.now()
      });
      await this.audit("owner-push-subscribe", { userId: admin.user.id });
      const subscriptions = await this.ctx.storage.list({ prefix: "push:owner:" });
      return json({ ok: true, subscriptionCount: subscriptions.size });
    }
    if (p === "/auth/admin/push-unsubscribe") {
      const endpoint = String(b.endpoint || "");
      if (endpoint) await this.ctx.storage.delete("push:owner:" + await sha256(endpoint));
      return json({ ok: true });
    }
    if (p === "/auth/admin/release-status") {
      const state = await this.ensureReleaseState(b.version, b.previousVersion, b.subject, true, b.releaseId, b.previousReleaseId);
      const all = await this.ctx.storage.list({ prefix: "push:all:" });
      const owners = await this.ctx.storage.list({ prefix: "push:owner:" });
      return json({ ok: true, ...state, userPushSubscriptions: all.size, ownerPushSubscriptions: owners.size });
    }
    if (p === "/auth/admin/publish-update") {
      const state = await this.ensureReleaseState(b.version, b.previousVersion, b.subject, false, b.releaseId, b.previousReleaseId);
      const version = String(state.stagedVersion || b.version || VERSION).slice(0, 30);
      const releaseId = String(state.stagedReleaseId || b.releaseId || RELEASE_ID).slice(0, 80);
      if (!version || !releaseId) return json({ ok: false, error: "INVALID_VERSION" }, 400);
      if (state.publishedReleaseId === releaseId) return json({ ok: true, alreadyPublished: true, ...state });
      const publishedAt = Date.now();
      await this.ctx.storage.put("release:publishedVersion", version);
      await this.ctx.storage.put("release:publishedReleaseId", releaseId);
      await this.ctx.storage.put("release:publishedAt", publishedAt);
      await this.ctx.storage.put("push:lastUpdateVersion", version);
      await this.ctx.storage.put("push:lastUpdateReleaseId", releaseId);
      const payload = {
        title: "تحديث جديد متوفر · مدير الراتب",
        body: `تم اعتماد الإصدار ${version}. افتح مدير الراتب ثم اختر وقت التحديث المناسب لك.`,
        icon: "./icons/choice/gold-192.png",
        badge: "./icons/choice/gold-192.png",
        url: "./?update=1",
        tag: `salary-manager-update-${releaseId}`
      };
      const result = await this.sendPushToPrefix("push:all:", payload, b.subject);
      await this.audit("release-published-to-users", { version, releaseId, adminId: admin.user.id, sent: result.sent, removed: result.removed, subscriptionCount: result.subscriptionCount });
      return json({ ok: true, stagedVersion: version, stagedReleaseId: releaseId, publishedVersion: version, publishedReleaseId: releaseId, published: true, publishedAt, ...result });
    }
    if (p === "/auth/admin/test-update-push") {
      const result = await this.sendOwnerReleasePush({
        title: "اختبار إشعارات مدير الراتب ✓",
        body: "هذا اختبار يدوي فقط. إشعارات التحديث الفعلية للمستخدمين تُرسل مرة واحدة بعد اعتماد المالك للإصدار.",
        icon: "./icons/choice/gold-192.png",
        badge: "./icons/choice/gold-192.png",
        url: "./?open=admin",
        tag: "salary-manager-owner-test"
      }, b.subject);
      await this.audit("owner-update-push-test", { adminId: admin.user.id, ...result });
      return json({ ok: true, ...result });
    }
    if (p === "/auth/admin/users") {
      const users = [...(await this.ctx.storage.list({ prefix: "user:" })).values()];
      const sessions = [...(await this.ctx.storage.list({ prefix: "session:" })).values()];
      const resets = await this.ctx.storage.list({ prefix: "reset:" });
      const out = [];
      for (const u of users) {
        const reset = resets.get(`reset:${u.id}`);
        out.push({ ...(await this.publicUser(u)), activeSessions: sessions.filter(s => s.userId === u.id && Number(s.expiresAt || 0) > Date.now()).length, resetRequested: !!reset?.requestedAt, resetCodeActive: !!reset?.codeHash && Number(reset.expiresAt || 0) > Date.now(), appLockResetRequested: Number(u.appLockResetRequestedAt || 0) > 0, appLockResetRequestedAt: Number(u.appLockResetRequestedAt || 0) || null });
      }
      out.sort((a, b2) => Number(b2.createdAt) - Number(a.createdAt));
      return json({ ok: true, users: out, count: out.length });
    }
    if (p === "/auth/admin/reset-code") {
      const id = String(b.userId || ""), user = await this.ctx.storage.get(`user:${id}`);
      if (!user) return json({ ok: false, error: "NOT_FOUND" }, 404);
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      const bytes = new Uint8Array(8); crypto.getRandomValues(bytes);
      const code = [...bytes].map(x => alphabet[x % alphabet.length]).join("");
      const expiresAt = Date.now() + 20 * 60 * 1000;
      const old = await this.ctx.storage.get(`reset:${id}`) || {};
      await this.ctx.storage.put(`reset:${id}`, { ...old, userId: id, codeHash: await sha256(code + "\0" + pepper), createdAt: Date.now(), expiresAt, createdBy: admin.user.id });
      await this.audit("admin-reset-code", { userId: id, adminId: admin.user.id });
      return json({ ok: true, code, expiresAt });
    }
    if (p === "/auth/admin/reset-app-lock") {
      const id = String(b.userId || ""), user = await this.ctx.storage.get(`user:${id}`);
      if (!user) return json({ ok: false, error: "NOT_FOUND" }, 404);
      if (user.role === "super_admin") return json({ ok: false, error: "CANNOT_RESET_OWNER_LOCK" }, 400);
      user.appLockResetVersion = Number(user.appLockResetVersion || 0) + 1;
      user.appLockResetRequestedAt = 0;
      await this.ctx.storage.put(`user:${id}`, user);
      await this.audit("admin-app-lock-reset", { userId: id, adminId: admin.user.id, resetVersion: user.appLockResetVersion });
      return json({ ok: true, appLockResetVersion: user.appLockResetVersion });
    }
    if (p === "/auth/admin/status") {
      const id = String(b.userId || ""), user = await this.ctx.storage.get(`user:${id}`);
      if (!user) return json({ ok: false, error: "NOT_FOUND" }, 404);
      if (user.role === "super_admin" && b.status !== "active") return json({ ok: false, error: "CANNOT_SUSPEND_OWNER" }, 400);
      user.status = b.status === "suspended" ? "suspended" : "active";
      await this.ctx.storage.put(`user:${id}`, user);
      if (user.status === "suspended") await this.revokeUserSessions(id);
      await this.audit("admin-status", { userId: id, status: user.status, adminId: admin.user.id });
      return json({ ok: true, status: user.status });
    }
    if (p === "/auth/admin/logout-user") {
      const id = String(b.userId || ""), user = await this.ctx.storage.get(`user:${id}`);
      if (!user) return json({ ok: false, error: "NOT_FOUND" }, 404);
      if (user.role === "super_admin" && id === admin.user.id) return json({ ok: false, error: "CANNOT_REVOKE_CURRENT" }, 400);
      await this.revokeUserSessions(id);
      await this.audit("admin-logout-user", { userId: id, adminId: admin.user.id });
      return json({ ok: true });
    }
    return json({ ok: false, error: "NOT_FOUND" }, 404);
  }
  async dataFetch(request, url) {
    if (url.pathname === "/data/get") {
      const state = await this.ctx.storage.get("state");
      const updatedAt = await this.ctx.storage.get("updatedAt");
      const revision = Number(await this.ctx.storage.get("revision") || 0);
      return json({ ok: true, state: state || null, updatedAt: updatedAt || null, revision });
    }
    if (url.pathname === "/data/live" && request.method === "GET") {
      if (String(request.headers.get("upgrade") || "").toLowerCase() !== "websocket") return json({ ok: false, error: "WEBSOCKET_REQUIRED" }, 426);
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ connectedAt: Date.now() });
      const revision = Number(await this.ctx.storage.get("revision") || 0);
      const updatedAt = await this.ctx.storage.get("updatedAt");
      try { server.send(JSON.stringify({ type: "ready", revision, updatedAt: updatedAt || null })); } catch (_) {}
      return new Response(null, { status: 101, webSocket: client });
    }
    if (url.pathname === "/data/put" && request.method === "POST") {
      const b = await request.json().catch(() => null);
      if (!b || typeof b !== "object" || !b.state || typeof b.state !== "object") return json({ ok: false, error: "INVALID_DATA" }, 400);
      if (!Array.isArray(b.state.commitments) || !Array.isArray(b.state.recurringPayments) || !Array.isArray(b.state.expenses)) return json({ ok: false, error: "INVALID_DATA" }, 400);
      const now = new Date().toISOString();
      const current = await this.ctx.storage.get("state");
      if (current) {
        const historyKey = `history:${Date.now()}:${crypto.randomUUID()}`;
        await this.ctx.storage.put(historyKey, current);
        const history = await this.ctx.storage.list({ prefix: "history:", reverse: true, limit: 8 });
        if (history.size > 6) {
          const keys = [...history.keys()].slice(6);
          if (keys.length) await this.ctx.storage.delete(keys);
        }
      }
      const revision = Number(await this.ctx.storage.get("revision") || 0) + 1;
      await this.ctx.storage.put("state", b.state);
      await this.ctx.storage.put("updatedAt", now);
      await this.ctx.storage.put("revision", revision);
      const message = JSON.stringify({ type: "revision", revision, updatedAt: now });
      for (const socket of this.ctx.getWebSockets()) {
        try { socket.send(message); } catch (_) {}
      }
      return json({ ok: true, updatedAt: now, revision });
    }
    return json({ ok: false, error: "NOT_FOUND" }, 404);
  }
  async webSocketMessage(ws, message) {
    try {
      const data = typeof message === "string" ? JSON.parse(message) : null;
      if (data?.type === "ping") ws.send(JSON.stringify({ type: "pong", at: Date.now() }));
    } catch (_) {}
  }
  async webSocketClose(ws, code, reason) {
    try { ws.close(code || 1000, String(reason || "")); } catch (_) {}
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/auth/")) {
      try {
        return await this.authFetch(request, url);
      } catch (e) {
        console.error("Salary auth directory error", url.pathname, e);
        return json({ ok: false, error: "AUTH_RUNTIME_ERROR", detail: String(e?.message || e || "Unknown auth runtime error").slice(0, 220), phase: url.pathname }, 500);
      }
    }
    if (url.pathname.startsWith("/data/")) {
      try {
        return await this.dataFetch(request, url);
      } catch (e) {
        console.error("Salary data store error", url.pathname, e);
        return json({ ok: false, error: "DATA_RUNTIME_ERROR", detail: String(e?.message || e || "Unknown data runtime error").slice(0, 220), phase: url.pathname }, 500);
      }
    }
    return json({ ok: false, error: "NOT_FOUND" }, 404);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const stageRelease = () => internal(env, "/auth/system/release-state", {
      version: VERSION,
      releaseId: RELEASE_ID,
      previousVersion: PREVIOUS_PUBLISHED_VERSION,
      previousReleaseId: PREVIOUS_RELEASE_ID,
      subject: url.origin
    }).catch(error => console.error("Release stage check failed", error));

    try {
      if (ctx && (url.pathname === "/" || url.pathname === "/index.html" || url.pathname === "/api/health" || url.pathname === "/api/auth/status")) {
        ctx.waitUntil(stageRelease());
      }

      if (url.pathname.startsWith("/api/")) return await handleApi(request, env, url);

      const isAppShell = url.pathname === "/" || url.pathname === "" || url.pathname === "/index.html";
      const isWorkerScript = url.pathname === "/sw.js";
      if (isAppShell || isWorkerScript) {
        const release = await getReleaseState(env, url.origin);
        // Critical release gate: staged assets are served ONLY to a currently authenticated owner session.
        // Query-string preview tokens and stale preview cookies can never grant a normal user access.
        const shellAuth = await optionalAuth(request, env);
        const preview = shellAuth?.user?.role === "super_admin";
        const publishedVersion = String(release.publishedVersion || PREVIOUS_PUBLISHED_VERSION);
        const rawPublishedReleaseId = String(release.publishedReleaseId || PREVIOUS_RELEASE_ID);
        // Defensive normalization: 3.8.6 can only map to its canonical archived release id.
        // This prevents a stale Durable Object pair such as version=3.8.6 + releaseId=3.8.7-r3
        // from ever routing users to a deleted/nonexistent archive.
        const publishedReleaseId = publishedVersion === PREVIOUS_PUBLISHED_VERSION
          ? PREVIOUS_RELEASE_ID
          : rawPublishedReleaseId;
        const latestPublished = publishedReleaseId === RELEASE_ID;
        const useLatest = preview || latestPublished;
        const safePublishedReleaseId = /^[A-Za-z0-9._-]{1,80}$/.test(publishedReleaseId) ? publishedReleaseId : PREVIOUS_RELEASE_ID;
        let assetPath;
        if (isWorkerScript) {
          assetPath = useLatest ? "/sw.js" : `/releases/${safePublishedReleaseId}/sw.js`;
        } else {
          // Use an exact non-index asset for archived public releases.
          // Cloudflare may canonicalize nested index.html paths; app.html avoids that redirect entirely.
          assetPath = useLatest ? "/" : `/releases/${safePublishedReleaseId}/app.html`;
        }
        const assetUrl = new URL(assetPath, url.origin);
        const assetRequest = new Request(assetUrl.toString(), { method: "GET", headers: request.headers, redirect: "manual" });
        let response = await env.ASSETS.fetch(assetRequest);
        // Defensive fallback for non-default html_handling configurations.
        if (isAppShell && response && response.status >= 300 && response.status < 400) {
          const location = response.headers.get("location");
          if (location) {
            const redirected = new URL(location, assetUrl);
            response = await env.ASSETS.fetch(new Request(redirected.toString(), { method: "GET", headers: request.headers, redirect: "manual" }));
          }
        }
        if (response && response.ok) {
          const headers = new Headers(response.headers);
          headers.set("cache-control", "no-store");
          headers.set("x-salary-release", useLatest ? RELEASE_ID : publishedReleaseId);
          return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
        }
        return new Response("Salary Manager app shell unavailable", { status: response ? response.status : 503 });
      }

      return await env.ASSETS.fetch(request);
    } catch (e) {
      console.error("Salary Manager error", url.pathname, e);
      if (!url.pathname.startsWith("/api/") && (request.mode === "navigate" || request.headers.get("accept")?.includes("text/html"))) {
        return new Response("<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>Salary Manager</title><body style='font-family:system-ui;padding:32px'><h2>تعذر تحميل مدير الراتب مؤقتًا</h2><p>أعد المحاولة بعد لحظات. بيانات الحساب لم تُحذف.</p></body>", {
          status: 503,
          headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }
        });
      }
      return apiJson(request, env, { ok: false, error: "SERVER_ERROR", detail: String(e?.message || e).slice(0, 180), version: VERSION }, 500);
    }
  },
  async scheduled(controller, env, ctx) {
    ctx.waitUntil((async () => {
      try {
        const { body } = await internal(env, "/auth/system/release-state", {
          version: VERSION,
          releaseId: RELEASE_ID,
          previousVersion: PREVIOUS_PUBLISHED_VERSION,
          previousReleaseId: PREVIOUS_RELEASE_ID,
          subject: "",
          notifyOwner: true
        });
        console.log("Release stage check", body);
      } catch (error) {
        console.error("Scheduled release stage check failed", error);
      }
    })());
  }
};

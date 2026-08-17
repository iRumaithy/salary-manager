import { DurableObject } from "cloudflare:workers";

const VERSION = "3.1.0";
const SESSION_MS = 10 * 365 * 24 * 60 * 60 * 1000;
const PBKDF2_ITERATIONS = 150000;
const AUTH_NAME = "__salary_manager_auth_v1__";

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
    { name: "PBKDF2", hash: "SHA-256", salt: unb64(salt), iterations: Math.max(10000, Number(iterations) || PBKDF2_ITERATIONS) },
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
    "vary": "Origin",
    "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
    "access-control-allow-headers": "content-type,authorization,x-salary-manager-app",
    "access-control-max-age": "86400"
  } : {};
}
function apiJson(request, env, body, status = 200, extra = {}) {
  return json(body, status, { ...corsHeaders(request, env), ...extra });
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
  const token = bearerToken(request);
  if (!token) return { ok: false, response: apiJson(request, env, { ok: false, error: "AUTH_REQUIRED" }, 401) };
  const { body } = await internal(env, "/auth/session", { token });
  if (!body?.ok) return { ok: false, response: apiJson(request, env, { ok: false, error: "AUTH_REQUIRED" }, 401) };
  if (admin && body.user?.role !== "super_admin") return { ok: false, response: apiJson(request, env, { ok: false, error: "FORBIDDEN" }, 403) };
  return { ok: true, token, session: body.session, user: body.user };
}

async function handleApi(request, env, url) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  if (request.headers.get("origin") && !allowedOrigin(request, env)) return apiJson(request, env, { ok: false, error: "ORIGIN_NOT_ALLOWED" }, 403);

  const p = url.pathname;
  if (p === "/api/health") return apiJson(request, env, { ok: true, version: VERSION, storage: "Cloudflare Durable Objects", auth: "PBKDF2-SHA256" });
  if (p === "/api/auth/status" && request.method === "GET") {
    const { body } = await internal(env, "/auth/status");
    return apiJson(request, env, { ok: true, ...(body || {}), version: VERSION, config: { ownerBootstrapConfigured: Boolean(String(env.OWNER_BOOTSTRAP_TOKEN || "")), authPepperConfigured: Boolean(String(env.AUTH_PEPPER || "")) } });
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
    const { response, body } = await internal(env, path, { ...b, pepper: String(env.AUTH_PEPPER || ""), ip: request.headers.get("cf-connecting-ip") || "" });
    return apiJson(request, env, body || { ok: false, error: "AUTH_FAILED" }, response.status || 400);
  }

  if (p === "/api/auth/session" && request.method === "GET") {
    const a = await requireAuth(request, env);
    if (!a.ok) return a.response;
    return apiJson(request, env, { ok: true, user: a.user, session: a.session });
  }
  if (p === "/api/auth/logout" && request.method === "POST") {
    const token = bearerToken(request);
    if (token) await internal(env, "/auth/logout", { token });
    return apiJson(request, env, { ok: true });
  }
  if (p === "/api/auth/change-password" && request.method === "POST") {
    if (!env.AUTH_PEPPER) return apiJson(request, env, { ok: false, error: "AUTH_PEPPER_NOT_CONFIGURED" }, 503);
    const a = await requireAuth(request, env);
    if (!a.ok) return a.response;
    const b = await request.json().catch(() => ({}));
    const { response, body } = await internal(env, "/auth/change-password", { token: a.token, currentPassword: b.currentPassword, newPassword: b.newPassword, pepper: String(env.AUTH_PEPPER || "") });
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
    return u ? { id: u.id, username: u.username, email: u.email, role: u.role, status: u.status, accountId: u.accountId, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt || null } : null;
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
        if (user.failedLoginCount >= 8) { user.lockUntil = Date.now() + 15 * 60 * 1000; user.failedLoginCount = 0; }
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
        const old = await this.ctx.storage.get(`reset:${id}`) || {};
        await this.ctx.storage.put(`reset:${id}`, { ...old, userId: id, requestedAt: Date.now(), requestedIp: String(b.ip || "").slice(0, 80) });
        await this.audit("reset-request", { userId: id });
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

    const admin = await this.getSession(String(b.token || ""));
    if (p.startsWith("/auth/admin/") && admin?.user?.role !== "super_admin") return json({ ok: false, error: "FORBIDDEN" }, 403);
    if (p === "/auth/admin/users") {
      const users = [...(await this.ctx.storage.list({ prefix: "user:" })).values()];
      const sessions = [...(await this.ctx.storage.list({ prefix: "session:" })).values()];
      const resets = await this.ctx.storage.list({ prefix: "reset:" });
      const out = [];
      for (const u of users) {
        const reset = resets.get(`reset:${u.id}`);
        out.push({ ...(await this.publicUser(u)), activeSessions: sessions.filter(s => s.userId === u.id && Number(s.expiresAt || 0) > Date.now()).length, resetRequested: !!reset?.requestedAt, resetCodeActive: !!reset?.codeHash && Number(reset.expiresAt || 0) > Date.now() });
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
      return json({ ok: true, state: state || null, updatedAt: updatedAt || null });
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
      await this.ctx.storage.put("state", b.state);
      await this.ctx.storage.put("updatedAt", now);
      return json({ ok: true, updatedAt: now });
    }
    return json({ ok: false, error: "NOT_FOUND" }, 404);
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/auth/")) return this.authFetch(request, url);
    if (url.pathname.startsWith("/data/")) return this.dataFetch(request, url);
    return json({ ok: false, error: "NOT_FOUND" }, 404);
  }
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.pathname.startsWith("/api/")) return await handleApi(request, env, url);
      return env.ASSETS.fetch(request);
    } catch (e) {
      console.error("Salary Manager error", e);
      return apiJson(request, env, { ok: false, error: "SERVER_ERROR", detail: String(e?.message || e).slice(0, 180), version: VERSION }, 500);
    }
  }
};

// Task-manager API client: signs in with the project's auth file and caches the session.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export const APP_URL = (process.env.TASK_APP_URL || "https://task-manager.sasconsults.com").replace(/\/$/, "");
// Access tokens are cached per email so we don't log in on every task.
const SESSION_FILE = process.env.TASK_APP_SESSION_FILE || join(homedir(), ".sas-task-mcp", "sessions.json");
const EXPIRY_MARGIN_MS = 60_000;

export function decodeJwt(token) {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
  } catch {
    return {};
  }
}

function isFresh(token) {
  if (!token) return false;
  const { exp } = decodeJwt(token);
  return !exp || exp * 1000 - EXPIRY_MARGIN_MS > Date.now();
}

function loadSessions() {
  try {
    return JSON.parse(readFileSync(SESSION_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveSession(email, session) {
  try {
    const all = loadSessions();
    all[email] = session;
    mkdirSync(dirname(SESSION_FILE), { recursive: true });
    writeFileSync(SESSION_FILE, JSON.stringify(all, null, 2), { mode: 0o600 });
  } catch {
    // Not fatal: we just sign in again next time.
  }
}

async function request(method, path, { token, body } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${APP_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON error page; the raw text goes into the message below.
  }
  if (!res.ok) {
    const msg = json?.message || json?.error || text.slice(0, 300) || res.statusText;
    const err = new Error(`HTTP ${res.status}: ${msg}`);
    err.status = res.status;
    throw err;
  }
  return json && typeof json === "object" && "data" in json ? json.data : json;
}

// For endpoints that don't need a login.
export function getPublic(path) {
  return request("GET", path);
}

async function signIn(path, body, email) {
  const data = await request("POST", path, { body });
  if (!data?.token) throw new Error(`${path} returned no token`);
  saveSession(email, { token: data.token, refreshToken: data.refreshToken ?? null });
  return data.token;
}

// Concurrent requests share one in-flight sign-in per email.
const pending = new Map();

function getToken(auth, force = false) {
  const key = `${auth.email}|${force}`;
  if (!pending.has(key)) pending.set(key, fetchToken(auth, force).finally(() => pending.delete(key)));
  return pending.get(key);
}

// A usable access token: cached, refreshed, or from a fresh login.
async function fetchToken({ email, password }, force) {
  const cached = loadSessions()[email] ?? {};
  if (!force && isFresh(cached.token)) return cached.token;
  if (cached.refreshToken) {
    try {
      return await signIn("/api/auth/refresh", { refreshToken: cached.refreshToken }, email);
    } catch {
      // Refresh token expired; log in again below.
    }
  }
  try {
    return await signIn("/api/auth/login", { email, password }, email);
  } catch (e) {
    if (e.status === 400 || e.status === 401) throw new Error(`Login failed for ${email}: wrong email or password.`);
    throw e;
  }
}

// Authenticated request; renews the session once if the token is rejected.
export async function api(auth, method, path, body) {
  const token = await getToken(auth);
  try {
    return { token, data: await request(method, path, { token, body }) };
  } catch (e) {
    if (e.status !== 401) throw e;
    const fresh = await getToken(auth, true);
    return { token: fresh, data: await request(method, path, { token: fresh, body }) };
  }
}

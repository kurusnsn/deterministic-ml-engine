"use client";

const SESSION_COOKIE_NAME = "session_id";
const SESSION_STORAGE_KEY = "session-id";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizeSessionId = (value: string | null): string | null => {
  if (!value) return null;
  let normalized = value.trim();
  if (!normalized || normalized === "null" || normalized === "undefined") return null;
  if (normalized.startsWith("temp-")) {
    normalized = normalized.slice(5);
  }
  if (!UUID_PATTERN.test(normalized)) return null;
  return normalized;
};

const generateSessionId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

const setSessionCookie = (sessionId: string) => {
  if (typeof document === "undefined") return;
  const secure = typeof location !== "undefined" && location.protocol === "https:";
  const secureFlag = secure ? "; Secure" : "";
  document.cookie = `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionId)}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax${secureFlag}`;
};

const setSessionStorage = (sessionId: string) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
};

export function getSessionId(): string | null {
  if (typeof document === "undefined") return null;

  const cookies = document.cookie ? document.cookie.split("; ") : [];
  let cookieValue: string | null = null;
  for (const c of cookies) {
    const [k, ...rest] = c.split("=");
    if (k === SESSION_COOKIE_NAME) {
      cookieValue = decodeURIComponent(rest.join("="));
      break;
    }
  }

  const normalizedCookie = normalizeSessionId(cookieValue);
  if (normalizedCookie) {
    const stored = typeof window !== "undefined"
      ? normalizeSessionId(localStorage.getItem(SESSION_STORAGE_KEY))
      : null;
    if (stored !== normalizedCookie) {
      setSessionStorage(normalizedCookie);
    }
    return normalizedCookie;
  }

  const stored = typeof window !== "undefined"
    ? normalizeSessionId(localStorage.getItem(SESSION_STORAGE_KEY))
    : null;
  if (stored) {
    setSessionCookie(stored);
    return stored;
  }

  const sessionId = generateSessionId();
  setSessionCookie(sessionId);
  setSessionStorage(sessionId);
  return sessionId;
}

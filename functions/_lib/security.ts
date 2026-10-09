import type { Env, User } from './types';

const enc = new TextEncoder();
export const PASSWORD_ITERATIONS = 150_000;

const bufferOf = (value: Uint8Array): ArrayBuffer => value.slice().buffer as ArrayBuffer;
const b64 = (value: ArrayBuffer | Uint8Array) => {
  const data = value instanceof Uint8Array ? value : new Uint8Array(value);
  return btoa(String.fromCharCode(...data)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
};
const bytes = (value: string) => {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  return Uint8Array.from(atob(normalized + '='.repeat((4 - normalized.length % 4) % 4)), (character) => character.charCodeAt(0));
};

const constantTimeEqual = (left: Uint8Array, right: Uint8Array) => {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  return difference === 0;
};

export async function hashPassword(password: string, salt = crypto.getRandomValues(new Uint8Array(16))): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: bufferOf(salt), iterations: PASSWORD_ITERATIONS, hash: 'SHA-256' }, key, 256);
  return `pbkdf2$${PASSWORD_ITERATIONS}$${b64(salt)}$${b64(bits)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [, iterationText, saltText, expectedText] = stored.split('$');
    const iterations = Number(iterationText);
    if (!iterationText || !saltText || !expectedText || !Number.isInteger(iterations) || iterations < 1_000 || iterations > 1_000_000) return false;
    const expected = bytes(expectedText);
    const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: bufferOf(bytes(saltText)), iterations, hash: 'SHA-256' }, key, expected.length * 8);
    return constantTimeEqual(new Uint8Array(bits), expected);
  } catch {
    return false;
  }
}

export function cookie(name: string, value: string, maxAge: number, secure = true) {
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`;
}

export function sessionId() { return crypto.randomUUID(); }

export async function currentUser(request: Request, env: Env): Promise<User | null> {
  const raw = request.headers.get('Cookie')?.match(/(?:^|;\s*)session=([^;]+)/)?.[1];
  if (!raw) return null;
  const row = await env.DB.prepare('SELECT l.id,l.name,l.username,s.csrf_token AS csrf FROM sessions s JOIN librarians l ON l.id=s.librarian_id WHERE s.id=? AND s.expires_at>? AND l.active=1').bind(raw, Date.now()).first<User>();
  return row ?? null;
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get('Origin');
  if (!origin) return true;

  const requestUrl = new URL(request.url);
  const loopback = (hostname: string) => hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  if (origin === 'null') return requestUrl.protocol === 'http:' && loopback(requestUrl.hostname);

  const originUrl = (() => {
    try {
      return new URL(origin);
    } catch {
      return null;
    }
  })();
  if (!originUrl || originUrl.protocol !== requestUrl.protocol || originUrl.port !== requestUrl.port) return false;
  if (originUrl.origin === requestUrl.origin) return true;

  // O Wrangler pode expor o mesmo servidor local por localhost ou 127.0.0.1.
  // Essa equivalência é restrita ao loopback HTTP e à mesma porta; não é
  // aplicada a hosts de produção nem transforma origens externas em confiáveis.
  return requestUrl.protocol === 'http:' && loopback(requestUrl.hostname) && loopback(originUrl.hostname);
}

export function requireCsrf(request: Request, user: User, form: FormData) {
  return sameOrigin(request) && form.get('csrf') === user.csrf;
}

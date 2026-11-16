export const SESSION_COOKIE_NAME = 'fiberos_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 hari

export interface SessionUser {
  username: string;
}

const AUTHORIZED_USERS: ReadonlyArray<{ username: string; password: string }> = [
  { username: 'Kamal', password: 'Password123' },
  { username: 'Sigit', password: 'Password123' },
  { username: 'Fahrudin', password: 'Password123' },
  { username: 'Yanuar', password: 'Password123' },
  { username: 'Danang', password: 'Password123' },
];

const ALLOWED_USERNAME_SET = new Set(AUTHORIZED_USERS.map((u) => u.username));

function constantTimeEqual(a: string, b: string): boolean {
  const maxLen = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < maxLen; i++) {
    const codeA = i < a.length ? a.charCodeAt(i) : 0;
    const codeB = i < b.length ? b.charCodeAt(i) : 0;
    diff |= codeA ^ codeB;
  }
  return diff === 0;
}

export function validateUserCredentials(username: string, password: string): SessionUser | null {
  const normalizedInput = (username || '').trim().toLowerCase();
  if (!normalizedInput || typeof password !== 'string' || password.length === 0) {
    return null;
  }

  const matchedUser = AUTHORIZED_USERS.find(
    (u) => u.username.toLowerCase() === normalizedInput
  );
  if (!matchedUser) {
    return null;
  }

  if (!constantTimeEqual(password, matchedUser.password)) {
    return null;
  }

  return { username: matchedUser.username };
}

function getAuthSecret(): string {
  return (
    process.env.AUTH_SECRET ||
    process.env.DATABASE_URL ||
    'fiberos-blora-rollout-session-key-2026'
  );
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(base64Url: string): Uint8Array {
  const padded = base64Url.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((base64Url.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function getHmacKey(usage: 'sign' | 'verify'): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(getAuthSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage]
  );
}

interface SessionPayload {
  u: string;
  exp: number;
}

export async function signSessionToken(user: SessionUser): Promise<string> {
  const payload: SessionPayload = {
    u: user.username,
    exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
  };
  const encoder = new TextEncoder();
  const payloadEncoded = bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
  const key = await getHmacKey('sign');
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadEncoded));
  const signatureEncoded = bytesToBase64Url(new Uint8Array(signatureBuffer));
  return `${payloadEncoded}.${signatureEncoded}`;
}

export async function verifySessionToken(
  token: string | undefined | null
): Promise<SessionUser | null> {
  if (!token || typeof token !== 'string') return null;

  const dotIdx = token.indexOf('.');
  if (dotIdx <= 0 || dotIdx === token.length - 1) return null;

  const payloadEncoded = token.slice(0, dotIdx);
  const signatureEncoded = token.slice(dotIdx + 1);

  try {
    const encoder = new TextEncoder();
    const key = await getHmacKey('verify');
    const sigBytes = base64UrlToBytes(signatureEncoded);
    const sigCopy = new Uint8Array(sigBytes.length);
    sigCopy.set(sigBytes);
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigCopy,
      encoder.encode(payloadEncoded)
    );
    if (!valid) return null;

    const decoder = new TextDecoder();
    const payload = JSON.parse(decoder.decode(base64UrlToBytes(payloadEncoded))) as SessionPayload;

    if (
      !payload ||
      typeof payload.u !== 'string' ||
      !ALLOWED_USERNAME_SET.has(payload.u) ||
      typeof payload.exp !== 'number' ||
      payload.exp <= Date.now()
    ) {
      return null;
    }

    return { username: payload.u };
  } catch {
    return null;
  }
}

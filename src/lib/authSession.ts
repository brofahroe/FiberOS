import type { UserPermissions, UserRole } from '@/lib/permissions';

export const SESSION_COOKIE_NAME = 'fiberos_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 hari

export type { UserRole };

export interface SessionTokenUser {
  id: string;
  username: string;
  role: UserRole;
  mustChangePassword: boolean;
}

export interface SessionUser extends SessionTokenUser {
  fullName: string;
  jobTitle: string;
  permissions: UserPermissions;
  allowedCities: string[];
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
  const padded =
    base64Url.replace(/-/g, '+').replace(/_/g, '/') +
    '==='.slice((base64Url.length + 3) % 4);
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
  v: number;
  uid: string;
  u: string;
  r: UserRole;
  mcp: boolean;
  exp: number;
}

export async function signSessionToken(user: SessionTokenUser): Promise<string> {
  const payload: SessionPayload = {
    v: 2,
    uid: user.id,
    u: user.username,
    r: user.role === 'ADMIN' ? 'ADMIN' : 'USER',
    mcp: Boolean(user.mustChangePassword),
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
): Promise<SessionTokenUser | null> {
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
      payload.v !== 2 ||
      typeof payload.uid !== 'string' ||
      !payload.uid ||
      typeof payload.u !== 'string' ||
      !payload.u ||
      (payload.r !== 'ADMIN' && payload.r !== 'USER') ||
      typeof payload.mcp !== 'boolean' ||
      typeof payload.exp !== 'number' ||
      payload.exp <= Date.now()
    ) {
      return null;
    }

    return {
      id: payload.uid,
      username: payload.u,
      role: payload.r,
      mustChangePassword: payload.mcp,
    };
  } catch {
    return null;
  }
}

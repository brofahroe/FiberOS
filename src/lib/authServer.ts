import crypto from 'crypto';
import { cookies, headers } from 'next/headers';
import { prisma } from '@/lib/prisma';
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  signSessionToken,
  type SessionTokenUser,
  type UserRole,
} from '@/lib/authSession';

const DEFAULT_ACCOUNTS: ReadonlyArray<{
  username: string;
  fullName: string;
  jobTitle: string;
  role: UserRole;
  password: string;
  mustChangePassword: boolean;
}> = [
  {
    username: 'Admin',
    fullName: 'Administrator',
    jobTitle: 'Administrator',
    role: 'ADMIN',
    password: 'Admin123',
    mustChangePassword: false,
  },
  {
    username: 'Kamal',
    fullName: 'Kamal',
    jobTitle: 'Pengawas Lapangan',
    role: 'USER',
    password: 'Password123',
    mustChangePassword: true,
  },
  {
    username: 'Sigit',
    fullName: 'Sigit',
    jobTitle: 'Pengawas Lapangan',
    role: 'USER',
    password: 'Password123',
    mustChangePassword: true,
  },
  {
    username: 'Fahrudin',
    fullName: 'Fahrudin',
    jobTitle: 'Pengawas Lapangan',
    role: 'USER',
    password: 'Password123',
    mustChangePassword: true,
  },
  {
    username: 'Yanuar',
    fullName: 'Yanuar',
    jobTitle: 'Pengawas Lapangan',
    role: 'USER',
    password: 'Password123',
    mustChangePassword: true,
  },
  {
    username: 'Danang',
    fullName: 'Danang',
    jobTitle: 'Pengawas Lapangan',
    role: 'USER',
    password: 'Password123',
    mustChangePassword: true,
  },
];

export function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(plain, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(plain: string, storedHash: string): boolean {
  if (!plain || !storedHash || !storedHash.includes(':')) return false;
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;

  try {
    const derived = crypto.scryptSync(plain, salt, 64);
    const keyBuf = Buffer.from(keyHex, 'hex');
    if (derived.length !== keyBuf.length) return false;
    return crypto.timingSafeEqual(derived, keyBuf);
  } catch {
    return false;
  }
}

let defaultUsersEnsured = false;

export async function ensureDefaultUsers(): Promise<void> {
  if (defaultUsersEnsured) return;

  const existingUsers = await prisma.user.findMany({
    select: { username: true },
  });
  const existingSet = new Set(existingUsers.map((u) => u.username.trim().toLowerCase()));

  for (const acc of DEFAULT_ACCOUNTS) {
    if (existingSet.has(acc.username.toLowerCase())) continue;
    await prisma.user.create({
      data: {
        username: acc.username,
        fullName: acc.fullName,
        jobTitle: acc.jobTitle,
        role: acc.role,
        passwordHash: hashPassword(acc.password),
        mustChangePassword: acc.mustChangePassword,
      },
    });
  }

  defaultUsersEnsured = true;
}

export async function setSessionCookieForUser(user: SessionTokenUser): Promise<void> {
  const token = await signSessionToken(user);
  const reqHeaders = headers();
  const forwardedProto = reqHeaders.get('x-forwarded-proto') || '';
  const origin = reqHeaders.get('origin') || '';
  const isHttps = forwardedProto.includes('https') || origin.startsWith('https://');

  cookies().set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
    secure: isHttps,
  });
}

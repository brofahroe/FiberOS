'use server';

import { cookies, headers } from 'next/headers';
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  signSessionToken,
  validateUserCredentials,
} from '@/lib/authSession';

function sanitizeRedirectTarget(target?: string): string {
  if (!target || typeof target !== 'string') return '/';
  const trimmed = target.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/login')) {
    return '/';
  }
  return trimmed;
}

export async function loginAction(data: {
  username: string;
  password: string;
  redirectTo?: string;
}): Promise<{ success: boolean; redirectTo?: string; error?: string }> {
  const user = validateUserCredentials(data.username, data.password);
  if (!user) {
    return { success: false, error: 'Username atau password salah.' };
  }

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

  return {
    success: true,
    redirectTo: sanitizeRedirectTarget(data.redirectTo),
  };
}

export async function logoutAction(): Promise<{ success: boolean }> {
  cookies().delete(SESSION_COOKIE_NAME);
  return { success: true };
}

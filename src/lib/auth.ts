import { cookies } from 'next/headers';
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  type SessionUser,
  verifySessionToken,
} from '@/lib/authSession';

export { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS, type SessionUser };

export async function getCurrentUser(): Promise<SessionUser | null> {
  try {
    const cookieStore = cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    return await verifySessionToken(token);
  } catch {
    return null;
  }
}

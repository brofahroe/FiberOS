import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  type SessionUser,
  type UserRole,
  verifySessionToken,
} from '@/lib/authSession';
import { normalizeAllowedCities, normalizePermissions } from '@/lib/permissions';

export { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS, type SessionUser, type UserRole };

export async function getCurrentUser(): Promise<SessionUser | null> {
  try {
    const cookieStore = cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    const tokenUser = await verifySessionToken(token);
    if (!tokenUser) return null;

    const dbUser = await prisma.user.findUnique({
      where: { id: tokenUser.id },
      select: {
        id: true,
        username: true,
        fullName: true,
        jobTitle: true,
        role: true,
        permissions: true,
        allowedCities: true,
        mustChangePassword: true,
      },
    });

    if (!dbUser) return null;

    const role: UserRole = dbUser.role === 'ADMIN' ? 'ADMIN' : 'USER';

    return {
      id: dbUser.id,
      username: dbUser.username,
      fullName: dbUser.fullName,
      jobTitle: dbUser.jobTitle,
      role,
      permissions: normalizePermissions(dbUser.permissions, role),
      allowedCities: normalizeAllowedCities(dbUser.allowedCities, role),
      mustChangePassword: dbUser.mustChangePassword,
    };
  } catch {
    return null;
  }
}

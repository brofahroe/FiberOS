import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/authSession';

const PUBLIC_EXACT_PATHS = new Set([
  '/login',
  '/favicon.ico',
  '/icon.svg',
  '/favicon-16x16.png',
  '/favicon-32x32.png',
  '/apple-touch-icon.png',
  '/manifest.json',
  '/manifest.webmanifest',
  '/sw.js',
]);

function isPublicAssetOrLogin(pathname: string): boolean {
  if (PUBLIC_EXACT_PATHS.has(pathname)) return true;
  return (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/icons/') ||
    pathname.startsWith('/workbox-')
  );
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/icons/') ||
    pathname.startsWith('/workbox-') ||
    (PUBLIC_EXACT_PATHS.has(pathname) && pathname !== '/login')
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const user = await verifySessionToken(token);

  if (pathname === '/login') {
    if (user) {
      return NextResponse.redirect(
        new URL(user.mustChangePassword ? '/profile?firstLogin=1' : '/', request.url)
      );
    }
    return NextResponse.next();
  }

  if (!user && !isPublicAssetOrLogin(pathname)) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const loginUrl = new URL('/login', request.url);
    const fullTarget = `${pathname}${search || ''}`;
    if (fullTarget && fullTarget !== '/') {
      loginUrl.searchParams.set('redirect', fullTarget);
    }
    return NextResponse.redirect(loginUrl);
  }

  if (user) {
    // Wajib ganti password saat login pertama sebelum mengakses halaman selain /profile
    if (user.mustChangePassword && pathname !== '/profile' && !pathname.startsWith('/api/')) {
      return NextResponse.redirect(new URL('/profile?firstLogin=1', request.url));
    }

    // Proteksi route khusus Admin
    if (pathname.startsWith('/admin') && user.role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

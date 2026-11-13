import { NextRequest, NextResponse } from 'next/server';
import { getFileFromNextcloud } from '@/lib/nextcloud';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  try {
    const rawPath = params.path.join('/');
    const cleanPath = decodeURIComponent(rawPath).replace(/^\/|\/$/g, '');

    const nextcloudRes = await getFileFromNextcloud(cleanPath);

    if (!nextcloudRes || !nextcloudRes.body) {
      return new NextResponse('Photo not found', { status: 404 });
    }

    const contentType =
      nextcloudRes.headers.get('content-type') ||
      (cleanPath.endsWith('.png') ? 'image/png' : 'image/jpeg');
    const contentLength = nextcloudRes.headers.get('content-length');

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    };

    if (contentLength) {
      headers['Content-Length'] = contentLength;
    }

    return new NextResponse(nextcloudRes.body as any, {
      status: 200,
      headers,
    });
  } catch (error: any) {
    console.error('Error streaming photo from Nextcloud:', error);
    return new NextResponse('Error loading photo', { status: 500 });
  }
}


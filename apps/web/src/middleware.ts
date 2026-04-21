import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  if (process.env.EXTERNAL_PLAYGROUND_ENABLED !== 'true') {
    return NextResponse.rewrite(new URL('/404', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: '/external-api-playground/:path*',
};

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const siteAuth = request.cookies.get('site_auth');

  // Dev and instructor routes require site password
  if (path.startsWith('/dev') || path.startsWith('/instructor')) {
    if (!siteAuth || siteAuth.value !== 'granted') {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  // Instructor routes additionally need session cookie (assessment-scoped JWT)
  if (path.startsWith('/instructor')) {
    const session = request.cookies.get('session');
    if (!session) {
      return NextResponse.redirect(new URL('/auth', request.url));
    }
  }

  // Student portal routes need portal_session cookie
  if (path.startsWith('/student')) {
    const portalSession = request.cookies.get('portal_session');
    if (!portalSession) {
      return NextResponse.redirect(new URL('/auth', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dev/:path*', '/student/:path*', '/instructor/:path*'],
};

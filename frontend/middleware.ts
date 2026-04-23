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

  // Note: instructor and student routes also require session JWTs for backend API calls.
  // Those are validated by the backend (get_current_user / get_portal_user), not here.
  // Frontend pages handle 401 responses from the backend gracefully.
  // The site password gate above is sufficient for middleware-level access control.

  return NextResponse.next();
}

export const config = {
  matcher: ['/dev/:path*', '/student/:path*', '/instructor/:path*'],
};

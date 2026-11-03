import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Public marketing surface: exact paths only (never prefixes), so every dashboard route stays gated.
const PUBLIC_FILES = new Set(['/robots.txt', '/sitemap.xml']);
const hasAuthCookie = (request: NextRequest) =>
  request.cookies.getAll().some((c) => c.name.startsWith('sb-') && c.name.includes('-auth-token'));

export async function proxy(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const pathname = requestUrl.pathname;

  // Never intercept static assets, API routes, or client-facing public pages
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/c/')
  ) {
    return NextResponse.next();
  }

  if (PUBLIC_FILES.has(pathname)) return NextResponse.next();

  // The public resources hub and its articles.
  if (pathname === '/resources' || pathname.startsWith('/resources/')) return NextResponse.next();

  // The landing page. Visitors with no session cookie never touch Supabase; a signed-in
  // user is sent on to the dashboard, as "/" always did.
  const isHome = pathname === '/';
  if (isHome && !hasAuthCookie(request)) return NextResponse.next();

  // Skip if Supabase is not configured (e.g. during CI / local without env)
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.next();
  }

  try {
    const response = NextResponse.next({
      request: { headers: request.headers },
    });

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (isHome) {
      return user ? NextResponse.redirect(new URL('/dashboard', request.url)) : response;
    }

    const isAuthPage = pathname.startsWith('/auth/');

    // Rule 1 & 2: Logged-in user on any /auth/* page → /dashboard
    if (user && isAuthPage) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    // Rule 3 & 4: Unauthenticated user on any non-public route → /auth/login
    if (!user && !isAuthPage) {
      return NextResponse.redirect(new URL('/auth/login', request.url));
    }

    return response;
  } catch {
    // Fail closed: on auth error, redirect unauthenticated-looking requests to
    // login rather than letting them through. /api/, /_next/, and /c/ are
    // already returned early above and are unaffected.
    if (isHome) return NextResponse.next(); // a stale cookie must not hide the landing page
    const isAuthPage = pathname.startsWith('/auth/');
    if (!isAuthPage) {
      return NextResponse.redirect(new URL('/auth/login', request.url));
    }
    return NextResponse.next();
  }
}

export const config = {
  // Static files in /public (the logo on the sign-in page, favicon…) are never auth-gated:
  // a signed-out visitor must be able to load them.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};

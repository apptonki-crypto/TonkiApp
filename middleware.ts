import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySessionToken, SESSION_COOKIE_NAME } from "src/lib/auth/session";
import { STAFF_HOME_PATH, STAFF_JOIN_PATH_PREFIX } from "src/lib/staff/constants";

function isStaffArea(pathname: string): boolean {
  return pathname === STAFF_HOME_PATH || pathname.startsWith(`${STAFF_HOME_PATH}/`);
}

export async function middleware(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  let session: Awaited<ReturnType<typeof verifySessionToken>> = null;
  if (token) {
    session = await verifySessionToken(token);
  }

  if (!session) {
    const login = new URL("/login", request.url);
    login.searchParams.set("from", request.nextUrl.pathname);
    return NextResponse.redirect(login);
  }

  const { pathname } = request.nextUrl;

  // Un mesero solo tiene su vista: ni feed de cliente, ni pago de QR, ni panel de negocio.
  if (session.role === "staff") {
    if (!isStaffArea(pathname)) {
      return NextResponse.redirect(new URL(STAFF_HOME_PATH, request.url));
    }
    return NextResponse.next();
  }

  if (isStaffArea(pathname) && !pathname.startsWith(STAFF_JOIN_PATH_PREFIX)) {
    return NextResponse.redirect(
      new URL(session.role === "admin" ? "/admin/dashboard" : "/dashboard", request.url)
    );
  }

  if (pathname.startsWith("/admin") && session.role !== "admin") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/rewards/:path*",
    "/admin/:path*",
    "/account/:path*",
    "/cobro/:path*",
    "/dinamica/:path*",
    "/visita/:path*",
    "/onboarding/empresa",
    "/mesero/:path*",
  ],
};

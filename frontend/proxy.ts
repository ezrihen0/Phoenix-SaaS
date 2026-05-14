import { NextResponse, type NextRequest } from "next/server";

const sessionCookieName = process.env.SESSION_COOKIE_NAME ?? "wizfield_session";

function isProtectedRoute(pathname: string) {
  return pathname === "/"
    || pathname.startsWith("/jobs")
    || pathname.startsWith("/technician")
    || pathname.startsWith("/customers")
    || pathname.startsWith("/admin")
    || pathname.startsWith("/schedule")
    || pathname.startsWith("/dispatch");
}

export async function proxy(request: NextRequest) {
  if (!isProtectedRoute(request.nextUrl.pathname)) {
    return NextResponse.next({ request });
  }

  const sessionCookie = request.cookies.get(sessionCookieName)?.value;

  if (!sessionCookie) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";

    if (request.nextUrl.pathname !== "/") {
      loginUrl.searchParams.set("next", request.nextUrl.pathname);
    }

    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next({ request });
}

export const config = {
  matcher: ["/", "/jobs/:path*", "/technician/:path*", "/customers/:path*", "/admin/:path*", "/schedule/:path*", "/dispatch/:path*"],
};
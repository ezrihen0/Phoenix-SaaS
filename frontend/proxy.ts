import { NextResponse, type NextRequest } from "next/server";

const sessionCookieName = process.env.SESSION_COOKIE_NAME ?? "wizfield_session";
const defaultPortalHostname = "portal.phoenixfireplace.ca";

function resolvePortalHostnames() {
  const configured = process.env.CUSTOMER_PORTAL_HOSTNAME?.trim().toLowerCase();
  const hostnames = new Set([defaultPortalHostname]);
  if (configured) {
    hostnames.add(configured);
  }
  return hostnames;
}

function isCustomerPortalHost(hostname: string) {
  return resolvePortalHostnames().has(hostname.trim().toLowerCase());
}

function isProtectedRoute(pathname: string) {
  return pathname === "/"
    || pathname.startsWith("/jobs")
    || pathname.startsWith("/customers")
    || pathname.startsWith("/admin")
    || pathname.startsWith("/schedule")
    || pathname.startsWith("/dispatch")
    || pathname.startsWith("/home");
}

export async function proxy(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const hostname = forwardedHost || request.nextUrl.hostname;

  if (isCustomerPortalHost(hostname) && request.nextUrl.pathname === "/") {
    const portalHome = request.nextUrl.clone();
    portalHome.pathname = "/portal";
    return NextResponse.redirect(portalHome);
  }

  if (isCustomerPortalHost(hostname) && isProtectedRoute(request.nextUrl.pathname)) {
    const portalHome = request.nextUrl.clone();
    portalHome.pathname = "/portal";
    return NextResponse.redirect(portalHome);
  }

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
  matcher: ["/", "/home/:path*", "/jobs/:path*", "/customers/:path*", "/admin/:path*", "/schedule/:path*", "/dispatch/:path*"],
};
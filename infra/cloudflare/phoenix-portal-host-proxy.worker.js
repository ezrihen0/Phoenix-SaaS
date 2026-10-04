/**
 * Proxies portal.phoenixfireplace.ca to app.phoenixfireplace.ca (same Next.js deployment).
 * Used when the portal hostname cannot yet be attached as a second Vercel project domain.
 */
const APP_ORIGIN = "https://app.phoenixfireplace.ca";

function rewriteSetCookieHeader(value) {
  if (!value) {
    return value;
  }
  return value
    .split(/,(?=\s*[^;]+=)/)
    .map((part) =>
      part
        .replace(/;\s*Domain=[^;]*/gi, "")
        .replace(/;\s*Secure/gi, "; Secure")
        .trim(),
    )
    .join(", ");
}

export default {
  async fetch(request) {
    const inUrl = new URL(request.url);
    const outUrl = new URL(`${inUrl.pathname}${inUrl.search}`, APP_ORIGIN);

    const headers = new Headers(request.headers);
    headers.set("Host", "app.phoenixfireplace.ca");
    headers.set("x-forwarded-host", inUrl.host);
    headers.delete("cf-connecting-ip");

    const init = {
      method: request.method,
      headers,
      redirect: "manual",
    };

    if (request.method !== "GET" && request.method !== "HEAD") {
      init.body = request.body;
    }

    const upstream = await fetch(outUrl.toString(), init);
    const outHeaders = new Headers(upstream.headers);

    if (typeof upstream.headers.getSetCookie === "function") {
      outHeaders.delete("Set-Cookie");
      for (const cookie of upstream.headers.getSetCookie()) {
        outHeaders.append("Set-Cookie", rewriteSetCookieHeader(cookie));
      }
    } else {
      const combined = upstream.headers.get("Set-Cookie");
      if (combined) {
        outHeaders.set("Set-Cookie", rewriteSetCookieHeader(combined));
      }
    }

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: outHeaders,
    });
  },
};

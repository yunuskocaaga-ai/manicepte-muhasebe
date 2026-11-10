import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";

// Not: Offline veri cache'leme bilerek uygulanmamıştır (hassas finansal
// veri, çevrimdışı önbelleğe alınmaz). PWA kurulabilirliği manifest +
// ikonlar + apple-mobile-web-app meta etiketleri ile sağlanır.
const PUBLIC_PATHS = ["/giris", "/manifest.webmanifest", "/icon", "/apple-icon", "/favicon.ico", "/api/icon"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/icons") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/cron")
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? verifySessionToken(token) : null;

  if (!session) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/giris";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

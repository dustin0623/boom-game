import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Block access to /game (and all sub-paths) when NEXT_PUBLIC_CHAIN is absent
 * or set to "none". Players are redirected to /login which will render the
 * "Coming Soon" panel instead of any sign-in form.
 */
export function middleware(request: NextRequest) {
  const rawChain = (process.env.NEXT_PUBLIC_CHAIN ?? "").toLowerCase().trim();
  const isComingSoon = rawChain === "" || rawChain === "none";

  if (isComingSoon && request.nextUrl.pathname.startsWith("/game")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/game/:path*"],
};

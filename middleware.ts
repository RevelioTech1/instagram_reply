import { NextResponse, type NextRequest } from "next/server";
import { authorizePanelRequest, isPublicPath } from "@/lib/panel-auth";

export function middleware(request: NextRequest) {
  if (isPublicPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const result = authorizePanelRequest(request.headers.get("authorization"));
  if (result.ok) {
    return NextResponse.next();
  }

  const headers = new Headers();
  if (result.wwwAuthenticate) {
    headers.set("WWW-Authenticate", result.wwwAuthenticate);
  }
  return new NextResponse(result.body, { status: result.status, headers });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};

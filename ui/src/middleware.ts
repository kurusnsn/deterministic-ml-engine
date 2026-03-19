import { auth } from "@/auth"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export default auth(function middleware(request: NextRequest) {
  const response = NextResponse.next()
  console.log(`[Middleware] GET ${request.nextUrl.pathname} - Agent: ${request.headers.get("user-agent")} - IP: ${request.ip || request.headers.get("x-forwarded-for")}`)

  // Ensure we have a client-visible session_id for anonymous persistence
  const existingSession = request.cookies.get("session_id")?.value
  if (!existingSession) {
    const sessionId = crypto.randomUUID()
    // Not httpOnly so client can forward via x-session-id header to gateway
    response.cookies.set({
      name: "session_id",
      value: sessionId,
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
      sameSite: "lax",
    })
  }

  return response
})

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - api (API routes - they handle their own auth)
     * - public assets (images, fonts, etc.)
     * - Files with extensions (e.g., .js, .css, .png, .woff2)
     */
    "/((?!_next/static|_next/image|favicon.ico|api/|public/|.*\\..*).*)",
  ],
}

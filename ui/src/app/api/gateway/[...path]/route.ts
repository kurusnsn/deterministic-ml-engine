import type { NextRequest } from "next/server"
import { auth } from "@/auth"
import { SignJWT } from "jose"

type RouteContext = {
  params: Promise<{ path?: string[] }>
}

function getGatewayUrl(): string {
  // Read env var dynamically at runtime to avoid Next.js build-time inlining.
  // Using bracket notation prevents static analysis from replacing this with a literal.
  const envKey = "GATEWAY_INTERNAL_URL"
  return (process.env[envKey] || "http://localhost:8010").replace(/\/$/, "")
}

function buildTargetUrl(request: NextRequest, pathParts: string[]): string {
  const { search } = new URL(request.url)
  const path = pathParts.join("/")
  return `${getGatewayUrl()}/${path}${search}`
}

async function proxy(request: NextRequest, context: RouteContext): Promise<Response> {
  const params = await context.params
  const targetUrl = buildTargetUrl(request, params.path ?? [])
  const headers = new Headers(request.headers)

  headers.delete("host")

  // Attach NextAuth session as HS256 JWT for gateway authentication
  const session = await auth()
  if (session?.user?.id) {
    try {
      const secretKey = process.env.AUTH_SECRET
      if (secretKey) {
        const secret = new TextEncoder().encode(secretKey)
        const jwt = await new SignJWT({
          sub: session.user.id,
          email: session.user.email ?? "",
        })
          .setProtectedHeader({ alg: "HS256" })
          .setExpirationTime("1h")
          .sign(secret)
        headers.set("Authorization", `Bearer ${jwt}`)
      }
    } catch {
      // non-fatal: request proceeds without auth header
    }
  }

  // Forward anonymous session cookie as header for gateway tracking
  const sessionId = request.cookies.get("session_id")?.value
  if (sessionId) {
    headers.set("x-session-id", sessionId)
  }

  const hasBody = !["GET", "HEAD"].includes(request.method)
  const requestInit: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
    redirect: "manual",
  }

  if (hasBody) {
    requestInit.body = request.body
    requestInit.duplex = "half"
  }

  try {
    const response = await fetch(targetUrl, requestInit)

    const responseHeaders = new Headers(response.headers)
    responseHeaders.delete("content-length")
    responseHeaders.delete("content-encoding")

    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    })
  } catch (error) {
    console.error(`Failed to proxy ${targetUrl}`, error)
    return new Response(
      JSON.stringify({ detail: "Gateway unavailable" }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    )
  }
}

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 600

export async function GET(request: NextRequest, context: RouteContext) {
  return proxy(request, context)
}

export async function POST(request: NextRequest, context: RouteContext) {
  return proxy(request, context)
}

export async function PUT(request: NextRequest, context: RouteContext) {
  return proxy(request, context)
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return proxy(request, context)
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return proxy(request, context)
}

export async function HEAD(request: NextRequest, context: RouteContext) {
  return proxy(request, context)
}

export async function OPTIONS(request: NextRequest, context: RouteContext) {
  return proxy(request, context)
}

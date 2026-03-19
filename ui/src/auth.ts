import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import Credentials from "next-auth/providers/credentials"
import { createSupabaseServerClient } from "@/lib/supabase-server"

// Auth.js v5 reads AUTH_SECRET automatically.
// Google provider reads AUTH_GOOGLE_ID + AUTH_GOOGLE_SECRET automatically.

function getGatewayUrl(): string {
  const envKey = "GATEWAY_INTERNAL_URL"
  return (process.env[envKey] || "http://localhost:8010").replace(/\/$/, "")
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  providers: [
    Google({}),
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        try {
          const supabase = createSupabaseServerClient()
          const { data, error } = await supabase.auth.signInWithPassword({
            email: credentials.email as string,
            password: credentials.password as string,
          })
          if (error || !data.user) return null
          return {
            id: data.user.id,
            email: data.user.email ?? "",
            name: data.user.user_metadata?.full_name ?? data.user.email ?? "",
          }
        } catch {
          return null
        }
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // On first sign-in, sync with gateway to get/create stable UUID
        try {
          const res = await fetch(`${getGatewayUrl()}/users/sync`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          })
          if (res.ok) {
            const data = await res.json()
            if (data.user_id) {
              token.sub = data.user_id
            }
          }
        } catch {
          // non-fatal
        }
        if (!token.sub && user.id) {
          token.sub = user.id
        }
        token.email = user.email ?? token.email
      }
      return token
    },
    async session({ session, token }) {
      if (token.sub) {
        session.user.id = token.sub
      }
      return session
    },
  },
  pages: {
    signIn: "/login",
  },
})

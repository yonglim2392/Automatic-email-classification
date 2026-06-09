import type { NextAuthConfig } from "next-auth"

// Edge 런타임 호환 설정 (Prisma/fs 모듈 없이)
export const authConfig: NextAuthConfig = {
  providers: [], // credentials provider는 auth.ts에서만 정의 (Node.js 런타임 전용)
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const isProtected =
        nextUrl.pathname.startsWith("/dashboard") ||
        nextUrl.pathname.startsWith("/admin")
      if (isProtected && !isLoggedIn) {
        return Response.redirect(new URL("/login", nextUrl))
      }
      return true
    },
  },
  pages: { signIn: "/login" },
}

import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";

/**
 * ==============================================================================
 * NEXTAUTH GOOGLE OAUTH HANDLER CHO NEXT.JS (APP ROUTER)
 * Vị trí file trong dự án Next.js: app/api/auth/[...nextauth]/route.ts
 *
 * ⚠️ KHẮC PHỤC LỖI "Error 400: origin_mismatch" TRÊN GOOGLE CLOUD CONSOLE:
 * 1. Truy cập https://console.cloud.google.com/apis/credentials
 * 2. Nhấp vào OAuth 2.0 Client ID bạn đang sử dụng
 * 3. Tại mục "Authorized JavaScript origins" (Nguồn gốc JavaScript được uỷ quyền):
 *    👉 Thêm: https://dao-tam-doc-truyen.vercel.app
 *    👉 Thêm: http://localhost:3000
 * 4. Tại mục "Authorized redirect URIs" (URI chuyển hướng được uỷ quyền):
 *    👉 Thêm: https://dao-tam-doc-truyen.vercel.app/api/auth/callback/google
 *    👉 Thêm: http://localhost:3000/api/auth/callback/google
 * 5. Tại Firebase Console (https://console.firebase.google.com/):
 *    👉 Authentication -> Settings -> Authorized Domains -> Thêm: dao-tam-doc-truyen.vercel.app
 * ==============================================================================
 */

export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "303878634946-3muahe4u9dteemsdcnnnaoau54pirbtq.apps.googleusercontent.com",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      authorization: {
        params: {
          prompt: "select_account",
          access_type: "offline",
          response_type: "code",
        },
      },
    }),
  ],
  callbacks: {
    async session({ session, token }: any) {
      if (session?.user) {
        session.user.id = token.sub;
        // Phân quyền Quản Trị Viên (Admin) - Duy nhất 2 tài khoản chính thức:
        const ADMIN_EMAILS = ["hoaamcac@gmail.com", "meoyeutien22@gmail.com"];
        const email = session.user.email?.toLowerCase().trim() || "";
        session.user.role = ADMIN_EMAILS.includes(email) ? "admin" : "reader";
      }
      return session;
    },
    async jwt({ token, user }: any) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
  },
  secret: process.env.NEXTAUTH_SECRET || "daotam_secure_session_secret_2026",
  pages: {
    signIn: "/",
    error: "/",
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };

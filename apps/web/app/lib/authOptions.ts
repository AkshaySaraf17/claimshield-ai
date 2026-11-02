import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "").split(",").filter(Boolean);

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
    CredentialsProvider({
      id: "admin-login",
      name: "Admin Login",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const adminEmail = process.env.ADMIN_EMAIL || "admin@claimshield.local";
        const adminPass = process.env.ADMIN_PASSWORD || "admin123";
        if (
          credentials?.email === adminEmail &&
          credentials?.password === adminPass
        ) {
          return {
            id: "admin-001",
            email: adminEmail,
            name: "Admin",
            role: "admin",
          };
        }
        return null;
      },
    }),
    CredentialsProvider({
      id: "dev-login",
      name: "Dev Login",
      credentials: {},
      async authorize() {
        return {
          id: "dev-user-001",
          email: "dev@claimshield.local",
          name: "Alice Chen (Dev)",
          role: "biller",
        };
      },
    }),
    // Reviewer persona so the server-enforced appeal approval flow can be exercised locally
    CredentialsProvider({
      id: "dev-reviewer-login",
      name: "Dev Reviewer Login",
      credentials: {},
      async authorize() {
        return {
          id: "dev-user-003",
          email: "reviewer@claimshield.local",
          name: "Mike Chen (Dev Reviewer)",
          role: "reviewer",
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.role =
          (user as { role?: string }).role ||
          (ADMIN_EMAILS.includes(user.email || "") ? "admin" : "user");
        token.provider = account?.provider || "credentials";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { role?: string }).role = token.role as string;
        (session.user as { id?: string }).id = token.sub as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET || "claimshield-dev-secret-change-in-production",
};

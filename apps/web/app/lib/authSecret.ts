/** NextAuth signing secret. Shared by the auth config and the edge middleware (keep this module dependency-free). */
export const AUTH_SECRET = process.env.NEXTAUTH_SECRET || "claimshield-dev-secret-change-in-production";

import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/authOptions";

const DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001";

/**
 * Headers the Java services use for tenancy, audit attribution and role checks,
 * built from the signed-in NextAuth session (server-side, so the browser cannot spoof them).
 * Unauthenticated requests are forwarded as "anonymous" with no roles.
 */
export async function identityHeaders(json = false): Promise<Record<string, string>> {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; role?: string } | undefined;

  const headers: Record<string, string> = {
    "X-Tenant-Id": DEFAULT_TENANT_ID,
    "X-User-Id": user?.id || "anonymous",
    "X-User-Roles": user?.role || "",
  };
  if (json) headers["Content-Type"] = "application/json";
  return headers;
}

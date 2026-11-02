import { NextResponse, type NextRequest } from "next/server";

const JAVA_API_URL = process.env.JAVA_API_URL || "http://localhost:8080";
const DEV_HEADERS: Record<string, string> = {
  "X-Tenant-Id": "00000000-0000-0000-0000-000000000001",
  "X-User-Id": "dev-user-001",
  "X-User-Roles": "biller",
};

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get("q") || "";
    const resp = await fetch(`${JAVA_API_URL}/api/v1/denial-code-reference?q=${encodeURIComponent(q)}`, { headers: DEV_HEADERS });
    const data = await resp.json();
    return NextResponse.json(data, { status: resp.status });
  } catch (err) {
    return NextResponse.json({ detail: err instanceof Error ? err.message : "error" }, { status: 502 });
  }
}

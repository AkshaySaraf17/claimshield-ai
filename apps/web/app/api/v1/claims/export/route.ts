import { NextResponse } from "next/server";

const JAVA_API_URL = process.env.JAVA_API_URL || "http://localhost:8080";
const DEV_HEADERS: Record<string, string> = {
  "X-Tenant-Id": "00000000-0000-0000-0000-000000000001",
  "X-User-Id": "dev-user-001",
  "X-User-Roles": "biller",
};

export async function GET() {
  try {
    const resp = await fetch(`${JAVA_API_URL}/api/v1/claims/export`, {
      headers: DEV_HEADERS,
    });
    const csv = await resp.text();
    return new NextResponse(csv, {
      status: resp.status,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=claims_export.csv",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Failed to reach dev server" },
      { status: 502 }
    );
  }
}

import { NextResponse } from "next/server";

const DEV_SERVER_URL = process.env.DEV_SERVER_URL || "http://localhost:8003";
const DEV_HEADERS: Record<string, string> = {
  "X-Tenant-Id": "00000000-0000-0000-0000-000000000001",
  "X-User-Id": "dev-user-001",
  "X-User-Roles": "biller",
};

export async function GET() {
  try {
    const resp = await fetch(`${DEV_SERVER_URL}/api/v1/claims/export/csv`, {
      headers: DEV_HEADERS,
    });
    const text = await resp.text();
    return new NextResponse(text, {
      status: resp.status,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=claims_export.csv",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Failed to reach dev server" },
      { status: 502 },
    );
  }
}

import { NextResponse } from "next/server";
import { identityHeaders } from "@/app/lib/identity";

const JAVA_API_URL = process.env.JAVA_API_URL || "http://localhost:8080";

export async function GET() {
  try {
    const resp = await fetch(`${JAVA_API_URL}/api/v1/claims/export/csv`, {
      headers: await identityHeaders(),
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

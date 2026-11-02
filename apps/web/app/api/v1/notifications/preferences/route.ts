import { NextResponse, type NextRequest } from "next/server";
import { identityHeaders } from "@/app/lib/identity";

const WORKFLOW_SERVICE_URL = process.env.WORKFLOW_SERVICE_URL || "http://localhost:8082";

export async function GET() {
  try {
    const resp = await fetch(`${WORKFLOW_SERVICE_URL}/api/v1/notifications/preferences`, {
      headers: await identityHeaders(),
    });
    const data = await resp.json();
    return NextResponse.json(data, { status: resp.status });
  } catch (err) {
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Failed to reach dev server" },
      { status: 502 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const resp = await fetch(`${WORKFLOW_SERVICE_URL}/api/v1/notifications/preferences`, {
      method: "PUT",
      headers: { ...(await identityHeaders()), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    return NextResponse.json(data, { status: resp.status });
  } catch (err) {
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Failed to reach dev server" },
      { status: 502 },
    );
  }
}

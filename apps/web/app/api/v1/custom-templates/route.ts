import { NextRequest, NextResponse } from "next/server";
import { identityHeaders } from "@/app/lib/identity";

const WORKFLOW_SERVICE_URL = process.env.WORKFLOW_SERVICE_URL || "http://localhost:8082";

export async function GET() {
  try {
    const resp = await fetch(`${WORKFLOW_SERVICE_URL}/api/v1/custom-templates`, {
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // The templates page deletes via POST { _action: "delete", id }
    if (body?._action === "delete" && body.id) {
      const del = await fetch(`${WORKFLOW_SERVICE_URL}/api/v1/custom-templates/${encodeURIComponent(body.id)}`, {
        method: "DELETE",
        headers: await identityHeaders(),
      });
      return NextResponse.json({ deleted: del.ok, id: body.id }, { status: del.ok ? 200 : del.status });
    }
    const resp = await fetch(`${WORKFLOW_SERVICE_URL}/api/v1/custom-templates`, {
      method: "POST",
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

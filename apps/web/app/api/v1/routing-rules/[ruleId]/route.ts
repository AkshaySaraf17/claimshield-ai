import { NextResponse, type NextRequest } from "next/server";
import { identityHeaders } from "@/app/lib/identity";

const WORKFLOW_SERVICE_URL = process.env.WORKFLOW_SERVICE_URL || "http://localhost:8082";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ ruleId: string }> },
) {
  const { ruleId } = await params;
  try {
    const resp = await fetch(`${WORKFLOW_SERVICE_URL}/api/v1/routing-rules/${ruleId}`, {
      method: "DELETE",
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

import { NextResponse, type NextRequest } from "next/server";
import { identityHeaders } from "@/app/lib/identity";

const WORKFLOW_SERVICE_URL = process.env.WORKFLOW_SERVICE_URL || "http://localhost:8082";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ contactId: string }> },
) {
  const { contactId } = await params;
  try {
    const resp = await fetch(`${WORKFLOW_SERVICE_URL}/api/v1/payer-contacts/${contactId}`, {
      method: "DELETE",
      headers: await identityHeaders(),
    });
    const data = await resp.json();
    return NextResponse.json(data, { status: resp.status });
  } catch (err) {
    return NextResponse.json({ detail: err instanceof Error ? err.message : "error" }, { status: 502 });
  }
}

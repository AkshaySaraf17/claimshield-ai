import { NextRequest, NextResponse } from "next/server";

const AGENT_SERVICE_URL =
  process.env.AGENT_SERVICE_URL || "http://localhost:8001";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const resp = await fetch(`${AGENT_SERVICE_URL}/api/v1/pipeline/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return NextResponse.json(
        { detail: text || `Agent service returned ${resp.status}` },
        { status: resp.status }
      );
    }

    const data = await resp.json();
    return NextResponse.json(data);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to reach agent service";
    return NextResponse.json({ detail: message }, { status: 502 });
  }
}

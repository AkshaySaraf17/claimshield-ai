import { NextResponse } from "next/server";

const DEV_SERVER_URL = process.env.DEV_SERVER_URL || "http://localhost:8003";

export async function GET() {
  try {
    const resp = await fetch(`${DEV_SERVER_URL}/api/v1/appeal-templates`);
    const data = await resp.json();
    return NextResponse.json(data, { status: resp.status });
  } catch (err) {
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Failed to reach dev server" },
      { status: 502 },
    );
  }
}

import { NextResponse } from "next/server";

const JAVA_API_URL = process.env.JAVA_API_URL || "http://localhost:8080";

export async function GET() {
  try {
    const resp = await fetch(`${JAVA_API_URL}/api/v1/appeal-templates`);
    const data = await resp.json();
    return NextResponse.json(data, { status: resp.status });
  } catch (err) {
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Failed to reach dev server" },
      { status: 502 },
    );
  }
}

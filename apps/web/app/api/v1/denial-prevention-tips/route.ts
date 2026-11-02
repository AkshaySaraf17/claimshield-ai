import { NextResponse } from "next/server";
import { identityHeaders } from "@/app/lib/identity";

const JAVA_API_URL = process.env.JAVA_API_URL || "http://localhost:8080";

export async function GET() {
  try {
    const resp = await fetch(`${JAVA_API_URL}/api/v1/denial-prevention-tips`, { headers: await identityHeaders() });
    const data = await resp.json();
    return NextResponse.json(data, { status: resp.status });
  } catch (err) {
    return NextResponse.json({ detail: err instanceof Error ? err.message : "error" }, { status: 502 });
  }
}

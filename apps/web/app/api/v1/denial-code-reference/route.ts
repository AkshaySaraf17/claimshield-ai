import { NextResponse, type NextRequest } from "next/server";
import { identityHeaders } from "@/app/lib/identity";

const JAVA_API_URL = process.env.JAVA_API_URL || "http://localhost:8080";

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get("q") || "";
    const resp = await fetch(`${JAVA_API_URL}/api/v1/denial-code-reference?q=${encodeURIComponent(q)}`, { headers: await identityHeaders() });
    const data = await resp.json();
    return NextResponse.json(data, { status: resp.status });
  } catch (err) {
    return NextResponse.json({ detail: err instanceof Error ? err.message : "error" }, { status: 502 });
  }
}

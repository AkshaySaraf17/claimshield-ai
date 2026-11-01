import { NextRequest, NextResponse } from "next/server";

const JAVA_API = process.env.JAVA_API_URL || "http://localhost:8080";

export async function POST(request: NextRequest) {
  const formData = await request.formData();

  const headers: Record<string, string> = {
    "X-Tenant-Id": request.headers.get("x-tenant-id") || "00000000-0000-0000-0000-000000000001",
    "X-User-Id": request.headers.get("x-user-id") || "dev-user-001",
  };

  const res = await fetch(`${JAVA_API}/api/v1/documents/upload`, {
    method: "POST",
    headers,
    body: formData,
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

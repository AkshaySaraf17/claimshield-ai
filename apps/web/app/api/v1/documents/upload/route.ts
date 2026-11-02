import { NextRequest, NextResponse } from "next/server";
import { identityHeaders } from "@/app/lib/identity";

const JAVA_API = process.env.JAVA_API_URL || "http://localhost:8080";

export async function POST(request: NextRequest) {
  const formData = await request.formData();

  // Identity comes from the server-side session, never from client-supplied headers
  const res = await fetch(`${JAVA_API}/api/v1/documents/upload`, {
    method: "POST",
    headers: await identityHeaders(),
    body: formData,
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

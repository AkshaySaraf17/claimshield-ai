import { NextResponse } from "next/server";

const JAVA_API = process.env.JAVA_API_URL || "http://localhost:8080";

export async function GET() {
  const res = await fetch(`${JAVA_API}/api/v1/documents/types`);
  const data = await res.json();
  return NextResponse.json(data);
}

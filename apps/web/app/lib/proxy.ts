import { NextResponse } from "next/server";

/**
 * Relay a backend response to the browser. Java DELETE endpoints answer 204 No Content,
 * which has no JSON body to parse, so that becomes { deleted: true } with status 200.
 */
export async function relayJson(resp: Response): Promise<NextResponse> {
  if (resp.status === 204) return NextResponse.json({ deleted: true }, { status: 200 });
  const text = await resp.text();
  return NextResponse.json(text ? JSON.parse(text) : null, { status: resp.status });
}

import { NextResponse } from "next/server";

export const maxDuration = 60;

const PARSER_SYSTEM = `You are a medical billing coding specialist. Extract structured
fields from a raw insurance denial letter. Respond with ONLY a JSON object, no
prose, no markdown fences, with exactly these keys:
{
  "denial_code": string (e.g. "CO-50"),
  "denial_reason": string (plain-English reason),
  "payer_name": string,
  "amount_denied": number
}
If a field cannot be determined, use your best inference from context; never
leave a field blank.`;

const WRITER_SYSTEM = `You are a medical billing appeals specialist writing a
formal insurance appeal letter. Use a professional, factual clinical tone.
Do not invent facts not present in the provided evidence or clinical notes.
Structure: recipient line, subject line, opening statement of appeal,
clinical justification section citing the provided policy evidence, closing
request for reversal, sign-off. Output plain text only, no markdown.`;

const STATIC_POLICY_KB: Record<string, string> = {
  "CO-50":
    "Payer medical policy generally requires documented functional impairment (e.g. mobility/ADL scores) to justify medical necessity for rehabilitative therapy. Cross-reference the clinical notes for objective measurements that satisfy this threshold.",
  "CO-97":
    "This code indicates the service is bundled into a prior payment. Verify whether a modifier (e.g. -59) was omitted on the original claim that would have unbundled the procedure.",
  "CO-16":
    "Claim/service lacks information needed for adjudication. Review the original submission for missing NPI, diagnosis pointers, or authorization numbers.",
};

const DEFAULT_EVIDENCE =
  "No pre-indexed policy clause matched this denial code. A billing specialist should manually pull the payer's medical policy for this code before the appeal is finalized.";

async function callGemini(
  system: string,
  user: string,
  jsonMode: boolean = false
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const payload: Record<string, unknown> = {
    model: "gemini-2.0-flash",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
  if (jsonMode) {
    payload.response_format = { type: "json_object" };
  }

  const resp = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Gemini API error ${resp.status}: ${text}`);
  }

  const data = await resp.json();
  return data.choices[0].message.content;
}

function safeJsonParse(raw: string, fallback: Record<string, unknown>) {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/, "")
    .replace(/^```\s*/, "")
    .replace(/\s*```$/, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return fallback;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { denial_text, clinical_notes } = body;

    if (!denial_text || !clinical_notes) {
      return NextResponse.json(
        { detail: "denial_text and clinical_notes are required" },
        { status: 400 }
      );
    }

    // Step 1: Parse the denial letter
    const fallback = {
      denial_code: "UNKNOWN",
      denial_reason:
        "Could not be automatically determined — needs manual review.",
      payer_name: "Unknown Payer",
      amount_denied: 0.0,
    };

    let parsed;
    try {
      const raw = await callGemini(PARSER_SYSTEM, denial_text, true);
      parsed = safeJsonParse(raw, fallback);
    } catch (err) {
      parsed = {
        ...fallback,
        denial_reason: `Parser error: ${err instanceof Error ? err.message : err}`,
      };
    }

    const denialCode = parsed.denial_code || fallback.denial_code;
    const denialReason = parsed.denial_reason || fallback.denial_reason;
    const payerName = parsed.payer_name || fallback.payer_name;
    const amountDenied = parseFloat(parsed.amount_denied) || 0.0;

    // Step 2: Research — static policy KB lookup
    const evidence = STATIC_POLICY_KB[denialCode] || DEFAULT_EVIDENCE;

    // Step 3: Generate appeal letter
    const writerPrompt = `
Payer: ${payerName}
Denial code: ${denialCode}
Denial reason given by payer: ${denialReason}
Amount denied: $${amountDenied.toFixed(2)}

Policy evidence supporting reversal:
${evidence}

Clinical notes (source of truth — do not contradict):
${clinical_notes}
`;

    let letter;
    try {
      letter = await callGemini(WRITER_SYSTEM, writerPrompt);
    } catch (err) {
      letter =
        `[DRAFT GENERATION FAILED: ${err instanceof Error ? err.message : err}]\n\n` +
        `To: Appeals Department, ${payerName}\n` +
        `RE: Appeal of denial code ${denialCode}\n\n` +
        `Evidence on file:\n${evidence}\n\n` +
        "A billing specialist must complete this letter manually.";
    }

    return NextResponse.json({
      status: "success",
      denial_summary: {
        denial_code: denialCode,
        denial_reason: denialReason,
        payer_name: payerName,
        amount_denied: amountDenied,
      },
      generated_appeal: letter,
      requires_human_review: true,
    });
  } catch (err) {
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

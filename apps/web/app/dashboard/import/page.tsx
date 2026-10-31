"use client";

import { useState } from "react";
import Link from "next/link";

interface ParsedClaim {
  claim_id: string | null;
  patient_name: string | null;
  payer_name: string | null;
  denial_code: string | null;
  denial_codes_all: string[];
  amount_denied_cents: number;
  total_charge_cents: number;
  total_paid_cents: number;
}

interface ParseResult {
  payer_name: string | null;
  payee_name: string | null;
  check_number: string | null;
  check_date: string | null;
  total_paid_cents: number;
  segment_count: number;
  claims_found: number;
  claims: ParsedClaim[];
  errors: string[];
}

interface ImportResult {
  imported: number;
  claim_ids: string[];
  payer_name: string | null;
}

const SAMPLE_EDI = `ISA*00*          *00*          *ZZ*PAYERID        *ZZ*PROVIDERID     *231015*1200*^*00501*000000001*0*P*:~
GS*HP*PAYERID*PROVIDERID*20231015*1200*1*X*005010X221A1~
ST*835*0001~
BPR*I*1500.00*C*ACH*CTX*01*999999999*DA*123456789*1234567890**01*999888777*DA*987654321*20231020~
TRN*1*12345678*1234567890~
DTM*405*20231015~
N1*PR*ACME HEALTH INSURANCE~
N1*PE*SUNSHINE MEDICAL GROUP~
CLP*CLM-2023-001*1*2500.00*1500.00*500.00*12~
NM1*QC*1*SMITH*JOHN~
SVC*HC:99213*250.00*200.00~
CAS*CO*45*50.00~
DTM*472*20230901~
SVC*HC:97110*150.00*100.00~
CAS*CO*50*50.00~
CAS*PR*1*50.00~
DTM*472*20230901~
LQ*HE*N425~
CLP*CLM-2023-002*4*1800.00*0.00*0.00*12~
NM1*QC*1*JONES*MARY~
SVC*HC:99214*300.00*0.00~
CAS*CO*197*300.00~
DTM*472*20230915~
SVC*HC:97140*200.00*0.00~
CAS*CO*4*200.00~
DTM*472*20230915~
SE*25*0001~
GE*1*1~
IEA*1*000000001~`;

export default function EDI835ImportPage() {
  const [rawEdi, setRawEdi] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleParse() {
    if (!rawEdi.trim()) return;
    setParsing(true);
    setError(null);
    setParseResult(null);
    setImportResult(null);
    try {
      const res = await fetch("/api/v1/edi835/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_edi: rawEdi }),
      });
      if (!res.ok) throw new Error(`Parse failed: ${res.status}`);
      setParseResult(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Parse failed");
    } finally {
      setParsing(false);
    }
  }

  async function handleImport() {
    if (!rawEdi.trim()) return;
    setImporting(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/edi835/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_edi: rawEdi }),
      });
      if (!res.ok) throw new Error(`Import failed: ${res.status}`);
      setImportResult(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  function centsToDisplay(cents: number) {
    return `$${(cents / 100).toFixed(2)}`;
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">
          Import &middot; EDI 835
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">
          EDI 835 Remittance Import
        </h1>
        <p className="mt-2 text-sm text-ink-500">
          Paste an EDI 835 (Electronic Remittance Advice) file to parse and import
          denials as claims. The parser is fully deterministic — no LLM involved.
        </p>
      </header>

      {error && (
        <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      {importResult && (
        <div className="mb-4 rounded border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700">
          Imported {importResult.imported} claims from {importResult.payer_name || "EDI 835"}.{" "}
          <Link href="/dashboard/claims" className="underline hover:text-green-900">
            View in Claims →
          </Link>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Input */}
        <div className="space-y-4">
          <div className="rounded border border-ink-300/40 bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">
                EDI 835 data
              </h2>
              <button
                onClick={() => setRawEdi(SAMPLE_EDI)}
                className="rounded border border-ink-300/50 px-2 py-1 text-xs text-ink-500 hover:bg-ink-100"
              >
                Load sample
              </button>
            </div>
            <textarea
              value={rawEdi}
              onChange={(e) => setRawEdi(e.target.value)}
              rows={16}
              placeholder="Paste EDI 835 content here (ISA*00*...)..."
              className="w-full rounded border border-ink-300/50 bg-parchment/30 p-3 font-mono text-xs focus:border-ledger-500 focus:outline-none focus:ring-1 focus:ring-ledger-500"
            />
            <div className="mt-3 flex gap-2">
              <button
                onClick={handleParse}
                disabled={parsing || !rawEdi.trim()}
                className="rounded bg-ink-950 px-4 py-2 text-sm font-medium text-white hover:bg-ink-900 disabled:opacity-50"
              >
                {parsing ? "Parsing..." : "Parse (preview)"}
              </button>
              <button
                onClick={handleImport}
                disabled={importing || !rawEdi.trim()}
                className="rounded bg-ledger-600 px-4 py-2 text-sm font-medium text-white hover:bg-ledger-700 disabled:opacity-50"
              >
                {importing ? "Importing..." : "Parse & import claims"}
              </button>
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="space-y-4">
          {parseResult && (
            <>
              <div className="rounded border border-ink-300/40 bg-white p-5">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">
                  Remittance summary
                </h2>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-ink-500">Payer</dt>
                    <dd className="font-medium text-ink-900">{parseResult.payer_name || "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-500">Payee</dt>
                    <dd className="text-ink-700">{parseResult.payee_name || "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-500">Check #</dt>
                    <dd className="font-mono text-ink-700">{parseResult.check_number || "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-500">Check date</dt>
                    <dd className="text-ink-700">{parseResult.check_date || "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-500">Total paid</dt>
                    <dd className="font-mono font-medium text-green-700">
                      {centsToDisplay(parseResult.total_paid_cents)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-500">Segments parsed</dt>
                    <dd className="text-ink-700">{parseResult.segment_count}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-500">Claims found</dt>
                    <dd className="font-medium text-ink-900">{parseResult.claims_found}</dd>
                  </div>
                </dl>
              </div>

              {parseResult.errors.length > 0 && (
                <div className="rounded border border-amber-300 bg-amber-50 p-4">
                  <h3 className="text-xs font-semibold text-amber-700">Parse warnings</h3>
                  {parseResult.errors.map((e, i) => (
                    <p key={i} className="mt-1 text-xs text-amber-600">{e}</p>
                  ))}
                </div>
              )}

              {parseResult.claims.map((claim, i) => (
                <div key={i} className="rounded border border-ink-300/40 bg-white p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-ink-800">
                      {claim.patient_name || `Claim ${i + 1}`}
                    </h3>
                    <span className="font-mono text-xs text-ink-400">
                      {claim.claim_id || "—"}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-ink-500">Charged</span>
                      <p className="font-mono font-medium">{centsToDisplay(claim.total_charge_cents)}</p>
                    </div>
                    <div>
                      <span className="text-ink-500">Paid</span>
                      <p className="font-mono font-medium text-green-700">
                        {centsToDisplay(claim.total_paid_cents)}
                      </p>
                    </div>
                    <div>
                      <span className="text-ink-500">Denied</span>
                      <p className="font-mono font-medium text-red-700">
                        {centsToDisplay(claim.amount_denied_cents)}
                      </p>
                    </div>
                  </div>
                  {claim.denial_codes_all.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {claim.denial_codes_all.map((code) => (
                        <span
                          key={code}
                          className="rounded border border-red-200 bg-red-50 px-1.5 py-0.5 font-mono text-[10px] text-red-700"
                        >
                          {code}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}

          {!parseResult && !error && (
            <div className="rounded border border-ink-300/30 bg-parchment/30 px-4 py-12 text-center text-sm text-ink-400">
              Paste an EDI 835 file on the left and click Parse to preview the
              extracted claims before importing.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

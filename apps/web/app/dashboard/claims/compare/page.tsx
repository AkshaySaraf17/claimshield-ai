"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Claim {
  id: string;
  claim_number: string | null;
  payer_name: string | null;
  denial_code: string | null;
  denial_reason: string | null;
  amount_denied_cents: number | null;
  status: string;
  filing_deadline: string | null;
  patient_id: string | null;
  created_at: string;
}

interface CompareResult {
  claims: Claim[];
  differences: Record<string, unknown[]>;
  same_payer: boolean;
  same_denial_code: boolean;
  total_denied_cents: number;
}

function dollars(cents: number | null) {
  if (cents == null) return "—";
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

const COMPARE_FIELDS: { key: keyof Claim; label: string; format?: (v: unknown) => string }[] = [
  { key: "claim_number", label: "Claim #" },
  { key: "patient_id", label: "Patient ID" },
  { key: "payer_name", label: "Payer" },
  { key: "denial_code", label: "Denial Code" },
  { key: "denial_reason", label: "Denial Reason" },
  { key: "amount_denied_cents", label: "Amount Denied", format: (v) => dollars(v as number | null) },
  { key: "status", label: "Status", format: (v) => String(v ?? "—").replace(/_/g, " ") },
  { key: "filing_deadline", label: "Filing Deadline", format: (v) => v ? new Date(v as string).toLocaleDateString() : "—" },
  { key: "created_at", label: "Created", format: (v) => v ? new Date(v as string).toLocaleDateString() : "—" },
];

export default function ComparePage() {
  const [allClaims, setAllClaims] = useState<Claim[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingClaims, setLoadingClaims] = useState(true);

  useEffect(() => {
    fetch("/api/v1/claims?limit=100")
      .then((r) => r.json())
      .then((d) => {
        setAllClaims(Array.isArray(d) ? d : d.items || []);
        setLoadingClaims(false);
      });
  }, []);

  function toggleClaim(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 5 ? [...prev, id] : prev
    );
    setResult(null);
  }

  async function runCompare() {
    if (selected.length < 2) return;
    setLoading(true);
    const resp = await fetch("/api/v1/claims/compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claim_ids: selected }),
    });
    const data = await resp.json();
    setResult(data);
    setLoading(false);
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">Claims</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">
          Compare Claims
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Select 2–5 claims to compare side-by-side.
        </p>
      </header>

      {/* Claim selector */}
      <div className="mb-6 rounded-lg border border-ink-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-medium text-ink-700">
            {selected.length} of 5 selected
          </p>
          <button
            onClick={runCompare}
            disabled={selected.length < 2 || loading}
            className="rounded bg-ink-950 px-4 py-1.5 text-sm text-white hover:bg-ink-900 disabled:opacity-40"
          >
            {loading ? "Comparing..." : "Compare Selected"}
          </button>
        </div>

        {loadingClaims ? (
          <p className="text-sm text-ink-400">Loading claims...</p>
        ) : (
          <div className="max-h-48 overflow-y-auto space-y-1">
            {allClaims.map((c) => (
              <label
                key={c.id}
                className={`flex cursor-pointer items-center gap-3 rounded px-3 py-2 text-sm transition-colors ${
                  selected.includes(c.id) ? "bg-indigo-50 border border-indigo-200" : "hover:bg-ink-50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(c.id)}
                  onChange={() => toggleClaim(c.id)}
                  className="accent-indigo-600"
                />
                <span className="font-mono text-ink-700">{c.claim_number || c.id.slice(0, 8)}</span>
                <span className="text-ink-500">{c.payer_name}</span>
                <span className="font-mono text-xs text-ink-400">{c.denial_code}</span>
                <span className="ml-auto font-mono text-ink-600">{dollars(c.amount_denied_cents)}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Comparison result */}
      {result && (
        <div className="rounded-lg border border-ink-200 bg-white">
          {/* Summary badges */}
          <div className="flex items-center gap-3 border-b border-ink-200 px-5 py-3">
            <span className={`rounded px-2 py-0.5 text-xs ${result.same_payer ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
              {result.same_payer ? "Same Payer" : "Different Payers"}
            </span>
            <span className={`rounded px-2 py-0.5 text-xs ${result.same_denial_code ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
              {result.same_denial_code ? "Same Denial Code" : "Different Denial Codes"}
            </span>
            <span className="rounded bg-ink-100 px-2 py-0.5 text-xs text-ink-600">
              Total: {dollars(result.total_denied_cents)}
            </span>
            <span className="ml-auto text-xs text-ink-400">
              {Object.keys(result.differences).length} field(s) differ
            </span>
          </div>

          {/* Comparison table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-200 bg-ink-50/50">
                  <th className="px-4 py-2 text-left text-xs font-medium text-ink-500">Field</th>
                  {result.claims.map((c) => (
                    <th key={c.id} className="px-4 py-2 text-left text-xs font-medium text-ink-500">
                      <Link href={`/dashboard/claims/${c.id}`} className="text-indigo-600 hover:underline">
                        {c.claim_number || c.id.slice(0, 8)}
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARE_FIELDS.map((field) => {
                  const isDiff = field.key in result.differences;
                  return (
                    <tr
                      key={field.key}
                      className={`border-b border-ink-100 ${isDiff ? "bg-amber-50/40" : ""}`}
                    >
                      <td className="px-4 py-2 font-medium text-ink-700">
                        {field.label}
                        {isDiff && <span className="ml-1 text-amber-600">*</span>}
                      </td>
                      {result.claims.map((c) => {
                        const raw = c[field.key];
                        const val = field.format ? field.format(raw) : (raw ?? "—");
                        return (
                          <td key={c.id} className="px-4 py-2 font-mono text-ink-600">
                            {String(val)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

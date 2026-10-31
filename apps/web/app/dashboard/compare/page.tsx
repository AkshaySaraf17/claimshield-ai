"use client";

import { useEffect, useState } from "react";

interface ClaimDetail {
  id: string;
  claim_number: string | null;
  payer_name: string | null;
  denial_code: string | null;
  denial_reason: string | null;
  amount_denied_cents: number | null;
  status: string;
  raw_denial_text: string | null;
  raw_clinical_notes: string | null;
  created_at: string;
}

function dollars(cents: number | null) {
  if (cents == null) return "—";
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

interface ClaimListItem {
  id: string;
  claim_number: string | null;
  payer_name: string | null;
  status: string;
}

export default function ComparePage() {
  const [claims, setClaims] = useState<ClaimListItem[]>([]);
  const [leftId, setLeftId] = useState("");
  const [rightId, setRightId] = useState("");
  const [left, setLeft] = useState<ClaimDetail | null>(null);
  const [right, setRight] = useState<ClaimDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v1/claims")
      .then((r) => r.json())
      .then((d) => {
        const items = Array.isArray(d) ? d : d.items || [];
        setClaims(items);
        setLoading(false);
      });
  }, []);

  async function loadClaim(id: string, side: "left" | "right") {
    if (!id) {
      if (side === "left") setLeft(null);
      else setRight(null);
      return;
    }
    const resp = await fetch(`/api/v1/claims/${id}`);
    const data = await resp.json();
    if (side === "left") setLeft(data);
    else setRight(data);
  }

  function handleLeft(id: string) {
    setLeftId(id);
    loadClaim(id, "left");
  }

  function handleRight(id: string) {
    setRightId(id);
    loadClaim(id, "right");
  }

  const fields: { label: string; get: (c: ClaimDetail) => string }[] = [
    { label: "Claim Number", get: (c) => c.claim_number || "—" },
    { label: "Payer", get: (c) => c.payer_name || "—" },
    { label: "Denial Code", get: (c) => c.denial_code || "—" },
    { label: "Denial Reason", get: (c) => c.denial_reason || "—" },
    { label: "Amount Denied", get: (c) => dollars(c.amount_denied_cents) },
    { label: "Status", get: (c) => c.status.replace(/_/g, " ") },
    {
      label: "Created",
      get: (c) => new Date(c.created_at).toLocaleDateString(),
    },
  ];

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">
          Analysis
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">
          Claim Comparison
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Compare two claims side by side to identify differences in denial
          patterns, amounts, and clinical documentation.
        </p>
      </header>

      {loading ? (
        <p className="text-ink-400">Loading claims...</p>
      ) : (
        <>
          {/* Selectors */}
          <div className="mb-6 grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-500">
                Claim A
              </label>
              <select
                value={leftId}
                onChange={(e) => handleLeft(e.target.value)}
                className="w-full rounded border border-ink-300 px-3 py-2 text-sm"
              >
                <option value="">Select a claim...</option>
                {claims.map((c) => (
                  <option key={c.id} value={c.id} disabled={c.id === rightId}>
                    {c.claim_number || c.id.slice(0, 8)} — {c.payer_name} (
                    {c.status.replace(/_/g, " ")})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-500">
                Claim B
              </label>
              <select
                value={rightId}
                onChange={(e) => handleRight(e.target.value)}
                className="w-full rounded border border-ink-300 px-3 py-2 text-sm"
              >
                <option value="">Select a claim...</option>
                {claims.map((c) => (
                  <option key={c.id} value={c.id} disabled={c.id === leftId}>
                    {c.claim_number || c.id.slice(0, 8)} — {c.payer_name} (
                    {c.status.replace(/_/g, " ")})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {left && right ? (
            <>
              {/* Field comparison table */}
              <div className="mb-6 rounded-lg border border-ink-200 bg-white overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink-200 bg-ink-50 text-xs text-ink-500">
                      <th className="px-4 py-2 text-left w-1/6">Field</th>
                      <th className="px-4 py-2 text-left w-5/12">Claim A</th>
                      <th className="px-4 py-2 text-left w-5/12">Claim B</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map((f) => {
                      const lv = f.get(left);
                      const rv = f.get(right);
                      const diff = lv !== rv;
                      return (
                        <tr
                          key={f.label}
                          className={`border-b border-ink-50 ${
                            diff ? "bg-amber-50/50" : ""
                          }`}
                        >
                          <td className="px-4 py-2 text-xs font-medium text-ink-500">
                            {f.label}
                            {diff && (
                              <span className="ml-1 text-[10px] text-amber-600">
                                differs
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-xs text-ink-700">
                            {lv}
                          </td>
                          <td className="px-4 py-2 text-xs text-ink-700">
                            {rv}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Denial text comparison */}
              <div className="mb-6 grid grid-cols-2 gap-4">
                <div className="rounded-lg border border-ink-200 bg-white p-4">
                  <h3 className="mb-2 text-xs font-semibold uppercase text-ink-500">
                    Denial Text (A)
                  </h3>
                  <p className="whitespace-pre-wrap text-xs text-ink-700">
                    {left.raw_denial_text || "No denial text"}
                  </p>
                </div>
                <div className="rounded-lg border border-ink-200 bg-white p-4">
                  <h3 className="mb-2 text-xs font-semibold uppercase text-ink-500">
                    Denial Text (B)
                  </h3>
                  <p className="whitespace-pre-wrap text-xs text-ink-700">
                    {right.raw_denial_text || "No denial text"}
                  </p>
                </div>
              </div>

              {/* Clinical notes comparison */}
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border border-ink-200 bg-white p-4">
                  <h3 className="mb-2 text-xs font-semibold uppercase text-ink-500">
                    Clinical Notes (A)
                  </h3>
                  <p className="whitespace-pre-wrap text-xs text-ink-700 max-h-60 overflow-y-auto">
                    {left.raw_clinical_notes || "No clinical notes"}
                  </p>
                </div>
                <div className="rounded-lg border border-ink-200 bg-white p-4">
                  <h3 className="mb-2 text-xs font-semibold uppercase text-ink-500">
                    Clinical Notes (B)
                  </h3>
                  <p className="whitespace-pre-wrap text-xs text-ink-700 max-h-60 overflow-y-auto">
                    {right.raw_clinical_notes || "No clinical notes"}
                  </p>
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-ink-200 bg-white p-8 text-center">
              <p className="text-sm text-ink-400">
                Select two claims above to compare them side by side.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

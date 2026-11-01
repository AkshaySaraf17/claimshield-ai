"use client";

import { useEffect, useState } from "react";

interface ClaimFull {
  id: string;
  claim_number: string | null;
  payer_name: string | null;
  denial_code: string | null;
  denial_reason: string | null;
  status: string;
  amount_denied_cents: number | null;
  amount_approved_cents: number | null;
  filing_deadline: string | null;
  created_at: string;
}

export default function ClaimComparePage() {
  const [claims, setClaims] = useState<{ id: string; claim_number: string | null }[]>([]);
  const [leftId, setLeftId] = useState("");
  const [rightId, setRightId] = useState("");
  const [compared, setCompared] = useState<ClaimFull[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/v1/claims")
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d) ? d : [];
        setClaims(list.map((c: { id: string; claim_number: string | null }) => ({ id: c.id, claim_number: c.claim_number })));
        if (list.length >= 2) {
          setLeftId(list[0].id);
          setRightId(list[1].id);
        } else if (list.length === 1) {
          setLeftId(list[0].id);
          setRightId(list[0].id);
        }
      });
  }, []);

  async function compare() {
    if (!leftId || !rightId) return;
    setLoading(true);
    const res = await fetch("/api/v1/claims/compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claim_ids: [leftId, rightId] }),
    });
    const data = await res.json();
    setCompared(data.claims || []);
    setLoading(false);
  }

  useEffect(() => { if (leftId && rightId) compare(); }, [leftId, rightId]);

  const fmt = (cents: number | null) =>
    cents != null ? `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—";

  const fields: { label: string; get: (c: ClaimFull) => string }[] = [
    { label: "Claim Number", get: (c) => c.claim_number || "—" },
    { label: "Payer", get: (c) => c.payer_name || "—" },
    { label: "Denial Code", get: (c) => c.denial_code || "—" },
    { label: "Denial Reason", get: (c) => c.denial_reason || "—" },
    { label: "Status", get: (c) => c.status.replace(/_/g, " ") },
    { label: "Amount Denied", get: (c) => fmt(c.amount_denied_cents) },
    { label: "Amount Approved", get: (c) => fmt(c.amount_approved_cents) },
    { label: "Filing Deadline", get: (c) => c.filing_deadline ? new Date(c.filing_deadline).toLocaleDateString() : "—" },
    { label: "Created", get: (c) => new Date(c.created_at).toLocaleDateString() },
  ];

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">Analysis</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">Claim Comparison</h1>
        <p className="mt-1 text-sm text-ink-500">Side-by-side comparison of two claims.</p>
      </header>

      <div className="mb-6 flex gap-4">
        <div className="flex-1">
          <label className="block text-xs text-ink-500 mb-1">Left Claim</label>
          <select value={leftId} onChange={(e) => setLeftId(e.target.value)} className="w-full rounded border border-ink-200 px-3 py-2 text-sm">
            {claims.map((c) => <option key={c.id} value={c.id}>{c.claim_number || c.id.slice(0, 8)}</option>)}
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-xs text-ink-500 mb-1">Right Claim</label>
          <select value={rightId} onChange={(e) => setRightId(e.target.value)} className="w-full rounded border border-ink-200 px-3 py-2 text-sm">
            {claims.map((c) => <option key={c.id} value={c.id}>{c.claim_number || c.id.slice(0, 8)}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <p className="text-ink-400">Comparing claims...</p>
      ) : compared.length < 2 ? (
        <p className="text-ink-400">Select two claims to compare.</p>
      ) : (
        <div className="rounded-lg border border-ink-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50">
                <th className="px-4 py-2 text-left text-xs font-semibold text-ink-500">Field</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-ink-500">{compared[0].claim_number || "Left"}</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-ink-500">{compared[1].claim_number || "Right"}</th>
              </tr>
            </thead>
            <tbody>
              {fields.map((f) => {
                const lv = f.get(compared[0]);
                const rv = f.get(compared[1]);
                const diff = lv !== rv;
                return (
                  <tr key={f.label} className={`border-b border-ink-100 ${diff ? "bg-amber-50" : ""}`}>
                    <td className="px-4 py-2 font-medium text-ink-600">{f.label}</td>
                    <td className="px-4 py-2 text-ink-800">{lv}</td>
                    <td className="px-4 py-2 text-ink-800">{rv}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

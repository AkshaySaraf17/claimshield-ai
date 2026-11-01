"use client";

import { useEffect, useState } from "react";

const STATUSES = ["pending_review", "in_progress", "needs_review", "approved", "sent", "won", "lost", "cancelled"];

export default function BatchStatusPage() {
  const [claims, setClaims] = useState<{ id: string; claim_number: string | null; status: string }[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [targetStatus, setTargetStatus] = useState("in_progress");
  const [transitioning, setTransitioning] = useState(false);
  const [result, setResult] = useState<{ success: number; failed: number } | null>(null);

  useEffect(() => {
    loadClaims();
  }, []);

  function loadClaims() {
    fetch("/api/v1/claims")
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d) ? d : [];
        setClaims(list.map((c: { id: string; claim_number: string | null; status: string }) => ({
          id: c.id, claim_number: c.claim_number, status: c.status,
        })));
      });
  }

  function toggleClaim(id: string) {
    setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  }

  async function handleTransition() {
    if (selected.length === 0) return;
    setTransitioning(true);
    setResult(null);
    const res = await fetch("/api/v1/claims/batch-transition", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claim_ids: selected, new_status: targetStatus }),
    });
    const data = await res.json();
    setResult({ success: data.transitioned ?? data.success ?? 0, failed: data.failed ?? 0 });
    setSelected([]);
    setTransitioning(false);
    loadClaims();
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">Batch Operations</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">Batch Status Transition</h1>
        <p className="mt-1 text-sm text-ink-500">Move multiple claims to a new status at once.</p>
      </header>

      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm text-ink-500">{selected.length} selected</span>
          <select value={targetStatus} onChange={(e) => setTargetStatus(e.target.value)} className="rounded border border-ink-200 px-3 py-2 text-sm">
            {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
          </select>
        </div>
        <button
          onClick={handleTransition}
          disabled={transitioning || selected.length === 0}
          className="rounded bg-ink-950 px-4 py-2 text-sm text-white hover:bg-ink-900 disabled:opacity-50"
        >
          {transitioning ? "Transitioning..." : "Transition Selected"}
        </button>
      </div>

      {result && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          Transitioned {result.success} claim{result.success !== 1 ? "s" : ""}
          {result.failed > 0 && <span className="text-red-600 ml-2">({result.failed} failed)</span>}
        </div>
      )}

      <div className="space-y-1">
        {claims.map((c) => (
          <label key={c.id} className="flex items-center gap-3 rounded border border-ink-200 bg-white px-4 py-2 cursor-pointer hover:bg-ink-50">
            <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggleClaim(c.id)} className="h-4 w-4 rounded border-ink-300" />
            <span className="text-sm font-medium text-ink-800">{c.claim_number || c.id.slice(0, 8)}</span>
            <span className="rounded bg-ink-100 px-2 py-0.5 text-xs text-ink-600">{c.status.replace(/_/g, " ")}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

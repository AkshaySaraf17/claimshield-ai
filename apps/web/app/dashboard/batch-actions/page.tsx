"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface ClaimRow {
  id: string;
  claim_number: string | null;
  payer_name: string | null;
  denial_code: string | null;
  amount_denied_cents: number | null;
  status: string;
  created_at: string;
}

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending_review: ["in_progress", "cancelled"],
  in_progress: ["needs_review", "cancelled"],
  needs_review: ["approved", "in_progress", "cancelled"],
  approved: ["sent", "cancelled"],
  sent: ["won", "lost"],
  lost: ["in_progress"],
};

function dollars(cents: number | null) {
  if (cents == null) return "—";
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

const STATUS_COLORS: Record<string, string> = {
  pending_review: "bg-amber-100 text-amber-800",
  in_progress: "bg-blue-100 text-blue-800",
  needs_review: "bg-orange-100 text-orange-800",
  approved: "bg-green-100 text-green-800",
  sent: "bg-indigo-100 text-indigo-800",
  won: "bg-emerald-100 text-emerald-800",
  lost: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-600",
};

export default function BatchActionsPage() {
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [targetStatus, setTargetStatus] = useState<string>("");
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<{ transitioned: number; errors: string[] } | null>(null);

  useEffect(() => {
    fetch("/api/v1/claims")
      .then((r) => r.json())
      .then((d) => {
        const items = Array.isArray(d) ? d : d.items || [];
        setClaims(items);
        setLoading(false);
      });
  }, []);

  const filtered =
    filterStatus === "all"
      ? claims
      : claims.filter((c) => c.status === filterStatus);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  function selectAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((c) => c.id)));
    }
  }

  const selectedClaims = claims.filter((c) => selected.has(c.id));
  const commonTransitions = selectedClaims.length > 0
    ? selectedClaims.reduce<string[]>((acc, c) => {
        const allowed = ALLOWED_TRANSITIONS[c.status] || [];
        if (acc.length === 0) return allowed;
        return acc.filter((t) => allowed.includes(t));
      }, [])
    : [];

  async function executeBatch() {
    if (!targetStatus || selected.size === 0) return;
    setProcessing(true);
    setResult(null);
    const resp = await fetch("/api/v1/claims/batch-transition", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        claim_ids: Array.from(selected),
        new_status: targetStatus,
      }),
    });
    const data = await resp.json();
    setResult({
      transitioned: data.transitioned || 0,
      errors: data.errors || [],
    });
    setProcessing(false);
    setSelected(new Set());
    setTargetStatus("");

    const refreshResp = await fetch("/api/v1/claims");
    const refreshData = await refreshResp.json();
    const refreshed: ClaimRow[] = Array.isArray(refreshData) ? refreshData : refreshData.items || [];
    setClaims(refreshed);
    // The status dropdown only lists statuses that still exist; don't leave it filtering on a vanished one
    if (filterStatus !== "all" && !refreshed.some((c) => c.status === filterStatus)) {
      setFilterStatus("all");
    }
  }

  const statuses = [...new Set(claims.map((c) => c.status))].sort();

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">
          Workflow
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">
          Batch Actions
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Select multiple claims and transition them to a new status together.
        </p>
      </header>

      {loading ? (
        <p className="text-ink-400">Loading claims...</p>
      ) : (
        <>
          {/* Controls bar */}
          <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-ink-200 bg-white px-4 py-3">
            <div className="flex items-center gap-3">
              <select
                value={filterStatus}
                onChange={(e) => {
                  setFilterStatus(e.target.value);
                  setSelected(new Set());
                }}
                className="rounded border border-ink-300 px-2 py-1 text-xs"
              >
                <option value="all">All statuses</option>
                {statuses.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
              <button
                onClick={selectAll}
                className="rounded border border-ink-300 px-2 py-1 text-xs text-ink-600 hover:bg-ink-50"
              >
                {selected.size === filtered.length && filtered.length > 0
                  ? "Deselect All"
                  : "Select All"}
              </button>
              <span className="text-xs text-ink-400">
                {selected.size} selected
              </span>
            </div>

            <div className="flex items-center gap-2">
              {commonTransitions.length > 0 && (
                <>
                  <span className="text-xs text-ink-500">Move to:</span>
                  <select
                    value={targetStatus}
                    onChange={(e) => setTargetStatus(e.target.value)}
                    className="rounded border border-ink-300 px-2 py-1 text-xs"
                  >
                    <option value="">Choose...</option>
                    {commonTransitions.map((t) => (
                      <option key={t} value={t}>
                        {t.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={executeBatch}
                    disabled={!targetStatus || processing}
                    className="rounded bg-ink-900 px-3 py-1 text-xs text-white hover:bg-ink-800 disabled:opacity-40"
                  >
                    {processing ? "Processing..." : "Apply"}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Result message */}
          {result && (
            <div
              className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
                result.errors.length > 0
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : "border-green-200 bg-green-50 text-green-700"
              }`}
            >
              Transitioned {result.transitioned} claim(s).
              {result.errors.length > 0 && (
                <span> {result.errors.length} error(s).</span>
              )}
            </div>
          )}

          {/* Claims table */}
          <div className="rounded-lg border border-ink-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-200 bg-ink-50 text-xs text-ink-500">
                  <th className="px-3 py-2 w-8"></th>
                  <th className="px-3 py-2 text-left">Claim</th>
                  <th className="px-3 py-2 text-left">Payer</th>
                  <th className="px-3 py-2 text-left">Code</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr
                    key={c.id}
                    className={`border-b border-ink-50 cursor-pointer transition ${
                      selected.has(c.id) ? "bg-indigo-50/50" : "hover:bg-ink-50/50"
                    }`}
                    onClick={() => toggleSelect(c.id)}
                  >
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={selected.has(c.id)}
                        onChange={() => toggleSelect(c.id)}
                        className="rounded"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/dashboard/claims/${c.id}`}
                        className="font-mono text-xs text-indigo-600 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {c.claim_number || c.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-xs text-ink-600">
                      {c.payer_name || "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-ink-600">
                      {c.denial_code || "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-ink-600">
                      {dollars(c.amount_denied_cents)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          STATUS_COLORS[c.status] || "bg-ink-100 text-ink-600"
                        }`}
                      >
                        {c.status.replace(/_/g, " ")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

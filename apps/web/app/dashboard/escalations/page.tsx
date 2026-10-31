"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Escalation {
  claim_id: string;
  claim_number: string | null;
  payer: string | null;
  status: string;
  amount_denied_cents: number;
  age_days: number;
  reasons: string[];
  escalation_notes: { content: string; author: string; created_at: string }[];
  priority: string;
}

function dollars(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

const PRIORITY_COLORS: Record<string, string> = {
  high: "bg-red-100 text-red-700 border-red-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-green-100 text-green-700 border-green-200",
};

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

export default function EscalationsPage() {
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [loading, setLoading] = useState(true);
  const [escalating, setEscalating] = useState<string | null>(null);

  function loadData() {
    fetch("/api/v1/escalations")
      .then((r) => r.json())
      .then((d) => {
        setEscalations(Array.isArray(d) ? d : []);
        setLoading(false);
      });
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleEscalate(claimId: string) {
    const reason = prompt("Escalation reason:");
    if (!reason) return;
    setEscalating(claimId);
    await fetch(`/api/v1/claims/${claimId}/escalate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    setEscalating(null);
    loadData();
  }

  const highCount = escalations.filter((e) => e.priority === "high").length;
  const medCount = escalations.filter((e) => e.priority === "medium").length;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">
          Operations
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">
          Escalations
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Claims flagged for supervisor attention — high-value, stale, or lost appeals.
        </p>
      </header>

      {loading ? (
        <p className="text-ink-400">Loading escalations...</p>
      ) : (
        <>
          {/* Summary */}
          <div className="mb-6 grid grid-cols-3 gap-4">
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-xs text-red-600">High Priority</p>
              <p className="mt-1 text-2xl font-semibold text-red-700">{highCount}</p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs text-amber-600">Medium Priority</p>
              <p className="mt-1 text-2xl font-semibold text-amber-700">{medCount}</p>
            </div>
            <div className="rounded-lg border border-ink-200 bg-white p-4">
              <p className="text-xs text-ink-500">Total Flagged</p>
              <p className="mt-1 text-2xl font-semibold text-ink-950">{escalations.length}</p>
            </div>
          </div>

          {/* Escalation cards */}
          {escalations.length === 0 ? (
            <div className="rounded-lg border border-ink-200 bg-white p-8 text-center">
              <p className="text-sm text-ink-400">No claims currently flagged for escalation.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {escalations.map((e) => (
                <div
                  key={e.claim_id}
                  className={`rounded-lg border bg-white overflow-hidden ${
                    e.priority === "high" ? "border-red-200" : e.priority === "medium" ? "border-amber-200" : "border-ink-200"
                  }`}
                >
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${PRIORITY_COLORS[e.priority] || ""}`}>
                        {e.priority}
                      </span>
                      <Link
                        href={`/dashboard/claims/${e.claim_id}`}
                        className="font-mono text-sm font-semibold text-indigo-600 hover:underline"
                      >
                        {e.claim_number || e.claim_id.slice(0, 8)}
                      </Link>
                      <span className="text-xs text-ink-500">{e.payer}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] ${STATUS_COLORS[e.status] || "bg-ink-100 text-ink-600"}`}>
                        {e.status.replace(/_/g, " ")}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs text-ink-600">{dollars(e.amount_denied_cents)}</span>
                      <span className="text-xs text-ink-400">{e.age_days}d old</span>
                      <button
                        onClick={() => handleEscalate(e.claim_id)}
                        disabled={escalating === e.claim_id}
                        className="rounded bg-red-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        {escalating === e.claim_id ? "..." : "Escalate"}
                      </button>
                    </div>
                  </div>
                  {(e.reasons.length > 0 || e.escalation_notes.length > 0) && (
                    <div className="border-t border-ink-100 px-4 py-2 bg-ink-50/30">
                      {e.reasons.map((r, i) => (
                        <p key={i} className="text-xs text-ink-600">
                          <span className="text-amber-600 font-medium">Flag:</span> {r}
                        </p>
                      ))}
                      {e.escalation_notes.map((n, i) => (
                        <p key={i} className="text-xs text-ink-600">
                          <span className="text-red-600 font-medium">Note:</span> {n.content} — <span className="text-ink-400">{n.author}</span>
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

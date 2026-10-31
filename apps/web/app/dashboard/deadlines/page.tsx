"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface DeadlineClaim {
  id: string;
  claim_number: string | null;
  payer_name: string | null;
  denial_code: string | null;
  amount_denied_cents: number | null;
  status: string;
  filing_deadline: string | null;
  days_remaining: number;
  is_overdue: boolean;
  urgency: "overdue" | "critical" | "urgent" | "normal";
}

const URGENCY_STYLES: Record<string, string> = {
  overdue: "border-red-400 bg-red-50",
  critical: "border-red-300 bg-red-50/50",
  urgent: "border-amber-300 bg-amber-50/50",
  normal: "border-ink-300/30 bg-white",
};

const URGENCY_BADGE: Record<string, string> = {
  overdue: "bg-red-600 text-white",
  critical: "bg-red-100 text-red-700",
  urgent: "bg-amber-100 text-amber-700",
  normal: "bg-green-100 text-green-700",
};

const STATUS_COLORS: Record<string, string> = {
  pending_review: "bg-amber-100 text-amber-800",
  in_progress: "bg-blue-100 text-blue-800",
  needs_review: "bg-orange-100 text-orange-800",
  approved: "bg-green-100 text-green-800",
  sent: "bg-indigo-100 text-indigo-800",
};

export default function DeadlinesPage() {
  const [claims, setClaims] = useState<DeadlineClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/deadlines")
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json();
      })
      .then(setClaims)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const overdue = claims.filter((c) => c.urgency === "overdue");
  const critical = claims.filter((c) => c.urgency === "critical");
  const urgent = claims.filter((c) => c.urgency === "urgent");

  function centsToDisplay(cents: number | null) {
    return cents !== null ? `$${(cents / 100).toFixed(2)}` : "—";
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">
          Compliance &middot; Filing Deadlines
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">
          Filing Deadlines
        </h1>
        <p className="mt-2 text-sm text-ink-500">
          Claims sorted by filing urgency. Deadlines are calculated from payer-specific timely filing rules.
        </p>
      </header>

      {/* Summary cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-sm border border-red-300 bg-red-50 px-4 py-3">
          <p className="text-xs font-medium uppercase text-red-600">Overdue</p>
          <p className="mt-1 font-display text-2xl font-semibold text-red-700">{overdue.length}</p>
        </div>
        <div className="rounded-sm border border-red-200 bg-red-50/50 px-4 py-3">
          <p className="text-xs font-medium uppercase text-red-500">Critical (&le;7 days)</p>
          <p className="mt-1 font-display text-2xl font-semibold text-red-600">{critical.length}</p>
        </div>
        <div className="rounded-sm border border-amber-200 bg-amber-50/50 px-4 py-3">
          <p className="text-xs font-medium uppercase text-amber-600">Urgent (&le;30 days)</p>
          <p className="mt-1 font-display text-2xl font-semibold text-amber-700">{urgent.length}</p>
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      {loading ? (
        <div className="py-8 text-center text-ink-400">Loading deadlines...</div>
      ) : claims.length === 0 ? (
        <div className="py-8 text-center text-ink-400">
          No active claims with filing deadlines.
        </div>
      ) : (
        <div className="space-y-2">
          {claims.map((claim) => (
            <Link
              key={claim.id}
              href={`/dashboard/claims/${claim.id}`}
              className={`flex items-center justify-between rounded border px-4 py-3 transition-colors hover:shadow-sm ${
                URGENCY_STYLES[claim.urgency]
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${
                    URGENCY_BADGE[claim.urgency]
                  }`}
                >
                  {claim.is_overdue
                    ? "OVERDUE"
                    : `${claim.days_remaining}d left`}
                </span>
                <span className="font-mono text-xs text-ink-500">
                  {claim.claim_number || claim.id.slice(0, 8)}
                </span>
                <span className="text-sm text-ink-700">
                  {claim.payer_name || "Unknown payer"}
                </span>
                {claim.denial_code && (
                  <span className="rounded border border-ink-300/40 px-1.5 py-0.5 font-mono text-xs">
                    {claim.denial_code}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm text-ink-600">
                  {centsToDisplay(claim.amount_denied_cents)}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    STATUS_COLORS[claim.status] || "bg-gray-100 text-gray-800"
                  }`}
                >
                  {claim.status.replace(/_/g, " ")}
                </span>
                {claim.filing_deadline && (
                  <span className="text-xs text-ink-400">
                    {new Date(claim.filing_deadline).toLocaleDateString()}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}

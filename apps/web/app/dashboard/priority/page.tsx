"use client";

import { useEffect, useState } from "react";

interface PriorityClaim {
  claim_id: string;
  claim_number: string | null;
  payer_name: string | null;
  denial_code: string | null;
  status: string;
  amount_denied_cents: number | null;
  filing_deadline: string | null;
  priority_score: number;
  reasons: string[];
}

const REASON_LABELS: Record<string, string> = {
  high_value: "High Value",
  medium_value: "Medium Value",
  overdue: "Overdue",
  deadline_urgent: "Urgent Deadline",
  deadline_approaching: "Deadline Soon",
  stale: "Stale",
  aging: "Aging",
};

function scoreBadge(score: number) {
  if (score >= 50) return "bg-red-100 text-red-700";
  if (score >= 30) return "bg-amber-100 text-amber-700";
  return "bg-green-100 text-green-700";
}

export default function PriorityPage() {
  const [claims, setClaims] = useState<PriorityClaim[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v1/claims/priority-scores")
      .then((r) => r.json())
      .then((d) => {
        setClaims(Array.isArray(d) ? d : []);
        setLoading(false);
      });
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">Triage</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">Claim Priority</h1>
        <p className="mt-1 text-sm text-ink-500">
          Claims ranked by urgency — deadline proximity, value, and age.
        </p>
      </header>

      {loading ? (
        <p className="text-ink-400">Loading priorities...</p>
      ) : claims.length === 0 ? (
        <p className="text-ink-400">No active claims to prioritize.</p>
      ) : (
        <div className="rounded-lg border border-ink-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-100 bg-ink-50/50">
                <th className="px-4 py-3 text-right text-xs font-semibold text-ink-500 w-20">Score</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-ink-500">Claim</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-ink-500">Payer</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-ink-500">Code</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-ink-500">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-ink-500">Reasons</th>
              </tr>
            </thead>
            <tbody>
              {claims.map((c) => (
                <tr key={c.claim_id} className="border-t border-ink-50">
                  <td className="px-4 py-3 text-right">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs font-bold ${scoreBadge(c.priority_score)}`}>
                      {c.priority_score}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-700">
                    {c.claim_number || c.claim_id.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3 text-sm text-ink-600">{c.payer_name || "—"}</td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-xs text-indigo-700">
                      {c.denial_code || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-ink-600">
                    {c.amount_denied_cents != null
                      ? `$${(c.amount_denied_cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {c.reasons.map((r) => (
                        <span key={r} className="rounded bg-ink-100 px-1.5 py-0.5 text-xs text-ink-600">
                          {REASON_LABELS[r] || r}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

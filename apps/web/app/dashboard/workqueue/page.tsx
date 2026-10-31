"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface WorkItem {
  id: string;
  claim_number: string | null;
  payer_name: string | null;
  denial_code: string | null;
  amount_denied_cents: number | null;
  status: string;
  created_at: string;
  urgency_score: number;
  urgency_reasons: string[];
  has_pending_appeal: boolean;
  age_days: number;
  allowed_transitions: string[];
}

function dollars(cents: number | null) {
  if (cents == null) return "—";
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

const STATUS_COLORS: Record<string, string> = {
  pending_review: "bg-amber-100 text-amber-800",
  in_progress: "bg-blue-100 text-blue-800",
  needs_review: "bg-orange-100 text-orange-800",
};

function urgencyColor(score: number) {
  if (score >= 80) return "bg-red-500";
  if (score >= 40) return "bg-amber-500";
  if (score >= 15) return "bg-yellow-400";
  return "bg-green-400";
}

export default function WorkqueuePage() {
  const [items, setItems] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [transitioning, setTransitioning] = useState<string | null>(null);

  async function fetchQueue() {
    setLoading(true);
    const resp = await fetch("/api/v1/workqueue");
    const d = await resp.json();
    setItems(d.items || []);
    setLoading(false);
  }

  useEffect(() => {
    fetchQueue();
  }, []);

  async function quickTransition(claimId: string, newStatus: string) {
    setTransitioning(claimId);
    await fetch(`/api/v1/claims/${claimId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus, reviewed_by: "dev-biller" }),
    });
    await fetchQueue();
    setTransitioning(null);
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-wide text-ink-500">
            Workflow
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">
            Priority Workqueue
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            Active claims sorted by urgency. Deadline proximity, age, value, and
            review status factor into the score.
          </p>
        </div>
        <button
          onClick={fetchQueue}
          className="rounded border border-ink-300 px-3 py-1.5 text-xs text-ink-600 hover:bg-ink-50"
        >
          Refresh
        </button>
      </header>

      {loading ? (
        <p className="text-ink-400">Loading workqueue...</p>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-green-200 bg-green-50 p-8 text-center">
          <p className="text-sm text-green-700">
            Workqueue is empty — no active claims need attention.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-lg border border-ink-200 bg-white px-4 py-3"
            >
              {/* Urgency bar */}
              <div className="flex flex-col items-center gap-0.5 w-10 shrink-0">
                <div
                  className={`w-3 h-3 rounded-full ${urgencyColor(item.urgency_score)}`}
                  title={`Urgency: ${item.urgency_score}`}
                />
                <span className="text-[10px] font-mono text-ink-500">
                  {item.urgency_score}
                </span>
              </div>

              {/* Claim info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/dashboard/claims/${item.id}`}
                    className="font-mono text-sm font-medium text-indigo-600 hover:underline"
                  >
                    {item.claim_number || item.id.slice(0, 8)}
                  </Link>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      STATUS_COLORS[item.status] || "bg-ink-100 text-ink-600"
                    }`}
                  >
                    {item.status.replace(/_/g, " ")}
                  </span>
                  {item.has_pending_appeal && (
                    <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] text-purple-700">
                      appeal pending
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-3 text-xs text-ink-500">
                  <span>{item.payer_name || "Unknown"}</span>
                  <span className="font-mono">{item.denial_code}</span>
                  <span className="font-mono">{dollars(item.amount_denied_cents)}</span>
                  <span>{item.age_days}d old</span>
                </div>
                {item.urgency_reasons.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {item.urgency_reasons.map((r, i) => (
                      <span
                        key={i}
                        className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] text-red-600"
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Quick actions */}
              <div className="flex gap-1 shrink-0">
                {item.allowed_transitions.slice(0, 2).map((t) => (
                  <button
                    key={t}
                    onClick={() => quickTransition(item.id, t)}
                    disabled={transitioning === item.id}
                    className="rounded border border-ink-300/50 px-2 py-1 text-[10px] text-ink-600 hover:bg-ink-50 disabled:opacity-50"
                  >
                    → {t.replace(/_/g, " ")}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

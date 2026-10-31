"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Pattern {
  payer: string;
  denial_code: string;
  category: string;
  count: number;
  total_denied_cents: number;
  avg_denied_cents: number;
  statuses: Record<string, number>;
  win_rate: number | null;
  claim_ids: string[];
  recommendation: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  "Medical Necessity": "bg-red-100 text-red-700",
  "Timely Filing": "bg-amber-100 text-amber-700",
  "Authorization": "bg-purple-100 text-purple-700",
  "Coding": "bg-blue-100 text-blue-700",
  "Coverage": "bg-indigo-100 text-indigo-700",
  "Duplicate": "bg-orange-100 text-orange-700",
  "Bundling": "bg-teal-100 text-teal-700",
  "Fee Schedule": "bg-cyan-100 text-cyan-700",
  "Information": "bg-yellow-100 text-yellow-700",
  "Patient Responsibility": "bg-green-100 text-green-700",
  "Coordination of Benefits": "bg-pink-100 text-pink-700",
};

function dollars(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

export default function PatternsPage() {
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/v1/analytics/patterns")
      .then((r) => r.json())
      .then((d) => {
        setPatterns(d);
        setLoading(false);
      });
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">
          Analytics
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">
          Denial Patterns
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Recurring payer + denial code combinations with recommendations.
        </p>
      </header>

      {loading ? (
        <p className="text-ink-500">Analyzing patterns...</p>
      ) : patterns.length === 0 ? (
        <div className="rounded-lg border border-ink-200 bg-white p-10 text-center">
          <p className="text-ink-500">No recurring patterns found (need at least 2 claims with same payer + code).</p>
        </div>
      ) : (
        <div className="space-y-4">
          {patterns.map((p, i) => (
            <div key={i} className="rounded-lg border border-ink-200 bg-white">
              <button
                onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
                className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-parchment/30"
              >
                <div className="flex items-center gap-3">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${CATEGORY_COLORS[p.category] || "bg-ink-100 text-ink-600"}`}>
                    {p.category}
                  </span>
                  <div>
                    <span className="text-sm font-medium text-ink-900">{p.payer}</span>
                    <span className="mx-2 text-ink-400">/</span>
                    <span className="font-mono text-sm text-ink-700">{p.denial_code}</span>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-ink-600">{p.count} claims</span>
                  <span className="font-mono text-ink-700">{dollars(p.total_denied_cents)}</span>
                  {p.win_rate !== null && (
                    <span className={`rounded px-1.5 py-0.5 text-xs ${
                      p.win_rate > 50 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    }`}>
                      {p.win_rate}% win
                    </span>
                  )}
                  <span className="text-ink-400">{expandedIdx === i ? "−" : "+"}</span>
                </div>
              </button>

              {expandedIdx === i && (
                <div className="border-t border-ink-200 px-5 py-4 space-y-4">
                  {/* Recommendation */}
                  <div className="rounded bg-indigo-50 border border-indigo-200 px-4 py-3">
                    <p className="text-xs font-semibold text-indigo-700 mb-1">Recommendation</p>
                    <p className="text-sm text-indigo-800">{p.recommendation}</p>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-xs text-ink-500">Average Denied</p>
                      <p className="font-mono font-medium text-ink-900">{dollars(p.avg_denied_cents)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-ink-500">Total Denied</p>
                      <p className="font-mono font-medium text-ink-900">{dollars(p.total_denied_cents)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-ink-500">Status Distribution</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {Object.entries(p.statuses).map(([status, count]) => (
                          <span key={status} className="rounded bg-ink-100 px-1.5 py-0.5 text-xs text-ink-600">
                            {status.replace(/_/g, " ")}: {count}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Claim links */}
                  <div>
                    <p className="text-xs text-ink-500 mb-1">Affected Claims</p>
                    <div className="flex flex-wrap gap-1">
                      {p.claim_ids.map((id) => (
                        <Link
                          key={id}
                          href={`/dashboard/claims/${id}`}
                          className="rounded border border-ink-300/40 px-2 py-0.5 font-mono text-xs text-indigo-600 hover:bg-indigo-50"
                        >
                          {id.slice(0, 8)}
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

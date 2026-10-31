"use client";

import { useEffect, useState } from "react";

interface PayerData {
  payer: string;
  total_claims: number;
  total_denied_cents: number;
  total_recovered_cents: number;
  avg_amount_cents: number;
  appeals_count: number;
  won: number;
  lost: number;
  pending: number;
  win_rate: number;
  recovery_rate: number;
  by_status: Record<string, number>;
  by_denial_code: { code: string; count: number }[];
}

function dollars(cents: number) {
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

export default function PayersPage() {
  const [payers, setPayers] = useState<PayerData[]>([]);
  const [totalDenied, setTotalDenied] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/analytics/payers")
      .then((r) => r.json())
      .then((d) => {
        setPayers(d.payers || []);
        setTotalDenied(d.total_denied_cents || 0);
        setLoading(false);
      });
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">
          Analytics
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">
          Payer Performance
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Per-payer breakdown of denials, appeals, win rates, and recovery.
        </p>
      </header>

      {loading ? (
        <p className="text-ink-400">Loading payer analytics...</p>
      ) : payers.length === 0 ? (
        <p className="text-ink-400">No payer data available.</p>
      ) : (
        <div className="space-y-4">
          {payers.map((p) => {
            const isExpanded = expanded === p.payer;
            const deniedPct =
              totalDenied > 0
                ? Math.round((p.total_denied_cents / totalDenied) * 100)
                : 0;

            return (
              <div
                key={p.payer}
                className="rounded-lg border border-ink-200 bg-white overflow-hidden"
              >
                {/* Header row */}
                <button
                  onClick={() =>
                    setExpanded(isExpanded ? null : p.payer)
                  }
                  className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-ink-50/50 transition"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink-900">{p.payer}</p>
                    <p className="text-xs text-ink-400">
                      {p.total_claims} claims &middot; {deniedPct}% of total
                      denials
                    </p>
                  </div>
                  <div className="flex gap-6 shrink-0 text-right">
                    <div>
                      <p className="text-xs text-ink-400">Denied</p>
                      <p className="font-mono text-sm font-medium text-ink-800">
                        {dollars(p.total_denied_cents)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-ink-400">Recovered</p>
                      <p className="font-mono text-sm font-medium text-green-700">
                        {dollars(p.total_recovered_cents)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-ink-400">Win Rate</p>
                      <p
                        className={`text-sm font-semibold ${
                          p.win_rate > 30
                            ? "text-green-600"
                            : p.win_rate > 0
                            ? "text-amber-600"
                            : "text-ink-400"
                        }`}
                      >
                        {p.win_rate}%
                      </p>
                    </div>
                    <span className="text-ink-400 text-sm">
                      {isExpanded ? "▲" : "▼"}
                    </span>
                  </div>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-ink-100 px-5 py-4">
                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                      {/* Key metrics */}
                      <div>
                        <h3 className="mb-2 text-xs font-semibold uppercase text-ink-500">
                          Key Metrics
                        </h3>
                        <div className="space-y-1.5 text-sm">
                          <div className="flex justify-between">
                            <span className="text-ink-500">Avg Denied</span>
                            <span className="font-mono text-ink-700">
                              {dollars(p.avg_amount_cents)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-ink-500">Appeals Filed</span>
                            <span className="font-mono text-ink-700">
                              {p.appeals_count}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-ink-500">Won / Lost</span>
                            <span className="font-mono text-ink-700">
                              {p.won} / {p.lost}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-ink-500">Pending</span>
                            <span className="font-mono text-ink-700">
                              {p.pending}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-ink-500">Recovery Rate</span>
                            <span className="font-mono text-ink-700">
                              {p.recovery_rate}%
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Status breakdown */}
                      <div>
                        <h3 className="mb-2 text-xs font-semibold uppercase text-ink-500">
                          By Status
                        </h3>
                        <div className="space-y-1">
                          {Object.entries(p.by_status)
                            .sort(([, a], [, b]) => b - a)
                            .map(([status, count]) => (
                              <div
                                key={status}
                                className="flex items-center justify-between text-sm"
                              >
                                <span
                                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                    STATUS_COLORS[status] ||
                                    "bg-ink-100 text-ink-600"
                                  }`}
                                >
                                  {status.replace(/_/g, " ")}
                                </span>
                                <span className="font-mono text-xs text-ink-500">
                                  {count}
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>

                      {/* Top denial codes */}
                      <div>
                        <h3 className="mb-2 text-xs font-semibold uppercase text-ink-500">
                          Top Denial Codes
                        </h3>
                        <div className="space-y-1">
                          {p.by_denial_code.slice(0, 5).map((d) => (
                            <div
                              key={d.code}
                              className="flex items-center justify-between text-sm"
                            >
                              <span className="font-mono text-xs text-ink-700">
                                {d.code}
                              </span>
                              <span className="font-mono text-xs text-ink-500">
                                {d.count}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Denied amount bar relative to total */}
                    <div className="mt-4">
                      <div className="flex items-center gap-2 text-xs text-ink-400">
                        <span>Share of total denials:</span>
                        <div className="flex-1 h-2 rounded-full bg-ink-100">
                          <div
                            className="h-2 rounded-full bg-indigo-500"
                            style={{ width: `${deniedPct}%` }}
                          />
                        </div>
                        <span className="font-mono">{deniedPct}%</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

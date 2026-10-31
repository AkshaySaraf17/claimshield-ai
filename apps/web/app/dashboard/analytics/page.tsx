"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface PayerPerf {
  payer: string;
  total_claims: number;
  total_denied_cents: number;
  total_recovered_cents: number;
  statuses: Record<string, number>;
  appeals_filed: number;
  appeals_won: number;
  appeals_lost: number;
  avg_days_to_appeal: number | null;
  win_rate: number | null;
  recovery_rate: number | null;
  top_denial_codes: { code: string; count: number }[];
}

interface RecoveryData {
  period_days: number;
  total_denied_cents: number;
  total_recovered_cents: number;
  recovery_rate: number;
  total_claims: number;
  weekly_trend: {
    week: string;
    denied_cents: number;
    recovered_cents: number;
    claims: number;
    recovery_pct: number;
  }[];
}

const STATUS_COLORS: Record<string, string> = {
  pending_review: "bg-amber-400",
  in_progress: "bg-blue-400",
  needs_review: "bg-orange-400",
  approved: "bg-green-400",
  sent: "bg-indigo-400",
  won: "bg-emerald-500",
  lost: "bg-red-400",
  cancelled: "bg-gray-400",
};

function dollars(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

function BarSegment({ pct, color, label }: { pct: number; color: string; label: string }) {
  if (pct < 1) return null;
  return (
    <div
      className={`${color} h-6 flex items-center justify-center text-[10px] text-white font-medium`}
      style={{ width: `${pct}%` }}
      title={label}
    >
      {pct >= 8 ? label : ""}
    </div>
  );
}

export default function AnalyticsPage() {
  const [payers, setPayers] = useState<PayerPerf[]>([]);
  const [recovery, setRecovery] = useState<RecoveryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(90);

  useEffect(() => {
    Promise.all([
      fetch("/api/v1/analytics/payer-performance").then((r) => r.json()),
      fetch(`/api/v1/analytics/recovery?period_days=${period}`).then((r) => r.json()),
    ]).then(([p, r]) => {
      setPayers(Array.isArray(p) ? p : []);
      setRecovery(r);
      setLoading(false);
    });
  }, [period]);

  const totalDenied = payers.reduce((sum, p) => sum + p.total_denied_cents, 0);
  const totalRecovered = payers.reduce((sum, p) => sum + p.total_recovered_cents, 0);
  const totalClaims = payers.reduce((sum, p) => sum + p.total_claims, 0);
  const totalAppeals = payers.reduce((sum, p) => sum + p.appeals_filed, 0);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-6 flex items-start justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-wide text-ink-500">
            Analytics
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">
            Payer Performance
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            Denial rates, appeal outcomes, and recovery metrics by payer.
          </p>
        </div>
        <Link
          href="/dashboard/patterns"
          className="rounded border border-ink-300/50 px-3 py-1.5 text-sm text-ink-600 hover:bg-ink-100"
        >
          View Patterns
        </Link>
      </header>

      {/* Summary cards */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-sm border border-ink-300/30 bg-white px-4 py-3">
          <p className="text-xs font-medium uppercase text-ink-500">Payers</p>
          <p className="mt-1 font-display text-2xl font-semibold text-ink-950">{payers.length}</p>
        </div>
        <div className="rounded-sm border border-ink-300/30 bg-white px-4 py-3">
          <p className="text-xs font-medium uppercase text-ink-500">Total Claims</p>
          <p className="mt-1 font-display text-2xl font-semibold text-ink-950">{totalClaims}</p>
        </div>
        <div className="rounded-sm border border-ink-300/30 bg-white px-4 py-3">
          <p className="text-xs font-medium uppercase text-ink-500">Total Denied</p>
          <p className="mt-1 font-display text-2xl font-semibold text-red-600">{dollars(totalDenied)}</p>
        </div>
        <div className="rounded-sm border border-ink-300/30 bg-white px-4 py-3">
          <p className="text-xs font-medium uppercase text-ink-500">Recovered</p>
          <p className="mt-1 font-display text-2xl font-semibold text-green-600">{dollars(totalRecovered)}</p>
        </div>
        <div className="rounded-sm border border-ink-300/30 bg-white px-4 py-3">
          <p className="text-xs font-medium uppercase text-ink-500">Appeals Filed</p>
          <p className="mt-1 font-display text-2xl font-semibold text-indigo-600">{totalAppeals}</p>
        </div>
      </div>

      {/* Recovery trend */}
      {recovery && recovery.weekly_trend.length > 0 && (
        <div className="mb-8 rounded-sm border border-ink-300/30 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">
              Weekly Recovery Trend
            </h2>
            <div className="flex gap-1">
              {[30, 90, 180, 365].map((d) => (
                <button
                  key={d}
                  onClick={() => { setLoading(true); setPeriod(d); }}
                  className={`rounded px-2 py-0.5 text-xs ${
                    period === d ? "bg-ink-950 text-white" : "text-ink-500 hover:bg-ink-100"
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-end gap-1" style={{ height: 120 }}>
            {recovery.weekly_trend.map((w) => {
              const maxDenied = Math.max(...recovery.weekly_trend.map((x) => x.denied_cents));
              const h = maxDenied > 0 ? (w.denied_cents / maxDenied) * 100 : 0;
              const rh = maxDenied > 0 ? (w.recovered_cents / maxDenied) * 100 : 0;
              return (
                <div
                  key={w.week}
                  className="relative flex flex-1 flex-col items-center justify-end"
                  title={`${w.week}: Denied ${dollars(w.denied_cents)}, Recovered ${dollars(w.recovered_cents)}`}
                >
                  <div className="absolute bottom-0 w-full rounded-t bg-red-200" style={{ height: `${h}%` }} />
                  <div className="absolute bottom-0 w-full rounded-t bg-green-400" style={{ height: `${rh}%` }} />
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex items-center gap-4 text-xs text-ink-500">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded bg-red-200" /> Denied
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded bg-green-400" /> Recovered
            </span>
            <span className="ml-auto">
              Recovery rate: <span className="font-medium text-ink-700">{recovery.recovery_rate}%</span>
            </span>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-8 text-center text-ink-400">Loading analytics...</div>
      ) : payers.length === 0 ? (
        <div className="py-8 text-center text-ink-400">No payer data available.</div>
      ) : (
        <div className="space-y-4">
          {payers.map((p) => (
            <div key={p.payer} className="rounded border border-ink-300/30 bg-white">
              <div className="flex items-center justify-between border-b border-ink-300/20 px-4 py-3">
                <div>
                  <h3 className="font-display text-lg font-semibold text-ink-950">{p.payer}</h3>
                  <p className="text-xs text-ink-500">
                    {p.total_claims} claims &middot; {p.appeals_filed} appeals
                    {p.win_rate !== null && (
                      <> &middot; Win rate:{" "}
                        <span className={p.win_rate > 50 ? "text-green-600" : p.win_rate > 0 ? "text-amber-600" : "text-ink-400"}>
                          {p.win_rate}%
                        </span>
                      </>
                    )}
                    {p.avg_days_to_appeal !== null && (
                      <> &middot; Avg {p.avg_days_to_appeal}d to appeal</>
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-lg font-semibold text-red-600">{dollars(p.total_denied_cents)}</p>
                  {p.recovery_rate !== null && (
                    <p className="text-xs text-green-600">{p.recovery_rate}% recovered</p>
                  )}
                </div>
              </div>

              <div className="px-4 py-3">
                <div className="grid gap-4 sm:grid-cols-3">
                  {/* Status distribution */}
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase text-ink-500">Claims by Status</p>
                    <div className="flex overflow-hidden rounded">
                      {Object.entries(p.statuses).map(([status, count]) => {
                        const pct = (count / p.total_claims) * 100;
                        return (
                          <BarSegment
                            key={status}
                            pct={pct}
                            color={STATUS_COLORS[status] || "bg-gray-400"}
                            label={`${status.replace(/_/g, " ")} (${count})`}
                          />
                        );
                      })}
                    </div>
                  </div>

                  {/* Top denial codes */}
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase text-ink-500">Top Denial Codes</p>
                    <div className="flex flex-wrap gap-1">
                      {p.top_denial_codes.map((dc) => (
                        <span
                          key={dc.code}
                          className="rounded border border-ink-300/40 px-1.5 py-0.5 font-mono text-xs text-ink-600"
                        >
                          {dc.code} ({dc.count})
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Appeal outcomes */}
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase text-ink-500">Appeal Outcomes</p>
                    <div className="flex gap-2 text-xs">
                      <span className="rounded bg-green-100 px-1.5 py-0.5 text-green-700">
                        Won: {p.appeals_won}
                      </span>
                      <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-700">
                        Lost: {p.appeals_lost}
                      </span>
                      <span className="rounded bg-ink-100 px-1.5 py-0.5 text-ink-600">
                        Pending: {p.appeals_filed - p.appeals_won - p.appeals_lost}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

"use client";

import { useState, useEffect } from "react";

interface PayerData {
  payer_name: string;
  total_claims: number;
  total_denied_cents: number;
  total_recovered_cents: number;
  win_rate: number;
  denial_codes: Record<string, number>;
  by_status: Record<string, number>;
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

function centsToDisplay(cents: number) {
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
  const [payers, setPayers] = useState<PayerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/analytics/payers")
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json();
      })
      .then(setPayers)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const totalDenied = payers.reduce((sum, p) => sum + p.total_denied_cents, 0);
  const totalRecovered = payers.reduce((sum, p) => sum + p.total_recovered_cents, 0);
  const totalClaims = payers.reduce((sum, p) => sum + p.total_claims, 0);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">
          Analytics &middot; Payer Performance
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">
          Payer Analytics
        </h1>
        <p className="mt-2 text-sm text-ink-500">
          Denial patterns, recovery rates, and claim distribution by payer.
        </p>
      </header>

      {/* Summary row */}
      <div className="mb-8 grid gap-4 sm:grid-cols-4">
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
          <p className="mt-1 font-display text-2xl font-semibold text-red-600">{centsToDisplay(totalDenied)}</p>
        </div>
        <div className="rounded-sm border border-ink-300/30 bg-white px-4 py-3">
          <p className="text-xs font-medium uppercase text-ink-500">Recovered</p>
          <p className="mt-1 font-display text-2xl font-semibold text-green-600">{centsToDisplay(totalRecovered)}</p>
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      {loading ? (
        <div className="py-8 text-center text-ink-400">Loading analytics...</div>
      ) : payers.length === 0 ? (
        <div className="py-8 text-center text-ink-400">No payer data available.</div>
      ) : (
        <div className="space-y-6">
          {payers.map((payer) => {
            const maxDenied = Math.max(...payers.map((p) => p.total_denied_cents));
            const barWidth = maxDenied > 0 ? (payer.total_denied_cents / maxDenied) * 100 : 0;

            return (
              <div
                key={payer.payer_name}
                className="rounded border border-ink-300/30 bg-white"
              >
                <div className="flex items-center justify-between border-b border-ink-300/20 px-4 py-3">
                  <div>
                    <h3 className="font-display text-lg font-semibold text-ink-950">
                      {payer.payer_name}
                    </h3>
                    <p className="text-xs text-ink-500">
                      {payer.total_claims} claims &middot; Win rate:{" "}
                      <span className={payer.win_rate > 50 ? "text-green-600" : payer.win_rate > 0 ? "text-amber-600" : "text-ink-400"}>
                        {payer.win_rate}%
                      </span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-lg font-semibold text-red-600">
                      {centsToDisplay(payer.total_denied_cents)}
                    </p>
                    <p className="text-xs text-ink-500">total denied</p>
                  </div>
                </div>

                <div className="px-4 py-3">
                  {/* Denied amount bar */}
                  <div className="mb-3">
                    <div className="h-3 rounded-full bg-ink-100">
                      <div
                        className="h-3 rounded-full bg-red-400"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    {/* Status distribution */}
                    <div>
                      <p className="mb-1 text-xs font-medium uppercase text-ink-500">Claims by Status</p>
                      <div className="flex overflow-hidden rounded">
                        {Object.entries(payer.by_status).map(([status, count]) => {
                          const pct = (count / payer.total_claims) * 100;
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
                      <p className="mb-1 text-xs font-medium uppercase text-ink-500">Denial Codes</p>
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(payer.denial_codes)
                          .sort(([, a], [, b]) => b - a)
                          .map(([code, count]) => (
                            <span
                              key={code}
                              className="rounded border border-ink-300/40 px-1.5 py-0.5 font-mono text-xs text-ink-600"
                            >
                              {code} ({count})
                            </span>
                          ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}

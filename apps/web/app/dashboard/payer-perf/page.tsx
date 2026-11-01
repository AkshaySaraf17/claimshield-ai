"use client";

import { useEffect, useState } from "react";

interface TopCode {
  code: string;
  count: number;
}

interface PayerPerf {
  payer: string;
  total_claims: number;
  total_denied_cents: number;
  total_recovered_cents: number;
  appeals_filed: number;
  appeals_won: number;
  appeals_lost: number;
  win_rate: number | null;
  recovery_rate: number;
  avg_days_to_appeal: number | null;
  top_denial_codes: TopCode[];
}

export default function PayerPerfPage() {
  const [payers, setPayers] = useState<PayerPerf[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v1/analytics/payer-performance")
      .then((r) => r.json())
      .then((d) => {
        setPayers(Array.isArray(d) ? d : []);
        setLoading(false);
      });
  }, []);

  const fmt = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">Analytics</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">Payer Performance</h1>
        <p className="mt-1 text-sm text-ink-500">Win rates, recovery, and denial patterns by payer.</p>
      </header>

      {loading ? (
        <p className="text-ink-400">Loading payer data...</p>
      ) : payers.length === 0 ? (
        <p className="text-ink-400">No payer data available.</p>
      ) : (
        <div className="space-y-4">
          {payers.sort((a, b) => b.total_claims - a.total_claims).map((p) => (
            <div key={p.payer} className="rounded-lg border border-ink-200 bg-white p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold text-ink-900">{p.payer}</h3>
                <span className="text-sm text-ink-500">{p.total_claims} claims</span>
              </div>
              <div className="grid grid-cols-5 gap-3 text-center text-sm mb-3">
                <div>
                  <p className="text-xs text-ink-500">Denied</p>
                  <p className="font-mono font-bold text-red-700">{fmt(p.total_denied_cents)}</p>
                </div>
                <div>
                  <p className="text-xs text-ink-500">Recovered</p>
                  <p className="font-mono font-bold text-green-700">{fmt(p.total_recovered_cents)}</p>
                </div>
                <div>
                  <p className="text-xs text-ink-500">Win Rate</p>
                  <p className="font-bold text-ink-800">{p.win_rate != null ? `${Math.round(p.win_rate * 100)}%` : "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-ink-500">Recovery %</p>
                  <p className="font-bold text-ink-800">{Math.round(p.recovery_rate * 100)}%</p>
                </div>
                <div>
                  <p className="text-xs text-ink-500">Avg Days</p>
                  <p className="font-bold text-ink-800">{p.avg_days_to_appeal != null ? `${Math.round(p.avg_days_to_appeal)}d` : "—"}</p>
                </div>
              </div>
              {p.top_denial_codes.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {p.top_denial_codes.map((c) => (
                    <span key={c.code} className="rounded bg-red-50 px-2 py-0.5 text-xs text-red-600">{c.code} ({c.count})</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

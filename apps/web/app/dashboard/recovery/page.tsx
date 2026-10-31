"use client";

import { useEffect, useState } from "react";

interface RecoveryData {
  total_denied_cents: number;
  total_recovered_cents: number;
  recovery_rate: number;
  total_claims: number;
  weekly_trend?: { week: string; denied_cents: number; recovered_cents: number; claims: number }[];
  by_payer?: { payer: string; denied_cents: number; recovered_cents: number }[];
}

export default function RecoveryPage() {
  const [data, setData] = useState<RecoveryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v1/analytics/recovery")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      });
  }, []);

  const fmt = (cents: number) =>
    `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">Finance</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">Revenue Recovery</h1>
        <p className="mt-1 text-sm text-ink-500">
          Track denied amounts vs. recovered revenue across all claims.
        </p>
      </header>

      {loading || !data ? (
        <p className="text-ink-400">Loading recovery data...</p>
      ) : (
        <>
          {/* Summary cards */}
          <div className="mb-6 grid grid-cols-4 gap-4">
            <div className="rounded-lg border border-ink-200 bg-white px-4 py-3">
              <p className="text-xs text-ink-500">Total Denied</p>
              <p className="mt-1 text-2xl font-bold text-red-700">{fmt(data.total_denied_cents)}</p>
            </div>
            <div className="rounded-lg border border-ink-200 bg-white px-4 py-3">
              <p className="text-xs text-ink-500">Recovered</p>
              <p className="mt-1 text-2xl font-bold text-green-700">{fmt(data.total_recovered_cents)}</p>
            </div>
            <div className="rounded-lg border border-ink-200 bg-white px-4 py-3">
              <p className="text-xs text-ink-500">Recovery Rate</p>
              <p className="mt-1 text-2xl font-bold text-ink-900">{data.recovery_rate}%</p>
            </div>
            <div className="rounded-lg border border-ink-200 bg-white px-4 py-3">
              <p className="text-xs text-ink-500">Total Claims</p>
              <p className="mt-1 text-2xl font-bold text-ink-900">{data.total_claims}</p>
            </div>
          </div>

          {/* Weekly trend */}
          {data.weekly_trend && data.weekly_trend.length > 0 && (
            <div className="mb-6 rounded-lg border border-ink-200 bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-ink-100">
                <p className="text-xs font-semibold text-ink-500">Weekly Trend</p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-100 bg-ink-50/50">
                    <th className="px-4 py-2 text-left text-xs font-semibold text-ink-500">Week</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-ink-500">Denied</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-ink-500">Recovered</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-ink-500">Claims</th>
                  </tr>
                </thead>
                <tbody>
                  {data.weekly_trend.map((w) => (
                    <tr key={w.week} className="border-t border-ink-50">
                      <td className="px-4 py-2 font-mono text-xs text-ink-700">{w.week}</td>
                      <td className="px-4 py-2 text-right text-red-600">{fmt(w.denied_cents)}</td>
                      <td className="px-4 py-2 text-right text-green-600">{fmt(w.recovered_cents)}</td>
                      <td className="px-4 py-2 text-right text-ink-600">{w.claims}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* By payer breakdown */}
          {data.by_payer && data.by_payer.length > 0 && (
            <div className="rounded-lg border border-ink-200 bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-ink-100">
                <p className="text-xs font-semibold text-ink-500">By Payer</p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-100 bg-ink-50/50">
                    <th className="px-4 py-2 text-left text-xs font-semibold text-ink-500">Payer</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-ink-500">Denied</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-ink-500">Recovered</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-ink-500">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_payer.map((p) => (
                    <tr key={p.payer} className="border-t border-ink-50">
                      <td className="px-4 py-2 font-medium text-ink-700">{p.payer}</td>
                      <td className="px-4 py-2 text-right text-red-600">{fmt(p.denied_cents)}</td>
                      <td className="px-4 py-2 text-right text-green-600">{fmt(p.recovered_cents)}</td>
                      <td className="px-4 py-2 text-right text-ink-600">
                        {p.denied_cents > 0 ? `${((p.recovered_cents / p.denied_cents) * 100).toFixed(0)}%` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

interface EffectRow {
  key: string;
  total: number;
  appealed: number;
  won: number;
  lost: number;
  pending: number;
  denied_cents: number;
  recovered_cents: number;
  win_rate: number;
}

export default function AppealEffectPage() {
  const [byCode, setByCode] = useState<EffectRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v1/analytics/appeal-effectiveness")
      .then((r) => r.json())
      .then((d) => {
        setByCode(d.by_denial_code || []);
        setLoading(false);
      });
  }, []);

  const fmt = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">Analytics</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">Appeal Effectiveness</h1>
        <p className="mt-1 text-sm text-ink-500">Win rates and recovery by denial code.</p>
      </header>

      {loading ? (
        <p className="text-ink-400">Loading effectiveness data...</p>
      ) : byCode.length === 0 ? (
        <p className="text-ink-400">No data available.</p>
      ) : (
        <div className="rounded-lg border border-ink-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50">
                <th className="px-4 py-2 text-left text-xs font-semibold text-ink-500">Code</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-ink-500">Claims</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-ink-500">Won</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-ink-500">Lost</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-ink-500">Pending</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-ink-500">Win Rate</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-ink-500">Denied</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-ink-500">Recovered</th>
              </tr>
            </thead>
            <tbody>
              {byCode.sort((a, b) => b.total - a.total).map((r) => (
                <tr key={r.key} className="border-b border-ink-100 hover:bg-ink-50">
                  <td className="px-4 py-2 font-medium text-ink-800">{r.key}</td>
                  <td className="px-4 py-2 text-right text-ink-700">{r.total}</td>
                  <td className="px-4 py-2 text-right text-green-700">{r.won}</td>
                  <td className="px-4 py-2 text-right text-red-600">{r.lost}</td>
                  <td className="px-4 py-2 text-right text-ink-500">{r.pending}</td>
                  <td className="px-4 py-2 text-right font-bold text-ink-800">{Math.round(r.win_rate * 100)}%</td>
                  <td className="px-4 py-2 text-right font-mono text-red-700">{fmt(r.denied_cents)}</td>
                  <td className="px-4 py-2 text-right font-mono text-green-700">{fmt(r.recovered_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

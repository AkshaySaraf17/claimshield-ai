"use client";

import { useEffect, useState } from "react";

interface EffectivenessItem {
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

interface EffectivenessData {
  by_denial_code: EffectivenessItem[];
  by_payer: EffectivenessItem[];
  total_claims: number;
  total_appeals: number;
}

function dollars(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

export default function EffectivenessPage() {
  const [data, setData] = useState<EffectivenessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"code" | "payer">("code");

  useEffect(() => {
    fetch("/api/v1/analytics/appeal-effectiveness")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      });
  }, []);

  const items = data ? (view === "code" ? data.by_denial_code : data.by_payer) : [];

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">Analytics</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">
          Appeal Effectiveness
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Win rates and recovery by denial code and payer.
        </p>
      </header>

      {data && (
        <div className="mb-6 flex gap-4">
          <div className="rounded-lg border border-ink-200 bg-white px-4 py-3 text-center">
            <p className="text-2xl font-bold text-ink-900">{data.total_claims}</p>
            <p className="text-xs text-ink-500">Total Claims</p>
          </div>
          <div className="rounded-lg border border-ink-200 bg-white px-4 py-3 text-center">
            <p className="text-2xl font-bold text-ink-900">{data.total_appeals}</p>
            <p className="text-xs text-ink-500">Appeals Filed</p>
          </div>
        </div>
      )}

      <div className="mb-4 flex items-center gap-2">
        <span className="text-xs text-ink-500">View by:</span>
        {(["code", "payer"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`rounded px-2 py-1 text-xs ${
              view === v ? "bg-ink-950 text-white" : "bg-ink-100 text-ink-600 hover:bg-ink-200"
            }`}
          >
            {v === "code" ? "Denial Code" : "Payer"}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-ink-400">Loading effectiveness data...</p>
      ) : items.length === 0 ? (
        <p className="text-ink-400">No data available.</p>
      ) : (
        <div className="rounded-lg border border-ink-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-100 bg-ink-50/50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-ink-500">
                  {view === "code" ? "Denial Code" : "Payer"}
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-ink-500">Total</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-ink-500">Appealed</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-ink-500">Won</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-ink-500">Lost</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-ink-500">Win Rate</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-ink-500">Denied</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-ink-500">Recovered</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.key} className="border-t border-ink-50">
                  <td className="px-4 py-3 font-mono text-xs text-ink-700">{item.key}</td>
                  <td className="px-4 py-3 text-center font-mono">{item.total}</td>
                  <td className="px-4 py-3 text-center font-mono">{item.appealed}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-700">
                      {item.won}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">
                      {item.lost}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                        item.win_rate >= 50
                          ? "bg-emerald-100 text-emerald-700"
                          : item.win_rate > 0
                          ? "bg-amber-100 text-amber-700"
                          : "bg-ink-100 text-ink-500"
                      }`}
                    >
                      {item.win_rate}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-red-600">
                    {dollars(item.denied_cents)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-emerald-600">
                    {dollars(item.recovered_cents)}
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

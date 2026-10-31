"use client";

import { useEffect, useState } from "react";

interface TrendMonth {
  month: string;
  new_claims: number;
  total_denied_cents: number;
  total_recovered_cents: number;
  won: number;
  lost: number;
  top_codes: { code: string; count: number }[];
  top_payers: { payer: string; count: number }[];
}

function dollars(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

export default function TrendsPage() {
  const [data, setData] = useState<TrendMonth[]>([]);
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState(6);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/v1/analytics/trends?months=${months}`)
      .then((r) => r.json())
      .then((d) => {
        setData(Array.isArray(d) ? d : []);
        setLoading(false);
      });
  }, [months]);

  const maxDenied = Math.max(...data.map((d) => d.total_denied_cents), 1);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">Analytics</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">Denial Trends</h1>
        <p className="mt-1 text-sm text-ink-500">
          Monthly denial volume, recovery, and outcome trends.
        </p>
      </header>

      <div className="mb-4 flex items-center gap-2">
        <span className="text-xs text-ink-500">Period:</span>
        {[3, 6, 12].map((m) => (
          <button
            key={m}
            onClick={() => setMonths(m)}
            className={`rounded px-2 py-1 text-xs ${
              months === m ? "bg-ink-950 text-white" : "bg-ink-100 text-ink-600 hover:bg-ink-200"
            }`}
          >
            {m} months
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-ink-400">Loading trends...</p>
      ) : data.length === 0 ? (
        <p className="text-ink-400">No trend data available.</p>
      ) : (
        <>
          {/* Bar chart */}
          <div className="rounded-lg border border-ink-200 bg-white p-6 mb-6">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-500">
              Monthly Denied Volume
            </h2>
            <div className="flex items-end gap-2" style={{ height: 200 }}>
              {data.map((d) => {
                const h = maxDenied > 0 ? (d.total_denied_cents / maxDenied) * 180 : 0;
                return (
                  <div key={d.month} className="flex-1 flex flex-col items-center">
                    <span className="text-[9px] text-ink-500 mb-1">{dollars(d.total_denied_cents)}</span>
                    <div
                      className="w-full rounded-t bg-red-400 transition-all"
                      style={{ height: Math.max(h, 2) }}
                      title={`${d.month}: ${dollars(d.total_denied_cents)}`}
                    />
                    <div
                      className="w-full bg-emerald-400 rounded-b"
                      style={{ height: maxDenied > 0 ? Math.max((d.total_recovered_cents / maxDenied) * 180, 0) : 0 }}
                    />
                    <span className="mt-1 text-[10px] text-ink-500">{d.month}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex gap-4 text-[10px] text-ink-500">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-red-400" /> Denied</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-emerald-400" /> Recovered</span>
            </div>
          </div>

          {/* Detail table */}
          <div className="rounded-lg border border-ink-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-100 bg-ink-50/50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-ink-500">Month</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-ink-500">New</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-ink-500">Denied</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-ink-500">Recovered</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-ink-500">Won</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-ink-500">Lost</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-ink-500">Top Codes</th>
                </tr>
              </thead>
              <tbody>
                {data.map((d) => (
                  <tr key={d.month} className="border-t border-ink-50">
                    <td className="px-4 py-3 font-mono text-xs text-ink-700">{d.month}</td>
                    <td className="px-4 py-3 text-center font-mono">{d.new_claims}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-red-600">{dollars(d.total_denied_cents)}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-emerald-600">{dollars(d.total_recovered_cents)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-700">{d.won}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">{d.lost}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {d.top_codes.map((tc) => (
                          <span key={tc.code} className="rounded border border-ink-200 px-1 py-0.5 font-mono text-[9px] text-ink-600">
                            {tc.code}×{tc.count}
                          </span>
                        ))}
                        {d.top_codes.length === 0 && <span className="text-[10px] text-ink-300">—</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

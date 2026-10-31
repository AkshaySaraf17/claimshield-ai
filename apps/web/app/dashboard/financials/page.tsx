"use client";

import { useEffect, useState } from "react";

interface PayerFinancial {
  payer: string;
  denied: number;
  recovered: number;
  lost: number;
  pending: number;
}

interface MonthlyTrend {
  month: string;
  denied: number;
  recovered: number;
  claims: number;
}

interface FinancialData {
  totals: {
    denied_cents: number;
    recovered_cents: number;
    lost_cents: number;
    pending_cents: number;
    cancelled_cents: number;
    net_recovery_rate: number;
  };
  period: { days: number; denied_cents: number; recovered_cents: number };
  by_payer: PayerFinancial[];
  monthly_trend: MonthlyTrend[];
}

function dollars(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

export default function FinancialsPage() {
  const [data, setData] = useState<FinancialData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v1/analytics/financials")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      });
  }, []);

  if (loading || !data) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10">
        <p className="text-ink-400">Loading financial data...</p>
      </div>
    );
  }

  const t = data.totals;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">
          Finance
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">
          Financial Reconciliation
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Track denied amounts, recoveries, and outstanding balances across all payers.
        </p>
      </header>

      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <div className="rounded-lg border border-ink-200 bg-white p-4">
          <p className="text-xs text-ink-500">Total Denied</p>
          <p className="mt-1 text-xl font-semibold text-red-600">{dollars(t.denied_cents)}</p>
        </div>
        <div className="rounded-lg border border-ink-200 bg-white p-4">
          <p className="text-xs text-ink-500">Recovered</p>
          <p className="mt-1 text-xl font-semibold text-emerald-600">{dollars(t.recovered_cents)}</p>
        </div>
        <div className="rounded-lg border border-ink-200 bg-white p-4">
          <p className="text-xs text-ink-500">Lost</p>
          <p className="mt-1 text-xl font-semibold text-red-400">{dollars(t.lost_cents)}</p>
        </div>
        <div className="rounded-lg border border-ink-200 bg-white p-4">
          <p className="text-xs text-ink-500">Pending</p>
          <p className="mt-1 text-xl font-semibold text-amber-600">{dollars(t.pending_cents)}</p>
        </div>
        <div className="rounded-lg border border-ink-200 bg-white p-4">
          <p className="text-xs text-ink-500">Recovery Rate</p>
          <p className={`mt-1 text-xl font-semibold ${t.net_recovery_rate >= 30 ? "text-emerald-600" : "text-amber-600"}`}>
            {t.net_recovery_rate}%
          </p>
        </div>
      </div>

      {/* Waterfall visualization */}
      <div className="mb-6 rounded-lg border border-ink-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase text-ink-500">
          Fund Flow
        </h2>
        <div className="flex items-end gap-2" style={{ height: 140 }}>
          {[
            { label: "Denied", cents: t.denied_cents, color: "bg-red-400" },
            { label: "Recovered", cents: t.recovered_cents, color: "bg-emerald-400" },
            { label: "Lost", cents: t.lost_cents, color: "bg-red-200" },
            { label: "Pending", cents: t.pending_cents, color: "bg-amber-300" },
          ].map((b) => {
            const pct = t.denied_cents > 0 ? (b.cents / t.denied_cents) * 100 : 0;
            return (
              <div key={b.label} className="flex flex-1 flex-col items-center">
                <div
                  className={`w-full rounded-t ${b.color}`}
                  style={{ height: `${Math.max(pct, 3)}%` }}
                />
                <p className="mt-2 text-[10px] font-medium text-ink-500">{b.label}</p>
                <p className="font-mono text-xs text-ink-700">{dollars(b.cents)}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Monthly trend */}
      {data.monthly_trend.length > 0 && (
        <div className="mb-6 rounded-lg border border-ink-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase text-ink-500">
            Monthly Trend
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-ink-200 text-ink-500">
                  <th className="px-3 py-2 text-left">Month</th>
                  <th className="px-3 py-2 text-right">Claims</th>
                  <th className="px-3 py-2 text-right">Denied</th>
                  <th className="px-3 py-2 text-right">Recovered</th>
                  <th className="px-3 py-2 text-right">Net</th>
                </tr>
              </thead>
              <tbody>
                {data.monthly_trend.map((m) => (
                  <tr key={m.month} className="border-b border-ink-50">
                    <td className="px-3 py-2 font-medium text-ink-700">{m.month}</td>
                    <td className="px-3 py-2 text-right text-ink-600">{m.claims}</td>
                    <td className="px-3 py-2 text-right font-mono text-red-600">{dollars(m.denied)}</td>
                    <td className="px-3 py-2 text-right font-mono text-emerald-600">{dollars(m.recovered)}</td>
                    <td className="px-3 py-2 text-right font-mono text-ink-700">
                      {dollars(m.recovered - m.denied)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Payer breakdown */}
      <div className="rounded-lg border border-ink-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase text-ink-500">
          By Payer
        </h2>
        <div className="space-y-3">
          {data.by_payer.map((p) => {
            const total = p.denied || 1;
            return (
              <div key={p.payer}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-ink-700">{p.payer}</span>
                  <span className="font-mono text-xs text-ink-500">{dollars(p.denied)}</span>
                </div>
                <div className="flex h-4 overflow-hidden rounded">
                  {p.recovered > 0 && (
                    <div
                      className="bg-emerald-400 flex items-center justify-center text-[9px] text-white"
                      style={{ width: `${(p.recovered / total) * 100}%` }}
                      title={`Recovered: ${dollars(p.recovered)}`}
                    >
                      {(p.recovered / total) * 100 > 15 ? dollars(p.recovered) : ""}
                    </div>
                  )}
                  {p.lost > 0 && (
                    <div
                      className="bg-red-300"
                      style={{ width: `${(p.lost / total) * 100}%` }}
                      title={`Lost: ${dollars(p.lost)}`}
                    />
                  )}
                  {p.pending > 0 && (
                    <div
                      className="bg-amber-200"
                      style={{ width: `${(p.pending / total) * 100}%` }}
                      title={`Pending: ${dollars(p.pending)}`}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex gap-4 text-[10px] text-ink-500">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-emerald-400" /> Recovered</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-red-300" /> Lost</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-amber-200" /> Pending</span>
        </div>
      </div>
    </div>
  );
}

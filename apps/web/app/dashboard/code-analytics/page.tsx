"use client";

import { useEffect, useState } from "react";

interface PayerBreakdown {
  payer: string;
  count: number;
}

interface CodeAnalytic {
  code: string;
  category: string;
  total_claims: number;
  total_denied_cents: number;
  won: number;
  lost: number;
  pending: number;
  payers: PayerBreakdown[];
  win_rate: number;
  avg_amount_cents: number;
}

export default function CodeAnalyticsPage() {
  const [data, setData] = useState<CodeAnalytic[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v1/analytics/denial-codes")
      .then((r) => r.json())
      .then((d) => {
        setData(d.codes || []);
        setLoading(false);
      });
  }, []);

  const fmt = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

  const catColor: Record<string, string> = {
    Coding: "bg-blue-100 text-blue-700",
    Medical: "bg-green-100 text-green-700",
    Authorization: "bg-purple-100 text-purple-700",
    Contractual: "bg-amber-100 text-amber-700",
    "Patient Responsibility": "bg-red-100 text-red-700",
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">Analytics</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">Denial Code Analytics</h1>
        <p className="mt-1 text-sm text-ink-500">Performance and distribution analysis by denial code.</p>
      </header>

      {loading ? (
        <p className="text-ink-400">Loading analytics...</p>
      ) : data.length === 0 ? (
        <p className="text-ink-400">No denial code data available.</p>
      ) : (
        <div className="space-y-3">
          {data.sort((a, b) => b.total_claims - a.total_claims).map((c) => (
            <div key={c.code} className="rounded-lg border border-ink-200 bg-white p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-ink-900">{c.code}</span>
                  <span className={`rounded px-2 py-0.5 text-xs ${catColor[c.category] || "bg-ink-100 text-ink-600"}`}>{c.category}</span>
                </div>
                <span className="text-sm text-ink-500">{c.total_claims} claim{c.total_claims !== 1 ? "s" : ""}</span>
              </div>
              <div className="grid grid-cols-4 gap-3 text-center text-sm mb-3">
                <div><p className="text-xs text-ink-500">Total Denied</p><p className="font-mono font-bold text-red-700">{fmt(c.total_denied_cents)}</p></div>
                <div><p className="text-xs text-ink-500">Avg Amount</p><p className="font-mono font-bold text-ink-700">{fmt(c.avg_amount_cents)}</p></div>
                <div><p className="text-xs text-ink-500">Win Rate</p><p className="font-bold text-green-700">{Math.round(c.win_rate * 100)}%</p></div>
                <div><p className="text-xs text-ink-500">W / L / P</p><p className="font-bold text-ink-700">{c.won} / {c.lost} / {c.pending}</p></div>
              </div>
              {c.payers.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {c.payers.map((p) => (
                    <span key={p.payer} className="rounded bg-ink-100 px-2 py-0.5 text-xs text-ink-600">
                      {p.payer} ({p.count})
                    </span>
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

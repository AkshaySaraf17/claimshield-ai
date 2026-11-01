"use client";

import { useEffect, useState } from "react";

interface CategoryCost {
  category: string;
  total_cents: number;
}

interface CostSummaryData {
  total_cents: number;
  total_entries: number;
  by_category: CategoryCost[];
  claims_with_costs: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  staff_time: "bg-blue-500",
  filing_fee: "bg-green-500",
  legal: "bg-red-500",
  copying: "bg-amber-500",
  postage: "bg-purple-500",
  other: "bg-ink-400",
};

export default function CostSummaryPage() {
  const [data, setData] = useState<CostSummaryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v1/analytics/cost-summary")
      .then((r) => r.json())
      .then((d) => {
        setData(d.total_cents != null ? d : null);
        setLoading(false);
      });
  }, []);

  const fmt = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">Analytics</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">Cost Summary</h1>
        <p className="mt-1 text-sm text-ink-500">Overall appeal cost analytics broken down by category.</p>
      </header>

      {loading ? (
        <p className="text-ink-400">Loading cost data...</p>
      ) : !data ? (
        <p className="text-ink-400">No cost data available.</p>
      ) : (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-ink-200 bg-white px-4 py-4 text-center">
              <p className="text-xs text-ink-500">Total Costs</p>
              <p className="text-2xl font-bold text-ink-900">{fmt(data.total_cents)}</p>
            </div>
            <div className="rounded-lg border border-ink-200 bg-white px-4 py-4 text-center">
              <p className="text-xs text-ink-500">Cost Entries</p>
              <p className="text-2xl font-bold text-ink-900">{data.total_entries}</p>
            </div>
            <div className="rounded-lg border border-ink-200 bg-white px-4 py-4 text-center">
              <p className="text-xs text-ink-500">Claims with Costs</p>
              <p className="text-2xl font-bold text-ink-900">{data.claims_with_costs}</p>
            </div>
          </div>

          {/* Category breakdown */}
          {data.by_category.length > 0 && (
            <div className="rounded-lg border border-ink-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-ink-500 mb-4">By Category</h2>
              <div className="space-y-3">
                {data.by_category.sort((a, b) => b.total_cents - a.total_cents).map((c) => {
                  const pct = data.total_cents > 0 ? (c.total_cents / data.total_cents) * 100 : 0;
                  return (
                    <div key={c.category}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-ink-700 capitalize">{c.category.replace(/_/g, " ")}</span>
                        <span className="font-mono text-ink-900">{fmt(c.total_cents)} ({Math.round(pct)}%)</span>
                      </div>
                      <div className="h-3 w-full rounded bg-ink-100 overflow-hidden">
                        <div className={`h-full rounded ${CATEGORY_COLORS[c.category] || "bg-ink-400"}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

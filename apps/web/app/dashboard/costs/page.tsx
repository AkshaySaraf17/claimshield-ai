"use client";

import { useEffect, useState } from "react";

interface CostSummary {
  total_cents: number;
  total_entries: number;
  by_category: { category: string; total_cents: number }[];
  claims_with_costs: number;
}

function dollars(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

const CATEGORY_LABELS: Record<string, string> = {
  staff_time: "Staff Time",
  filing_fee: "Filing Fees",
  legal: "Legal",
  copying: "Copying",
  postage: "Postage",
  other: "Other",
};

export default function CostsPage() {
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v1/analytics/cost-summary")
      .then((r) => r.json())
      .then((d) => {
        setSummary(d);
        setLoading(false);
      });
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">Finance</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">Cost Tracker</h1>
        <p className="mt-1 text-sm text-ink-500">
          Internal costs incurred per claim (staff time, fees, postage).
        </p>
      </header>

      {loading ? (
        <p className="text-ink-400">Loading cost data...</p>
      ) : !summary ? (
        <p className="text-ink-400">Unable to load cost summary.</p>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-3 gap-4">
            <div className="rounded-lg border border-ink-200 bg-white px-4 py-3 text-center">
              <p className="text-2xl font-bold text-ink-900">{dollars(summary.total_cents)}</p>
              <p className="text-xs text-ink-500">Total Costs</p>
            </div>
            <div className="rounded-lg border border-ink-200 bg-white px-4 py-3 text-center">
              <p className="text-2xl font-bold text-ink-900">{summary.total_entries}</p>
              <p className="text-xs text-ink-500">Cost Entries</p>
            </div>
            <div className="rounded-lg border border-ink-200 bg-white px-4 py-3 text-center">
              <p className="text-2xl font-bold text-ink-900">{summary.claims_with_costs}</p>
              <p className="text-xs text-ink-500">Claims with Costs</p>
            </div>
          </div>

          {summary.by_category.length > 0 ? (
            <div className="rounded-lg border border-ink-200 bg-white overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-100 bg-ink-50/50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-ink-500">Category</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-ink-500">Total</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-ink-500">% of Total</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.by_category.map((cat) => (
                    <tr key={cat.category} className="border-t border-ink-50">
                      <td className="px-4 py-3 text-sm text-ink-700">
                        {CATEGORY_LABELS[cat.category] || cat.category}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm text-ink-900">
                        {dollars(cat.total_cents)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-ink-500">
                        {summary.total_cents > 0
                          ? ((cat.total_cents / summary.total_cents) * 100).toFixed(1)
                          : "0.0"}
                        %
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-lg border border-ink-200 bg-white p-8 text-center">
              <p className="text-ink-500">No costs recorded yet.</p>
              <p className="mt-1 text-xs text-ink-400">
                Add costs from the claim detail page.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

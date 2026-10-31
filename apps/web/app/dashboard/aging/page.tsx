"use client";

import { useEffect, useState } from "react";

interface Bucket {
  range: string;
  count: number;
  amount_cents: number;
}

interface AgingData {
  buckets: Bucket[];
  by_status: Record<string, { range: string; count: number }[]>;
  total_open: number;
}

function dollars(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

const BUCKET_COLORS = [
  "bg-green-400",
  "bg-emerald-400",
  "bg-yellow-400",
  "bg-amber-400",
  "bg-orange-500",
  "bg-red-500",
];

export default function AgingPage() {
  const [data, setData] = useState<AgingData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v1/analytics/aging")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10">
        <p className="text-ink-400">Loading aging data...</p>
      </div>
    );
  }

  if (!data) return null;

  const maxCount = Math.max(...data.buckets.map((b) => b.count), 1);
  const totalAmount = data.buckets.reduce((s, b) => s + b.amount_cents, 0);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">
          Analytics
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">
          Claim Aging Report
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          How long open claims have been in the system — older claims need attention.
        </p>
      </header>

      {/* Summary */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-ink-200 bg-white p-4">
          <p className="text-xs text-ink-500">Open Claims</p>
          <p className="mt-1 text-2xl font-semibold text-ink-950">{data.total_open}</p>
        </div>
        <div className="rounded-lg border border-ink-200 bg-white p-4">
          <p className="text-xs text-ink-500">Open Amount</p>
          <p className="mt-1 text-2xl font-semibold text-ink-950">{dollars(totalAmount)}</p>
        </div>
        <div className="rounded-lg border border-ink-200 bg-white p-4">
          <p className="text-xs text-ink-500">Oldest Bucket</p>
          <p className="mt-1 text-2xl font-semibold text-ink-950">
            {data.buckets.filter((b) => b.count > 0).pop()?.range || "—"}
          </p>
        </div>
      </div>

      {/* Bar chart */}
      <div className="mb-8 rounded-lg border border-ink-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase text-ink-500">
          Claims by Age
        </h2>
        <div className="space-y-3">
          {data.buckets.map((b, i) => {
            const pct = (b.count / maxCount) * 100;
            return (
              <div key={b.range} className="flex items-center gap-4">
                <span className="w-16 text-right font-mono text-xs text-ink-600">
                  {b.range}
                </span>
                <div className="flex-1 h-6 rounded bg-ink-100">
                  <div
                    className={`h-6 rounded ${BUCKET_COLORS[i]} flex items-center px-2`}
                    style={{ width: `${Math.max(pct, 2)}%` }}
                  >
                    {b.count > 0 && (
                      <span className="text-[10px] font-semibold text-white">
                        {b.count}
                      </span>
                    )}
                  </div>
                </div>
                <span className="w-24 text-right font-mono text-xs text-ink-500">
                  {dollars(b.amount_cents)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Status breakdown */}
      {Object.keys(data.by_status).length > 0 && (
        <div className="rounded-lg border border-ink-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase text-ink-500">
            Aging by Status
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-ink-200 text-ink-500">
                  <th className="px-3 py-2 text-left">Status</th>
                  {data.buckets.map((b) => (
                    <th key={b.range} className="px-3 py-2 text-right">
                      {b.range}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.by_status).map(([status, ranges]) => (
                  <tr key={status} className="border-b border-ink-50">
                    <td className="px-3 py-2 font-medium text-ink-700">
                      {status.replace(/_/g, " ")}
                    </td>
                    {ranges.map((r) => (
                      <td
                        key={r.range}
                        className={`px-3 py-2 text-right font-mono ${
                          r.count > 0 ? "text-ink-900 font-semibold" : "text-ink-300"
                        }`}
                      >
                        {r.count}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

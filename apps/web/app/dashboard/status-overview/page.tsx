"use client";

import { useEffect, useState } from "react";

interface StatusCount {
  status: string;
  count: number;
}

const STATUS_COLORS: Record<string, string> = {
  pending_review: "bg-amber-500",
  in_progress: "bg-blue-500",
  needs_review: "bg-yellow-500",
  approved: "bg-indigo-500",
  sent: "bg-purple-500",
  won: "bg-green-500",
  lost: "bg-red-500",
  cancelled: "bg-ink-400",
};

const STATUS_LABELS: Record<string, string> = {
  pending_review: "Pending Review",
  in_progress: "In Progress",
  needs_review: "Needs Review",
  approved: "Approved",
  sent: "Sent",
  won: "Won",
  lost: "Lost",
  cancelled: "Cancelled",
};

export default function StatusOverviewPage() {
  const [data, setData] = useState<StatusCount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v1/analytics/status-distribution")
      .then((r) => r.json())
      .then((d) => {
        setData(Array.isArray(d) ? d : []);
        setLoading(false);
      });
  }, []);

  const total = data.reduce((s, d) => s + d.count, 0);
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">Overview</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">Status Distribution</h1>
        <p className="mt-1 text-sm text-ink-500">
          Claims broken down by current pipeline stage.
        </p>
      </header>

      {loading ? (
        <p className="text-ink-400">Loading distribution...</p>
      ) : data.length === 0 ? (
        <p className="text-ink-400">No claims found.</p>
      ) : (
        <>
          <div className="mb-6 rounded-lg border border-ink-200 bg-white px-4 py-3">
            <p className="text-xs text-ink-500">Total Claims</p>
            <p className="text-3xl font-bold text-ink-900">{total}</p>
          </div>

          <div className="space-y-3">
            {data
              .sort((a, b) => b.count - a.count)
              .map((d) => (
                <div key={d.status} className="flex items-center gap-4">
                  <div className="w-32 text-sm font-medium text-ink-700">
                    {STATUS_LABELS[d.status] || d.status}
                  </div>
                  <div className="flex-1">
                    <div className="h-8 rounded bg-ink-50 overflow-hidden">
                      <div
                        className={`h-full rounded ${STATUS_COLORS[d.status] || "bg-ink-300"}`}
                        style={{ width: `${(d.count / maxCount) * 100}%` }}
                      />
                    </div>
                  </div>
                  <div className="w-16 text-right">
                    <span className="text-sm font-bold text-ink-800">{d.count}</span>
                    <span className="ml-1 text-xs text-ink-400">
                      ({total > 0 ? ((d.count / total) * 100).toFixed(0) : 0}%)
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  );
}

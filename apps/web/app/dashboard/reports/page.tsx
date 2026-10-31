"use client";

import { useEffect, useState } from "react";

interface ReportData {
  period_days: number;
  generated_at: string;
  totals: {
    claims: number;
    denied_cents: number;
    recovered_cents: number;
    recovery_rate: number;
    appeals: number;
    audit_entries: number;
  };
  period: {
    new_claims: number;
    denied_cents: number;
    recovered_cents: number;
    new_appeals: number;
  };
  status_distribution: Record<string, number>;
  top_denial_codes: { code: string; count: number }[];
  payer_summary: {
    payer: string;
    claims: number;
    denied_cents: number;
    won: number;
    win_rate: number;
  }[];
}

function dollars(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

const STATUS_COLORS: Record<string, string> = {
  pending_review: "bg-yellow-100 text-yellow-800",
  in_progress: "bg-blue-100 text-blue-800",
  needs_review: "bg-orange-100 text-orange-800",
  approved: "bg-green-100 text-green-800",
  sent: "bg-indigo-100 text-indigo-800",
  won: "bg-emerald-100 text-emerald-800",
  lost: "bg-red-100 text-red-800",
  cancelled: "bg-ink-100 text-ink-600",
};

export default function ReportsPage() {
  const [report, setReport] = useState<ReportData | null>(null);
  const [period, setPeriod] = useState(30);
  const [loading, setLoading] = useState(true);

  function loadReport(days: number) {
    setLoading(true);
    fetch(`/api/v1/reports/summary?period_days=${days}`)
      .then((r) => r.json())
      .then((d) => {
        setReport(d);
        setLoading(false);
      });
  }

  useEffect(() => {
    loadReport(period);
  }, [period]);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-display text-2xl font-semibold text-ink-950">
          Reports
        </h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-ink-500">Period:</span>
          {[7, 30, 90, 365].map((d) => (
            <button
              key={d}
              onClick={() => setPeriod(d)}
              className={`rounded px-3 py-1 text-sm ${
                period === d
                  ? "bg-ink-950 text-white"
                  : "border border-ink-300 text-ink-600 hover:bg-ink-100"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {loading || !report ? (
        <p className="text-ink-500">Loading report...</p>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-8">
            <Card label="Total Claims" value={report.totals.claims.toString()} />
            <Card label="Total Denied" value={dollars(report.totals.denied_cents)} />
            <Card label="Recovered" value={dollars(report.totals.recovered_cents)} />
            <Card
              label="Recovery Rate"
              value={`${report.totals.recovery_rate}%`}
              highlight={report.totals.recovery_rate > 20}
            />
          </div>

          {/* Period stats */}
          <div className="rounded-lg border border-ink-200 bg-white p-5 mb-6">
            <h2 className="text-sm font-semibold text-ink-900 mb-3">
              Last {report.period_days} Days
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 text-sm">
              <div>
                <p className="text-ink-500">New Claims</p>
                <p className="text-lg font-semibold text-ink-900">{report.period.new_claims}</p>
              </div>
              <div>
                <p className="text-ink-500">Denied</p>
                <p className="text-lg font-semibold text-ink-900">{dollars(report.period.denied_cents)}</p>
              </div>
              <div>
                <p className="text-ink-500">Recovered</p>
                <p className="text-lg font-semibold text-ink-900">{dollars(report.period.recovered_cents)}</p>
              </div>
              <div>
                <p className="text-ink-500">New Appeals</p>
                <p className="text-lg font-semibold text-ink-900">{report.period.new_appeals}</p>
              </div>
            </div>
          </div>

          {/* Status distribution */}
          <div className="grid gap-6 md:grid-cols-2 mb-6">
            <div className="rounded-lg border border-ink-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-ink-900 mb-3">
                Status Distribution
              </h2>
              <div className="space-y-2">
                {Object.entries(report.status_distribution).map(([status, count]) => {
                  const pct = report.totals.claims > 0
                    ? Math.round((count / report.totals.claims) * 100)
                    : 0;
                  return (
                    <div key={status} className="flex items-center gap-3 text-sm">
                      <span
                        className={`rounded px-2 py-0.5 text-xs ${STATUS_COLORS[status] || "bg-ink-100 text-ink-600"}`}
                      >
                        {status.replace(/_/g, " ")}
                      </span>
                      <div className="flex-1 h-2 rounded-full bg-ink-100">
                        <div
                          className="h-2 rounded-full bg-indigo-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-12 text-right text-ink-600">{count} ({pct}%)</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Top denial codes */}
            <div className="rounded-lg border border-ink-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-ink-900 mb-3">
                Top Denial Codes
              </h2>
              <div className="space-y-2">
                {report.top_denial_codes.map(({ code, count }) => {
                  const pct = report.totals.claims > 0
                    ? Math.round((count / report.totals.claims) * 100)
                    : 0;
                  return (
                    <div key={code} className="flex items-center gap-3 text-sm">
                      <span className="font-mono text-xs text-ink-700 w-16">{code}</span>
                      <div className="flex-1 h-2 rounded-full bg-ink-100">
                        <div
                          className="h-2 rounded-full bg-amber-500"
                          style={{ width: `${Math.max(pct, 5)}%` }}
                        />
                      </div>
                      <span className="w-12 text-right text-ink-600">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Payer summary table */}
          <div className="rounded-lg border border-ink-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-ink-900 mb-3">
              Payer Summary
            </h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-500 border-b border-ink-200">
                  <th className="pb-2">Payer</th>
                  <th className="pb-2 text-right">Claims</th>
                  <th className="pb-2 text-right">Denied</th>
                  <th className="pb-2 text-right">Won</th>
                  <th className="pb-2 text-right">Win Rate</th>
                </tr>
              </thead>
              <tbody>
                {report.payer_summary.map((p) => (
                  <tr key={p.payer} className="border-b border-ink-100">
                    <td className="py-2 font-medium text-ink-900">{p.payer}</td>
                    <td className="py-2 text-right text-ink-600">{p.claims}</td>
                    <td className="py-2 text-right text-ink-600">{dollars(p.denied_cents)}</td>
                    <td className="py-2 text-right text-ink-600">{p.won}</td>
                    <td className="py-2 text-right">
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs ${
                          p.win_rate > 30
                            ? "bg-green-100 text-green-700"
                            : p.win_rate > 0
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-ink-100 text-ink-500"
                        }`}
                      >
                        {p.win_rate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-xs text-ink-400">
            Report generated at {new Date(report.generated_at).toLocaleString()}
          </p>
        </>
      )}
    </div>
  );
}

function Card({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg border border-ink-200 bg-white p-4">
      <p className="text-xs text-ink-500 mb-1">{label}</p>
      <p
        className={`text-xl font-semibold ${
          highlight ? "text-emerald-600" : "text-ink-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

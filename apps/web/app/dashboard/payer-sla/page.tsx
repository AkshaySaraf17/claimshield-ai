"use client";

import { useEffect, useState } from "react";

interface PayerSla {
  payer: string;
  total_claims: number;
  responded: number;
  avg_response_days: number | null;
  sla_target_days: number;
  within_sla: number;
  overdue: number;
  sla_compliance_rate: number | null;
}

function complianceBadge(rate: number | null) {
  if (rate === null) return "bg-ink-100 text-ink-500";
  if (rate >= 90) return "bg-green-100 text-green-700";
  if (rate >= 70) return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
}

export default function PayerSlaPage() {
  const [data, setData] = useState<PayerSla[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v1/analytics/payer-sla")
      .then((r) => r.json())
      .then((d) => {
        setData(Array.isArray(d) ? d : []);
        setLoading(false);
      });
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">Analytics</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">Payer SLA Tracker</h1>
        <p className="mt-1 text-sm text-ink-500">
          Response-time compliance by payer against their filing deadlines.
        </p>
      </header>

      {loading ? (
        <p className="text-ink-400">Loading SLA data...</p>
      ) : data.length === 0 ? (
        <p className="text-ink-400">No payer data available.</p>
      ) : (
        <div className="rounded-lg border border-ink-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-100 bg-ink-50/50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-ink-500">Payer</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-ink-500">Claims</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-ink-500">Responded</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-ink-500">Avg Days</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-ink-500">Target</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-ink-500">Within SLA</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-ink-500">Overdue</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-ink-500">Compliance</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.payer} className="border-t border-ink-50">
                  <td className="px-4 py-3 font-medium text-ink-800">{p.payer}</td>
                  <td className="px-4 py-3 text-right text-ink-600">{p.total_claims}</td>
                  <td className="px-4 py-3 text-right text-ink-600">{p.responded}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-ink-600">
                    {p.avg_response_days != null ? `${p.avg_response_days.toFixed(1)}d` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-ink-500">{p.sla_target_days}d</td>
                  <td className="px-4 py-3 text-right text-ink-600">{p.within_sla}</td>
                  <td className="px-4 py-3 text-right text-ink-600">{p.overdue}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs font-bold ${complianceBadge(p.sla_compliance_rate)}`}>
                      {p.sla_compliance_rate != null ? `${p.sla_compliance_rate.toFixed(0)}%` : "N/A"}
                    </span>
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

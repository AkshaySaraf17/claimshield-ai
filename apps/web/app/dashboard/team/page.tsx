"use client";

import { useEffect, useState } from "react";

interface TeamMember {
  user_id: string;
  name: string;
  claims_assigned: number;
  claims_won: number;
  claims_lost: number;
  claims_pending: number;
  win_rate: number | null;
  total_denied_cents: number;
  total_recovered_cents: number;
  appeals_drafted: number;
  audit_actions: number;
}

function dollars(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v1/analytics/team-performance")
      .then((r) => r.json())
      .then((d) => {
        setMembers(Array.isArray(d) ? d : []);
        setLoading(false);
      });
  }, []);

  const totalAssigned = members.reduce((s, m) => s + m.claims_assigned, 0);
  const totalWon = members.reduce((s, m) => s + m.claims_won, 0);
  const totalDenied = members.reduce((s, m) => s + m.total_denied_cents, 0);
  const totalRecovered = members.reduce((s, m) => s + m.total_recovered_cents, 0);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">
          Operations
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">
          Team Performance
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Per-member productivity and outcomes.
        </p>
      </header>

      {loading ? (
        <p className="text-ink-400">Loading team data...</p>
      ) : (
        <>
          {/* Summary row */}
          <div className="mb-6 grid grid-cols-4 gap-4">
            <div className="rounded-lg border border-ink-200 bg-white p-4">
              <p className="text-xs text-ink-500">Total Assigned</p>
              <p className="mt-1 text-2xl font-semibold text-ink-950">{totalAssigned}</p>
            </div>
            <div className="rounded-lg border border-ink-200 bg-white p-4">
              <p className="text-xs text-ink-500">Total Won</p>
              <p className="mt-1 text-2xl font-semibold text-emerald-600">{totalWon}</p>
            </div>
            <div className="rounded-lg border border-ink-200 bg-white p-4">
              <p className="text-xs text-ink-500">Total Denied</p>
              <p className="mt-1 text-2xl font-semibold text-red-600">{dollars(totalDenied)}</p>
            </div>
            <div className="rounded-lg border border-ink-200 bg-white p-4">
              <p className="text-xs text-ink-500">Total Recovered</p>
              <p className="mt-1 text-2xl font-semibold text-emerald-600">{dollars(totalRecovered)}</p>
            </div>
          </div>

          {/* Team table */}
          <div className="rounded-lg border border-ink-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-100 bg-ink-50/50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-ink-500">Member</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-ink-500">Assigned</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-ink-500">Won</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-ink-500">Lost</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-ink-500">Pending</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-ink-500">Win Rate</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-ink-500">Denied</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-ink-500">Recovered</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-ink-500">Appeals</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-ink-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.user_id} className="border-t border-ink-50 hover:bg-ink-50/30">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-ink-800">{m.name}</p>
                        <p className="text-[10px] text-ink-400 font-mono">{m.user_id}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center font-mono">{m.claims_assigned}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-semibold text-emerald-700">
                        {m.claims_won}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-700">
                        {m.claims_lost}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-ink-500">{m.claims_pending}</td>
                    <td className="px-4 py-3 text-center">
                      {m.win_rate !== null ? (
                        <span className={`font-semibold ${m.win_rate >= 0.5 ? "text-emerald-600" : "text-amber-600"}`}>
                          {Math.round(m.win_rate * 100)}%
                        </span>
                      ) : (
                        <span className="text-ink-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-ink-600">
                      {dollars(m.total_denied_cents)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-emerald-600">
                      {dollars(m.total_recovered_cents)}
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-ink-500">{m.appeals_drafted}</td>
                    <td className="px-4 py-3 text-center font-mono text-ink-500">{m.audit_actions}</td>
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

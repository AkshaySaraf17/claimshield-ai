"use client";

import { useEffect, useState } from "react";

interface TeamMember {
  user_id: string;
  name?: string;
  user_name?: string;
  claims_assigned: number;
  claims_won?: number;
  won?: number;
  claims_lost?: number;
  lost?: number;
  claims_pending?: number;
  pending?: number;
  win_rate: number | null;
  total_denied_cents?: number;
  total_recovered_cents?: number;
  recovered_cents?: number;
  appeals_drafted?: number;
  audit_actions?: number;
  actions?: number;
}

export default function TeamPerfPage() {
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

  const getName = (m: TeamMember) => m.name || m.user_name || m.user_id;
  const getWon = (m: TeamMember) => m.claims_won ?? m.won ?? 0;
  const getLost = (m: TeamMember) => m.claims_lost ?? m.lost ?? 0;
  const getPending = (m: TeamMember) => m.claims_pending ?? m.pending ?? 0;
  const getRecovered = (m: TeamMember) => m.total_recovered_cents ?? m.recovered_cents ?? 0;
  const getActions = (m: TeamMember) => m.audit_actions ?? m.actions ?? 0;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">Team</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">Team Performance</h1>
        <p className="mt-1 text-sm text-ink-500">
          Individual metrics — claims handled, win rates, and recovery amounts.
        </p>
      </header>

      {loading ? (
        <p className="text-ink-400">Loading team data...</p>
      ) : members.length === 0 ? (
        <p className="text-ink-400">No team data available.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {members.map((m) => (
            <div key={m.user_id} className="rounded-lg border border-ink-200 bg-white p-4">
              <h3 className="text-lg font-semibold text-ink-800">{getName(m)}</h3>
              <p className="text-xs text-ink-400 mb-3">{m.user_id}</p>

              <div className="grid grid-cols-3 gap-3 mb-3">
                <div>
                  <p className="text-xs text-ink-500">Assigned</p>
                  <p className="text-xl font-bold text-ink-900">{m.claims_assigned}</p>
                </div>
                <div>
                  <p className="text-xs text-ink-500">Win Rate</p>
                  <p className="text-xl font-bold text-ink-900">
                    {m.win_rate != null ? `${m.win_rate}%` : "N/A"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-ink-500">Actions</p>
                  <p className="text-xl font-bold text-ink-900">{getActions(m)}</p>
                </div>
              </div>

              <div className="flex gap-3 text-sm">
                <span className="text-green-700">Won: {getWon(m)}</span>
                <span className="text-red-700">Lost: {getLost(m)}</span>
                <span className="text-amber-700">Pending: {getPending(m)}</span>
              </div>

              {getRecovered(m) > 0 && (
                <p className="mt-2 text-sm text-green-700">
                  Recovered: ${(getRecovered(m) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

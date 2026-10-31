"use client";

import { useEffect, useState } from "react";

interface PayerProfile {
  payer: string;
  total_claims: number;
  won: number;
  lost: number;
  pending: number;
  win_rate: number | null;
  total_denied_cents: number;
  total_recovered_cents: number;
  avg_response_days: number | null;
  top_denial_codes: { code: string; count: number }[];
  contacts: { name: string | null; phone: string | null; email: string | null; department: string | null }[];
  deadline_days: number;
}

export default function PayerIntelPage() {
  const [payers, setPayers] = useState<PayerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/analytics/payer-intelligence")
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d) ? d : [];
        setPayers(list);
        if (list.length > 0) setSelected(list[0].payer);
        setLoading(false);
      });
  }, []);

  const active = payers.find((p) => p.payer === selected);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">Intelligence</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">Payer Profiles</h1>
        <p className="mt-1 text-sm text-ink-500">
          Detailed intelligence per payer — win rates, denial patterns, contacts.
        </p>
      </header>

      {loading ? (
        <p className="text-ink-400">Loading payer data...</p>
      ) : (
        <div className="grid grid-cols-4 gap-6">
          {/* Payer list */}
          <div className="col-span-1 space-y-1">
            {payers.map((p) => (
              <button
                key={p.payer}
                onClick={() => setSelected(p.payer)}
                className={`w-full text-left rounded px-3 py-2 text-sm transition-colors ${
                  selected === p.payer ? "bg-ink-950 text-white" : "text-ink-700 hover:bg-ink-100"
                }`}
              >
                {p.payer}
                <span className="ml-1 text-xs opacity-60">({p.total_claims})</span>
              </button>
            ))}
          </div>

          {/* Detail panel */}
          {active && (
            <div className="col-span-3 space-y-4">
              {/* Stats row */}
              <div className="grid grid-cols-4 gap-3">
                <div className="rounded-lg border border-ink-200 bg-white px-4 py-3">
                  <p className="text-xs text-ink-500">Win Rate</p>
                  <p className="mt-1 text-2xl font-bold text-ink-900">
                    {active.win_rate != null ? `${active.win_rate}%` : "N/A"}
                  </p>
                </div>
                <div className="rounded-lg border border-ink-200 bg-white px-4 py-3">
                  <p className="text-xs text-ink-500">Avg Response</p>
                  <p className="mt-1 text-2xl font-bold text-ink-900">
                    {active.avg_response_days != null ? `${active.avg_response_days}d` : "N/A"}
                  </p>
                </div>
                <div className="rounded-lg border border-ink-200 bg-white px-4 py-3">
                  <p className="text-xs text-ink-500">Total Denied</p>
                  <p className="mt-1 text-2xl font-bold text-ink-900">
                    ${(active.total_denied_cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0 })}
                  </p>
                </div>
                <div className="rounded-lg border border-ink-200 bg-white px-4 py-3">
                  <p className="text-xs text-ink-500">Filing Deadline</p>
                  <p className="mt-1 text-2xl font-bold text-ink-900">{active.deadline_days}d</p>
                </div>
              </div>

              {/* W/L/P */}
              <div className="rounded-lg border border-ink-200 bg-white px-4 py-3">
                <p className="mb-2 text-xs font-semibold text-ink-500">Outcomes</p>
                <div className="flex gap-4 text-sm">
                  <span className="text-green-700">Won: {active.won}</span>
                  <span className="text-red-700">Lost: {active.lost}</span>
                  <span className="text-amber-700">Pending: {active.pending}</span>
                </div>
              </div>

              {/* Top denial codes */}
              <div className="rounded-lg border border-ink-200 bg-white px-4 py-3">
                <p className="mb-2 text-xs font-semibold text-ink-500">Top Denial Codes</p>
                <div className="flex flex-wrap gap-2">
                  {active.top_denial_codes.map((c) => (
                    <span key={c.code} className="rounded bg-indigo-100 px-2 py-1 text-xs text-indigo-700">
                      {c.code} ({c.count})
                    </span>
                  ))}
                </div>
              </div>

              {/* Contacts */}
              {active.contacts.length > 0 && (
                <div className="rounded-lg border border-ink-200 bg-white px-4 py-3">
                  <p className="mb-2 text-xs font-semibold text-ink-500">Contacts</p>
                  <div className="space-y-2">
                    {active.contacts.map((c, i) => (
                      <div key={i} className="text-sm text-ink-700">
                        <span className="font-medium">{c.name || "—"}</span>
                        {c.department && <span className="ml-2 text-ink-400">({c.department})</span>}
                        {c.phone && <span className="ml-3 text-ink-500">{c.phone}</span>}
                        {c.email && <span className="ml-3 text-ink-500">{c.email}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

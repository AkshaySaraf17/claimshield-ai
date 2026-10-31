"use client";

import { useEffect, useState } from "react";

interface ClinicStat {
  clinic_id: string;
  clinic_name: string;
  npi: string | null;
  total_claims: number;
  total_denied_cents: number;
  total_recovered_cents: number;
  won: number;
  lost: number;
  pending: number;
  win_rate: number | null;
  top_denial_codes: { code: string; count: number }[];
}

function dollars(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

export default function ClinicsPage() {
  const [clinics, setClinics] = useState<ClinicStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/analytics/clinics")
      .then((r) => r.json())
      .then((d) => {
        setClinics(Array.isArray(d) ? d : []);
        setLoading(false);
      });
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">
          Analytics
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">
          Provider Analytics
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Denial and recovery performance by clinic/provider.
        </p>
      </header>

      {loading ? (
        <p className="text-ink-400">Loading clinic data...</p>
      ) : clinics.length === 0 ? (
        <div className="rounded-lg border border-ink-200 bg-white p-8 text-center">
          <p className="text-sm text-ink-400">No clinic data available.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {clinics.map((c) => {
            const isExpanded = expanded === c.clinic_id;
            const recoveryRate =
              c.total_denied_cents > 0
                ? Math.round((c.total_recovered_cents / c.total_denied_cents) * 100)
                : 0;

            return (
              <div
                key={c.clinic_id}
                className="rounded-lg border border-ink-200 bg-white overflow-hidden"
              >
                <button
                  onClick={() => setExpanded(isExpanded ? null : c.clinic_id)}
                  className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-ink-50/30"
                >
                  <div>
                    <p className="font-medium text-ink-800">{c.clinic_name}</p>
                    {c.npi && (
                      <p className="text-[10px] text-ink-400 font-mono">NPI: {c.npi}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <div className="text-right">
                      <p className="font-mono text-xs text-ink-500">{c.total_claims} claims</p>
                      <p className="font-mono text-xs text-red-600">{dollars(c.total_denied_cents)} denied</p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-xs text-emerald-600">{dollars(c.total_recovered_cents)} recovered</p>
                      <p className="text-[10px] text-ink-400">{recoveryRate}% recovery</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {c.win_rate !== null ? (
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-semibold ${
                            c.win_rate >= 0.5
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {Math.round(c.win_rate * 100)}% win
                        </span>
                      ) : (
                        <span className="text-xs text-ink-300">—</span>
                      )}
                      <span className="text-ink-300">{isExpanded ? "▲" : "▼"}</span>
                    </div>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-ink-100 px-5 py-4 bg-ink-50/20">
                    <div className="grid grid-cols-4 gap-4 mb-4">
                      <div>
                        <p className="text-[10px] text-ink-500">Won</p>
                        <p className="text-lg font-semibold text-emerald-600">{c.won}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-ink-500">Lost</p>
                        <p className="text-lg font-semibold text-red-600">{c.lost}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-ink-500">Pending</p>
                        <p className="text-lg font-semibold text-amber-600">{c.pending}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-ink-500">Total</p>
                        <p className="text-lg font-semibold text-ink-700">{c.total_claims}</p>
                      </div>
                    </div>
                    {c.top_denial_codes.length > 0 && (
                      <div>
                        <p className="text-[10px] text-ink-500 mb-2">Top Denial Codes</p>
                        <div className="flex flex-wrap gap-2">
                          {c.top_denial_codes.map((dc) => (
                            <span
                              key={dc.code}
                              className="rounded border border-ink-200 bg-white px-2 py-1 text-xs"
                            >
                              <span className="font-mono font-semibold text-ink-700">{dc.code}</span>
                              <span className="ml-1 text-ink-400">×{dc.count}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

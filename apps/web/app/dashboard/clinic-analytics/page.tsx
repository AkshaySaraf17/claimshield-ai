"use client";

import { useEffect, useState } from "react";

interface Clinic {
  clinic_id: string;
  clinic_name: string;
  npi: string;
  total_claims: number;
  total_denied_cents: number;
  total_recovered_cents: number;
  won: number;
  lost: number;
  pending: number;
  top_denial_codes: { code: string; count: number }[];
}

export default function ClinicAnalyticsPage() {
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v1/analytics/clinics")
      .then((r) => r.json())
      .then((d) => {
        setClinics(Array.isArray(d) ? d : []);
        setLoading(false);
      });
  }, []);

  const fmt = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">Analytics</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">Clinic Analytics</h1>
        <p className="mt-1 text-sm text-ink-500">Denial and recovery performance by clinic.</p>
      </header>

      {loading ? (
        <p className="text-ink-400">Loading clinic data...</p>
      ) : clinics.length === 0 ? (
        <p className="text-ink-400">No clinic data available.</p>
      ) : (
        <div className="space-y-4">
          {clinics.map((c) => (
            <div key={c.clinic_id} className="rounded-lg border border-ink-200 bg-white p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-lg font-bold text-ink-900">{c.clinic_name}</h3>
                  <p className="text-xs text-ink-400">NPI: {c.npi}</p>
                </div>
                <span className="text-sm text-ink-500">{c.total_claims} claims</span>
              </div>
              <div className="grid grid-cols-4 gap-3 text-center text-sm mb-3">
                <div>
                  <p className="text-xs text-ink-500">Denied</p>
                  <p className="font-mono font-bold text-red-700">{fmt(c.total_denied_cents)}</p>
                </div>
                <div>
                  <p className="text-xs text-ink-500">Recovered</p>
                  <p className="font-mono font-bold text-green-700">{fmt(c.total_recovered_cents)}</p>
                </div>
                <div>
                  <p className="text-xs text-ink-500">Won</p>
                  <p className="font-bold text-green-700">{c.won}</p>
                </div>
                <div>
                  <p className="text-xs text-ink-500">Lost</p>
                  <p className="font-bold text-red-600">{c.lost}</p>
                </div>
              </div>
              {c.top_denial_codes.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {c.top_denial_codes.map((dc) => (
                    <span key={dc.code} className="rounded bg-red-50 px-2 py-0.5 text-xs text-red-600">{dc.code} ({dc.count})</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

interface PipelineClaim {
  id: string;
  claim_number: string;
  payer: string;
  denial_code: string;
  amount_cents: number;
  days_old: number;
}

interface PipelineStage {
  name: string;
  label: string;
  count: number;
  total_cents: number;
  claims: PipelineClaim[];
}

const STAGE_COLORS: Record<string, string> = {
  pending_review: "border-l-amber-500",
  in_progress: "border-l-blue-500",
  needs_review: "border-l-purple-500",
  approved: "border-l-green-500",
  sent: "border-l-indigo-500",
  won: "border-l-emerald-500",
  lost: "border-l-red-500",
  cancelled: "border-l-ink-400",
};

export default function PipelineAnalyticsPage() {
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/analytics/pipeline")
      .then((r) => r.json())
      .then((d) => {
        setStages(d.stages || []);
        setLoading(false);
      });
  }, []);

  const fmt = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  const total = stages.reduce((s, st) => s + st.count, 0);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">Pipeline</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">Pipeline Analytics</h1>
        <p className="mt-1 text-sm text-ink-500">Claims by stage with drill-down into each step.</p>
      </header>

      {loading ? (
        <p className="text-ink-400">Loading pipeline data...</p>
      ) : stages.length === 0 ? (
        <p className="text-ink-400">No pipeline data available.</p>
      ) : (
        <div className="space-y-3">
          {stages.filter((s) => s.count > 0).map((stage) => {
            const pct = total > 0 ? (stage.count / total) * 100 : 0;
            const isOpen = expanded === stage.name;
            return (
              <div key={stage.name}>
                <button
                  onClick={() => setExpanded(isOpen ? null : stage.name)}
                  className={`w-full rounded-lg border border-ink-200 border-l-4 ${STAGE_COLORS[stage.name] || "border-l-ink-300"} bg-white px-4 py-3 text-left hover:bg-ink-50 transition-colors`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-semibold text-ink-800">{stage.label}</span>
                      <span className="ml-2 text-xs text-ink-400">({Math.round(pct)}%)</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-bold text-ink-900">{stage.count} claims</span>
                      <span className="text-sm font-mono text-ink-600">{fmt(stage.total_cents)}</span>
                      <span className="text-ink-400">{isOpen ? "▲" : "▼"}</span>
                    </div>
                  </div>
                  <div className="mt-2 h-2 w-full rounded bg-ink-100 overflow-hidden">
                    <div className="h-full rounded bg-indigo-500" style={{ width: `${pct}%` }} />
                  </div>
                </button>
                {isOpen && stage.claims.length > 0 && (
                  <div className="ml-4 mt-1 space-y-1">
                    {stage.claims.map((c) => (
                      <div key={c.id} className="flex items-center justify-between rounded border border-ink-100 bg-white px-3 py-2 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-ink-800">{c.claim_number}</span>
                          <span className="text-xs text-ink-400">{c.denial_code}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-ink-500">
                          <span>{c.payer}</span>
                          <span className="font-mono">{fmt(c.amount_cents)}</span>
                          <span>{c.days_old}d old</span>
                        </div>
                      </div>
                    ))}
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

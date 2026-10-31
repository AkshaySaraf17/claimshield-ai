"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface PipelineClaim {
  id: string;
  claim_number: string | null;
  payer: string | null;
  denial_code: string | null;
  amount_cents: number;
  days_old: number;
}

interface Stage {
  name: string;
  label: string;
  count: number;
  total_cents: number;
  claims: PipelineClaim[];
}

const STAGE_COLORS: Record<string, string> = {
  pending_review: "border-amber-300 bg-amber-50",
  in_progress: "border-blue-300 bg-blue-50",
  needs_review: "border-orange-300 bg-orange-50",
  approved: "border-green-300 bg-green-50",
  sent: "border-indigo-300 bg-indigo-50",
  won: "border-emerald-300 bg-emerald-50",
  lost: "border-red-300 bg-red-50",
  cancelled: "border-gray-300 bg-gray-50",
};

function dollars(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

export default function PipelinePage() {
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v1/analytics/pipeline")
      .then((r) => r.json())
      .then((d) => {
        setStages(d.stages || []);
        setLoading(false);
      });
  }, []);

  const activeStages = stages.filter((s) => s.count > 0);

  return (
    <div className="mx-auto max-w-full px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">Workflow</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">
          Claim Pipeline
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Claims grouped by workflow stage. Click a claim to view details.
        </p>
      </header>

      {loading ? (
        <p className="text-ink-400">Loading pipeline...</p>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {activeStages.map((stage) => (
            <div
              key={stage.name}
              className={`flex-shrink-0 w-64 rounded-lg border-2 ${STAGE_COLORS[stage.name] || "border-ink-200 bg-white"}`}
            >
              <div className="px-3 py-2 border-b border-ink-200/50">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-ink-900">{stage.label}</h3>
                  <span className="rounded-full bg-ink-200 px-2 py-0.5 text-xs font-medium text-ink-700">
                    {stage.count}
                  </span>
                </div>
                <p className="text-xs text-ink-500 font-mono">{dollars(stage.total_cents)}</p>
              </div>
              <div className="p-2 space-y-2 max-h-96 overflow-y-auto">
                {stage.claims.map((c) => (
                  <Link
                    key={c.id}
                    href={`/dashboard/claims/${c.id}`}
                    className="block rounded border border-ink-200/50 bg-white px-3 py-2 text-sm shadow-sm hover:shadow transition-shadow"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-medium text-ink-800">
                        {c.claim_number || c.id.slice(0, 8)}
                      </span>
                      <span className="font-mono text-xs text-ink-600">{dollars(c.amount_cents)}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-ink-500 truncate">{c.payer}</p>
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-ink-400">
                      {c.denial_code && <span className="font-mono">{c.denial_code}</span>}
                      <span>{c.days_old}d old</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

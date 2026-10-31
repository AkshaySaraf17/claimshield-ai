"use client";

import { useEffect, useState } from "react";

interface RulesConfig {
  transitions: Record<string, string[]>;
  denial_code_mappings: { denial_code: string; category: string }[];
  pipeline_stages: { name: string; label: string }[];
  appeal_template_categories: string[];
}

const STAGE_COLORS: Record<string, string> = {
  pending_review: "bg-amber-100 text-amber-800 border-amber-300",
  in_progress: "bg-blue-100 text-blue-800 border-blue-300",
  needs_review: "bg-orange-100 text-orange-800 border-orange-300",
  approved: "bg-green-100 text-green-800 border-green-300",
  sent: "bg-indigo-100 text-indigo-800 border-indigo-300",
  won: "bg-emerald-100 text-emerald-800 border-emerald-300",
  lost: "bg-red-100 text-red-800 border-red-300",
  cancelled: "bg-gray-100 text-gray-600 border-gray-300",
};

export default function RulesPage() {
  const [config, setConfig] = useState<RulesConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v1/rules/config")
      .then((r) => r.json())
      .then((d) => {
        setConfig(d);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10">
        <p className="text-ink-400">Loading rules configuration...</p>
      </div>
    );
  }

  if (!config) return null;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">
          Configuration
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">
          Rules Engine
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Deterministic rules governing claim workflow, denial categorization,
          and appeal templates. Every rule has a regulatory source.
        </p>
      </header>

      {/* Status Transitions */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-600">
          Status Transition Rules
        </h2>
        <div className="rounded-lg border border-ink-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50">
                <th className="px-4 py-2 text-left text-xs font-medium text-ink-600">
                  From Status
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-ink-600">
                  Allowed Transitions
                </th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(config.transitions).map(([from, targets]) => (
                <tr key={from} className="border-b border-ink-100 last:border-0">
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${
                        STAGE_COLORS[from] || "bg-ink-100 text-ink-600 border-ink-300"
                      }`}
                    >
                      {from.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    {targets.length === 0 ? (
                      <span className="text-xs text-ink-400 italic">
                        Terminal state
                      </span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {targets.map((t) => (
                          <span key={t} className="flex items-center gap-1">
                            <span className="text-ink-400">→</span>
                            <span
                              className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${
                                STAGE_COLORS[t] || "bg-ink-100 text-ink-600 border-ink-300"
                              }`}
                            >
                              {t.replace(/_/g, " ")}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Denial Code Mappings */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-600">
          Denial Code → Category Mapping
        </h2>
        <div className="rounded-lg border border-ink-200 bg-white p-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {config.denial_code_mappings.map((m) => (
              <div
                key={m.denial_code}
                className="flex items-center gap-2 rounded border border-ink-200 px-3 py-2"
              >
                <span className="font-mono text-xs font-semibold text-ink-800">
                  {m.denial_code}
                </span>
                <span className="text-xs text-ink-500">→</span>
                <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] text-indigo-700">
                  {m.category}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pipeline Stages */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-600">
          Pipeline Stages
        </h2>
        <div className="flex flex-wrap gap-2">
          {config.pipeline_stages.map((s, i) => (
            <div key={s.name} className="flex items-center gap-1">
              {i > 0 && <span className="text-ink-300">→</span>}
              <span
                className={`rounded border px-2.5 py-1 text-xs font-medium ${
                  STAGE_COLORS[s.name] || "bg-ink-100 text-ink-600 border-ink-300"
                }`}
              >
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Appeal Template Categories */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-600">
          Appeal Template Categories
        </h2>
        <div className="flex flex-wrap gap-2">
          {config.appeal_template_categories.map((cat) => (
            <span
              key={cat}
              className="rounded border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700"
            >
              {cat}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}

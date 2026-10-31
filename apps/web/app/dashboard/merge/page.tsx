"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface DupGroup {
  key: string;
  count: number;
  claims: {
    id: string;
    claim_number: string | null;
    payer_name: string | null;
    denial_code: string | null;
    amount_denied_cents: number | null;
    status: string;
    created_at: string;
  }[];
}

function dollars(cents: number | null) {
  if (cents == null) return "—";
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

export default function MergePage() {
  const [groups, setGroups] = useState<DupGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});
  const [primary, setPrimary] = useState<Record<string, string>>({});
  const [merging, setMerging] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { merged: number }>>({});

  useEffect(() => {
    fetch("/api/v1/claims/duplicates")
      .then((r) => r.json())
      .then((d) => {
        setGroups(d.groups || []);
        setLoading(false);
      });
  }, []);

  function toggleSelect(groupKey: string, claimId: string) {
    setSelected((prev) => {
      const s = new Set(prev[groupKey] || []);
      if (s.has(claimId)) s.delete(claimId);
      else s.add(claimId);
      return { ...prev, [groupKey]: s };
    });
  }

  function setPrimaryFor(groupKey: string, claimId: string) {
    setPrimary((prev) => ({ ...prev, [groupKey]: claimId }));
    setSelected((prev) => {
      const s = new Set(prev[groupKey] || []);
      s.delete(claimId);
      return { ...prev, [groupKey]: s };
    });
  }

  async function doMerge(groupKey: string) {
    const p = primary[groupKey];
    const secs = Array.from(selected[groupKey] || []);
    if (!p || secs.length === 0) return;

    setMerging(groupKey);
    const resp = await fetch("/api/v1/claims/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        primary_claim_id: p,
        secondary_claim_ids: secs,
      }),
    });
    const data = await resp.json();
    setResults((prev) => ({ ...prev, [groupKey]: { merged: data.merged_count || 0 } }));
    setMerging(null);
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">
          Data Quality
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">
          Claim Merge Tool
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Select a primary claim and secondary duplicates to merge. Secondary
          claims are cancelled and their notes/clinical data are absorbed into the
          primary.
        </p>
      </header>

      {loading ? (
        <p className="text-ink-400">Loading duplicate groups...</p>
      ) : groups.length === 0 ? (
        <div className="rounded-lg border border-green-200 bg-green-50 p-8 text-center">
          <p className="text-sm text-green-700">
            No duplicate groups found. Claims are clean.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => {
            const gPrimary = primary[g.key];
            const gSelected = selected[g.key] || new Set();
            const merged = results[g.key];

            return (
              <div
                key={g.key}
                className="rounded-lg border border-ink-200 bg-white p-4"
              >
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-ink-800">
                      {g.key}
                    </p>
                    <p className="text-xs text-ink-400">
                      {g.count} potential duplicates
                    </p>
                  </div>
                  {merged ? (
                    <span className="rounded bg-green-100 px-2 py-1 text-xs text-green-700">
                      Merged {merged.merged} claim(s)
                    </span>
                  ) : (
                    <button
                      onClick={() => doMerge(g.key)}
                      disabled={
                        !gPrimary || gSelected.size === 0 || merging === g.key
                      }
                      className="rounded bg-ink-900 px-3 py-1.5 text-xs text-white hover:bg-ink-800 disabled:opacity-40"
                    >
                      {merging === g.key ? "Merging..." : "Merge Selected"}
                    </button>
                  )}
                </div>

                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink-100 text-xs text-ink-500">
                      <th className="px-2 py-1 text-left">Role</th>
                      <th className="px-2 py-1 text-left">Claim</th>
                      <th className="px-2 py-1 text-left">Status</th>
                      <th className="px-2 py-1 text-right">Amount</th>
                      <th className="px-2 py-1 text-left">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.claims.map((c) => {
                      const isPrimary = gPrimary === c.id;
                      const isSecondary = gSelected.has(c.id);
                      return (
                        <tr
                          key={c.id}
                          className={`border-b border-ink-50 ${
                            isPrimary
                              ? "bg-indigo-50/50"
                              : isSecondary
                              ? "bg-red-50/30"
                              : ""
                          }`}
                        >
                          <td className="px-2 py-2">
                            <div className="flex gap-1">
                              <button
                                onClick={() => setPrimaryFor(g.key, c.id)}
                                className={`rounded px-1.5 py-0.5 text-[10px] ${
                                  isPrimary
                                    ? "bg-indigo-600 text-white"
                                    : "border border-ink-300 text-ink-500 hover:bg-ink-50"
                                }`}
                              >
                                Primary
                              </button>
                              {!isPrimary && (
                                <button
                                  onClick={() => toggleSelect(g.key, c.id)}
                                  className={`rounded px-1.5 py-0.5 text-[10px] ${
                                    isSecondary
                                      ? "bg-red-500 text-white"
                                      : "border border-ink-300 text-ink-500 hover:bg-ink-50"
                                  }`}
                                >
                                  Merge
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="px-2 py-2">
                            <Link
                              href={`/dashboard/claims/${c.id}`}
                              className="font-mono text-xs text-indigo-600 hover:underline"
                            >
                              {c.claim_number || c.id.slice(0, 8)}
                            </Link>
                          </td>
                          <td className="px-2 py-2 text-xs text-ink-500">
                            {c.status.replace(/_/g, " ")}
                          </td>
                          <td className="px-2 py-2 text-right font-mono text-xs text-ink-600">
                            {dollars(c.amount_denied_cents)}
                          </td>
                          <td className="px-2 py-2 text-xs text-ink-400">
                            {new Date(c.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

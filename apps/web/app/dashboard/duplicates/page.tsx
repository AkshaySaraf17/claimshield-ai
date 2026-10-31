"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface DupClaim {
  id: string;
  claim_number: string | null;
  payer_name: string | null;
  denial_code: string | null;
  amount_denied_cents: number | null;
  status: string;
  created_at: string;
}

interface DupGroup {
  payer_name: string;
  denial_code: string;
  amount_denied_cents: number;
  count: number;
  claims: DupClaim[];
}

function dollars(cents: number | null) {
  if (cents == null) return "—";
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

const STATUS_COLORS: Record<string, string> = {
  pending_review: "bg-amber-100 text-amber-800",
  in_progress: "bg-blue-100 text-blue-800",
  needs_review: "bg-orange-100 text-orange-800",
  approved: "bg-green-100 text-green-800",
  sent: "bg-indigo-100 text-indigo-800",
  won: "bg-emerald-100 text-emerald-800",
  lost: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-600",
};

export default function DuplicatesPage() {
  const [groups, setGroups] = useState<DupGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/claims/duplicates")
      .then((r) => r.json())
      .then((d) => {
        setGroups(d.groups || []);
        setLoading(false);
      });
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">
          Data Quality
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">
          Duplicate Detection
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Claims grouped by matching payer, denial code, and amount.
          Review potential duplicates and take action.
        </p>
      </header>

      {loading ? (
        <p className="text-ink-400">Scanning for duplicates...</p>
      ) : groups.length === 0 ? (
        <div className="rounded-lg border border-green-200 bg-green-50 p-8 text-center">
          <p className="text-sm text-green-700">
            No duplicate groups found. All claims appear unique.
          </p>
        </div>
      ) : (
        <>
          <p className="mb-4 text-sm text-ink-500">
            Found {groups.length} potential duplicate group
            {groups.length !== 1 ? "s" : ""}
          </p>

          <div className="space-y-3">
            {groups.map((g, idx) => {
              const key = `${g.payer_name}|${g.denial_code}|${g.amount_denied_cents}`;
              const isExpanded = expanded === key;
              return (
                <div
                  key={idx}
                  className="rounded-lg border border-red-200 bg-white"
                >
                  <button
                    onClick={() => setExpanded(isExpanded ? null : key)}
                    className="w-full px-4 py-3 flex items-center justify-between text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                        {g.count} matches
                      </span>
                      <span className="text-sm font-medium text-ink-900">
                        {g.payer_name || "Unknown Payer"}
                      </span>
                      <span className="font-mono text-xs text-ink-500">
                        {g.denial_code}
                      </span>
                      <span className="font-mono text-xs text-ink-600">
                        {dollars(g.amount_denied_cents)}
                      </span>
                    </div>
                    <span className="text-ink-400 text-sm">
                      {isExpanded ? "▲" : "▼"}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-red-100 px-4 py-3">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-ink-500">
                            <th className="pb-1 text-left">Claim #</th>
                            <th className="pb-1 text-left">Status</th>
                            <th className="pb-1 text-right">Amount</th>
                            <th className="pb-1 text-left">Created</th>
                            <th className="pb-1 text-right"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.claims.map((c) => (
                            <tr key={c.id} className="border-t border-ink-100">
                              <td className="py-1.5">
                                <Link
                                  href={`/dashboard/claims/${c.id}`}
                                  className="font-mono text-xs text-indigo-600 hover:underline"
                                >
                                  {c.claim_number || c.id.slice(0, 8)}
                                </Link>
                              </td>
                              <td className="py-1.5">
                                <span
                                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                    STATUS_COLORS[c.status] ||
                                    "bg-ink-100 text-ink-600"
                                  }`}
                                >
                                  {c.status.replace(/_/g, " ")}
                                </span>
                              </td>
                              <td className="py-1.5 text-right font-mono text-xs">
                                {dollars(c.amount_denied_cents)}
                              </td>
                              <td className="py-1.5 text-xs text-ink-500">
                                {new Date(c.created_at).toLocaleDateString()}
                              </td>
                              <td className="py-1.5 text-right">
                                <Link
                                  href={`/dashboard/claims/${c.id}`}
                                  className="rounded border border-ink-300/40 px-2 py-0.5 text-[10px] text-ink-600 hover:bg-ink-50"
                                >
                                  View
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

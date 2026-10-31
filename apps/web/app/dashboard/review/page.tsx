"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface Appeal {
  id: string;
  claim_id: string;
  version: number;
  letter_text: string | null;
  confidence: number | null;
  needs_review: boolean;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
}

interface Claim {
  id: string;
  claim_number: string | null;
  payer_name: string | null;
  denial_code: string | null;
  amount_denied_cents: number | null;
  status: string;
}

export default function ReviewQueuePage() {
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [claimMap, setClaimMap] = useState<Record<string, Claim>>({});
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/appeals?needs_review=true&limit=50");
      if (!res.ok) throw new Error("Failed to load appeals");
      const data: Appeal[] = await res.json();
      setAppeals(data);

      const claimIds = [...new Set(data.map((a) => a.claim_id))];
      const claims: Record<string, Claim> = {};
      await Promise.all(
        claimIds.map(async (id) => {
          const r = await fetch(`/api/v1/claims/${id}`);
          if (r.ok) claims[id] = await r.json();
        })
      );
      setClaimMap(claims);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleApprove(appealId: string) {
    setApprovingId(appealId);
    try {
      const res = await fetch(`/api/v1/appeals/${appealId}/approve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved_by: "dev-biller" }),
      });
      if (res.ok) await fetchData();
    } finally {
      setApprovingId(null);
    }
  }

  const dollars = (cents: number | null) =>
    cents !== null ? `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—";

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">
          Queue
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">
          Review Queue
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          {appeals.length} appeal{appeals.length !== 1 ? "s" : ""} pending review
        </p>
      </header>

      {loading ? (
        <p className="text-ink-500">Loading...</p>
      ) : appeals.length === 0 ? (
        <div className="rounded-lg border border-ink-200 bg-white p-10 text-center">
          <p className="text-ink-500">No appeals pending review</p>
          <Link href="/dashboard/appeals" className="mt-2 inline-block text-sm text-indigo-600 hover:text-indigo-800">
            View all appeals
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {appeals.map((appeal) => {
            const claim = claimMap[appeal.claim_id];
            return (
              <div key={appeal.id} className="rounded-lg border border-ink-200 bg-white">
                <div className="flex items-center justify-between px-5 py-4">
                  <div className="flex items-center gap-4">
                    <div>
                      <Link
                        href={`/dashboard/claims/${appeal.claim_id}`}
                        className="text-sm font-medium text-ink-900 hover:text-indigo-600"
                      >
                        {claim?.claim_number || appeal.claim_id.slice(0, 8)}
                      </Link>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-ink-500">
                          {claim?.payer_name || "Unknown payer"}
                        </span>
                        {claim?.denial_code && (
                          <span className="rounded border border-ink-300/40 px-1.5 py-0.5 font-mono text-xs text-ink-600">
                            {claim.denial_code}
                          </span>
                        )}
                        <span className="text-xs text-ink-500">
                          {dollars(claim?.amount_denied_cents ?? null)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-ink-400">v{appeal.version}</span>
                    {appeal.confidence !== null && (
                      <span className={`rounded border px-1.5 py-0.5 font-mono text-xs ${
                        appeal.confidence >= 0.8
                          ? "border-green-300 bg-green-50 text-green-700"
                          : appeal.confidence >= 0.5
                          ? "border-amber-300 bg-amber-50 text-amber-700"
                          : "border-red-300 bg-red-50 text-red-700"
                      }`}>
                        {Math.round(appeal.confidence * 100)}%
                      </span>
                    )}
                    <button
                      onClick={() => setExpandedId(expandedId === appeal.id ? null : appeal.id)}
                      className="rounded border border-ink-300/50 px-2 py-1 text-xs text-ink-600 hover:bg-ink-100"
                    >
                      {expandedId === appeal.id ? "Hide" : "Preview"}
                    </button>
                    <button
                      onClick={() => handleApprove(appeal.id)}
                      disabled={approvingId === appeal.id}
                      className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      {approvingId === appeal.id ? "Approving..." : "Approve"}
                    </button>
                  </div>
                </div>
                {expandedId === appeal.id && appeal.letter_text && (
                  <div className="border-t border-ink-200 bg-parchment/20 p-5">
                    <pre className="whitespace-pre-wrap font-mono text-xs text-ink-700 max-h-64 overflow-y-auto">
                      {appeal.letter_text}
                    </pre>
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

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

export default function AppealsListPage() {
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchAppeals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (filter === "pending") params.set("needs_review", "true");
      if (filter === "approved") params.set("needs_review", "false");
      const res = await fetch(`/api/v1/appeals?${params}`);
      if (!res.ok) throw new Error(`${res.status}`);
      setAppeals(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load appeals");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchAppeals();
  }, [fetchAppeals]);

  async function handleApprove(appealId: string) {
    setActionLoading(appealId);
    try {
      const res = await fetch(`/api/v1/appeals/${appealId}/approve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved_by: "dev-biller" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Approval failed");
      }
      await fetchAppeals();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSend(appealId: string) {
    setActionLoading(appealId);
    try {
      const res = await fetch(`/api/v1/appeals/${appealId}/send`, {
        method: "PATCH",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Send failed");
      }
      await fetchAppeals();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">
          Casework &middot; All Appeals
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">Appeals</h1>
      </header>

      <div className="mb-4 flex items-center gap-3">
        <label className="text-sm text-ink-600">
          Filter:
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="ml-2 rounded border border-ink-300/50 px-2 py-1 text-sm"
          >
            <option value="all">All</option>
            <option value="pending">Pending review</option>
            <option value="approved">Approved</option>
          </select>
        </label>
        <button
          onClick={fetchAppeals}
          className="rounded border border-ink-300/50 px-3 py-1 text-sm text-ink-600 hover:bg-ink-100"
        >
          Refresh
        </button>
      </div>

      {error && (
        <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      <div className="space-y-2">
        {loading ? (
          <div className="py-8 text-center text-ink-400">Loading appeals...</div>
        ) : appeals.length === 0 ? (
          <div className="py-8 text-center text-ink-400">No appeals found.</div>
        ) : (
          appeals.map((appeal) => (
            <div key={appeal.id} className="rounded border border-ink-300/30 bg-white">
              <div className="flex items-center justify-between px-4 py-3">
                <button
                  onClick={() =>
                    setExpandedId(expandedId === appeal.id ? null : appeal.id)
                  }
                  className="flex flex-1 items-center gap-3 text-left text-sm hover:text-ink-700"
                >
                  <span className="font-mono text-xs text-ink-400">
                    v{appeal.version}
                  </span>
                  <Link
                    href={`/dashboard/claims/${appeal.claim_id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="font-mono text-xs text-blue-600 hover:underline"
                  >
                    claim/{appeal.claim_id.slice(0, 8)}
                  </Link>
                  {appeal.confidence !== null && (
                    <span
                      className={`rounded border px-1.5 py-0.5 font-mono text-xs ${
                        appeal.confidence >= 0.8
                          ? "border-green-300 bg-green-50 text-green-700"
                          : appeal.confidence >= 0.5
                          ? "border-amber-300 bg-amber-50 text-amber-700"
                          : "border-red-300 bg-red-50 text-red-700"
                      }`}
                    >
                      {Math.round(appeal.confidence * 100)}%
                    </span>
                  )}
                  {appeal.needs_review ? (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">
                      Pending review
                    </span>
                  ) : (
                    <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">
                      Approved by {appeal.approved_by}
                    </span>
                  )}
                  <span className="ml-auto text-xs text-ink-400">
                    {new Date(appeal.created_at).toLocaleString()}
                  </span>
                </button>

                <div className="ml-3 flex items-center gap-2">
                  {appeal.needs_review && (
                    <button
                      onClick={() => handleApprove(appeal.id)}
                      disabled={actionLoading === appeal.id}
                      className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      {actionLoading === appeal.id ? "..." : "Approve"}
                    </button>
                  )}
                  {!appeal.needs_review && (
                    <button
                      onClick={() => handleSend(appeal.id)}
                      disabled={actionLoading === appeal.id}
                      className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {actionLoading === appeal.id ? "..." : "Send"}
                    </button>
                  )}
                </div>
              </div>

              {expandedId === appeal.id && appeal.letter_text && (
                <div className="border-t border-ink-300/20 bg-parchment/20 p-4">
                  <pre className="whitespace-pre-wrap font-mono text-xs text-ink-700">
                    {appeal.letter_text}
                  </pre>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </main>
  );
}

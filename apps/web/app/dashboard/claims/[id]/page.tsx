"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { authFetch } from "../../../lib/auth";

interface Claim {
  id: string;
  claim_number: string | null;
  payer_name: string | null;
  denial_code: string | null;
  denial_reason: string | null;
  raw_denial_text: string;
  raw_clinical_notes: string;
  amount_denied_cents: number | null;
  status: string;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
}

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

const STATUS_COLORS: Record<string, string> = {
  pending_review: "bg-amber-100 text-amber-800",
  in_progress: "bg-blue-100 text-blue-800",
  needs_review: "bg-orange-100 text-orange-800",
  approved: "bg-green-100 text-green-800",
  sent: "bg-indigo-100 text-indigo-800",
  won: "bg-emerald-100 text-emerald-800",
  lost: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-800",
};

export default function ClaimDetailPage() {
  const params = useParams();
  const router = useRouter();
  const claimId = params.id as string;

  const [claim, setClaim] = useState<Claim | null>(null);
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedAppeal, setExpandedAppeal] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [claimRes, appealsRes] = await Promise.all([
        fetch(`/api/v1/claims/${claimId}`),
        fetch(`/api/v1/appeals?claim_id=${claimId}`),
      ]);
      if (!claimRes.ok) throw new Error(`Claim not found: ${claimRes.status}`);
      setClaim(await claimRes.json());
      if (appealsRes.ok) setAppeals(await appealsRes.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load claim");
    } finally {
      setLoading(false);
    }
  }, [claimId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const centsToDisplay = (cents: number | null) =>
    cents !== null ? `$${(cents / 100).toFixed(2)}` : "Unknown";

  if (loading) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="py-8 text-center text-ink-400">Loading claim...</div>
      </main>
    );
  }

  if (error || !claim) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <p className="rounded bg-red-50 p-4 text-sm text-red-700">{error || "Claim not found"}</p>
        <Link href="/dashboard/claims" className="mt-4 inline-block text-sm text-ink-500 hover:text-ink-700">
          Back to claims
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <Link href="/dashboard/claims" className="text-sm text-ink-500 hover:text-ink-700">
        Back to claims
      </Link>

      <header className="mt-4 mb-6">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-2xl font-semibold text-ink-950">
            {claim.claim_number || `Claim ${claim.id.slice(0, 8)}`}
          </h1>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[claim.status] || "bg-gray-100 text-gray-800"}`}>
            {claim.status.replace(/_/g, " ")}
          </span>
        </div>
      </header>

      {/* Claim details */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded border border-ink-300/40 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">Denial details</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-500">Payer</dt>
              <dd className="font-medium text-ink-900">{claim.payer_name || "Unknown"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-500">Denial code</dt>
              <dd><span className="rounded border border-ink-300/40 px-1.5 py-0.5 font-mono text-xs">{claim.denial_code || "N/A"}</span></dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-500">Amount denied</dt>
              <dd className="font-mono font-medium text-ink-900">{centsToDisplay(claim.amount_denied_cents)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-500">Created</dt>
              <dd className="text-ink-600">{new Date(claim.created_at).toLocaleString()}</dd>
            </div>
          </dl>
          {claim.denial_reason && (
            <div className="mt-3 border-t border-ink-300/20 pt-3">
              <p className="text-xs font-semibold text-ink-500">Reason</p>
              <p className="mt-1 text-sm text-ink-700">{claim.denial_reason}</p>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded border border-ink-300/40 bg-white p-5">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-500">Denial text</h2>
            <p className="whitespace-pre-wrap text-xs text-ink-700">{claim.raw_denial_text}</p>
          </div>
          <div className="rounded border border-ink-300/40 bg-white p-5">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-500">Clinical notes</h2>
            <p className="whitespace-pre-wrap text-xs text-ink-700">{claim.raw_clinical_notes}</p>
          </div>
        </div>
      </div>

      {/* Appeals */}
      <div className="mt-8">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-500">
          Appeal drafts ({appeals.length})
        </h2>
        {appeals.length === 0 ? (
          <p className="rounded border border-ink-300/30 bg-parchment/30 px-4 py-6 text-center text-sm text-ink-400">
            No appeals yet. Use the Appeal Workbench to generate one.
          </p>
        ) : (
          <div className="space-y-3">
            {appeals.map((appeal) => (
              <div key={appeal.id} className="rounded border border-ink-300/30 bg-white">
                <button
                  onClick={() => setExpandedAppeal(expandedAppeal === appeal.id ? null : appeal.id)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-parchment/30"
                >
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
                        {Math.round(appeal.confidence * 100)}% confidence
                      </span>
                    )}
                    {appeal.needs_review ? (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">Pending review</span>
                    ) : (
                      <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">
                        Approved by {appeal.approved_by}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-ink-400">
                    {new Date(appeal.created_at).toLocaleString()}
                    <span className="ml-2">{expandedAppeal === appeal.id ? "−" : "+"}</span>
                  </span>
                </button>
                {expandedAppeal === appeal.id && appeal.letter_text && (
                  <div className="border-t border-ink-300/20 bg-parchment/20 p-4">
                    <pre className="whitespace-pre-wrap font-mono text-xs text-ink-700">
                      {appeal.letter_text}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

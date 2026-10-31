"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface PreviewData {
  appeal_id: string;
  claim_id: string;
  claim_number: string | null;
  payer_name: string | null;
  denial_code: string | null;
  denial_reason: string | null;
  amount_denied_cents: number | null;
  letter_body: string | null;
  template_used: string | null;
  needs_review: boolean;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
}

function dollars(cents: number | null) {
  if (cents == null) return "—";
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

export default function AppealPreviewPage() {
  const params = useParams();
  const appealId = params.id as string;
  const [data, setData] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/v1/appeals/${appealId}/preview`)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [appealId]);

  function handlePrint() {
    window.print();
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <p className="text-ink-400">Loading appeal preview...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <p className="rounded bg-red-50 p-4 text-sm text-red-700">
          Failed to load appeal: {error}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      {/* Controls - hidden when printing */}
      <div className="mb-6 flex items-center justify-between print:hidden">
        <div>
          <Link
            href="/dashboard/appeals"
            className="text-xs text-ink-500 hover:text-ink-700"
          >
            &larr; Back to Appeals
          </Link>
          <h1 className="mt-1 font-display text-2xl font-semibold text-ink-950">
            Appeal Letter Preview
          </h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handlePrint}
            className="rounded border border-ink-300 px-3 py-1.5 text-xs text-ink-600 hover:bg-ink-50"
          >
            Print / PDF
          </button>
          {data.needs_review && (
            <span className="rounded bg-amber-100 px-2 py-1.5 text-xs text-amber-700">
              Pending Review
            </span>
          )}
          {data.approved_by && (
            <span className="rounded bg-green-100 px-2 py-1.5 text-xs text-green-700">
              Approved by {data.approved_by}
            </span>
          )}
        </div>
      </div>

      {/* Letter */}
      <div className="rounded-lg border border-ink-200 bg-white p-8 print:border-0 print:p-0">
        {/* Header block */}
        <div className="mb-8 border-b border-ink-100 pb-6">
          <p className="text-xs text-ink-400 mb-4">
            {new Date(data.created_at).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-ink-400">To</p>
              <p className="font-medium text-ink-900">
                {data.payer_name || "Insurance Payer"}
              </p>
              <p className="text-xs text-ink-500">Appeals Department</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-ink-400">Re</p>
              <p className="font-mono text-xs text-ink-700">
                Claim: {data.claim_number || data.claim_id.slice(0, 8)}
              </p>
              <p className="font-mono text-xs text-ink-700">
                Denial Code: {data.denial_code || "N/A"}
              </p>
              <p className="font-mono text-xs text-ink-700">
                Amount: {dollars(data.amount_denied_cents)}
              </p>
            </div>
          </div>
        </div>

        {/* Denial reason summary */}
        {data.denial_reason && (
          <div className="mb-6 rounded bg-red-50 px-4 py-3 print:bg-gray-50">
            <p className="text-xs font-medium text-red-700 mb-1">
              Denial Reason
            </p>
            <p className="text-sm text-red-600">{data.denial_reason}</p>
          </div>
        )}

        {/* Letter body */}
        {data.letter_body ? (
          <div className="prose prose-sm max-w-none text-ink-800">
            <div className="whitespace-pre-wrap">{data.letter_body}</div>
          </div>
        ) : (
          <p className="italic text-ink-400 text-sm">
            No appeal letter has been generated yet.
          </p>
        )}

        {/* Template info */}
        {data.template_used && (
          <div className="mt-8 border-t border-ink-100 pt-4 print:hidden">
            <p className="text-[10px] text-ink-400">
              Template used: {data.template_used}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

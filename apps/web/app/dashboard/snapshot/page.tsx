"use client";

import { useEffect, useState } from "react";

interface ClaimSnapshot {
  claim: {
    id: string;
    claim_number: string | null;
    payer_name: string | null;
    denial_code: string | null;
    denial_reason: string | null;
    status: string;
    amount_denied_cents: number | null;
    amount_approved_cents: number | null;
    filing_deadline: string | null;
    created_at: string;
  };
  appeals: { version: number; confidence: number | null; approved_by: string | null; created_at: string }[];
  notes: { content: string; created_at: string }[];
  tags: string[];
  costs_total_cents: number;
  attachments_count: number;
}

export default function SnapshotPage() {
  const [claimId, setClaimId] = useState("");
  const [claims, setClaims] = useState<{ id: string; claim_number: string | null }[]>([]);
  const [snapshot, setSnapshot] = useState<ClaimSnapshot | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/v1/claims")
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d) ? d : [];
        setClaims(list.map((c: { id: string; claim_number: string | null }) => ({ id: c.id, claim_number: c.claim_number })));
        if (list.length > 0) setClaimId(list[0].id);
      });
  }, []);

  useEffect(() => {
    if (!claimId) return;
    setLoading(true);
    fetch(`/api/v1/claims/${claimId}/snapshot`)
      .then((r) => r.json())
      .then((d) => {
        setSnapshot(d.claim ? d : null);
        setLoading(false);
      });
  }, [claimId]);

  const fmt = (cents: number | null) =>
    cents != null ? `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—";

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 print:px-0 print:py-0">
      <header className="mb-6 print:mb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-wide text-ink-500 print:hidden">Print</p>
            <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">Claim Snapshot</h1>
            <p className="mt-1 text-sm text-ink-500 print:hidden">Full claim summary — printable format.</p>
          </div>
          <div className="print:hidden flex gap-3">
            <select value={claimId} onChange={(e) => setClaimId(e.target.value)} className="rounded border border-ink-200 px-3 py-2 text-sm">
              {claims.map((c) => (
                <option key={c.id} value={c.id}>{c.claim_number || c.id.slice(0, 8)}</option>
              ))}
            </select>
            <button onClick={() => window.print()} className="rounded bg-ink-950 px-4 py-2 text-sm text-white hover:bg-ink-900">
              Print
            </button>
          </div>
        </div>
      </header>

      {loading ? (
        <p className="text-ink-400">Loading snapshot...</p>
      ) : !snapshot ? (
        <p className="text-ink-400">No snapshot data available.</p>
      ) : (
        <div className="space-y-4">
          {/* Claim details */}
          <div className="rounded-lg border border-ink-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-ink-500 mb-3">Claim Details</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-ink-500">Number:</span> <span className="font-medium text-ink-800">{snapshot.claim.claim_number || "—"}</span></div>
              <div><span className="text-ink-500">Status:</span> <span className="font-medium text-ink-800">{snapshot.claim.status}</span></div>
              <div><span className="text-ink-500">Payer:</span> <span className="font-medium text-ink-800">{snapshot.claim.payer_name || "—"}</span></div>
              <div><span className="text-ink-500">Denial Code:</span> <span className="font-medium text-ink-800">{snapshot.claim.denial_code || "—"}</span></div>
              <div><span className="text-ink-500">Denied:</span> <span className="font-medium text-red-700">{fmt(snapshot.claim.amount_denied_cents)}</span></div>
              <div><span className="text-ink-500">Approved:</span> <span className="font-medium text-green-700">{fmt(snapshot.claim.amount_approved_cents)}</span></div>
              <div><span className="text-ink-500">Filing Deadline:</span> <span className="font-medium text-ink-800">{snapshot.claim.filing_deadline ? new Date(snapshot.claim.filing_deadline).toLocaleDateString() : "—"}</span></div>
              <div><span className="text-ink-500">Created:</span> <span className="font-medium text-ink-800">{new Date(snapshot.claim.created_at).toLocaleDateString()}</span></div>
            </div>
            {snapshot.claim.denial_reason && (
              <div className="mt-3 text-sm"><span className="text-ink-500">Reason:</span> <span className="text-ink-700">{snapshot.claim.denial_reason}</span></div>
            )}
          </div>

          {/* Tags */}
          {snapshot.tags.length > 0 && (
            <div className="rounded-lg border border-ink-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-ink-500 mb-2">Tags</h2>
              <div className="flex flex-wrap gap-1">
                {snapshot.tags.map((t) => (
                  <span key={t} className="rounded bg-ink-100 px-2 py-0.5 text-xs text-ink-700">{t}</span>
                ))}
              </div>
            </div>
          )}

          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-ink-200 bg-white px-4 py-3 text-center">
              <p className="text-xs text-ink-500">Appeals</p>
              <p className="text-xl font-bold text-ink-900">{snapshot.appeals.length}</p>
            </div>
            <div className="rounded-lg border border-ink-200 bg-white px-4 py-3 text-center">
              <p className="text-xs text-ink-500">Total Costs</p>
              <p className="text-xl font-bold text-ink-900">{fmt(snapshot.costs_total_cents)}</p>
            </div>
            <div className="rounded-lg border border-ink-200 bg-white px-4 py-3 text-center">
              <p className="text-xs text-ink-500">Attachments</p>
              <p className="text-xl font-bold text-ink-900">{snapshot.attachments_count}</p>
            </div>
          </div>

          {/* Notes */}
          {snapshot.notes.length > 0 && (
            <div className="rounded-lg border border-ink-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-ink-500 mb-2">Notes ({snapshot.notes.length})</h2>
              <div className="space-y-2">
                {snapshot.notes.slice(0, 5).map((n, i) => (
                  <div key={i} className="text-sm text-ink-600 border-l-2 border-ink-200 pl-3">
                    <p>{n.content}</p>
                    <p className="text-xs text-ink-400 mt-0.5">{new Date(n.created_at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

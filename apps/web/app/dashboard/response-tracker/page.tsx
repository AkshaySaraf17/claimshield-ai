"use client";

import { useEffect, useState } from "react";

interface PayerResponseItem {
  id: string;
  response_type: string;
  response_text: string | null;
  amount_approved_cents: number | null;
  received_at: string;
  recorded_by: string;
}

const TEAM: Record<string, string> = {
  "dev-user-001": "Alice Chen",
  "dev-user-002": "Bob Martinez",
  "dev-user-003": "Carol Williams",
  "dev-user-004": "David Kim",
};

const RESPONSE_COLORS: Record<string, string> = {
  approved: "bg-green-100 text-green-700",
  denied: "bg-red-100 text-red-700",
  partial: "bg-amber-100 text-amber-700",
  pending: "bg-blue-100 text-blue-700",
  request_info: "bg-purple-100 text-purple-700",
};

export default function ResponseTrackerPage() {
  const [claimId, setClaimId] = useState("");
  const [claims, setClaims] = useState<{ id: string; claim_number: string | null }[]>([]);
  const [responses, setResponses] = useState<PayerResponseItem[]>([]);
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
    fetch(`/api/v1/claims/${claimId}/responses`)
      .then((r) => r.json())
      .then((d) => {
        setResponses(Array.isArray(d) ? d : []);
        setLoading(false);
      });
  }, [claimId]);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">Tracking</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">Response Tracker</h1>
        <p className="mt-1 text-sm text-ink-500">Track payer responses for each claim.</p>
      </header>

      <div className="mb-6">
        <select value={claimId} onChange={(e) => setClaimId(e.target.value)} className="rounded border border-ink-200 px-3 py-2 text-sm">
          {claims.map((c) => (
            <option key={c.id} value={c.id}>{c.claim_number || c.id.slice(0, 8)}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-ink-400">Loading responses...</p>
      ) : responses.length === 0 ? (
        <p className="text-ink-400">No payer responses recorded for this claim.</p>
      ) : (
        <div className="space-y-3">
          {responses.map((r) => (
            <div key={r.id} className="rounded-lg border border-ink-200 bg-white px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <span className={`rounded px-2 py-0.5 text-xs font-bold ${RESPONSE_COLORS[r.response_type] || "bg-ink-100 text-ink-600"}`}>
                  {r.response_type.replace(/_/g, " ")}
                </span>
                <span className="text-xs text-ink-400">{new Date(r.received_at).toLocaleString()}</span>
              </div>
              {r.response_text && <p className="text-sm text-ink-700 mb-2">{r.response_text}</p>}
              <div className="flex items-center justify-between text-xs text-ink-500">
                <span>Recorded by: {TEAM[r.recorded_by] || r.recorded_by}</span>
                {r.amount_approved_cents != null && (
                  <span className="font-mono text-green-700">
                    Approved: ${(r.amount_approved_cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

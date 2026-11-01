"use client";

import { useEffect, useState, useCallback } from "react";

interface ClaimLink {
  link_id: string;
  link_type: string;
  other_claim_id: string;
  other_claim_number: string;
  other_status: string;
  other_payer: string;
  created_by: string;
  created_at: string;
}

const LINK_COLORS: Record<string, string> = {
  related: "bg-blue-100 text-blue-700",
  duplicate: "bg-red-100 text-red-700",
  parent: "bg-purple-100 text-purple-700",
  child: "bg-purple-100 text-purple-700",
  follow_up: "bg-green-100 text-green-700",
  rebill: "bg-amber-100 text-amber-700",
};

const TEAM: Record<string, string> = {
  "dev-user-001": "Alice Chen",
  "dev-user-002": "Bob Martinez",
  "dev-user-003": "Carol Williams",
  "dev-user-004": "David Kim",
};

export default function ClaimLinksPage() {
  const [claimId, setClaimId] = useState("");
  const [claims, setClaims] = useState<{ id: string; claim_number: string | null }[]>([]);
  const [links, setLinks] = useState<ClaimLink[]>([]);
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

  const loadLinks = useCallback(() => {
    if (!claimId) return;
    setLoading(true);
    fetch(`/api/v1/claims/${claimId}/links`)
      .then((r) => r.json())
      .then((d) => {
        setLinks(Array.isArray(d) ? d : []);
        setLoading(false);
      });
  }, [claimId]);

  useEffect(() => { loadLinks(); }, [loadLinks]);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">Relationships</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">Claim Links</h1>
        <p className="mt-1 text-sm text-ink-500">View relationships between claims — related, duplicate, parent/child, follow-up.</p>
      </header>

      <div className="mb-6">
        <select value={claimId} onChange={(e) => setClaimId(e.target.value)} className="rounded border border-ink-200 px-3 py-2 text-sm">
          {claims.map((c) => (
            <option key={c.id} value={c.id}>{c.claim_number || c.id.slice(0, 8)}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-ink-400">Loading links...</p>
      ) : links.length === 0 ? (
        <p className="text-ink-400">No linked claims.</p>
      ) : (
        <div className="space-y-3">
          {links.map((l) => (
            <div key={l.link_id} className="rounded-lg border border-ink-200 bg-white px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={`rounded px-2 py-0.5 text-xs font-bold ${LINK_COLORS[l.link_type] || "bg-ink-100 text-ink-600"}`}>
                  {l.link_type.replace(/_/g, " ")}
                </span>
                <div>
                  <p className="text-sm font-medium text-ink-800">{l.other_claim_number}</p>
                  <p className="text-xs text-ink-500">{l.other_payer} — {l.other_status.replace(/_/g, " ")}</p>
                </div>
              </div>
              <div className="text-right text-xs text-ink-400">
                <p>Linked by {TEAM[l.created_by] || l.created_by}</p>
                <p>{new Date(l.created_at).toLocaleDateString()}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

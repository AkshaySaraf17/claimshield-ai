"use client";

import { useEffect, useState } from "react";

interface LetterRecord {
  id: string;
  appeal_id: string;
  version: number;
  letter_type: string;
  generated_at: string;
  sent_at: string | null;
  method: string | null;
  tracking_number: string | null;
}

export default function LetterHistoryPage() {
  const [claimId, setClaimId] = useState("");
  const [claims, setClaims] = useState<{ id: string; claim_number: string | null }[]>([]);
  const [letters, setLetters] = useState<LetterRecord[]>([]);
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
    fetch(`/api/v1/claims/${claimId}/letter-history`)
      .then((r) => r.json())
      .then((d) => {
        setLetters(Array.isArray(d) ? d : []);
        setLoading(false);
      });
  }, [claimId]);

  const METHOD_BADGE: Record<string, string> = {
    fax: "bg-purple-100 text-purple-700",
    mail: "bg-blue-100 text-blue-700",
    portal: "bg-green-100 text-green-700",
    email: "bg-amber-100 text-amber-700",
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">Correspondence</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">Letter History</h1>
        <p className="mt-1 text-sm text-ink-500">View all appeal letters generated and sent per claim.</p>
      </header>

      <div className="mb-6">
        <select value={claimId} onChange={(e) => setClaimId(e.target.value)} className="rounded border border-ink-200 px-3 py-2 text-sm">
          {claims.map((c) => (
            <option key={c.id} value={c.id}>{c.claim_number || c.id.slice(0, 8)}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-ink-400">Loading letter history...</p>
      ) : letters.length === 0 ? (
        <p className="text-ink-400">No letters on file for this claim.</p>
      ) : (
        <div className="space-y-3">
          {letters.map((l) => (
            <div key={l.id} className="rounded-lg border border-ink-200 bg-white px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-ink-800">Version {l.version}</span>
                  <span className="rounded bg-ink-100 px-2 py-0.5 text-xs text-ink-600">{l.letter_type}</span>
                </div>
                <span className="text-xs text-ink-400">{new Date(l.generated_at).toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-4 text-xs text-ink-500">
                {l.sent_at ? (
                  <span className="text-green-600">Sent {new Date(l.sent_at).toLocaleDateString()}</span>
                ) : (
                  <span className="text-amber-600">Not yet sent</span>
                )}
                {l.method && (
                  <span className={`rounded px-1.5 py-0.5 ${METHOD_BADGE[l.method] || "bg-ink-100 text-ink-600"}`}>
                    via {l.method}
                  </span>
                )}
                {l.tracking_number && (
                  <span className="font-mono">#{l.tracking_number}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

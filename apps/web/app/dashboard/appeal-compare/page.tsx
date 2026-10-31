"use client";

import { useEffect, useState } from "react";

interface AppealVersion {
  id: string;
  version: number;
  letter_text: string | null;
  policy_evidence: string | null;
  confidence: number | null;
  needs_review: boolean;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
}

export default function AppealComparePage() {
  const [claimId, setClaimId] = useState("");
  const [claims, setClaims] = useState<{ id: string; claim_number: string | null }[]>([]);
  const [versions, setVersions] = useState<AppealVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [leftIdx, setLeftIdx] = useState(0);
  const [rightIdx, setRightIdx] = useState(1);

  useEffect(() => {
    fetch("/api/v1/claims")
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d) ? d : [];
        setClaims(list.map((c: { id: string; claim_number: string | null }) => ({
          id: c.id,
          claim_number: c.claim_number,
        })));
        if (list.length > 0) setClaimId(list[0].id);
      });
  }, []);

  useEffect(() => {
    if (!claimId) return;
    setLoading(true);
    fetch(`/api/v1/claims/${claimId}/appeal-versions`)
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d) ? d : [];
        setVersions(list);
        setLeftIdx(0);
        setRightIdx(Math.min(1, list.length - 1));
        setLoading(false);
      });
  }, [claimId]);

  const left = versions[leftIdx];
  const right = versions[rightIdx];

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">Appeals</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">Appeal Comparison</h1>
        <p className="mt-1 text-sm text-ink-500">
          Compare different versions of an appeal letter side by side.
        </p>
      </header>

      <div className="mb-6 flex items-center gap-4">
        <select
          value={claimId}
          onChange={(e) => setClaimId(e.target.value)}
          className="rounded border border-ink-200 px-3 py-2 text-sm"
        >
          {claims.map((c) => (
            <option key={c.id} value={c.id}>
              {c.claim_number || c.id.slice(0, 8)}
            </option>
          ))}
        </select>
        <span className="text-xs text-ink-400">{versions.length} version(s)</span>
      </div>

      {loading ? (
        <p className="text-ink-400">Loading versions...</p>
      ) : versions.length === 0 ? (
        <p className="text-ink-400">No appeal versions for this claim.</p>
      ) : versions.length === 1 ? (
        <div className="rounded-lg border border-ink-200 bg-white p-6">
          <h3 className="mb-2 text-sm font-semibold text-ink-700">Version {versions[0].version}</h3>
          <p className="text-xs text-ink-400 mb-3">Confidence: {versions[0].confidence ?? "N/A"}</p>
          <pre className="whitespace-pre-wrap text-sm text-ink-700">{versions[0].letter_text || "No letter text."}</pre>
        </div>
      ) : (
        <>
          <div className="mb-4 flex gap-4">
            <select
              value={leftIdx}
              onChange={(e) => setLeftIdx(Number(e.target.value))}
              className="rounded border border-ink-200 px-3 py-1 text-sm"
            >
              {versions.map((v, i) => (
                <option key={i} value={i}>v{v.version}</option>
              ))}
            </select>
            <span className="text-ink-400">vs</span>
            <select
              value={rightIdx}
              onChange={(e) => setRightIdx(Number(e.target.value))}
              className="rounded border border-ink-200 px-3 py-1 text-sm"
            >
              {versions.map((v, i) => (
                <option key={i} value={i}>v{v.version}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {[left, right].map((v, idx) => v && (
              <div key={idx} className="rounded-lg border border-ink-200 bg-white p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-ink-700">Version {v.version}</h3>
                  <div className="flex items-center gap-2">
                    {v.confidence != null && (
                      <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-xs text-indigo-700">
                        {(v.confidence * 100).toFixed(0)}%
                      </span>
                    )}
                    {v.approved_by && (
                      <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">
                        Approved
                      </span>
                    )}
                    {v.needs_review && !v.approved_by && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">
                        Needs Review
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-xs text-ink-400 mb-2">
                  Created: {new Date(v.created_at).toLocaleString()}
                </p>
                <pre className="whitespace-pre-wrap text-sm text-ink-700 max-h-96 overflow-y-auto">
                  {v.letter_text || "No letter text."}
                </pre>
                {v.policy_evidence && (
                  <div className="mt-3 border-t border-ink-100 pt-3">
                    <p className="text-xs font-semibold text-ink-500 mb-1">Policy Evidence</p>
                    <pre className="whitespace-pre-wrap text-xs text-ink-600 max-h-32 overflow-y-auto">
                      {v.policy_evidence}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

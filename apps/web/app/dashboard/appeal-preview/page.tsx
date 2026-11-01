"use client";

import { useEffect, useState } from "react";

interface AppealPreview {
  appeal_id: string;
  claim_id: string;
  claim_number: string;
  payer_name: string;
  denial_code: string;
  letter_text: string;
  version: number;
  confidence: number | null;
  status: string;
  created_at: string;
}

export default function AppealPreviewPage() {
  const [appealId, setAppealId] = useState("");
  const [appeals, setAppeals] = useState<{ id: string; claim_id: string }[]>([]);
  const [preview, setPreview] = useState<AppealPreview | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/v1/appeals")
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d) ? d : [];
        setAppeals(list.map((a: { id: string; claim_id: string }) => ({ id: a.id, claim_id: a.claim_id })));
        if (list.length > 0) setAppealId(list[0].id);
      });
  }, []);

  useEffect(() => {
    if (!appealId) return;
    setLoading(true);
    fetch(`/api/v1/appeals/${appealId}/preview`)
      .then((r) => r.json())
      .then((d) => {
        setPreview(d.appeal_id ? d : null);
        setLoading(false);
      });
  }, [appealId]);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 print:px-0 print:py-0">
      <header className="mb-6 print:mb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-wide text-ink-500 print:hidden">Correspondence</p>
            <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">Appeal Letter Preview</h1>
            <p className="mt-1 text-sm text-ink-500 print:hidden">Preview the full appeal letter before sending.</p>
          </div>
          <div className="print:hidden flex gap-3">
            {appeals.length > 0 && (
              <select value={appealId} onChange={(e) => setAppealId(e.target.value)} className="rounded border border-ink-200 px-3 py-2 text-sm">
                {appeals.map((a) => (
                  <option key={a.id} value={a.id}>{a.id.slice(0, 8)}</option>
                ))}
              </select>
            )}
            <button onClick={() => window.print()} className="rounded bg-ink-950 px-4 py-2 text-sm text-white hover:bg-ink-900">Print</button>
          </div>
        </div>
      </header>

      {appeals.length === 0 ? (
        <p className="text-ink-400">No appeals exist yet. Generate an appeal from the Claims page first.</p>
      ) : loading ? (
        <p className="text-ink-400">Loading preview...</p>
      ) : !preview ? (
        <p className="text-ink-400">No preview available for this appeal.</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-ink-200 bg-white px-4 py-3">
              <span className="text-ink-500">Claim:</span>{" "}
              <span className="font-medium text-ink-800">{preview.claim_number}</span>
            </div>
            <div className="rounded-lg border border-ink-200 bg-white px-4 py-3">
              <span className="text-ink-500">Payer:</span>{" "}
              <span className="font-medium text-ink-800">{preview.payer_name}</span>
            </div>
            <div className="rounded-lg border border-ink-200 bg-white px-4 py-3">
              <span className="text-ink-500">Denial Code:</span>{" "}
              <span className="font-medium text-ink-800">{preview.denial_code}</span>
            </div>
            <div className="rounded-lg border border-ink-200 bg-white px-4 py-3">
              <span className="text-ink-500">Version:</span>{" "}
              <span className="font-medium text-ink-800">{preview.version}</span>
              {preview.confidence != null && (
                <span className="ml-2 text-xs text-ink-400">({Math.round(preview.confidence * 100)}% confidence)</span>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-ink-200 bg-white p-6">
            <h2 className="text-sm font-semibold text-ink-500 mb-4">Letter Content</h2>
            <div className="prose prose-sm max-w-none text-ink-700 whitespace-pre-wrap font-serif leading-relaxed">
              {preview.letter_text}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

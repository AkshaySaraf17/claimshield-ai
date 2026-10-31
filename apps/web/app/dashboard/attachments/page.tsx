"use client";

import { useEffect, useState } from "react";

interface Attachment {
  id: string;
  filename: string;
  file_type: string;
  size_bytes: number;
  uploaded_by: string;
  description: string | null;
  created_at: string;
}

export default function AttachmentsPage() {
  const [claimId, setClaimId] = useState("");
  const [claims, setClaims] = useState<{ id: string; claim_number: string | null }[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(false);

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
    fetch(`/api/v1/claims/${claimId}/attachments`)
      .then((r) => r.json())
      .then((d) => {
        setAttachments(Array.isArray(d) ? d : []);
        setLoading(false);
      });
  }, [claimId]);

  function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  const FILE_TYPE_ICONS: Record<string, string> = {
    pdf: "PDF",
    docx: "DOC",
    xlsx: "XLS",
    png: "IMG",
    jpg: "IMG",
    csv: "CSV",
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">Documents</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">Attachments</h1>
        <p className="mt-1 text-sm text-ink-500">
          View and manage documents attached to each claim.
        </p>
      </header>

      <div className="mb-6">
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
      </div>

      {loading ? (
        <p className="text-ink-400">Loading attachments...</p>
      ) : attachments.length === 0 ? (
        <p className="text-ink-400">No attachments for this claim.</p>
      ) : (
        <div className="space-y-2">
          {attachments.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between rounded-lg border border-ink-200 bg-white px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span className="rounded bg-indigo-100 px-2 py-1 text-xs font-bold text-indigo-700">
                  {FILE_TYPE_ICONS[a.file_type] || a.file_type.toUpperCase()}
                </span>
                <div>
                  <p className="text-sm font-medium text-ink-800">{a.filename}</p>
                  {a.description && (
                    <p className="text-xs text-ink-500">{a.description}</p>
                  )}
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-ink-500">{formatSize(a.size_bytes)}</p>
                <p className="text-xs text-ink-400">{new Date(a.created_at).toLocaleDateString()}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";

interface Comment {
  id: string;
  author_id: string;
  author_name: string;
  body: string;
  parent_id: string | null;
  created_at: string;
}

export default function CommentsPage() {
  const [claimId, setClaimId] = useState("");
  const [claims, setClaims] = useState<{ id: string; claim_number: string | null }[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [body, setBody] = useState("");

  useEffect(() => {
    fetch("/api/v1/claims")
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d) ? d : [];
        setClaims(list.map((c: { id: string; claim_number: string | null }) => ({ id: c.id, claim_number: c.claim_number })));
        if (list.length > 0) setClaimId(list[0].id);
      });
  }, []);

  const loadComments = useCallback(() => {
    if (!claimId) return;
    setLoading(true);
    fetch(`/api/v1/claims/${claimId}/comments`)
      .then((r) => r.json())
      .then((d) => {
        setComments(Array.isArray(d) ? d : []);
        setLoading(false);
      });
  }, [claimId]);

  useEffect(() => { loadComments(); }, [loadComments]);

  async function addComment(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    await fetch(`/api/v1/claims/${claimId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: body.trim() }),
    });
    setBody("");
    loadComments();
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">Discussion</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">Claim Comments</h1>
        <p className="mt-1 text-sm text-ink-500">Threaded discussion per claim.</p>
      </header>

      <div className="mb-6">
        <select value={claimId} onChange={(e) => setClaimId(e.target.value)} className="rounded border border-ink-200 px-3 py-2 text-sm">
          {claims.map((c) => (
            <option key={c.id} value={c.id}>{c.claim_number || c.id.slice(0, 8)}</option>
          ))}
        </select>
      </div>

      <form onSubmit={addComment} className="mb-6 flex gap-3">
        <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a comment..." className="flex-1 rounded border border-ink-200 px-3 py-2 text-sm" />
        <button type="submit" className="rounded bg-ink-950 px-4 py-2 text-sm text-white hover:bg-ink-900">Post</button>
      </form>

      {loading ? (
        <p className="text-ink-400">Loading comments...</p>
      ) : comments.length === 0 ? (
        <p className="text-ink-400">No comments for this claim yet.</p>
      ) : (
        <div className="space-y-3">
          {comments.map((c) => (
            <div key={c.id} className="rounded-lg border border-ink-200 bg-white px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-ink-700">{c.author_name || c.author_id}</span>
                <span className="text-xs text-ink-400">{new Date(c.created_at).toLocaleString()}</span>
              </div>
              <p className="text-sm text-ink-600">{c.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

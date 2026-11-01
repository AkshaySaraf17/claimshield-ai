"use client";

import { useEffect, useState, useCallback } from "react";

interface Note {
  id: string;
  author_id: string;
  content: string;
  created_at: string;
}

const TEAM: Record<string, string> = {
  "dev-user-001": "Alice Chen",
  "dev-user-002": "Bob Martinez",
  "dev-user-003": "Carol Williams",
  "dev-user-004": "David Kim",
};

export default function NotesPage() {
  const [claimId, setClaimId] = useState("");
  const [claims, setClaims] = useState<{ id: string; claim_number: string | null }[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState("");

  useEffect(() => {
    fetch("/api/v1/claims")
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d) ? d : [];
        setClaims(list.map((c: { id: string; claim_number: string | null }) => ({ id: c.id, claim_number: c.claim_number })));
        if (list.length > 0) setClaimId(list[0].id);
      });
  }, []);

  const loadNotes = useCallback(() => {
    if (!claimId) return;
    setLoading(true);
    fetch(`/api/v1/claims/${claimId}/notes`)
      .then((r) => r.json())
      .then((d) => {
        setNotes(Array.isArray(d) ? d : []);
        setLoading(false);
      });
  }, [claimId]);

  useEffect(() => { loadNotes(); }, [loadNotes]);

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    await fetch(`/api/v1/claims/${claimId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: content.trim() }),
    });
    setContent("");
    loadNotes();
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">Collaboration</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">Claim Notes</h1>
        <p className="mt-1 text-sm text-ink-500">Add and view internal notes per claim.</p>
      </header>

      <div className="mb-6">
        <select value={claimId} onChange={(e) => setClaimId(e.target.value)} className="rounded border border-ink-200 px-3 py-2 text-sm">
          {claims.map((c) => (
            <option key={c.id} value={c.id}>{c.claim_number || c.id.slice(0, 8)}</option>
          ))}
        </select>
      </div>

      <form onSubmit={addNote} className="mb-6 flex gap-3">
        <input
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write a note..."
          className="flex-1 rounded border border-ink-200 px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded bg-ink-950 px-4 py-2 text-sm text-white hover:bg-ink-900">Add Note</button>
      </form>

      {loading ? (
        <p className="text-ink-400">Loading notes...</p>
      ) : notes.length === 0 ? (
        <p className="text-ink-400">No notes for this claim yet.</p>
      ) : (
        <div className="space-y-3">
          {notes.map((n) => (
            <div key={n.id} className="rounded-lg border border-ink-200 bg-white px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-ink-700">{TEAM[n.author_id] || n.author_id}</span>
                <span className="text-xs text-ink-400">{new Date(n.created_at).toLocaleString()}</span>
              </div>
              <p className="text-sm text-ink-600">{n.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

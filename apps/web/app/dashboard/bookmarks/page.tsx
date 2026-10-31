"use client";

import { useEffect, useState, useCallback } from "react";

interface Bookmark {
  id: string;
  label: string;
  path: string;
  icon: string | null;
  created_at: string;
}

export default function BookmarksPage() {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [path, setPath] = useState("");

  const load = useCallback(() => {
    fetch("/api/v1/bookmarks")
      .then((r) => r.json())
      .then((d) => {
        setBookmarks(Array.isArray(d) ? d : []);
        setLoading(false);
      });
  }, []);

  useEffect(() => { load(); }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || !path.trim()) return;
    await fetch("/api/v1/bookmarks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: label.trim(), path: path.trim() }),
    });
    setLabel("");
    setPath("");
    load();
  }

  async function remove(id: string) {
    await fetch(`/api/v1/bookmarks/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">Personalization</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">Bookmarks</h1>
        <p className="mt-1 text-sm text-ink-500">
          Save quick links to your most-used dashboard views.
        </p>
      </header>

      <form onSubmit={add} className="mb-6 flex gap-3">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label (e.g. Overdue Claims)"
          className="flex-1 rounded border border-ink-200 px-3 py-2 text-sm"
        />
        <input
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="Path (e.g. /dashboard/claims?status=overdue)"
          className="flex-1 rounded border border-ink-200 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded bg-ink-950 px-4 py-2 text-sm text-white hover:bg-ink-900"
        >
          Add
        </button>
      </form>

      {loading ? (
        <p className="text-ink-400">Loading bookmarks...</p>
      ) : bookmarks.length === 0 ? (
        <p className="text-ink-400">No bookmarks saved yet. Add one above.</p>
      ) : (
        <div className="space-y-2">
          {bookmarks.map((b) => (
            <div
              key={b.id}
              className="flex items-center justify-between rounded-lg border border-ink-200 bg-white px-4 py-3"
            >
              <div>
                <span className="font-medium text-ink-800">{b.label}</span>
                <span className="ml-3 font-mono text-xs text-ink-400">{b.path}</span>
              </div>
              <button
                onClick={() => remove(b.id)}
                className="text-xs text-red-500 hover:text-red-700"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

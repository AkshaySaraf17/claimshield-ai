"use client";

import { useEffect, useState, useCallback } from "react";

interface TagCount {
  tag: string;
  count: number;
}

interface ClaimOption {
  id: string;
  claim_number: string | null;
}

export default function TagManagerPage() {
  const [tags, setTags] = useState<TagCount[]>([]);
  const [claims, setClaims] = useState<ClaimOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClaims, setSelectedClaims] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [message, setMessage] = useState("");

  const loadTags = useCallback(() => {
    fetch("/api/v1/tags/summary")
      .then((r) => r.json())
      .then((d) => {
        setTags(Array.isArray(d) ? d : []);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    loadTags();
    fetch("/api/v1/claims")
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d) ? d : [];
        setClaims(list.map((c: ClaimOption) => ({ id: c.id, claim_number: c.claim_number })));
      });
  }, [loadTags]);

  function toggleClaim(id: string) {
    setSelectedClaims((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function bulkAdd() {
    if (!tagInput.trim() || selectedClaims.length === 0) return;
    const resp = await fetch("/api/v1/tags/bulk-add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claim_ids: selectedClaims, tag: tagInput.trim() }),
    });
    const data = await resp.json();
    setMessage(`Added "${data.tag}" to ${data.added} claim(s)`);
    setTagInput("");
    loadTags();
  }

  async function bulkRemove() {
    if (!tagInput.trim() || selectedClaims.length === 0) return;
    const resp = await fetch("/api/v1/tags/bulk-remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claim_ids: selectedClaims, tag: tagInput.trim() }),
    });
    const data = await resp.json();
    setMessage(`Removed "${data.tag}" from ${data.removed} claim(s)`);
    setTagInput("");
    loadTags();
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">Organization</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">Tag Manager</h1>
        <p className="mt-1 text-sm text-ink-500">
          Bulk add or remove tags across multiple claims.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-6">
        {/* Tag summary */}
        <div>
          <h2 className="mb-3 text-sm font-semibold text-ink-700">Active Tags</h2>
          {loading ? (
            <p className="text-ink-400">Loading...</p>
          ) : tags.length === 0 ? (
            <p className="text-ink-400">No tags yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tags.map((t) => (
                <button
                  key={t.tag}
                  onClick={() => setTagInput(t.tag)}
                  className="rounded-full border border-ink-200 bg-white px-3 py-1 text-sm text-ink-700 hover:bg-ink-50"
                >
                  {t.tag} <span className="text-ink-400">({t.count})</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Claim selector */}
        <div>
          <h2 className="mb-3 text-sm font-semibold text-ink-700">Select Claims</h2>
          <div className="max-h-48 overflow-y-auto rounded border border-ink-200 bg-white">
            {claims.map((c) => (
              <label
                key={c.id}
                className="flex items-center gap-2 border-b border-ink-50 px-3 py-2 text-sm hover:bg-ink-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedClaims.includes(c.id)}
                  onChange={() => toggleClaim(c.id)}
                />
                {c.claim_number || c.id.slice(0, 8)}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-ink-400">{selectedClaims.length} selected</p>
        </div>
      </div>

      {/* Bulk actions */}
      <div className="mt-6 flex items-center gap-3">
        <input
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          placeholder="Tag name"
          className="rounded border border-ink-200 px-3 py-2 text-sm w-48"
        />
        <button
          onClick={bulkAdd}
          className="rounded bg-ink-950 px-4 py-2 text-sm text-white hover:bg-ink-900"
        >
          Add Tag
        </button>
        <button
          onClick={bulkRemove}
          className="rounded border border-red-200 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
        >
          Remove Tag
        </button>
      </div>

      {message && (
        <p className="mt-3 text-sm text-green-700 bg-green-50 rounded px-3 py-2">{message}</p>
      )}
    </div>
  );
}

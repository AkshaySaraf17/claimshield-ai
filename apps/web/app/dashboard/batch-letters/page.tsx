"use client";

import { useEffect, useState } from "react";

interface BatchResult {
  claim_id: string;
  claim_number: string;
  appeal_id: string;
  letter_preview: string;
  confidence: number | null;
}

export default function BatchLettersPage() {
  const [claims, setClaims] = useState<{ id: string; claim_number: string | null; status: string }[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [results, setResults] = useState<BatchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch("/api/v1/claims")
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d) ? d : [];
        setClaims(list.map((c: { id: string; claim_number: string | null; status: string }) => ({
          id: c.id,
          claim_number: c.claim_number,
          status: c.status,
        })));
        setLoading(false);
      });
  }, []);

  function toggleClaim(id: string) {
    setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  }

  async function generateBatch() {
    if (selected.length === 0) return;
    setGenerating(true);
    const res = await fetch("/api/v1/appeal-letters/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claim_ids: selected }),
    });
    const data = await res.json();
    setResults(Array.isArray(data) ? data : data.results || []);
    setGenerating(false);
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">Batch Operations</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">Batch Letter Generator</h1>
        <p className="mt-1 text-sm text-ink-500">Generate appeal letters for multiple claims at once.</p>
      </header>

      {loading ? (
        <p className="text-ink-400">Loading claims...</p>
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm text-ink-500">{selected.length} of {claims.length} selected</span>
            <button
              onClick={generateBatch}
              disabled={generating || selected.length === 0}
              className="rounded bg-ink-950 px-4 py-2 text-sm text-white hover:bg-ink-900 disabled:opacity-50"
            >
              {generating ? "Generating..." : `Generate ${selected.length} Letter${selected.length !== 1 ? "s" : ""}`}
            </button>
          </div>

          <div className="mb-6 space-y-1">
            {claims.map((c) => (
              <label key={c.id} className="flex items-center gap-3 rounded border border-ink-200 bg-white px-4 py-2 cursor-pointer hover:bg-ink-50">
                <input
                  type="checkbox"
                  checked={selected.includes(c.id)}
                  onChange={() => toggleClaim(c.id)}
                  className="h-4 w-4 rounded border-ink-300"
                />
                <span className="text-sm font-medium text-ink-800">{c.claim_number || c.id.slice(0, 8)}</span>
                <span className="rounded bg-ink-100 px-2 py-0.5 text-xs text-ink-600">{c.status.replace(/_/g, " ")}</span>
              </label>
            ))}
          </div>

          {results.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-ink-500">Generated Letters</h2>
              {results.map((r) => (
                <div key={r.claim_id} className="rounded-lg border border-ink-200 bg-white p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-ink-800">{r.claim_number}</span>
                    {r.confidence != null && (
                      <span className="text-xs text-ink-400">{Math.round(r.confidence * 100)}% confidence</span>
                    )}
                  </div>
                  <p className="text-sm text-ink-600 whitespace-pre-wrap line-clamp-4">{r.letter_preview}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

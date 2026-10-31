"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Claim {
  id: string;
  claim_number: string | null;
  payer_name: string | null;
  denial_code: string | null;
  denial_reason: string | null;
  amount_denied_cents: number | null;
  status: string;
}

interface GeneratedResult {
  claim_id: string;
  claim_number?: string;
  template_category?: string;
  letter_text?: string;
  source?: string;
  appeal_id?: string;
  error?: string;
}

interface BatchResponse {
  generated: number;
  errors: number;
  results: GeneratedResult[];
}

const CATEGORIES = [
  "Auto-detect",
  "Medical Necessity",
  "Timely Filing",
  "Authorization",
  "Coding",
  "Coverage",
];

function dollars(cents: number | null) {
  if (cents == null) return "—";
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

export default function BatchAppealsPage() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [category, setCategory] = useState("Auto-detect");
  const [saveAsDraft, setSaveAsDraft] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingClaims, setLoadingClaims] = useState(true);
  const [result, setResult] = useState<BatchResponse | null>(null);
  const [expandedLetter, setExpandedLetter] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/claims?limit=100")
      .then((r) => r.json())
      .then((d) => {
        const items = Array.isArray(d) ? d : d.items || [];
        setClaims(items.filter((c: Claim) => c.status === "pending_review" || c.status === "needs_review"));
        setLoadingClaims(false);
      });
  }, []);

  function toggleAll() {
    if (selected.size === claims.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(claims.map((c) => c.id)));
    }
  }

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
    setResult(null);
  }

  async function generate() {
    if (selected.size === 0) return;
    setLoading(true);
    setResult(null);
    const resp = await fetch("/api/v1/appeal-letters/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        claim_ids: Array.from(selected),
        template_category: category === "Auto-detect" ? null : category,
        save_as_draft: saveAsDraft,
      }),
    });
    const data = await resp.json();
    setResult(data);
    setLoading(false);
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">Appeals</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">
          Batch Appeal Generator
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Select claims and generate appeal letters for all of them at once.
        </p>
      </header>

      {/* Controls */}
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-ink-200 bg-white px-4 py-3">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded border border-ink-300 px-2 py-1 text-sm"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-ink-600">
          <input
            type="checkbox"
            checked={saveAsDraft}
            onChange={(e) => setSaveAsDraft(e.target.checked)}
            className="accent-indigo-600"
          />
          Save as appeal drafts
        </label>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-ink-500">{selected.size} selected</span>
          <button
            onClick={generate}
            disabled={selected.size === 0 || loading}
            className="rounded bg-ink-950 px-4 py-1.5 text-sm text-white hover:bg-ink-900 disabled:opacity-40"
          >
            {loading ? "Generating..." : `Generate ${selected.size} Letters`}
          </button>
        </div>
      </div>

      {/* Claim selector */}
      <div className="mb-6 rounded-lg border border-ink-200 bg-white">
        <div className="border-b border-ink-200 px-4 py-2">
          <label className="flex items-center gap-2 text-sm text-ink-600">
            <input
              type="checkbox"
              checked={selected.size === claims.length && claims.length > 0}
              onChange={toggleAll}
              className="accent-indigo-600"
            />
            Select all ({claims.length} pending claims)
          </label>
        </div>
        {loadingClaims ? (
          <p className="px-4 py-3 text-sm text-ink-400">Loading claims...</p>
        ) : claims.length === 0 ? (
          <p className="px-4 py-3 text-sm text-ink-400">No pending claims available.</p>
        ) : (
          <div className="max-h-64 overflow-y-auto divide-y divide-ink-100">
            {claims.map((c) => (
              <label
                key={c.id}
                className={`flex cursor-pointer items-center gap-3 px-4 py-2 text-sm ${
                  selected.has(c.id) ? "bg-indigo-50" : "hover:bg-ink-50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(c.id)}
                  onChange={() => toggle(c.id)}
                  className="accent-indigo-600"
                />
                <span className="font-mono text-ink-700 w-28 truncate">
                  {c.claim_number || c.id.slice(0, 8)}
                </span>
                <span className="text-ink-500 w-28 truncate">{c.payer_name}</span>
                <span className="font-mono text-xs text-ink-400 w-16">{c.denial_code}</span>
                <span className="text-xs text-ink-400 flex-1 truncate">{c.denial_reason}</span>
                <span className="font-mono text-ink-600">{dollars(c.amount_denied_cents)}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-sm">
            <span className="rounded bg-green-100 px-2 py-0.5 text-green-700">
              {result.generated} generated
            </span>
            {result.errors > 0 && (
              <span className="rounded bg-red-100 px-2 py-0.5 text-red-700">
                {result.errors} errors
              </span>
            )}
            {saveAsDraft && (
              <span className="rounded bg-indigo-100 px-2 py-0.5 text-indigo-700">
                Saved as drafts
              </span>
            )}
          </div>

          {result.results.map((r) => (
            <div key={r.claim_id} className="rounded-lg border border-ink-200 bg-white">
              <button
                onClick={() => setExpandedLetter(expandedLetter === r.claim_id ? null : r.claim_id)}
                className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-parchment/30"
              >
                <div className="flex items-center gap-3">
                  {r.error ? (
                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">Error</span>
                  ) : (
                    <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">
                      {r.template_category}
                    </span>
                  )}
                  <span className="font-mono text-ink-700">{r.claim_number || r.claim_id.slice(0, 8)}</span>
                  {r.appeal_id && (
                    <Link
                      href={`/dashboard/appeals`}
                      className="text-xs text-indigo-600 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      View draft →
                    </Link>
                  )}
                </div>
                <span className="text-ink-400">{expandedLetter === r.claim_id ? "−" : "+"}</span>
              </button>
              {expandedLetter === r.claim_id && r.letter_text && (
                <div className="border-t border-ink-200 px-4 py-3">
                  <pre className="whitespace-pre-wrap text-xs text-ink-700 leading-relaxed max-h-64 overflow-y-auto">
                    {r.letter_text}
                  </pre>
                  <p className="mt-2 text-xs text-ink-400">Source: {r.source}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

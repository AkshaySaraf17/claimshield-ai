"use client";

import { useState } from "react";

interface ImportResult {
  created: number;
  errors: string[];
}

export default function BulkImportPage() {
  const [jsonText, setJsonText] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleImport() {
    setImporting(true);
    setResult(null);
    setError(null);
    try {
      const claims = JSON.parse(jsonText);
      if (!Array.isArray(claims)) throw new Error("Input must be a JSON array of claims");
      const res = await fetch("/api/v1/claims/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claims }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Import failed");
      setResult({ created: data.created ?? data.count ?? claims.length, errors: data.errors || [] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    }
    setImporting(false);
  }

  const sampleClaim = JSON.stringify([{
    claim_number: "CLM-IMPORT-001",
    payer_name: "Aetna",
    denial_code: "CO-50",
    denial_reason: "Non-covered service",
    amount_denied_cents: 150000,
    status: "pending_review",
  }], null, 2);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">Data</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">Bulk Claim Import</h1>
        <p className="mt-1 text-sm text-ink-500">Import multiple claims via JSON.</p>
      </header>

      <div className="rounded-lg border border-ink-200 bg-white p-4 mb-4">
        <h2 className="text-sm font-semibold text-ink-500 mb-2">Sample Format</h2>
        <pre className="text-xs text-ink-500 bg-ink-50 p-3 rounded overflow-x-auto">{sampleClaim}</pre>
      </div>

      <textarea
        value={jsonText}
        onChange={(e) => setJsonText(e.target.value)}
        placeholder="Paste JSON array of claims here..."
        rows={10}
        className="w-full rounded border border-ink-200 px-3 py-2 text-sm font-mono mb-4"
      />

      <div className="flex items-center gap-4">
        <button
          onClick={handleImport}
          disabled={importing || !jsonText.trim()}
          className="rounded bg-ink-950 px-6 py-2 text-sm text-white hover:bg-ink-900 disabled:opacity-50"
        >
          {importing ? "Importing..." : "Import Claims"}
        </button>
        <button
          onClick={() => setJsonText(sampleClaim)}
          className="text-sm text-ink-500 hover:text-ink-700"
        >
          Load sample
        </button>
      </div>

      {result && (
        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4">
          <p className="text-sm text-green-700 font-medium">Successfully imported {result.created} claim{result.created !== 1 ? "s" : ""}.</p>
          {result.errors.length > 0 && (
            <ul className="mt-2 space-y-1">
              {result.errors.map((e, i) => <li key={i} className="text-xs text-red-600">{e}</li>)}
            </ul>
          )}
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
    </div>
  );
}

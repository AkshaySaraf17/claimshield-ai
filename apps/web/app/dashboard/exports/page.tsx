"use client";

import { useEffect, useState } from "react";

interface ExportItem {
  id: string;
  name: string;
  description: string;
  format: string;
  endpoint: string;
}

export default function ExportsPage() {
  const [exports, setExports] = useState<ExportItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v1/exports")
      .then((r) => r.json())
      .then((d) => {
        setExports(Array.isArray(d) ? d : d.exports || []);
        setLoading(false);
      });
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">Data</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">Exports</h1>
        <p className="mt-1 text-sm text-ink-500">
          Download claim data, analytics, and reports.
        </p>
      </header>

      {loading ? (
        <p className="text-ink-400">Loading export options...</p>
      ) : exports.length === 0 ? (
        <p className="text-ink-400">No exports available.</p>
      ) : (
        <div className="grid gap-4">
          {exports.map((ex) => (
            <div
              key={ex.id}
              className="flex items-center justify-between rounded-lg border border-ink-200 bg-white px-5 py-4"
            >
              <div>
                <h3 className="text-sm font-semibold text-ink-900">{ex.name}</h3>
                <p className="mt-0.5 text-xs text-ink-500">{ex.description}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="rounded border border-ink-200 px-2 py-0.5 font-mono text-[10px] uppercase text-ink-500">
                  {ex.format}
                </span>
                <button
                  onClick={() => window.open(ex.endpoint, "_blank")}
                  className="rounded bg-ink-950 px-3 py-1.5 text-xs font-medium text-white hover:bg-ink-800"
                >
                  Download
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

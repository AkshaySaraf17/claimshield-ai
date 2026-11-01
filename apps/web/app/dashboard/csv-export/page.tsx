"use client";

import { useState } from "react";

export default function CsvExportPage() {
  const [downloading, setDownloading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function downloadCsv() {
    setDownloading(true);
    setStatus(null);
    try {
      const res = await fetch("/api/v1/claims/export/csv");
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `claims-export-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatus("Download complete!");
    } catch {
      setStatus("Export failed. Please try again.");
    }
    setDownloading(false);
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">Data</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">CSV Export</h1>
        <p className="mt-1 text-sm text-ink-500">Download all claims as a CSV file for offline analysis.</p>
      </header>

      <div className="rounded-lg border border-ink-200 bg-white p-6 text-center">
        <p className="text-sm text-ink-600 mb-4">
          Export includes: claim number, payer, denial code, amounts, status, dates, and assigned user.
        </p>
        <button
          onClick={downloadCsv}
          disabled={downloading}
          className="rounded bg-ink-950 px-6 py-3 text-sm text-white hover:bg-ink-900 disabled:opacity-50"
        >
          {downloading ? "Exporting..." : "Download CSV"}
        </button>
        {status && <p className={`mt-3 text-sm ${status.includes("failed") ? "text-red-600" : "text-green-600"}`}>{status}</p>}
      </div>
    </div>
  );
}

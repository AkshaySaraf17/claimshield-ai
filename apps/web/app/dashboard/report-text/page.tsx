"use client";

import { useEffect, useState } from "react";

export default function ReportTextPage() {
  const [text, setText] = useState("");
  const [period, setPeriod] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v1/reports/summary-text")
      .then((r) => r.json())
      .then((d) => {
        setText(d.text || "");
        setPeriod(d.period_days || 30);
        setLoading(false);
      });
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 print:px-0 print:py-0">
      <header className="mb-6 print:mb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-wide text-ink-500 print:hidden">Reports</p>
            <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">Summary Report</h1>
            <p className="mt-1 text-sm text-ink-500 print:hidden">{period}-day text report — copy or print.</p>
          </div>
          <div className="print:hidden flex gap-2">
            <button onClick={() => { navigator.clipboard.writeText(text); }} className="rounded border border-ink-200 px-4 py-2 text-sm hover:bg-ink-50">Copy</button>
            <button onClick={() => window.print()} className="rounded bg-ink-950 px-4 py-2 text-sm text-white hover:bg-ink-900">Print</button>
          </div>
        </div>
      </header>

      {loading ? (
        <p className="text-ink-400">Generating report...</p>
      ) : !text ? (
        <p className="text-ink-400">No report data available.</p>
      ) : (
        <div className="rounded-lg border border-ink-200 bg-white p-6">
          <pre className="whitespace-pre-wrap text-sm font-mono text-ink-700 leading-relaxed">{text}</pre>
        </div>
      )}
    </div>
  );
}

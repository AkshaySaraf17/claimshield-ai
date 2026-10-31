"use client";

import { useEffect, useState } from "react";

interface HeatmapData {
  payers: string[];
  codes: string[];
  cells: { payer: string; code: string; count: number }[];
  max_count: number;
}

function intensity(count: number, max: number): string {
  if (count === 0) return "bg-ink-50 text-ink-300";
  const ratio = count / Math.max(max, 1);
  if (ratio >= 0.75) return "bg-red-500 text-white";
  if (ratio >= 0.5) return "bg-red-300 text-red-900";
  if (ratio >= 0.25) return "bg-amber-200 text-amber-900";
  return "bg-amber-100 text-amber-800";
}

export default function HeatmapPage() {
  const [data, setData] = useState<HeatmapData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v1/analytics/heatmap")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      });
  }, []);

  if (loading || !data) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-10">
        <p className="text-ink-400">Loading heatmap...</p>
      </div>
    );
  }

  const cellMap = new Map(data.cells.map((c) => [`${c.payer}|${c.code}`, c.count]));

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">
          Analytics
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">
          Denial Heatmap
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Denial frequency by payer and denial code — darker cells indicate higher volume.
        </p>
      </header>

      {/* Legend */}
      <div className="mb-4 flex items-center gap-3 text-xs text-ink-500">
        <span>Intensity:</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-ink-50 border border-ink-200" /> 0</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-amber-100" /> Low</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-amber-200" /> Med</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-red-300" /> High</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-red-500" /> Max</span>
      </div>

      <div className="rounded-lg border border-ink-200 bg-white p-6 overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="px-2 py-2 text-left text-xs text-ink-500">Payer / Code</th>
              {data.codes.map((code) => (
                <th key={code} className="px-2 py-2 text-center font-mono text-[10px] text-ink-500">
                  {code}
                </th>
              ))}
              <th className="px-2 py-2 text-center text-xs text-ink-500">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.payers.map((payer) => {
              const rowTotal = data.codes.reduce(
                (sum, code) => sum + (cellMap.get(`${payer}|${code}`) || 0),
                0,
              );
              return (
                <tr key={payer} className="border-t border-ink-50">
                  <td className="px-2 py-2 text-xs font-medium text-ink-700 whitespace-nowrap">
                    {payer}
                  </td>
                  {data.codes.map((code) => {
                    const count = cellMap.get(`${payer}|${code}`) || 0;
                    return (
                      <td key={code} className="px-1 py-1 text-center">
                        <div
                          className={`mx-auto flex h-8 w-10 items-center justify-center rounded text-xs font-semibold ${intensity(count, data.max_count)}`}
                          title={`${payer} × ${code}: ${count}`}
                        >
                          {count}
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-2 py-2 text-center font-mono text-xs font-semibold text-ink-700">
                    {rowTotal}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-ink-200">
              <td className="px-2 py-2 text-xs font-semibold text-ink-500">Total</td>
              {data.codes.map((code) => {
                const colTotal = data.payers.reduce(
                  (sum, payer) => sum + (cellMap.get(`${payer}|${code}`) || 0),
                  0,
                );
                return (
                  <td key={code} className="px-2 py-2 text-center font-mono text-xs font-semibold text-ink-700">
                    {colTotal}
                  </td>
                );
              })}
              <td className="px-2 py-2 text-center font-mono text-xs font-bold text-ink-900">
                {data.cells.reduce((s, c) => s + c.count, 0)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

interface Factor {
  factor: string;
  impact: string;
  direction: string;
  code?: string;
  payer?: string;
}

interface Prediction {
  claim_id: string;
  predicted_win_probability: number;
  risk_level: string;
  factors: Factor[];
  recommendation: string;
  source: string;
}

export default function PredictorPage() {
  const [claimId, setClaimId] = useState("");
  const [claims, setClaims] = useState<{ id: string; claim_number: string | null }[]>([]);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/v1/claims")
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d) ? d : [];
        setClaims(list.map((c: { id: string; claim_number: string | null }) => ({ id: c.id, claim_number: c.claim_number })));
        if (list.length > 0) setClaimId(list[0].id);
      });
  }, []);

  useEffect(() => {
    if (!claimId) return;
    setLoading(true);
    fetch(`/api/v1/claims/${claimId}/predict`)
      .then((r) => r.json())
      .then((d) => {
        setPrediction(d.claim_id ? d : null);
        setLoading(false);
      });
  }, [claimId]);

  const riskColor = (r: string) => {
    if (r === "low") return "text-green-700 bg-green-100";
    if (r === "high") return "text-red-700 bg-red-100";
    return "text-amber-700 bg-amber-100";
  };

  const dirColor = (d: string) => {
    if (d === "positive") return "text-green-600";
    if (d === "negative") return "text-red-600";
    return "text-ink-500";
  };

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">Intelligence</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">Outcome Predictor</h1>
        <p className="mt-1 text-sm text-ink-500">Deterministic prediction based on historical win rates and claim factors.</p>
      </header>

      <div className="mb-6">
        <select value={claimId} onChange={(e) => setClaimId(e.target.value)} className="rounded border border-ink-200 px-3 py-2 text-sm">
          {claims.map((c) => (
            <option key={c.id} value={c.id}>{c.claim_number || c.id.slice(0, 8)}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-ink-400">Analyzing claim...</p>
      ) : !prediction ? (
        <p className="text-ink-400">No prediction data available.</p>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border border-ink-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-ink-500">Win Probability</p>
                <p className="text-4xl font-bold text-ink-900">{Math.round(prediction.predicted_win_probability * 100)}%</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-ink-500">Risk Level</p>
                <span className={`mt-1 inline-block rounded px-3 py-1 text-lg font-bold ${riskColor(prediction.risk_level)}`}>
                  {prediction.risk_level.toUpperCase()}
                </span>
              </div>
            </div>
            <div className="mt-4 h-3 w-full rounded bg-ink-100 overflow-hidden">
              <div className="h-full rounded bg-green-500 transition-all" style={{ width: `${prediction.predicted_win_probability * 100}%` }} />
            </div>
          </div>

          {prediction.factors.length > 0 && (
            <div className="rounded-lg border border-ink-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-ink-500 mb-3">Contributing Factors</h2>
              <div className="space-y-2">
                {prediction.factors.map((f, i) => (
                  <div key={i} className="flex items-center justify-between text-sm border-b border-ink-100 pb-2 last:border-0">
                    <div>
                      <span className="text-ink-700 font-medium">{f.factor}</span>
                      {f.code && <span className="ml-2 text-xs text-ink-400">({f.code})</span>}
                      {f.payer && <span className="ml-2 text-xs text-ink-400">({f.payer})</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-ink-500">{f.impact}</span>
                      <span className={`text-xs font-medium ${dirColor(f.direction)}`}>{f.direction}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-lg border border-ink-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-ink-500 mb-2">Recommendation</h2>
            <p className="text-sm text-ink-700">{prediction.recommendation}</p>
          </div>

          <p className="text-xs text-ink-400 italic">{prediction.source}</p>
        </div>
      )}
    </div>
  );
}

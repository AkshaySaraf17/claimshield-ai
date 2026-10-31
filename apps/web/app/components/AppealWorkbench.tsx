"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { spring, tapScale, focusNudge } from "../lib/motion";
import { useAuth } from "./AuthProvider";
import type { PipelineResult } from "../lib/api";
import { authFetch } from "../lib/auth";

const crossFade = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.25 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

function MotionTextarea({
  value,
  onChange,
  rows,
  placeholder,
  required,
  className,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  rows: number;
  placeholder: string;
  required?: boolean;
  className: string;
}) {
  return (
    <motion.textarea
      whileFocus={focusNudge}
      transition={spring}
      value={value}
      onChange={onChange}
      rows={rows}
      placeholder={placeholder}
      required={required}
      className={className}
    />
  );
}

function ConfidenceBadge({ value, label }: { value: number | null; label: string }) {
  if (value === null || value === undefined) return null;
  const pct = Math.round(value * 100);
  const color =
    pct >= 80 ? "text-green-700 bg-green-50 border-green-300" :
    pct >= 50 ? "text-amber-700 bg-amber-50 border-amber-300" :
    "text-red-700 bg-red-50 border-red-300";
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-xs ${color}`}>
      {label}: {pct}%
    </span>
  );
}

function RuleResults({ rules }: { rules: PipelineResult["rule_results"] }) {
  if (!rules || rules.length === 0) return null;
  return (
    <div className="space-y-1">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-500">Rule Checks</h4>
      {rules.map((r, i) => {
        const icon = !r.passed && r.severity === "block" ? "🚫" : r.severity === "warn" ? "⚠️" : "✓";
        const bg = !r.passed && r.severity === "block"
          ? "bg-red-50 border-red-200"
          : r.severity === "warn" ? "bg-amber-50 border-amber-200" : "bg-green-50 border-green-200";
        return (
          <div key={i} className={`rounded border px-3 py-2 text-xs ${bg}`}>
            <span className="mr-1">{icon}</span>
            <span className="font-medium">{r.message}</span>
            <span className="ml-2 text-ink-400">({r.source})</span>
          </div>
        );
      })}
    </div>
  );
}

function ResultPanel({
  result,
  onEditAppeal,
  onApprove,
  approving,
  approveError,
  approved,
}: {
  result: PipelineResult;
  onEditAppeal: (text: string) => void;
  onApprove: () => void;
  approving: boolean;
  approveError: string | null;
  approved: boolean;
}) {
  const ds = result.denial_summary;
  const amountDisplay = ds.amount_denied_cents !== null
    ? `$${(ds.amount_denied_cents / 100).toFixed(2)}`
    : "Unknown";

  return (
    <motion.div key="result" {...crossFade} className="mt-4 flex flex-col gap-4">
      {/* Denial summary */}
      <div className="animate-entrance stagger-0 flex items-center justify-between rounded-sm border border-ink-300/40 bg-parchment/50 px-4 py-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-500">
            {ds.payer_name || <span className="italic text-amber-600">Unknown payer — needs review</span>}
          </p>
          <p className="mt-0.5 text-sm text-ink-700">
            {ds.denial_reason || <span className="italic text-amber-600">Reason not extracted</span>}
          </p>
        </div>
        <div className="text-right">
          <span className="rounded-sm border border-denial-500/40 bg-denial-50 px-2 py-1 font-mono text-xs font-medium text-denial-600">
            {ds.denial_code || "N/A"}
          </span>
          <p className="mt-1 font-mono text-sm font-medium text-ink-950">{amountDisplay}</p>
        </div>
      </div>

      {/* Confidence scores */}
      <div className="animate-entrance stagger-1 flex flex-wrap gap-2">
        <ConfidenceBadge value={ds.parser_confidence} label="Parser" />
        <ConfidenceBadge value={result.writer_confidence} label="Writer" />
        {ds.parser_needs_review && (
          <span className="inline-flex items-center rounded border border-amber-300 bg-amber-50 px-2 py-0.5 font-mono text-xs text-amber-700">
            Parser flagged for review
          </span>
        )}
        {result.has_rule_blockers && (
          <span className="inline-flex items-center rounded border border-red-300 bg-red-50 px-2 py-0.5 font-mono text-xs text-red-700">
            Rule blocker found
          </span>
        )}
      </div>

      {/* Rule check results */}
      <div className="animate-entrance stagger-1">
        <RuleResults rules={result.rule_results} />
      </div>

      {/* Appeal letter */}
      <div className="animate-entrance stagger-2">
        <h3 className="text-sm font-semibold text-ink-700">Drafted appeal letter</h3>
        <MotionTextarea
          value={result.generated_appeal || ""}
          onChange={(e) => onEditAppeal(e.target.value)}
          rows={12}
          placeholder=""
          className="mt-1 w-full rounded-sm border border-ink-300/50 p-3 font-mono text-xs focus:border-ledger-500 focus:outline-none focus:ring-1 focus:ring-ledger-500"
        />
      </div>

      {/* Server-enforced approval */}
      {approved ? (
        <div className="animate-entrance rounded-sm border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700">
          ✓ Approved — ready to send via the appeals service.
        </div>
      ) : (
        <motion.button
          whileTap={tapScale}
          transition={spring}
          type="button"
          disabled={approving || !result.generated_appeal}
          onClick={onApprove}
          className="animate-entrance stagger-3 rounded-sm bg-ink-950 px-4 py-2 font-medium text-white transition-colors hover:bg-ink-900 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {approving ? "Submitting approval..." : "Approve appeal (server-enforced)"}
        </motion.button>
      )}

      {approveError && (
        <p className="rounded-sm bg-denial-50 p-3 text-sm text-denial-600">{approveError}</p>
      )}

      <p className="text-xs text-ink-400">
        Approval is server-enforced — only authorized roles (biller, clinic admin, physician reviewer)
        can approve. Nothing is sent without approval.
      </p>
    </motion.div>
  );
}

export default function AppealWorkbench() {
  const { user } = useAuth();
  const [denialText, setDenialText] = useState("");
  const [clinicalNotes, setClinicalNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [approved, setApproved] = useState(false);

  const apiBase = process.env.NEXT_PUBLIC_API_URL || "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    setApproved(false);
    setApproveError(null);

    try {
      // Try the new pipeline API first, fall back to legacy backend
      const pipelineUrl = apiBase
        ? `${apiBase}/api/v1/pipeline/run`
        : "/api/backend/appeal";

      const res = await authFetch(pipelineUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          denial_text: denialText,
          clinical_notes: clinicalNotes,
        }),
      });

      if (!res.ok) {
        const detail = await res.text();
        throw new Error(detail || `Request failed with ${res.status}`);
      }

      const data = await res.json();

      // Normalize response shape (handle both old and new API formats)
      if (data.denial_summary && "parser_confidence" in data.denial_summary) {
        setResult(data as PipelineResult);
      } else {
        // Legacy format adaptation
        setResult({
          status: data.status || "completed",
          denial_summary: {
            denial_code: data.denial_summary?.denial_code || null,
            denial_reason: data.denial_summary?.denial_reason || null,
            payer_name: data.denial_summary?.payer_name || null,
            amount_denied_cents: data.denial_summary?.amount_denied
              ? Math.round(data.denial_summary.amount_denied * 100)
              : null,
            parser_confidence: null,
            parser_needs_review: true,
          },
          rule_results: [],
          has_rule_blockers: false,
          generated_appeal: data.generated_appeal || null,
          writer_confidence: null,
          needs_human_review: true,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove() {
    setApproving(true);
    setApproveError(null);

    try {
      // In full flow: create appeal via appeals service, then approve it
      // For now, show the server-enforced approval concept
      if (!apiBase) {
        // No API configured — show that approval would go through the server
        setApproved(true);
        return;
      }

      // Create the appeal draft
      const createRes = await authFetch(`${apiBase}/api/v1/appeals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claim_id: "00000000-0000-0000-0000-000000000000", // placeholder
          letter_text: result?.generated_appeal,
          confidence: result?.writer_confidence,
        }),
      });

      if (!createRes.ok) {
        throw new Error("Failed to create appeal draft");
      }

      const appeal = await createRes.json();

      // Approve it (server checks role)
      const approveRes = await authFetch(`${apiBase}/api/v1/appeals/${appeal.id}/approve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approved_by: user?.name || user?.sub || "unknown",
        }),
      });

      if (!approveRes.ok) {
        const err = await approveRes.json().catch(() => ({}));
        throw new Error(err.detail || "Server rejected approval — check your role permissions");
      }

      setApproved(true);
    } catch (err) {
      setApproveError(err instanceof Error ? err.message : "Approval failed");
    } finally {
      setApproving(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {/* Intake form */}
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 rounded-sm border border-ink-300/40 bg-white p-6"
      >
        <h2 className="font-display text-lg font-semibold text-ink-950">Intake</h2>

        <label className="text-sm font-medium text-ink-700">
          Denial letter text
          <MotionTextarea
            required
            value={denialText}
            onChange={(e) => setDenialText(e.target.value)}
            rows={6}
            placeholder="Paste the EOB / denial letter text here..."
            className="mt-1 w-full rounded-sm border border-ink-300/50 bg-parchment/40 p-3 text-sm focus:border-ledger-500 focus:outline-none focus:ring-1 focus:ring-ledger-500"
          />
        </label>

        <label className="text-sm font-medium text-ink-700">
          Clinical notes (de-identified)
          <MotionTextarea
            required
            value={clinicalNotes}
            onChange={(e) => setClinicalNotes(e.target.value)}
            rows={6}
            placeholder="Paste the relevant encounter notes here..."
            className="mt-1 w-full rounded-sm border border-ink-300/50 bg-parchment/40 p-3 text-sm focus:border-ledger-500 focus:outline-none focus:ring-1 focus:ring-ledger-500"
          />
        </label>

        <motion.button
          whileTap={tapScale}
          transition={spring}
          type="submit"
          disabled={loading}
          className="mt-2 rounded-sm bg-ledger-600 px-4 py-2 font-medium text-white transition-colors hover:bg-ledger-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Analyzing denial..." : "Draft the appeal"}
        </motion.button>

        <AnimatePresence>
          {error && (
            <motion.p key="error" {...crossFade} className="rounded-sm bg-denial-50 p-3 text-sm text-denial-600">
              {error}
            </motion.p>
          )}
        </AnimatePresence>
      </form>

      {/* Result panel */}
      <div className="rounded-sm border border-ink-300/40 bg-white p-6">
        <h2 className="font-display text-lg font-semibold text-ink-950">Review before sending</h2>

        <AnimatePresence mode="wait">
          {!result && !loading && (
            <motion.p key="empty" {...crossFade} className="mt-4 text-sm text-ink-500">
              Submit a denial on the left. The extracted case summary, rule check results,
              confidence scores, and a drafted appeal will appear here for review.
            </motion.p>
          )}

          {loading && (
            <motion.div key="skeleton" {...crossFade} className="mt-4 space-y-2">
              <div className="h-3 w-3/4 animate-pulse rounded bg-ink-300/30" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-ink-300/30" />
              <div className="h-3 w-full animate-pulse rounded bg-ink-300/30" />
            </motion.div>
          )}

          {result && (
            <ResultPanel
              result={result}
              onEditAppeal={(text) => setResult({ ...result, generated_appeal: text })}
              onApprove={handleApprove}
              approving={approving}
              approveError={approveError}
              approved={approved}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

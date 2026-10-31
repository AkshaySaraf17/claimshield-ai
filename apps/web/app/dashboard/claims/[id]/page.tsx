"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface Claim {
  id: string;
  claim_number: string | null;
  payer_name: string | null;
  denial_code: string | null;
  denial_reason: string | null;
  raw_denial_text: string;
  raw_clinical_notes: string;
  amount_denied_cents: number | null;
  status: string;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
}

interface Appeal {
  id: string;
  claim_id: string;
  version: number;
  letter_text: string | null;
  confidence: number | null;
  needs_review: boolean;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending_review: "bg-amber-100 text-amber-800",
  in_progress: "bg-blue-100 text-blue-800",
  needs_review: "bg-orange-100 text-orange-800",
  approved: "bg-green-100 text-green-800",
  sent: "bg-indigo-100 text-indigo-800",
  won: "bg-emerald-100 text-emerald-800",
  lost: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-800",
};

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending_review: ["in_progress", "cancelled"],
  in_progress: ["needs_review", "cancelled"],
  needs_review: ["approved", "in_progress", "cancelled"],
  approved: ["sent", "cancelled"],
  sent: ["won", "lost"],
  lost: ["in_progress"],
};

const TRANSITION_STYLES: Record<string, string> = {
  in_progress: "bg-blue-600 text-white hover:bg-blue-700",
  needs_review: "bg-orange-600 text-white hover:bg-orange-700",
  approved: "bg-green-600 text-white hover:bg-green-700",
  sent: "bg-indigo-600 text-white hover:bg-indigo-700",
  won: "bg-emerald-600 text-white hover:bg-emerald-700",
  lost: "bg-red-600 text-white hover:bg-red-700",
  cancelled: "bg-gray-500 text-white hover:bg-gray-600",
};

export default function ClaimDetailPage() {
  const params = useParams();
  const claimId = params.id as string;

  const [claim, setClaim] = useState<Claim | null>(null);
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedAppeal, setExpandedAppeal] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [redrafting, setRedrafting] = useState(false);
  const [auditEntries, setAuditEntries] = useState<
    { id: number; action: string; created_at: string; actor_id: string }[]
  >([]);
  const [notes, setNotes] = useState<
    { id: string; author_id: string; content: string; created_at: string }[]
  >([]);
  const [newNote, setNewNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [attachments, setAttachments] = useState<
    { id: string; filename: string; file_type: string; size_bytes: number; uploaded_by: string; description: string | null; created_at: string }[]
  >([]);
  const [generatingLetter, setGeneratingLetter] = useState(false);
  const [generatedLetter, setGeneratedLetter] = useState<string | null>(null);
  const [letterCategory, setLetterCategory] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<
    { type: string; timestamp: string; title: string; detail: string }[]
  >([]);
  const [teamMembers, setTeamMembers] = useState<{ id: string; name: string; role: string }[]>([]);
  const [assignments, setAssignments] = useState<{ id: string; assigned_to: string; assignee_name: string; note: string | null; created_at: string }[]>([]);
  const [assignTo, setAssignTo] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [prediction, setPrediction] = useState<{
    predicted_win_probability: number;
    risk_level: string;
    factors: { factor: string; impact: string; direction: string }[];
    recommendation: string;
  } | null>(null);
  const [tags, setTags] = useState<{ id: string; tag: string; created_by: string }[]>([]);
  const [newTag, setNewTag] = useState("");
  const [addingTag, setAddingTag] = useState(false);
  const [payerResponses, setPayerResponses] = useState<{
    id: string; response_type: string; response_text: string | null;
    amount_approved_cents: number | null; received_at: string; recorded_by: string;
  }[]>([]);
  const [addingResponse, setAddingResponse] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [claimRes, appealsRes, auditRes, notesRes, attachRes] = await Promise.all([
        fetch(`/api/v1/claims/${claimId}`),
        fetch(`/api/v1/appeals?claim_id=${claimId}`),
        fetch(`/api/v1/audit/entries?resource_id=${claimId}&limit=20`),
        fetch(`/api/v1/claims/${claimId}/notes`),
        fetch(`/api/v1/claims/${claimId}/attachments`),
      ]);
      if (!claimRes.ok) throw new Error(`Claim not found: ${claimRes.status}`);
      setClaim(await claimRes.json());
      if (appealsRes.ok) setAppeals(await appealsRes.json());
      if (auditRes.ok) setAuditEntries(await auditRes.json());
      if (notesRes.ok) setNotes(await notesRes.json());
      if (attachRes.ok) setAttachments(await attachRes.json());
      const timelineRes = await fetch(`/api/v1/claims/${claimId}/timeline`);
      if (timelineRes.ok) setTimeline(await timelineRes.json());
      const predictRes = await fetch(`/api/v1/claims/${claimId}/predict`);
      if (predictRes.ok) setPrediction(await predictRes.json());
      const [tagsRes, responsesRes] = await Promise.all([
        fetch(`/api/v1/claims/${claimId}/tags`),
        fetch(`/api/v1/claims/${claimId}/responses`),
      ]);
      if (tagsRes.ok) setTags(await tagsRes.json());
      if (responsesRes.ok) setPayerResponses(await responsesRes.json());
      const [teamRes, assignRes] = await Promise.all([
        fetch("/api/v1/team-members"),
        fetch(`/api/v1/assignments?claim_id=${claimId}`),
      ]);
      if (teamRes.ok) {
        const tmData = await teamRes.json();
        if (Array.isArray(tmData)) {
          setTeamMembers(tmData);
        } else {
          setTeamMembers(Object.entries(tmData).map(([id, name]) => ({ id, name: name as string, role: "biller" })));
        }
      }
      if (assignRes.ok) {
        const all = await assignRes.json();
        setAssignments(Array.isArray(all) ? all.filter((a: { claim_id: string }) => a.claim_id === claimId) : []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load claim");
    } finally {
      setLoading(false);
    }
  }, [claimId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleTransition(newStatus: string) {
    setTransitioning(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/claims/${claimId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus, reviewed_by: "dev-biller" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Transition to ${newStatus} failed`);
      }
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transition failed");
    } finally {
      setTransitioning(false);
    }
  }

  async function handleRedraft() {
    if (!claim) return;
    setRedrafting(true);
    setError(null);
    try {
      const pipelineRes = await fetch("/api/backend/appeal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          denial_text: claim.raw_denial_text,
          clinical_notes: claim.raw_clinical_notes,
        }),
      });
      if (!pipelineRes.ok) throw new Error("Pipeline failed");
      const data = await pipelineRes.json();

      const letterText = data.generated_appeal || data.appeal_letter || null;
      const confidence = data.writer_confidence ?? data.denial_summary?.parser_confidence ?? null;

      const appealRes = await fetch("/api/v1/appeals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claim_id: claimId,
          letter_text: letterText,
          confidence,
        }),
      });
      if (!appealRes.ok) throw new Error("Failed to save new appeal draft");
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Re-draft failed");
    } finally {
      setRedrafting(false);
    }
  }

  async function handleGenerateLetter(category?: string) {
    if (!claim) return;
    setGeneratingLetter(true);
    setGeneratedLetter(null);
    try {
      const res = await fetch("/api/v1/appeal-letters/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claim_id: claimId,
          template_category: category || undefined,
        }),
      });
      if (!res.ok) throw new Error("Letter generation failed");
      const data = await res.json();
      setGeneratedLetter(data.letter_text);
      setLetterCategory(data.template_category);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Letter generation failed");
    } finally {
      setGeneratingLetter(false);
    }
  }

  async function saveLetterAsAppeal() {
    if (!generatedLetter) return;
    setRedrafting(true);
    try {
      const res = await fetch("/api/v1/appeals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claim_id: claimId,
          letter_text: generatedLetter,
        }),
      });
      if (!res.ok) throw new Error("Failed to save appeal");
      setGeneratedLetter(null);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save appeal");
    } finally {
      setRedrafting(false);
    }
  }

  async function addAttachment() {
    const filename = prompt("Filename (e.g., clinical_notes.pdf):");
    if (!filename) return;
    const desc = prompt("Description (optional):") || undefined;
    const ext = filename.split(".").pop()?.toLowerCase() || "unknown";
    const typeMap: Record<string, string> = {
      pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", txt: "text/plain", csv: "text/csv",
    };
    await fetch(`/api/v1/claims/${claimId}/attachments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename,
        file_type: typeMap[ext] || "application/octet-stream",
        size_bytes: Math.floor(Math.random() * 500000) + 1000,
        description: desc,
      }),
    });
    await fetchData();
  }

  async function handleAssign() {
    if (!assignTo) return;
    setAssigning(true);
    try {
      await fetch(`/api/v1/claims/${claimId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claim_id: claimId, assigned_to: assignTo }),
      });
      setAssignTo("");
      await fetchData();
    } catch {
      setError("Failed to assign claim");
    } finally {
      setAssigning(false);
    }
  }

  const centsToDisplay = (cents: number | null) =>
    cents !== null ? `$${(cents / 100).toFixed(2)}` : "Unknown";

  if (loading) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="py-8 text-center text-ink-400">Loading claim...</div>
      </main>
    );
  }

  if (error && !claim) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <p className="rounded bg-red-50 p-4 text-sm text-red-700">{error}</p>
        <Link href="/dashboard/claims" className="mt-4 inline-block text-sm text-ink-500 hover:text-ink-700">
          Back to claims
        </Link>
      </main>
    );
  }

  if (!claim) return null;

  const nextStatuses = ALLOWED_TRANSITIONS[claim.status] || [];

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <Link href="/dashboard/claims" className="text-sm text-ink-500 hover:text-ink-700">
        &larr; Back to claims
      </Link>

      <header className="mt-4 mb-6">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-2xl font-semibold text-ink-950">
            {claim.claim_number || `Claim ${claim.id.slice(0, 8)}`}
          </h1>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[claim.status] || "bg-gray-100 text-gray-800"}`}>
            {claim.status.replace(/_/g, " ")}
          </span>
        </div>
      </header>

      {error && (
        <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      {/* Status transitions */}
      {nextStatuses.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-2 rounded border border-ink-300/30 bg-white px-4 py-3">
          <span className="text-xs font-medium text-ink-500">Move to:</span>
          {nextStatuses.map((s) => (
            <button
              key={s}
              onClick={() => handleTransition(s)}
              disabled={transitioning}
              className={`rounded px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                TRANSITION_STYLES[s] || "bg-gray-200 text-gray-800 hover:bg-gray-300"
              }`}
            >
              {s.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      )}

      {/* Claim details */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded border border-ink-300/40 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">Denial details</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-500">Payer</dt>
              <dd className="font-medium text-ink-900">{claim.payer_name || "Unknown"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-500">Denial code</dt>
              <dd><span className="rounded border border-ink-300/40 px-1.5 py-0.5 font-mono text-xs">{claim.denial_code || "N/A"}</span></dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-500">Amount denied</dt>
              <dd className="font-mono font-medium text-ink-900">{centsToDisplay(claim.amount_denied_cents)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-500">Created</dt>
              <dd className="text-ink-600">{new Date(claim.created_at).toLocaleString()}</dd>
            </div>
            {claim.reviewed_by && (
              <div className="flex justify-between">
                <dt className="text-ink-500">Reviewed by</dt>
                <dd className="text-ink-600">{claim.reviewed_by}</dd>
              </div>
            )}
          </dl>
          {claim.denial_reason && (
            <div className="mt-3 border-t border-ink-300/20 pt-3">
              <p className="text-xs font-semibold text-ink-500">Reason</p>
              <p className="mt-1 text-sm text-ink-700">{claim.denial_reason}</p>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded border border-ink-300/40 bg-white p-5">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-500">Denial text</h2>
            <p className="whitespace-pre-wrap text-xs text-ink-700">{claim.raw_denial_text}</p>
          </div>
          <div className="rounded border border-ink-300/40 bg-white p-5">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-500">Clinical notes</h2>
            <p className="whitespace-pre-wrap text-xs text-ink-700">{claim.raw_clinical_notes}</p>
          </div>
        </div>
      </div>

      {/* Appeal Success Prediction */}
      {prediction && (
        <div className="mt-6 rounded border border-ink-300/40 bg-white p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">
              Appeal Success Prediction
            </h2>
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                prediction.risk_level === "low" ? "bg-emerald-100 text-emerald-700" :
                prediction.risk_level === "medium" ? "bg-amber-100 text-amber-700" :
                "bg-red-100 text-red-700"
              }`}>
                {prediction.risk_level} risk
              </span>
              <span className={`text-2xl font-semibold ${
                prediction.predicted_win_probability >= 0.6 ? "text-emerald-600" :
                prediction.predicted_win_probability >= 0.35 ? "text-amber-600" :
                "text-red-600"
              }`}>
                {Math.round(prediction.predicted_win_probability * 100)}%
              </span>
            </div>
          </div>
          <p className="text-sm text-ink-600 mb-3">{prediction.recommendation}</p>
          <div className="flex flex-wrap gap-2">
            {prediction.factors.map((f, i) => (
              <span
                key={i}
                className={`rounded border px-2 py-1 text-[10px] ${
                  f.direction === "positive" ? "border-green-200 bg-green-50 text-green-700" :
                  f.direction === "negative" ? "border-red-200 bg-red-50 text-red-700" :
                  "border-ink-200 bg-ink-50 text-ink-600"
                }`}
              >
                {f.factor}: {f.impact}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Appeals */}
      <div className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">
            Appeal drafts ({appeals.length})
          </h2>
          <button
            onClick={handleRedraft}
            disabled={redrafting}
            className="rounded bg-ledger-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-ledger-700 disabled:opacity-50"
          >
            {redrafting ? "Generating new draft..." : "Re-draft appeal"}
          </button>
        </div>
        {appeals.length === 0 ? (
          <p className="rounded border border-ink-300/30 bg-parchment/30 px-4 py-6 text-center text-sm text-ink-400">
            No appeals yet. Click &quot;Re-draft appeal&quot; to generate one, or use the Appeal Workbench.
          </p>
        ) : (
          <div className="space-y-3">
            {appeals.map((appeal) => (
              <div key={appeal.id} className="rounded border border-ink-300/30 bg-white">
                <button
                  onClick={() => setExpandedAppeal(expandedAppeal === appeal.id ? null : appeal.id)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-parchment/30"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-ink-400">v{appeal.version}</span>
                    {appeal.confidence !== null && (
                      <span className={`rounded border px-1.5 py-0.5 font-mono text-xs ${
                        appeal.confidence >= 0.8
                          ? "border-green-300 bg-green-50 text-green-700"
                          : appeal.confidence >= 0.5
                          ? "border-amber-300 bg-amber-50 text-amber-700"
                          : "border-red-300 bg-red-50 text-red-700"
                      }`}>
                        {Math.round(appeal.confidence * 100)}% confidence
                      </span>
                    )}
                    {appeal.needs_review ? (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">Pending review</span>
                    ) : (
                      <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">
                        Approved by {appeal.approved_by}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-ink-400">
                    {new Date(appeal.created_at).toLocaleString()}
                    <span className="ml-2">{expandedAppeal === appeal.id ? "−" : "+"}</span>
                  </span>
                </button>
                {expandedAppeal === appeal.id && appeal.letter_text && (
                  <div className="border-t border-ink-300/20 bg-parchment/20 p-4">
                    <pre className="whitespace-pre-wrap font-mono text-xs text-ink-700">
                      {appeal.letter_text}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Assignment */}
      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">
          Assignment
        </h2>
        <div className="flex items-center gap-2 mb-2">
          <select
            value={assignTo}
            onChange={(e) => setAssignTo(e.target.value)}
            className="rounded border border-ink-300 px-2 py-1 text-sm"
          >
            <option value="">Select team member...</option>
            {teamMembers.map((m) => (
              <option key={m.id} value={m.id}>{m.name} ({m.role})</option>
            ))}
          </select>
          <button
            onClick={handleAssign}
            disabled={!assignTo || assigning}
            className="rounded bg-indigo-600 px-3 py-1 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {assigning ? "Assigning..." : "Assign"}
          </button>
        </div>
        {assignments.length > 0 && (
          <div className="space-y-1">
            {assignments.map((a) => (
              <div key={a.id} className="flex items-center gap-2 text-xs text-ink-600">
                <span className="rounded bg-indigo-50 px-1.5 py-0.5 font-medium text-indigo-700">{a.assignee_name}</span>
                <span className="text-ink-400">{a.created_at ? new Date(a.created_at).toLocaleDateString() : ""}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tags */}
      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">Tags</h2>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          {tags.map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center gap-1 rounded-full border border-ink-200 bg-ink-50 px-2.5 py-0.5 text-xs text-ink-700"
            >
              {t.tag}
              <button
                onClick={async () => {
                  await fetch(`/api/v1/claims/${claimId}/tags/${t.id}`, { method: "DELETE" });
                  await fetchData();
                }}
                className="ml-0.5 text-ink-400 hover:text-red-500"
              >
                ×
              </button>
            </span>
          ))}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newTag.trim()) return;
              setAddingTag(true);
              await fetch(`/api/v1/claims/${claimId}/tags`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tag: newTag.trim() }),
              });
              setNewTag("");
              setAddingTag(false);
              await fetchData();
            }}
            className="inline-flex gap-1"
          >
            <input
              type="text"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              placeholder="Add tag..."
              className="w-24 rounded border border-ink-200 px-2 py-0.5 text-xs focus:border-ledger-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={addingTag || !newTag.trim()}
              className="rounded bg-ink-800 px-2 py-0.5 text-[10px] text-white hover:bg-ink-700 disabled:opacity-50"
            >
              +
            </button>
          </form>
        </div>
      </div>

      {/* Payer Responses */}
      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">
            Payer Responses ({payerResponses.length})
          </h2>
          <button
            onClick={async () => {
              const responseType = prompt("Response type (approved/denied/partial/additional_info_requested/other):");
              if (!responseType) return;
              const responseText = prompt("Response details:") || undefined;
              const amountStr = prompt("Amount approved (cents, or leave blank):") || undefined;
              setAddingResponse(true);
              await fetch(`/api/v1/claims/${claimId}/responses`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  response_type: responseType,
                  response_text: responseText,
                  amount_approved_cents: amountStr ? parseInt(amountStr) : undefined,
                }),
              });
              setAddingResponse(false);
              await fetchData();
            }}
            disabled={addingResponse}
            className="rounded bg-ink-950 px-3 py-1 text-xs font-medium text-white hover:bg-ink-900 disabled:opacity-50"
          >
            {addingResponse ? "Recording..." : "Record Response"}
          </button>
        </div>
        {payerResponses.length > 0 && (
          <div className="space-y-2">
            {payerResponses.map((r) => {
              const typeColors: Record<string, string> = {
                approved: "bg-emerald-100 text-emerald-700",
                denied: "bg-red-100 text-red-700",
                partial: "bg-amber-100 text-amber-700",
                additional_info_requested: "bg-blue-100 text-blue-700",
                other: "bg-ink-100 text-ink-600",
              };
              return (
                <div key={r.id} className="rounded border border-ink-200 bg-white px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${typeColors[r.response_type] || typeColors.other}`}>
                        {r.response_type.replace(/_/g, " ")}
                      </span>
                      {r.amount_approved_cents != null && (
                        <span className="font-mono text-xs text-emerald-600">
                          {centsToDisplay(r.amount_approved_cents)}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-ink-400">
                      {new Date(r.received_at).toLocaleDateString()}
                    </span>
                  </div>
                  {r.response_text && (
                    <p className="mt-1 text-xs text-ink-600">{r.response_text}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="mt-8">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-500">
          Notes ({notes.length})
        </h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newNote.trim()) return;
            setAddingNote(true);
            try {
              const res = await fetch(`/api/v1/claims/${claimId}/notes`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content: newNote }),
              });
              if (res.ok) {
                setNewNote("");
                await fetchData();
              }
            } finally {
              setAddingNote(false);
            }
          }}
          className="mb-3 flex gap-2"
        >
          <input
            type="text"
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Add a note..."
            className="flex-1 rounded border border-ink-300/50 px-3 py-1.5 text-sm focus:border-ledger-500 focus:outline-none focus:ring-1 focus:ring-ledger-500"
          />
          <button
            type="submit"
            disabled={addingNote || !newNote.trim()}
            className="rounded bg-ink-950 px-3 py-1.5 text-xs font-medium text-white hover:bg-ink-900 disabled:opacity-50"
          >
            {addingNote ? "Adding..." : "Add note"}
          </button>
        </form>
        {notes.length > 0 && (
          <div className="space-y-2">
            {notes.map((note) => (
              <div key={note.id} className="rounded border border-ink-300/20 bg-white px-4 py-3">
                <p className="text-sm text-ink-700">{note.content}</p>
                <p className="mt-1 text-xs text-ink-400">
                  by {note.author_id} &middot; {new Date(note.created_at).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Appeal Letter Generator */}
      <div className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">
            Appeal Letter Generator
          </h2>
          <div className="flex gap-2">
            {["Medical Necessity", "Timely Filing", "Authorization", "Coding", "Coverage"].map((cat) => (
              <button
                key={cat}
                onClick={() => handleGenerateLetter(cat)}
                disabled={generatingLetter}
                className="rounded border border-ink-300/50 px-2 py-1 text-xs text-ink-600 hover:bg-ink-100 disabled:opacity-50"
              >
                {cat}
              </button>
            ))}
            <button
              onClick={() => handleGenerateLetter()}
              disabled={generatingLetter}
              className="rounded bg-ledger-600 px-3 py-1 text-xs font-medium text-white hover:bg-ledger-700 disabled:opacity-50"
            >
              {generatingLetter ? "Generating..." : "Auto-detect"}
            </button>
          </div>
        </div>
        {generatedLetter && (
          <div className="rounded border border-ink-300/30 bg-white">
            <div className="flex items-center justify-between border-b border-ink-300/20 px-4 py-2">
              <span className="text-xs text-ink-500">
                Template: <span className="font-medium text-ink-700">{letterCategory}</span>
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => navigator.clipboard.writeText(generatedLetter)}
                  className="rounded border border-ink-300/50 px-2 py-1 text-xs text-ink-600 hover:bg-ink-100"
                >
                  Copy
                </button>
                <button
                  onClick={saveLetterAsAppeal}
                  disabled={redrafting}
                  className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  Save as Appeal Draft
                </button>
              </div>
            </div>
            <pre className="whitespace-pre-wrap p-4 font-mono text-xs text-ink-700 max-h-96 overflow-y-auto">
              {generatedLetter}
            </pre>
          </div>
        )}
      </div>

      {/* Attachments */}
      <div className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">
            Attachments ({attachments.length})
          </h2>
          <button
            onClick={addAttachment}
            className="rounded bg-ink-950 px-3 py-1.5 text-xs font-medium text-white hover:bg-ink-900"
          >
            Add attachment
          </button>
        </div>
        {attachments.length > 0 ? (
          <div className="space-y-2">
            {attachments.map((att) => (
              <div key={att.id} className="flex items-center justify-between rounded border border-ink-300/20 bg-white px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="rounded bg-ink-100 px-2 py-1 font-mono text-xs text-ink-600">
                    {att.filename.split(".").pop()?.toUpperCase() || "FILE"}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-ink-900">{att.filename}</p>
                    {att.description && <p className="text-xs text-ink-500">{att.description}</p>}
                  </div>
                </div>
                <div className="text-right text-xs text-ink-400">
                  <p>{(att.size_bytes / 1024).toFixed(1)} KB</p>
                  <p>{new Date(att.created_at).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded border border-ink-300/30 bg-parchment/30 px-4 py-6 text-center text-sm text-ink-400">
            No attachments yet.
          </p>
        )}
      </div>

      {/* Timeline */}
      {timeline.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-500">
            Claim Timeline
          </h2>
          <div className="relative border-l-2 border-ink-200 pl-6 space-y-4">
            {timeline.map((evt, i) => {
              const dotColor =
                evt.type === "claim_created" ? "bg-blue-500" :
                evt.type === "appeal_created" ? "bg-purple-500" :
                evt.type === "appeal_approved" ? "bg-green-500" :
                evt.type === "note" ? "bg-amber-500" :
                evt.type === "deadline" ? "bg-red-500" :
                "bg-ink-400";
              return (
                <div key={i} className="relative">
                  <div className={`absolute -left-8 top-1.5 h-3 w-3 rounded-full ${dotColor}`} />
                  <div className="text-sm">
                    <p className="font-medium text-ink-900">{evt.title}</p>
                    <p className="text-xs text-ink-500">{evt.detail}</p>
                    <p className="mt-0.5 text-[10px] text-ink-400">
                      {new Date(evt.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </main>
  );
}

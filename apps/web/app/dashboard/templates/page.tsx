"use client";

import { useEffect, useState } from "react";

interface BuiltinTemplate {
  category: string;
  sections: string[];
  source: string;
}

interface CustomTemplate {
  id: string;
  name: string;
  category: string;
  sections: string[];
  source: string;
  body_template: string | null;
  is_active: boolean;
  created_by: string;
  created_at: string;
}

const SECTION_OPTIONS = [
  "patient_info",
  "denial_summary",
  "medical_necessity_argument",
  "clinical_evidence",
  "regulatory_citations",
  "timely_filing_argument",
  "proof_of_timely_submission",
  "authorization_argument",
  "auth_reference_numbers",
  "coding_correction_argument",
  "supporting_documentation",
  "coverage_argument",
  "plan_documentation",
  "duplicate_rebuttal",
  "service_differentiation",
  "closing",
];

export default function TemplatesPage() {
  const [builtins, setBuiltins] = useState<BuiltinTemplate[]>([]);
  const [customs, setCustoms] = useState<CustomTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newSections, setNewSections] = useState<string[]>([
    "patient_info",
    "denial_summary",
    "closing",
  ]);
  const [newSource, setNewSource] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/v1/appeal-templates").then((r) => r.json()),
      fetch("/api/v1/custom-templates").then((r) => r.json()),
    ]).then(([b, c]) => {
      setBuiltins(Array.isArray(b) ? b : []);
      setCustoms(Array.isArray(c) ? c : []);
      setLoading(false);
    });
  }, []);

  async function createTemplate() {
    setSaving(true);
    const resp = await fetch("/api/v1/custom-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName,
        category: newCategory,
        sections: newSections,
        source: newSource,
      }),
    });
    if (resp.ok) {
      const t = await resp.json();
      setCustoms((prev) => [t, ...prev]);
      setShowCreate(false);
      setNewName("");
      setNewCategory("");
      setNewSections(["patient_info", "denial_summary", "closing"]);
      setNewSource("");
    }
    setSaving(false);
  }

  async function deleteTemplate(id: string) {
    await fetch(`/api/v1/custom-templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ _action: "delete", id }),
    });
    setCustoms((prev) => prev.filter((t) => t.id !== id));
  }

  function toggleSection(s: string) {
    setNewSections((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-wide text-ink-500">
            Configuration
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">
            Appeal Templates
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            Built-in and custom templates for appeal letter generation.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="rounded bg-ink-950 px-4 py-2 text-sm font-medium text-white hover:bg-ink-900"
        >
          {showCreate ? "Cancel" : "+ New Template"}
        </button>
      </header>

      {/* Create form */}
      {showCreate && (
        <div className="mb-6 rounded-lg border border-indigo-200 bg-indigo-50/50 p-4">
          <h2 className="mb-3 text-sm font-semibold text-ink-900">
            Create Custom Template
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-ink-600 mb-1">
                Template Name
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Medical Necessity — Outpatient"
                className="w-full rounded border border-ink-300 px-2.5 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-600 mb-1">
                Category
              </label>
              <input
                type="text"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="e.g. Medical Necessity"
                className="w-full rounded border border-ink-300 px-2.5 py-1.5 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-ink-600 mb-1">
                Source / Citation
              </label>
              <input
                type="text"
                value={newSource}
                onChange={(e) => setNewSource(e.target.value)}
                placeholder="e.g. CMS Medicare Claims Processing Manual Ch. 1 §60"
                className="w-full rounded border border-ink-300 px-2.5 py-1.5 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-ink-600 mb-2">
                Sections (click to toggle)
              </label>
              <div className="flex flex-wrap gap-1.5">
                {SECTION_OPTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => toggleSection(s)}
                    className={`rounded px-2 py-1 text-xs transition-colors ${
                      newSections.includes(s)
                        ? "bg-indigo-600 text-white"
                        : "bg-ink-100 text-ink-600 hover:bg-ink-200"
                    }`}
                  >
                    {s.replace(/_/g, " ")}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              onClick={createTemplate}
              disabled={!newName || !newCategory || !newSource || saving}
              className="rounded bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? "Creating..." : "Create Template"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-ink-400">Loading templates...</p>
      ) : (
        <>
          {/* Custom templates */}
          {customs.length > 0 && (
            <div className="mb-8">
              <h2 className="mb-3 text-sm font-semibold text-ink-700">
                Custom Templates ({customs.length})
              </h2>
              <div className="space-y-2">
                {customs.map((t) => (
                  <div
                    key={t.id}
                    className="rounded-lg border border-indigo-200 bg-white px-4 py-3"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-ink-900">
                          {t.name}
                        </h3>
                        <p className="text-xs text-ink-500">
                          {t.category} &middot; {t.source}
                        </p>
                      </div>
                      <button
                        onClick={() => deleteTemplate(t.id)}
                        className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {t.sections.map((s) => (
                        <span
                          key={s}
                          className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] text-indigo-700"
                        >
                          {s.replace(/_/g, " ")}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Built-in templates */}
          <h2 className="mb-3 text-sm font-semibold text-ink-700">
            Built-in Templates ({builtins.length})
          </h2>
          <div className="space-y-2">
            {builtins.map((t) => (
              <div
                key={t.category}
                className="rounded-lg border border-ink-200 bg-white px-4 py-3"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-ink-900">
                      {t.category}
                    </h3>
                    <p className="text-xs text-ink-500">{t.source}</p>
                  </div>
                  <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] text-ink-500">
                    built-in
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {t.sections.map((s) => (
                    <span
                      key={s}
                      className="rounded bg-ink-50 px-1.5 py-0.5 text-[10px] text-ink-600"
                    >
                      {s.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

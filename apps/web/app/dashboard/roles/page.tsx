"use client";

import { useEffect, useState } from "react";

interface Role {
  role: string;
  permissions: string[];
  user_count: number;
}

const PERM_LABELS: Record<string, string> = {
  read: "View claims & data",
  write: "Create & edit claims",
  approve: "Approve appeals",
  send: "Send appeals to payers",
  assign: "Assign claims to users",
  manage_users: "Manage user roles",
  manage_rules: "Manage routing rules",
  view_audit: "View audit log",
  export: "Export data",
};

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v1/roles")
      .then((r) => r.json())
      .then((d) => {
        setRoles(Array.isArray(d) ? d : []);
        setLoading(false);
      });
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-500">Administration</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">Roles & Permissions</h1>
        <p className="mt-1 text-sm text-ink-500">
          View role capabilities and permission levels.
        </p>
      </header>

      {loading ? (
        <p className="text-ink-400">Loading roles...</p>
      ) : (
        <div className="grid gap-4">
          {roles.map((r) => (
            <div
              key={r.role}
              className="rounded-lg border border-ink-200 bg-white px-5 py-4"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <h3 className="text-base font-semibold text-ink-900 capitalize">{r.role}</h3>
                  <span className="rounded bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700">
                    {r.permissions.length} permissions
                  </span>
                </div>
                <span className="text-xs text-ink-500">{r.user_count} users</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {r.permissions.map((p) => (
                  <span
                    key={p}
                    className="rounded border border-ink-200 bg-ink-50 px-2 py-1 text-xs text-ink-600"
                  >
                    {PERM_LABELS[p] || p}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

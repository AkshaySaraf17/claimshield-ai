"use client";

import { useEffect, useState } from "react";

interface PayerContact {
  id: string;
  payer_name: string;
  contact_name: string | null;
  phone: string | null;
  fax: string | null;
  email: string | null;
  address: string | null;
  department: string | null;
  notes: string | null;
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<PayerContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    payer_name: "",
    contact_name: "",
    phone: "",
    fax: "",
    email: "",
    department: "",
    notes: "",
  });

  const fetchContacts = () => {
    fetch("/api/v1/payer-contacts")
      .then((r) => r.json())
      .then((d) => {
        setContacts(Array.isArray(d) ? d : []);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchContacts();
  }, []);

  const handleCreate = async () => {
    await fetch("/api/v1/payer-contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setShowForm(false);
    setForm({ payer_name: "", contact_name: "", phone: "", fax: "", email: "", department: "", notes: "" });
    fetchContacts();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/v1/payer-contacts/${id}`, { method: "DELETE" });
    fetchContacts();
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-wide text-ink-500">Directory</p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950">Payer Contacts</h1>
          <p className="mt-1 text-sm text-ink-500">
            Contact information for payer appeals departments.
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded bg-ink-950 px-3 py-1.5 text-xs font-medium text-white hover:bg-ink-800"
        >
          {showForm ? "Cancel" : "Add Contact"}
        </button>
      </header>

      {showForm && (
        <div className="mb-6 rounded-lg border border-ink-200 bg-white p-5">
          <h3 className="mb-3 text-sm font-semibold text-ink-700">New Payer Contact</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-ink-500 mb-1">Payer Name *</label>
              <input value={form.payer_name} onChange={(e) => setForm({ ...form, payer_name: e.target.value })}
                className="w-full rounded border border-ink-200 px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-ink-500 mb-1">Contact Name</label>
              <input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                className="w-full rounded border border-ink-200 px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-ink-500 mb-1">Phone</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full rounded border border-ink-200 px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-ink-500 mb-1">Fax</label>
              <input value={form.fax} onChange={(e) => setForm({ ...form, fax: e.target.value })}
                className="w-full rounded border border-ink-200 px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-ink-500 mb-1">Email</label>
              <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full rounded border border-ink-200 px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-ink-500 mb-1">Department</label>
              <input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}
                className="w-full rounded border border-ink-200 px-2 py-1.5 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-ink-500 mb-1">Notes</label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full rounded border border-ink-200 px-2 py-1.5 text-sm" rows={2} />
            </div>
          </div>
          <button onClick={handleCreate} disabled={!form.payer_name}
            className="mt-3 rounded bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-40">
            Save Contact
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-ink-400">Loading contacts...</p>
      ) : contacts.length === 0 ? (
        <div className="rounded-lg border border-ink-200 bg-white p-8 text-center">
          <p className="text-ink-500">No payer contacts recorded.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {contacts.map((c) => (
            <div key={c.id} className="rounded-lg border border-ink-200 bg-white px-5 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-ink-900">{c.payer_name}</h3>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-ink-500">
                    {c.contact_name && <span>{c.contact_name}</span>}
                    {c.department && <span className="rounded bg-ink-100 px-1.5 py-0.5">{c.department}</span>}
                    {c.phone && <span>Ph: {c.phone}</span>}
                    {c.fax && <span>Fax: {c.fax}</span>}
                    {c.email && <span>{c.email}</span>}
                  </div>
                  {c.notes && <p className="mt-1 text-xs text-ink-400">{c.notes}</p>}
                </div>
                <button onClick={() => handleDelete(c.id)}
                  className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

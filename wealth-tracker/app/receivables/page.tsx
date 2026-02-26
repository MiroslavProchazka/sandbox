"use client";

import { useState, useEffect, useCallback } from "react";
import Modal from "@/components/Modal";
import FormField from "@/components/FormField";
import { formatCurrency } from "@/lib/currencies";

interface Receivable {
  id: string;
  description: string;
  client: string | null;
  amount: number;
  currency: string;
  invoiced: boolean;
  dueDate: string | null;
  status: "PENDING" | "INVOICED" | "PAID" | "OVERDUE";
  notes: string | null;
  createdAt: string;
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  PENDING:  { label: "Pending",  cls: "badge badge-yellow" },
  INVOICED: { label: "Invoiced", cls: "badge badge-blue" },
  PAID:     { label: "Paid",     cls: "badge badge-green" },
  OVERDUE:  { label: "Overdue",  cls: "badge badge-red" },
};

const EMPTY_FORM = {
  description: "", client: "", amount: "", currency: "CZK",
  invoiced: false, dueDate: "", status: "PENDING", notes: "",
};

export default function ReceivablesPage() {
  const [items, setItems] = useState<Receivable[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/receivables");
    setItems(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/receivables", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        amount: parseFloat(form.amount as string),
        dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : null,
      }),
    });
    setForm({ ...EMPTY_FORM });
    setShowModal(false);
    setSaving(false);
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this receivable?")) return;
    await fetch(`/api/receivables/${id}`, { method: "DELETE" });
    load();
  }

  async function markPaid(item: Receivable) {
    await fetch(`/api/receivables/${item.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...item, status: "PAID" }),
    });
    load();
  }

  const total = items.filter((i) => i.status !== "PAID").reduce((s, i) => s + i.amount, 0);
  const totalAll = items.reduce((s, i) => s + i.amount, 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.75rem", fontWeight: 700 }}>Receivables</h1>
          <p style={{ color: "var(--muted)", margin: "0.35rem 0 0", fontSize: "0.875rem" }}>
            Un-invoiced work, outstanding invoices, money owed to you
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowModal(true)}>+ Add</button>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        {[
          { label: "Outstanding", value: formatCurrency(total, "CZK"), color: "var(--yellow)" },
          { label: "Total (incl. paid)", value: formatCurrency(totalAll, "CZK"), color: "var(--muted)" },
          { label: "Items Outstanding", value: String(items.filter((i) => i.status !== "PAID").length), color: "var(--accent)" },
          { label: "Overdue", value: String(items.filter((i) => i.status === "OVERDUE").length), color: "var(--red)" },
        ].map((s) => (
          <div key={s.label} className="card">
            <div style={{ fontSize: "0.7rem", color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.4rem" }}>{s.label}</div>
            <div style={{ fontSize: "1.4rem", fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <p style={{ padding: "2rem", color: "var(--muted)", textAlign: "center" }}>Loading…</p>
        ) : items.length === 0 ? (
          <p style={{ padding: "2rem", color: "var(--muted)", textAlign: "center" }}>
            No receivables yet. Track un-invoiced work or outstanding invoices.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th>Client</th>
                <th>Amount</th>
                <th>Due Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const overdue = item.status !== "PAID" && item.dueDate && new Date(item.dueDate) < new Date();
                return (
                  <tr key={item.id}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{item.description}</div>
                      {item.notes && <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>{item.notes}</div>}
                    </td>
                    <td style={{ color: "var(--muted)" }}>{item.client ?? "—"}</td>
                    <td style={{ fontWeight: 600, color: item.status === "PAID" ? "var(--green)" : "var(--foreground)" }}>
                      {formatCurrency(item.amount, item.currency)}
                    </td>
                    <td style={{ color: overdue ? "var(--red)" : "var(--muted)", fontSize: "0.8rem" }}>
                      {item.dueDate ? new Date(item.dueDate).toLocaleDateString("cs-CZ") : "—"}
                      {overdue && <span style={{ marginLeft: "0.25rem" }}>⚠️</span>}
                    </td>
                    <td>
                      <span className={STATUS_BADGE[item.status]?.cls ?? "badge badge-gray"}>
                        {STATUS_BADGE[item.status]?.label ?? item.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                        {item.status !== "PAID" && (
                          <button
                            onClick={() => markPaid(item)}
                            style={{
                              background: "rgba(16,185,129,0.15)",
                              color: "var(--green)",
                              border: "1px solid var(--green)",
                              borderRadius: "6px",
                              padding: "0.3rem 0.6rem",
                              cursor: "pointer",
                              fontSize: "0.7rem",
                              fontWeight: 600,
                            }}
                          >
                            Mark Paid
                          </button>
                        )}
                        <button className="btn-danger" onClick={() => handleDelete(item.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <Modal title="Add Receivable" onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <FormField label="Description *" name="description" value={form.description} onChange={handleChange} placeholder="e.g. Website redesign — March" required />
            <FormField label="Client" name="client" value={form.client} onChange={handleChange} placeholder="e.g. Acme s.r.o." />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <FormField label="Amount *" name="amount" type="number" value={form.amount} onChange={handleChange} placeholder="0" step="0.01" required />
              <FormField label="Currency" name="currency" value={form.currency} onChange={handleChange}
                options={[
                  { value: "CZK", label: "CZK" },
                  { value: "EUR", label: "EUR" },
                  { value: "USD", label: "USD" },
                ]}
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <FormField label="Due Date" name="dueDate" type="date" value={form.dueDate} onChange={handleChange} />
              <FormField label="Status" name="status" value={form.status} onChange={handleChange}
                options={[
                  { value: "PENDING",  label: "Pending (un-invoiced)" },
                  { value: "INVOICED", label: "Invoiced" },
                  { value: "OVERDUE",  label: "Overdue" },
                  { value: "PAID",     label: "Paid" },
                ]}
              />
            </div>
            <FormField label="Notes" name="notes" type="textarea" value={form.notes} onChange={handleChange} placeholder="Additional details…" />
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", marginTop: "0.5rem" }}>
              <button type="button" className="btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={saving}>{saving ? "Saving…" : "Add Receivable"}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import Modal from "@/components/Modal";
import FormField from "@/components/FormField";
import { formatCurrency } from "@/lib/currencies";

interface SavingsAccount {
  id: string;
  name: string;
  bank: string;
  balance: number;
  currency: string;
  interestRate: number | null;
  notes: string | null;
}

const EMPTY = { name: "", bank: "", balance: "", currency: "CZK", interestRate: "", notes: "" };

export default function SavingsPage() {
  const [items, setItems] = useState<SavingsAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/savings");
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
    await fetch("/api/savings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        balance: parseFloat(form.balance as string),
        interestRate: form.interestRate ? parseFloat(form.interestRate as string) : null,
      }),
    });
    setForm({ ...EMPTY });
    setShowModal(false);
    setSaving(false);
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this savings account?")) return;
    await fetch(`/api/savings/${id}`, { method: "DELETE" });
    load();
  }

  const total = items.reduce((s, i) => s + i.balance, 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.75rem", fontWeight: 700 }}>Savings Accounts</h1>
          <p style={{ color: "var(--muted)", margin: "0.35rem 0 0", fontSize: "0.875rem" }}>
            Savings, spořicí účty, term deposits
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowModal(true)}>+ Add Account</button>
      </div>

      {/* Total */}
      <div className="card" style={{ marginBottom: "1.5rem", borderLeft: "3px solid var(--green)" }}>
        <div style={{ fontSize: "0.7rem", color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>Total Savings</div>
        <div style={{ fontSize: "2rem", fontWeight: 800, marginTop: "0.25rem" }}>{formatCurrency(total, "CZK")}</div>
        <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.25rem" }}>{items.length} account{items.length !== 1 ? "s" : ""}</div>
      </div>

      {/* Cards */}
      {loading ? (
        <p style={{ color: "var(--muted)" }}>Loading…</p>
      ) : items.length === 0 ? (
        <div className="card" style={{ textAlign: "center", color: "var(--muted)" }}>
          <p>No savings accounts yet. Add your first spořicí účet.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1rem" }}>
          {items.map((item) => (
            <div key={item.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "1rem" }}>{item.name}</div>
                  <div style={{ color: "var(--muted)", fontSize: "0.8rem", marginTop: "0.2rem" }}>{item.bank}</div>
                </div>
                <button className="btn-danger" onClick={() => handleDelete(item.id)}>Delete</button>
              </div>
              <div style={{ marginTop: "1rem" }}>
                <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--green)" }}>
                  {formatCurrency(item.balance, item.currency)}
                </div>
                {item.interestRate && (
                  <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: "0.35rem" }}>
                    Úroková sazba: <span style={{ color: "var(--accent)", fontWeight: 600 }}>{item.interestRate}% p.a.</span>
                    {" "}≈ {formatCurrency((item.balance * item.interestRate) / 100, item.currency)}/yr
                  </div>
                )}
                {item.notes && (
                  <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.5rem", fontStyle: "italic" }}>{item.notes}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <Modal title="Add Savings Account" onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <FormField label="Account Name *" name="name" value={form.name} onChange={handleChange} placeholder="e.g. Spořicí účet Moneta" required />
            <FormField label="Bank / Provider *" name="bank" value={form.bank} onChange={handleChange} placeholder="e.g. Moneta Money Bank" required />
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "0.75rem" }}>
              <FormField label="Balance *" name="balance" type="number" value={form.balance} onChange={handleChange} placeholder="0" step="0.01" required />
              <FormField label="Currency" name="currency" value={form.currency} onChange={handleChange}
                options={[{ value: "CZK", label: "CZK" }, { value: "EUR", label: "EUR" }, { value: "USD", label: "USD" }]}
              />
            </div>
            <FormField label="Interest Rate % p.a. (Úroková sazba)" name="interestRate" type="number" value={form.interestRate} onChange={handleChange} placeholder="e.g. 4.5" step="0.01" min="0" />
            <FormField label="Notes" name="notes" type="textarea" value={form.notes} onChange={handleChange} placeholder="Any additional notes…" />
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", marginTop: "0.5rem" }}>
              <button type="button" className="btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={saving}>{saving ? "Saving…" : "Add Account"}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

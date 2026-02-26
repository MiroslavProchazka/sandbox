"use client";

import { useState, useEffect, useCallback } from "react";
import Modal from "@/components/Modal";
import FormField from "@/components/FormField";
import { formatCurrency } from "@/lib/currencies";

interface BankAccount {
  id: string;
  name: string;
  bank: string;
  balance: number;
  currency: string;
  iban: string | null;
  notes: string | null;
}

const EMPTY = { name: "", bank: "", balance: "", currency: "CZK", iban: "", notes: "" };

export default function AccountsPage() {
  const [items, setItems] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/accounts");
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
    await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        balance: parseFloat(form.balance as string),
        iban: form.iban || null,
      }),
    });
    setForm({ ...EMPTY });
    setShowModal(false);
    setSaving(false);
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this account?")) return;
    await fetch(`/api/accounts/${id}`, { method: "DELETE" });
    load();
  }

  const byCurrency = items.reduce<Record<string, number>>((acc, item) => {
    acc[item.currency] = (acc[item.currency] ?? 0) + item.balance;
    return acc;
  }, {});

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.75rem", fontWeight: 700 }}>Bank Accounts</h1>
          <p style={{ color: "var(--muted)", margin: "0.35rem 0 0", fontSize: "0.875rem" }}>
            Current accounts, Revolut, Wise — regular balances
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowModal(true)}>+ Add Account</button>
      </div>

      {/* Balances by currency */}
      {Object.keys(byCurrency).length > 0 && (
        <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
          {Object.entries(byCurrency).map(([ccy, amount]) => (
            <div key={ccy} className="card" style={{ flex: "0 0 auto", borderLeft: "3px solid var(--accent)" }}>
              <div style={{ fontSize: "0.7rem", color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Total {ccy}
              </div>
              <div style={{ fontSize: "1.5rem", fontWeight: 800, marginTop: "0.25rem" }}>
                {formatCurrency(amount, ccy)}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <p style={{ padding: "2rem", color: "var(--muted)", textAlign: "center" }}>Loading…</p>
        ) : items.length === 0 ? (
          <p style={{ padding: "2rem", color: "var(--muted)", textAlign: "center" }}>
            No accounts yet. Add your Raiffeisenbank, ČSOB, Revolut, etc.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Account</th>
                <th>Bank</th>
                <th>Balance</th>
                <th>IBAN</th>
                <th>Notes</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td style={{ fontWeight: 600 }}>{item.name}</td>
                  <td style={{ color: "var(--muted)" }}>{item.bank}</td>
                  <td style={{ fontWeight: 700, color: item.balance >= 0 ? "var(--green)" : "var(--red)" }}>
                    {formatCurrency(item.balance, item.currency)}
                  </td>
                  <td style={{ color: "var(--muted)", fontSize: "0.75rem", fontFamily: "monospace" }}>
                    {item.iban ?? "—"}
                  </td>
                  <td style={{ color: "var(--muted)", fontSize: "0.8rem" }}>{item.notes ?? "—"}</td>
                  <td>
                    <button className="btn-danger" onClick={() => handleDelete(item.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <Modal title="Add Bank Account" onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <FormField label="Account Name *" name="name" value={form.name} onChange={handleChange} placeholder="e.g. Revolut EUR" required />
            <FormField label="Bank / Provider *" name="bank" value={form.bank} onChange={handleChange} placeholder="e.g. Revolut" required />
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "0.75rem" }}>
              <FormField label="Balance *" name="balance" type="number" value={form.balance} onChange={handleChange} placeholder="0" step="0.01" required />
              <FormField label="Currency" name="currency" value={form.currency} onChange={handleChange}
                options={[
                  { value: "CZK", label: "CZK" },
                  { value: "EUR", label: "EUR" },
                  { value: "USD", label: "USD" },
                  { value: "GBP", label: "GBP" },
                  { value: "CHF", label: "CHF" },
                ]}
              />
            </div>
            <FormField label="IBAN (optional)" name="iban" value={form.iban} onChange={handleChange} placeholder="CZ65 0800 0000 0012 3456 7890" />
            <FormField label="Notes" name="notes" type="textarea" value={form.notes} onChange={handleChange} placeholder="Any notes…" />
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

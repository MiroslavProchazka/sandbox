"use client";
import { useState, useEffect } from "react";
import Modal from "@/components/Modal";
import FormField from "@/components/FormField";
import { formatCurrency } from "@/lib/currencies";

interface StockHolding {
  id: string;
  ticker: string;
  name: string;
  shares: number;
  currency: string;
  notes?: string | null;
  createdAt: string;
}

const emptyForm = {
  ticker: "",
  name: "",
  shares: "",
  currency: "USD",
  notes: "",
};

const CURRENCY_OPTIONS = [
  { value: "USD", label: "USD" },
  { value: "EUR", label: "EUR" },
  { value: "CZK", label: "CZK" },
  { value: "GBP", label: "GBP" },
];

export default function StocksPage() {
  const [holdings, setHoldings] = useState<StockHolding[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/stocks");
      const data = await res.json();
      setHoldings(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await fetch("/api/stocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: form.ticker.toUpperCase(),
          name: form.name,
          shares: parseFloat(form.shares),
          currency: form.currency,
          notes: form.notes || null,
        }),
      });
      setForm(emptyForm);
      setShowModal(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this holding?")) return;
    await fetch(`/api/stocks/${id}`, { method: "DELETE" });
    await load();
  }

  const totalValue = holdings.reduce((sum, h) => sum + h.shares, 0);

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "1.75rem",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: "1.75rem", fontWeight: 700 }}>
            Stock Holdings
          </h1>
          <p style={{ color: "var(--muted)", margin: "0.35rem 0 0", fontSize: "0.875rem" }}>
            Track your equity portfolio across multiple exchanges
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowModal(true)}>
          + Add Holding
        </button>
      </div>

      {/* Total Value Card */}
      <div
        className="card"
        style={{
          marginBottom: "1.5rem",
          display: "flex",
          alignItems: "center",
          gap: "1.5rem",
          background: "linear-gradient(135deg, #1a1f2e 0%, #1e201a 100%)",
          borderColor: "rgba(245,158,11,0.3)",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "0.7rem",
              color: "var(--muted)",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: "0.35rem",
            }}
          >
            Total Portfolio Value
          </div>
          <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--yellow)" }}>
            {formatCurrency(totalValue, "CZK")}
          </div>
        </div>
        <div
          style={{
            marginLeft: "auto",
            fontSize: "0.8rem",
            color: "var(--muted)",
          }}
        >
          {holdings.length} holding{holdings.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Table Card */}
      <div className="card" style={{ marginBottom: "1.25rem", padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: "3rem", textAlign: "center", color: "var(--muted)" }}>
            Loading...
          </div>
        ) : holdings.length === 0 ? (
          <div style={{ padding: "3rem", textAlign: "center", color: "var(--muted)" }}>
            <div style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>📈</div>
            <p style={{ margin: 0, fontWeight: 500 }}>No stock holdings yet</p>
            <p style={{ margin: "0.5rem 0 0", fontSize: "0.8rem" }}>
              Add your first position using the button above
            </p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Name</th>
                <th>Value (CZK)</th>
                <th>Currency</th>
                <th>Notes</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((h) => (
                <tr key={h.id}>
                  <td>
                    <span
                      style={{
                        fontWeight: 700,
                        color: "var(--yellow)",
                        fontFamily: "monospace",
                        fontSize: "0.9rem",
                      }}
                    >
                      {h.ticker}
                    </span>
                  </td>
                  <td style={{ color: "var(--foreground)" }}>{h.name}</td>
                  <td style={{ fontWeight: 600 }}>{formatCurrency(h.shares, "CZK")}</td>
                  <td>
                    <span
                      className="badge badge-blue"
                      style={{ fontSize: "0.7rem" }}
                    >
                      {h.currency}
                    </span>
                  </td>
                  <td style={{ color: "var(--muted)", fontSize: "0.8rem", maxWidth: "220px" }}>
                    {h.notes ?? <span style={{ opacity: 0.4 }}>—</span>}
                  </td>
                  <td>
                    <button
                      className="btn-danger"
                      onClick={() => handleDelete(h.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Info Box */}
      <div
        style={{
          padding: "1rem 1.25rem",
          borderRadius: "10px",
          background: "rgba(59,130,246,0.08)",
          border: "1px solid rgba(59,130,246,0.2)",
          fontSize: "0.85rem",
          color: "var(--foreground)",
        }}
      >
        💡 Connect Alpha Vantage API key in settings to get live stock prices
      </div>

      {/* Add Holding Modal */}
      {showModal && (
        <Modal title="Add Stock Holding" onClose={() => setShowModal(false)}>
          <form
            onSubmit={handleSubmit}
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            <FormField
              label="Ticker"
              name="ticker"
              value={form.ticker}
              onChange={handleChange}
              placeholder="AAPL"
              required
            />
            <FormField
              label="Name"
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="Apple Inc."
              required
            />
            <FormField
              label="Value in CZK"
              name="shares"
              type="number"
              value={form.shares}
              onChange={handleChange}
              placeholder="0.00"
              step="0.01"
              min="0"
              required
            />
            <FormField
              label="Currency"
              name="currency"
              value={form.currency}
              onChange={handleChange}
              options={CURRENCY_OPTIONS}
            />
            <FormField
              label="Notes"
              name="notes"
              type="textarea"
              value={form.notes}
              onChange={handleChange}
              placeholder="Optional notes..."
              rows={3}
            />
            <div
              style={{
                display: "flex",
                gap: "0.75rem",
                justifyContent: "flex-end",
                marginTop: "0.5rem",
              }}
            >
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setShowModal(false)}
              >
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? "Saving..." : "Add Holding"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

"use client";
import { useState, useEffect } from "react";
import Modal from "@/components/Modal";
import FormField from "@/components/FormField";
import { formatCurrency } from "@/lib/currencies";

interface Property {
  id: string;
  name: string;
  address?: string | null;
  estimatedValue: number;
  currency: string;
  hasMortgage: boolean;
  originalLoan?: number | null;
  remainingLoan?: number | null;
  monthlyPayment?: number | null;
  interestRate?: number | null;
  mortgageStart?: string | null;
  mortgageEnd?: string | null;
  notes?: string | null;
  createdAt: string;
}

const emptyForm = {
  name: "",
  address: "",
  estimatedValue: "",
  currency: "CZK",
  hasMortgage: false,
  originalLoan: "",
  remainingLoan: "",
  monthlyPayment: "",
  interestRate: "",
  mortgageStart: "",
  mortgageEnd: "",
  notes: "",
};

export default function PropertyPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/property");
      const data = await res.json();
      setProperties(data);
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
      const payload = {
        ...form,
        estimatedValue: parseFloat(form.estimatedValue),
        originalLoan: form.hasMortgage && form.originalLoan ? parseFloat(form.originalLoan) : null,
        remainingLoan: form.hasMortgage && form.remainingLoan ? parseFloat(form.remainingLoan) : null,
        monthlyPayment: form.hasMortgage && form.monthlyPayment ? parseFloat(form.monthlyPayment) : null,
        interestRate: form.hasMortgage && form.interestRate ? parseFloat(form.interestRate) : null,
        mortgageStart: form.hasMortgage && form.mortgageStart ? new Date(form.mortgageStart).toISOString() : null,
        mortgageEnd: form.hasMortgage && form.mortgageEnd ? new Date(form.mortgageEnd).toISOString() : null,
      };
      await fetch("/api/property", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setForm(emptyForm);
      setShowModal(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this property?")) return;
    await fetch(`/api/property/${id}`, { method: "DELETE" });
    await load();
  }

  const totalValue = properties.reduce((sum, p) => sum + p.estimatedValue, 0);
  const totalMortgageDebt = properties.reduce((sum, p) => sum + (p.remainingLoan ?? 0), 0);
  const totalEquity = totalValue - totalMortgageDebt;

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
            Real Estate
          </h1>
          <p style={{ color: "var(--muted)", margin: "0.35rem 0 0", fontSize: "0.875rem" }}>
            Track your property portfolio and mortgage details
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowModal(true)}>
          + Add Property
        </button>
      </div>

      {/* Summary Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        <div
          className="card"
          style={{
            background: "linear-gradient(135deg, #1a1f2e 0%, #1a2e1e 100%)",
            borderColor: "rgba(139,92,246,0.3)",
          }}
        >
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
            Total Property Value
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "#8b5cf6" }}>
            {formatCurrency(totalValue, "CZK")}
          </div>
          <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: "0.25rem" }}>
            {properties.length} propert{properties.length !== 1 ? "ies" : "y"}
          </div>
        </div>
        <div
          className="card"
          style={{
            background: "linear-gradient(135deg, #1a1f2e 0%, #1e1a1a 100%)",
            borderColor: "rgba(239,68,68,0.3)",
          }}
        >
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
            Total Mortgage Debt
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--red)" }}>
            {formatCurrency(totalMortgageDebt, "CZK")}
          </div>
        </div>
        <div
          className="card"
          style={{
            background: "linear-gradient(135deg, #1a1f2e 0%, #1e2a1e 100%)",
            borderColor: "rgba(16,185,129,0.3)",
          }}
        >
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
            Total Equity
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--green)" }}>
            {formatCurrency(totalEquity, "CZK")}
          </div>
        </div>
      </div>

      {/* Property Cards */}
      {loading ? (
        <div
          className="card"
          style={{ padding: "3rem", textAlign: "center", color: "var(--muted)" }}
        >
          Loading...
        </div>
      ) : properties.length === 0 ? (
        <div
          className="card"
          style={{ padding: "3rem", textAlign: "center", color: "var(--muted)" }}
        >
          <div style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>🏠</div>
          <p style={{ margin: 0, fontWeight: 500 }}>No properties yet</p>
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.8rem" }}>
            Add your first property using the button above
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {properties.map((p) => {
            const paid = (p.originalLoan ?? 0) - (p.remainingLoan ?? 0);
            const paidRatio = p.originalLoan ? (paid / p.originalLoan) * 100 : 0;
            const yearsLeft = p.mortgageEnd
              ? Math.max(0, new Date(p.mortgageEnd).getFullYear() - new Date().getFullYear())
              : null;

            return (
              <div
                key={p.id}
                className="card"
                style={{ position: "relative" }}
              >
                {/* Delete button */}
                <button
                  className="btn-danger"
                  onClick={() => handleDelete(p.id)}
                  style={{ position: "absolute", top: "1.25rem", right: "1.25rem" }}
                >
                  Delete
                </button>

                {/* Property name and address */}
                <div style={{ marginBottom: "1rem", paddingRight: "5rem" }}>
                  <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700 }}>
                    {p.name}
                  </h2>
                  {p.address && (
                    <div style={{ color: "var(--muted)", fontSize: "0.875rem", marginTop: "0.25rem" }}>
                      {p.address}
                    </div>
                  )}
                </div>

                {/* Estimated value */}
                <div style={{ marginBottom: p.hasMortgage ? "1.25rem" : "0" }}>
                  <div
                    style={{
                      fontSize: "0.7rem",
                      color: "var(--muted)",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      marginBottom: "0.25rem",
                    }}
                  >
                    Estimated Value
                  </div>
                  <div style={{ fontSize: "2rem", fontWeight: 800, color: "#8b5cf6" }}>
                    {formatCurrency(p.estimatedValue, p.currency)}
                  </div>
                </div>

                {/* Mortgage details */}
                {p.hasMortgage && (
                  <div
                    style={{
                      borderTop: "1px solid var(--card-border)",
                      paddingTop: "1.25rem",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.7rem",
                        color: "var(--muted)",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        marginBottom: "0.75rem",
                      }}
                    >
                      Mortgage / Hypotéka
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                        gap: "1rem",
                        marginBottom: "1rem",
                      }}
                    >
                      {p.remainingLoan != null && (
                        <div>
                          <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginBottom: "0.2rem" }}>
                            Remaining Loan
                          </div>
                          <div style={{ fontWeight: 700, color: "var(--red)" }}>
                            {formatCurrency(p.remainingLoan, p.currency)}
                          </div>
                        </div>
                      )}
                      {p.interestRate != null && (
                        <div>
                          <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginBottom: "0.2rem" }}>
                            Úrok
                          </div>
                          <div style={{ fontWeight: 700, color: "var(--yellow)" }}>
                            {p.interestRate.toFixed(2)}%
                          </div>
                        </div>
                      )}
                      {p.monthlyPayment != null && (
                        <div>
                          <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginBottom: "0.2rem" }}>
                            Monthly Payment
                          </div>
                          <div style={{ fontWeight: 700 }}>
                            {formatCurrency(p.monthlyPayment, p.currency)}
                          </div>
                        </div>
                      )}
                      {yearsLeft !== null && (
                        <div>
                          <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginBottom: "0.2rem" }}>
                            Years Left
                          </div>
                          <div style={{ fontWeight: 700 }}>
                            {yearsLeft} yr{yearsLeft !== 1 ? "s" : ""}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Progress bar */}
                    {p.originalLoan != null && (
                      <div style={{ marginBottom: "0.75rem" }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: "0.4rem",
                          }}
                        >
                          <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                            Splaceno {paidRatio.toFixed(1)}% z původní výše úvěru
                          </span>
                          <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                            {formatCurrency(paid, p.currency)} / {formatCurrency(p.originalLoan, p.currency)}
                          </span>
                        </div>
                        <div
                          style={{
                            height: "8px",
                            background: "var(--card-border)",
                            borderRadius: "4px",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              height: "100%",
                              width: `${Math.min(100, paidRatio)}%`,
                              background: "var(--green)",
                              borderRadius: "4px",
                              transition: "width 0.3s ease",
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Mortgage equity */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        padding: "0.6rem 0.9rem",
                        borderRadius: "8px",
                        background: "rgba(16,185,129,0.08)",
                        border: "1px solid rgba(16,185,129,0.2)",
                        fontSize: "0.85rem",
                      }}
                    >
                      <span style={{ color: "var(--muted)" }}>Equity:</span>
                      <span style={{ fontWeight: 700, color: "var(--green)" }}>
                        {formatCurrency(p.estimatedValue - (p.remainingLoan ?? 0), p.currency)}
                      </span>
                    </div>
                  </div>
                )}

                {/* Notes */}
                {p.notes && (
                  <div
                    style={{
                      marginTop: "1rem",
                      fontSize: "0.8rem",
                      color: "var(--muted)",
                      borderTop: "1px solid var(--card-border)",
                      paddingTop: "0.75rem",
                    }}
                  >
                    {p.notes}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Property Modal */}
      {showModal && (
        <Modal title="Add Property" onClose={() => setShowModal(false)}>
          <form
            onSubmit={handleSubmit}
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            <FormField
              label="Name"
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="Prague Flat"
              required
            />
            <FormField
              label="Address"
              name="address"
              value={form.address}
              onChange={handleChange}
              placeholder="Wenceslas Square 1, Prague"
            />
            <FormField
              label="Estimated Value (CZK)"
              name="estimatedValue"
              type="number"
              value={form.estimatedValue}
              onChange={handleChange}
              placeholder="0.00"
              step="0.01"
              min="0"
              required
            />

            {/* hasMortgage checkbox */}
            <div>
              <label>
                <input
                  type="checkbox"
                  checked={form.hasMortgage}
                  onChange={(e) => setForm((f) => ({ ...f, hasMortgage: e.target.checked }))}
                  style={{ width: "auto", marginRight: "0.5rem" }}
                />
                Has mortgage / hypotéka
              </label>
            </div>

            {/* Mortgage fields - conditionally shown */}
            {form.hasMortgage && (
              <>
                <FormField
                  label="Original Loan Amount (CZK)"
                  name="originalLoan"
                  type="number"
                  value={form.originalLoan}
                  onChange={handleChange}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                />
                <FormField
                  label="Remaining Loan (CZK)"
                  name="remainingLoan"
                  type="number"
                  value={form.remainingLoan}
                  onChange={handleChange}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                />
                <FormField
                  label="Monthly Payment (CZK)"
                  name="monthlyPayment"
                  type="number"
                  value={form.monthlyPayment}
                  onChange={handleChange}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                />
                <FormField
                  label="Interest Rate / Úrok (%)"
                  name="interestRate"
                  type="number"
                  value={form.interestRate}
                  onChange={handleChange}
                  placeholder="4.50"
                  step="0.01"
                  min="0"
                />
                <FormField
                  label="Mortgage Start"
                  name="mortgageStart"
                  type="date"
                  value={form.mortgageStart}
                  onChange={handleChange}
                />
                <FormField
                  label="Mortgage End"
                  name="mortgageEnd"
                  type="date"
                  value={form.mortgageEnd}
                  onChange={handleChange}
                />
              </>
            )}

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
                {saving ? "Saving..." : "Add Property"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

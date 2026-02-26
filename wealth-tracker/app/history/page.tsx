"use client";

import { useState, useEffect, useCallback } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, BarChart, Bar,
} from "recharts";
import { formatCurrency } from "@/lib/currencies";

interface Snapshot {
  id: string;
  date: string;
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  cryptoValue: number;
  stocksValue: number;
  propertyValue: number;
  savingsValue: number;
  bankValue: number;
  receivablesValue: number;
}

interface CurrentData {
  cryptoValue: number;
  stocksValue: number;
  propertyValue: number;
  savingsValue: number;
  bankValue: number;
  receivablesValue: number;
  mortgageDebt: number;
}

export default function HistoryPage() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [current, setCurrent] = useState<CurrentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [snapping, setSnapping] = useState(false);
  const [view, setView] = useState<"networth" | "breakdown">("networth");

  const load = useCallback(async () => {
    const [snapsRes, cryptoRes, stocksRes, propRes, savRes, accRes, recRes] = await Promise.all([
      fetch("/api/snapshot"),
      fetch("/api/crypto"),
      fetch("/api/stocks"),
      fetch("/api/property"),
      fetch("/api/savings"),
      fetch("/api/accounts"),
      fetch("/api/receivables"),
    ]);

    const [snaps, cryptos, stocks, props, savings, accounts, receivables] = await Promise.all([
      snapsRes.json(), cryptoRes.json(), stocksRes.json(),
      propRes.json(), savRes.json(), accRes.json(), recRes.json(),
    ]);

    setSnapshots(snaps);

    const cryptoValue = cryptos.reduce((s: number, c: { amount: number }) => s + c.amount, 0);
    const stocksValue = stocks.reduce((s: number, st: { shares: number }) => s + st.shares, 0);
    const propertyValue = props.reduce((s: number, p: { estimatedValue: number }) => s + p.estimatedValue, 0);
    const mortgageDebt = props.reduce((s: number, p: { remainingLoan?: number }) => s + (p.remainingLoan ?? 0), 0);
    const savingsValue = savings.reduce((s: number, sv: { balance: number }) => s + sv.balance, 0);
    const bankValue = accounts.reduce((s: number, a: { balance: number }) => s + a.balance, 0);
    const receivablesValue = receivables
      .filter((r: { status: string }) => r.status !== "PAID")
      .reduce((s: number, r: { amount: number }) => s + r.amount, 0);

    setCurrent({ cryptoValue, stocksValue, propertyValue, savingsValue, bankValue, receivablesValue, mortgageDebt });
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function takeSnapshot() {
    if (!current) return;
    setSnapping(true);
    const totalAssets = current.cryptoValue + current.stocksValue + current.propertyValue +
      current.savingsValue + current.bankValue + current.receivablesValue;
    const totalLiabilities = current.mortgageDebt;
    const netWorth = totalAssets - totalLiabilities;

    await fetch("/api/snapshot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        totalAssets, totalLiabilities, netWorth,
        cryptoValue: current.cryptoValue,
        stocksValue: current.stocksValue,
        propertyValue: current.propertyValue,
        savingsValue: current.savingsValue,
        bankValue: current.bankValue,
        receivablesValue: current.receivablesValue,
        currency: "CZK",
      }),
    });
    setSnapping(false);
    load();
  }

  const chartData = snapshots.map((s) => ({
    date: new Date(s.date).toLocaleDateString("cs-CZ", { day: "2-digit", month: "short", year: "2-digit" }),
    "Net Worth": Math.round(s.netWorth),
    "Assets": Math.round(s.totalAssets),
    "Liabilities": Math.round(s.totalLiabilities),
    Crypto: Math.round(s.cryptoValue),
    Stocks: Math.round(s.stocksValue),
    Property: Math.round(s.propertyValue),
    Savings: Math.round(s.savingsValue),
    Bank: Math.round(s.bankValue),
    Receivables: Math.round(s.receivablesValue),
  }));

  const currentNetWorth = current
    ? (current.cryptoValue + current.stocksValue + current.propertyValue +
       current.savingsValue + current.bankValue + current.receivablesValue) - current.mortgageDebt
    : 0;

  const firstSnapshot = snapshots[0];
  const totalChange = firstSnapshot ? currentNetWorth - firstSnapshot.netWorth : 0;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.75rem", fontWeight: 700 }}>History & Charts</h1>
          <p style={{ color: "var(--muted)", margin: "0.35rem 0 0", fontSize: "0.875rem" }}>
            Net worth over time · {snapshots.length} snapshot{snapshots.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={takeSnapshot}
          disabled={snapping || !current}
        >
          {snapping ? "Saving…" : "📸 Take Snapshot"}
        </button>
      </div>

      {/* Current summary */}
      {current && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
          {[
            { label: "Current Net Worth", value: formatCurrency(currentNetWorth, "CZK"), color: "var(--accent)" },
            { label: "Total Change", value: (totalChange >= 0 ? "+" : "") + formatCurrency(totalChange, "CZK"), color: totalChange >= 0 ? "var(--green)" : "var(--red)" },
            { label: "Since", value: firstSnapshot ? new Date(firstSnapshot.date).toLocaleDateString("cs-CZ") : "—", color: "var(--muted)" },
            { label: "Snapshots", value: String(snapshots.length), color: "var(--muted)" },
          ].map((s) => (
            <div key={s.label} className="card">
              <div style={{ fontSize: "0.65rem", color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.4rem" }}>{s.label}</div>
              <div style={{ fontSize: "1.2rem", fontWeight: 700, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Chart type toggle */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem" }}>
        {(["networth", "breakdown"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            style={{
              padding: "0.4rem 1rem",
              borderRadius: "6px",
              border: "1px solid var(--card-border)",
              background: view === v ? "var(--accent)" : "transparent",
              color: view === v ? "white" : "var(--muted)",
              cursor: "pointer",
              fontSize: "0.8rem",
              fontWeight: 500,
            }}
          >
            {v === "networth" ? "Net Worth" : "Asset Breakdown"}
          </button>
        ))}
      </div>

      <div className="card" style={{ marginBottom: "1.5rem" }}>
        {loading ? (
          <p style={{ color: "var(--muted)", textAlign: "center" }}>Loading…</p>
        ) : snapshots.length < 2 ? (
          <div style={{ textAlign: "center", padding: "3rem", color: "var(--muted)" }}>
            <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>📊</div>
            <p>Take at least 2 snapshots to see charts.</p>
            <p style={{ fontSize: "0.8rem" }}>Click "Take Snapshot" to record today's values.</p>
          </div>
        ) : view === "networth" ? (
          <ResponsiveContainer width="100%" height={360}>
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 20, bottom: 0 }}>
              <defs>
                <linearGradient id="netWorthGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="assetsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" />
              <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 11 }} />
              <YAxis tick={{ fill: "#64748b", fontSize: 11 }}
                tickFormatter={(v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
              />
              <Tooltip
                contentStyle={{ background: "#1a1f2e", border: "1px solid #2d3748", borderRadius: "8px" }}
                labelStyle={{ color: "#e2e8f0", fontWeight: 600 }}
                formatter={(value: number | undefined, name: string | undefined) => [formatCurrency(value ?? 0, "CZK"), name ?? ""]}
              />
              <Legend wrapperStyle={{ color: "#64748b", fontSize: "0.8rem" }} />
              <Area type="monotone" dataKey="Assets" stroke="#10b981" fill="url(#assetsGrad)" strokeWidth={2} />
              <Area type="monotone" dataKey="Net Worth" stroke="#3b82f6" fill="url(#netWorthGrad)" strokeWidth={2.5} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height={360}>
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" />
              <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 11 }} />
              <YAxis tick={{ fill: "#64748b", fontSize: 11 }}
                tickFormatter={(v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
              />
              <Tooltip
                contentStyle={{ background: "#1a1f2e", border: "1px solid #2d3748", borderRadius: "8px" }}
                formatter={(value: number | undefined, name: string | undefined) => [formatCurrency(value ?? 0, "CZK"), name ?? ""]}
              />
              <Legend wrapperStyle={{ color: "#64748b", fontSize: "0.8rem" }} />
              <Bar dataKey="Property"   stackId="a" fill="#8b5cf6" radius={[0, 0, 0, 0]} />
              <Bar dataKey="Savings"    stackId="a" fill="#10b981" />
              <Bar dataKey="Bank"       stackId="a" fill="#3b82f6" />
              <Bar dataKey="Stocks"     stackId="a" fill="#f59e0b" />
              <Bar dataKey="Crypto"     stackId="a" fill="#f97316" />
              <Bar dataKey="Receivables" stackId="a" fill="#06b6d4" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Snapshots table */}
      {snapshots.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "1rem 1.5rem", borderBottom: "1px solid var(--card-border)", fontWeight: 700, fontSize: "0.9rem" }}>
            Snapshot History
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Net Worth</th>
                <th>Assets</th>
                <th>Liabilities</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              {[...snapshots].reverse().map((snap, idx, arr) => {
                const prev = arr[idx + 1];
                const change = prev ? snap.netWorth - prev.netWorth : null;
                return (
                  <tr key={snap.id}>
                    <td style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
                      {new Date(snap.date).toLocaleString("cs-CZ", { dateStyle: "medium", timeStyle: "short" })}
                    </td>
                    <td style={{ fontWeight: 700 }}>{formatCurrency(snap.netWorth, "CZK")}</td>
                    <td style={{ color: "var(--green)" }}>{formatCurrency(snap.totalAssets, "CZK")}</td>
                    <td style={{ color: "var(--red)" }}>{formatCurrency(snap.totalLiabilities, "CZK")}</td>
                    <td style={{ color: change === null ? "var(--muted)" : change >= 0 ? "var(--green)" : "var(--red)", fontSize: "0.85rem" }}>
                      {change === null ? "—" : (change >= 0 ? "+" : "") + formatCurrency(change, "CZK")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/currencies";
import StatCard from "@/components/StatCard";
import Link from "next/link";

async function getNetWorthData() {
  const [
    cryptos,
    stocks,
    properties,
    receivables,
    savings,
    accounts,
    snapshots,
  ] = await Promise.all([
    prisma.cryptoHolding.findMany(),
    prisma.stockHolding.findMany(),
    prisma.property.findMany(),
    prisma.receivable.findMany({ where: { status: { not: "PAID" } } }),
    prisma.savingsAccount.findMany(),
    prisma.bankAccount.findMany(),
    prisma.netWorthSnapshot.findMany({ orderBy: { date: "desc" }, take: 2 }),
  ]);

  // Amounts stored in CZK-equivalent (user converts manually or via settings)
  const cryptoValue = cryptos.reduce((sum: number, c) => sum + c.amount, 0);
  const stocksValue = stocks.reduce((sum: number, s) => sum + s.shares, 0);
  const propertyValue = properties.reduce((sum: number, p) => sum + p.estimatedValue, 0);
  const mortgageDebt = properties.reduce((sum: number, p) => sum + (p.remainingLoan ?? 0), 0);
  const receivablesValue = receivables.reduce((sum: number, r) => sum + r.amount, 0);
  const savingsValue = savings.reduce((sum: number, s) => sum + s.balance, 0);
  const bankValue = accounts.reduce((sum: number, a) => sum + a.balance, 0);

  const totalAssets = cryptoValue + stocksValue + propertyValue + receivablesValue + savingsValue + bankValue;
  const totalLiabilities = mortgageDebt;
  const netWorth = totalAssets - totalLiabilities;

  const prevSnapshot = snapshots[1];
  const change = prevSnapshot ? netWorth - prevSnapshot.netWorth : 0;

  return {
    netWorth, totalAssets, totalLiabilities,
    cryptoValue, stocksValue, propertyValue,
    receivablesValue, savingsValue, bankValue,
    change,
    cryptoCount: cryptos.length,
    stockCount: stocks.length,
    propertyCount: properties.length,
    receivablesCount: receivables.length,
  };
}

export default async function Dashboard() {
  const data = await getNetWorthData();

  const allocationItems = [
    { label: "Property", value: data.propertyValue, color: "#8b5cf6", href: "/property" },
    { label: "Savings",  value: data.savingsValue,  color: "#10b981", href: "/savings" },
    { label: "Bank Accounts", value: data.bankValue, color: "#3b82f6", href: "/accounts" },
    { label: "Stocks",   value: data.stocksValue,   color: "#f59e0b", href: "/stocks" },
    { label: "Crypto",   value: data.cryptoValue,   color: "#f97316", href: "/crypto" },
    { label: "Receivables", value: data.receivablesValue, color: "#06b6d4", href: "/receivables" },
  ].filter((i) => i.value > 0);

  const total = allocationItems.reduce((s, i) => s + i.value, 0) || 1;

  return (
    <div>
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ margin: 0, fontSize: "1.75rem", fontWeight: 700 }}>Dashboard</h1>
        <p style={{ color: "var(--muted)", margin: "0.35rem 0 0", fontSize: "0.875rem" }}>
          {new Date().toLocaleDateString("cs-CZ", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>

      {/* Net Worth Hero */}
      <div
        className="card"
        style={{
          marginBottom: "1.5rem",
          background: "linear-gradient(135deg, #1a1f2e 0%, #1e2a3a 100%)",
          borderColor: "#2d4a6e",
        }}
      >
        <div style={{ fontSize: "0.75rem", color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Net Worth
        </div>
        <div style={{ fontSize: "3rem", fontWeight: 800, color: "var(--foreground)", margin: "0.5rem 0" }}>
          {formatCurrency(data.netWorth, "CZK")}
        </div>
        {data.change !== 0 && (
          <div style={{ fontSize: "0.9rem", color: data.change >= 0 ? "var(--green)" : "var(--red)" }}>
            {data.change >= 0 ? "▲" : "▼"} {formatCurrency(Math.abs(data.change), "CZK")} since last snapshot
          </div>
        )}
        {data.change === 0 && (
          <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
            Take a snapshot in{" "}
            <Link href="/history" style={{ color: "var(--accent)" }}>History</Link>{" "}
            to track changes over time
          </div>
        )}
      </div>

      {/* Key Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        <StatCard label="Total Assets"      value={formatCurrency(data.totalAssets, "CZK")}      accent="var(--green)" icon="↑" />
        <StatCard label="Total Liabilities" value={formatCurrency(data.totalLiabilities, "CZK")} accent="var(--red)"   icon="↓" />
        <StatCard label="Savings"           value={formatCurrency(data.savingsValue, "CZK")}     accent="var(--green)" icon="🏦" />
        <StatCard
          label="Receivables"
          value={formatCurrency(data.receivablesValue, "CZK")}
          sub={`${data.receivablesCount} pending`}
          accent="var(--yellow)"
          icon="💼"
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
        {/* Asset Allocation */}
        <div className="card">
          <h2 style={{ margin: "0 0 1.25rem", fontSize: "1rem", fontWeight: 700 }}>Asset Allocation</h2>
          {allocationItems.length === 0 ? (
            <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
              No assets yet. Add your first asset using the sidebar.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {allocationItems.map((item) => {
                const pct = (item.value / total) * 100;
                return (
                  <Link key={item.label} href={item.href} style={{ textDecoration: "none" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: "0.8rem", color: "var(--foreground)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "50%", background: item.color }} />
                          {item.label}
                        </span>
                        <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                          {formatCurrency(item.value, "CZK")} · {pct.toFixed(1)}%
                        </span>
                      </div>
                      <div style={{ height: "6px", background: "var(--card-border)", borderRadius: "3px" }}>
                        <div style={{ height: "100%", background: item.color, borderRadius: "3px", width: `${pct}%` }} />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick Links */}
        <div className="card">
          <h2 style={{ margin: "0 0 1.25rem", fontSize: "1rem", fontWeight: 700 }}>Quick Access</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            {[
              { href: "/crypto",      icon: "₿",  label: "Crypto",      count: data.cryptoCount },
              { href: "/stocks",      icon: "📈", label: "Stocks",      count: data.stockCount },
              { href: "/property",    icon: "🏠", label: "Property",    count: data.propertyCount },
              { href: "/receivables", icon: "💼", label: "Receivables", count: data.receivablesCount },
              { href: "/savings",     icon: "🏦", label: "Savings",     count: null },
              { href: "/history",     icon: "📊", label: "History",     count: null },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.75rem",
                  borderRadius: "8px",
                  background: "rgba(59,130,246,0.06)",
                  border: "1px solid rgba(59,130,246,0.15)",
                  textDecoration: "none",
                  color: "var(--foreground)",
                  fontSize: "0.8rem",
                  transition: "all 0.15s",
                }}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
                {item.count !== null && item.count > 0 && (
                  <span style={{ marginLeft: "auto", fontSize: "0.7rem", color: "var(--muted)" }}>
                    {item.count}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

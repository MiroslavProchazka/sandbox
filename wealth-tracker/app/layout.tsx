import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "Wealth Tracker",
  description: "Personal wealth & net worth tracker",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body style={{ display: "flex", minHeight: "100vh" }}>
        <Sidebar />
        <main style={{ flex: 1, padding: "2rem", maxWidth: "1400px" }}>
          {children}
        </main>
      </body>
    </html>
  );
}

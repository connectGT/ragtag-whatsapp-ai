import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: "RAGTAG — Task Command Center",
  description: "High-contrast, breathable task extraction and agentic chat workspace.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 min-h-screen antialiased selection:bg-yellow-400 selection:text-black">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}

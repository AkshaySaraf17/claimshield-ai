import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClaimShield AI",
  description: "Autonomous denial appeal drafting for independent clinics",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}

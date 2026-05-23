import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Forest City Vault",
  description: "A Next.js app powered by Tailwind and Natcore Design System.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-surface-900">
        {children}
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Alegreya, Manrope, Playfair_Display } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "./theme-provider";

const headingFont = Playfair_Display({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const subheadingFont = Manrope({
  variable: "--font-subheading",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const bodyFont = Alegreya({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "Forest City Vault: admin portal",
  description:
    "Internal administration for the Forest City Vault community marketplace.",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${headingFont.variable} ${subheadingFont.variable} ${bodyFont.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col palette-surface bg-surface-50 text-on-surface-50">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}

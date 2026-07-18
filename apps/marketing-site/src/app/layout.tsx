import type { Metadata } from "next";
import {
  Alegreya,
  Manrope,
  Playfair_Display,
} from "next/font/google";
import "./globals.css";

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
  title: "Forest City Vault: a community marketplace",
  description:
    "A place where local makers build something together and customers discover what is worth finding.",
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
      className={`${headingFont.variable} ${subheadingFont.variable} ${bodyFont.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col palette-surface bg-surface-50 text-on-surface-50">
        {children}
      </body>
    </html>
  );
}

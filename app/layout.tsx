import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "https://sama.ph";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Sama — Philippine outdoor adventures",
    template: "%s | Sama",
  },
  description:
    "Discover hikes, camps, dives, and island hops across the Philippines. Book trusted trips from local organizers.",
  openGraph: {
    siteName: "Sama",
    type: "website",
    locale: "en_PH",
  },
  twitter: {
    card: "summary_large_image",
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

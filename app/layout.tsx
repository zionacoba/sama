import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";
import { CookieConsent } from "./components/cookie-consent";
import { Analytics } from '@vercel/analytics/next';

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-dm-sans",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://sama.com.ph";

export const viewport: Viewport = {
  themeColor: "#1a5c38",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Sama",
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
  icons: {
    icon: '/sama-badge.png',
    apple: '/sama-badge.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
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
      className={`${dmSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-trailhead focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lg focus:ring-2 focus:ring-trailhead/40"
          >
            Skip to main content
          </a>
          <div id="main-content" tabIndex={-1} className="flex flex-1 flex-col focus:outline-none">
            {children}
          </div>
          <CookieConsent />
          <Analytics />
        </body>
    </html>
  );
}

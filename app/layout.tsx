import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";
import { CookieConsent } from "./components/cookie-consent";

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
          {children}
          <CookieConsent />
        </body>
    </html>
  );
}

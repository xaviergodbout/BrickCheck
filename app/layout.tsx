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

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const title = "BrickCheck — Find every piece";
const description = "Search a LEGO set, work through pictured parts, and carry your progress between devices.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  openGraph: {
    title,
    description: "Turn a mixed bin into a complete set, one pictured part at a time.",
    type: "website",
    url: siteUrl,
    images: [{ url: `${siteUrl}/og.png`, width: 1734, height: 907, alt: title }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description: "Turn a mixed bin into a complete set, one pictured part at a time.",
    images: [`${siteUrl}/og.png`],
  },
  icons: {
    icon: `${basePath}/brickcheck-icon.webp`,
    shortcut: `${basePath}/brickcheck-icon.webp`,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { getBrandingSettings } from "@/lib/settings";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getBrandingSettings().catch(() => ({
    siteName: "Social Media Manager",
    siteFaviconUrl: "/social-media-favicon.svg",
  }));

  return {
    title: branding.siteName,
    description: "Self-hosted social media scheduler foundation",
    icons: {
      icon: branding.siteFaviconUrl,
      shortcut: branding.siteFaviconUrl,
      apple: branding.siteFaviconUrl,
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

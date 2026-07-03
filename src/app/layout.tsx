import type { Metadata } from "next";
import { getBrandingSettings } from "@/lib/settings";
import "./globals.css";

const FALLBACK_BRANDING = {
  siteName: "Social Media Manager",
  siteFaviconUrl: "/social-media-favicon.svg",
};

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const isProductionBuild =
    process.env.NEXT_PHASE === "phase-production-build" || process.env.npm_lifecycle_event === "build";
  const branding = isProductionBuild
    ? FALLBACK_BRANDING
    : await getBrandingSettings().catch(() => FALLBACK_BRANDING);

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

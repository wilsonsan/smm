import type { Metadata } from "next";
import { env } from "@/lib/env";
import { getAppSettings } from "@/lib/settings";
import "./globals.css";

const FALLBACK_BRANDING = {
  siteName: "Social Media Manager",
  siteFaviconUrl: "/social-media-favicon.svg",
  publicAppUrl: env.APP_URL,
  facebookAppId: env.FACEBOOK_APP_ID || "",
};

const APP_DESCRIPTION = "Self-hosted social media scheduler foundation";
const OPEN_GRAPH_IMAGE_PATH = "/opengraph-image";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const isProductionBuild =
    process.env.NEXT_PHASE === "phase-production-build" || process.env.npm_lifecycle_event === "build";
  const branding = isProductionBuild
    ? FALLBACK_BRANDING
    : await getAppSettings().catch(() => FALLBACK_BRANDING);
  const metadataBase = new URL(branding.publicAppUrl || env.APP_URL);
  const facebookAppId = branding.facebookAppId || env.FACEBOOK_APP_ID || "";
  const loginUrl = new URL("/login", metadataBase);

  return {
    metadataBase,
    title: branding.siteName,
    description: APP_DESCRIPTION,
    icons: {
      icon: branding.siteFaviconUrl,
      shortcut: branding.siteFaviconUrl,
      apple: branding.siteFaviconUrl,
    },
    openGraph: {
      type: "website",
      url: loginUrl,
      siteName: branding.siteName,
      title: branding.siteName,
      description: APP_DESCRIPTION,
      images: [
        {
          url: OPEN_GRAPH_IMAGE_PATH,
          width: 1200,
          height: 630,
          alt: `${branding.siteName} preview image`,
        },
      ],
    },
    facebook: facebookAppId ? { appId: facebookAppId } : undefined,
    twitter: {
      card: "summary_large_image",
      title: branding.siteName,
      description: APP_DESCRIPTION,
      images: [OPEN_GRAPH_IMAGE_PATH],
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

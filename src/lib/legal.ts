import type { Metadata } from "next";
import { env } from "@/lib/env";

export const LEGAL_EFFECTIVE_DATE = "July 19, 2026";
export const PUBLIC_APPLICATION_ORIGIN = "https://smm.nctilepros.com";
export const COMPANY_WEBSITE_URL = "https://www.nctilepros.com";
export const CONTACT_EMAIL = "michael@nctilepros.com";

type LegalMetadataInput = {
  title: string;
  description: string;
  path: "/privacy" | "/terms" | "/data-deletion";
};

export function createLegalMetadata({
  title,
  description,
  path,
}: LegalMetadataInput): Metadata {
  const url = `${PUBLIC_APPLICATION_ORIGIN}${path}`;
  const socialImageUrl = `${PUBLIC_APPLICATION_ORIGIN}/opengraph-image`;

  return {
    title,
    description,
    alternates: {
      canonical: url,
    },
    robots: {
      index: true,
      follow: true,
    },
    openGraph: {
      type: "website",
      url,
      siteName: "Social Media Manager",
      title,
      description,
      images: [
        {
          url: socialImageUrl,
          width: 1200,
          height: 630,
          alt: "Social Media Manager",
        },
      ],
    },
    facebook: env.FACEBOOK_APP_ID ? { appId: env.FACEBOOK_APP_ID } : undefined,
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [socialImageUrl],
    },
  };
}

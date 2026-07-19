import { ImageResponse } from "next/og";
import { getBrandingSettings } from "@/lib/settings";

export const alt = "Social Media Manager preview image";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";
export const dynamic = "force-dynamic";

const FALLBACK_SITE_NAME = "Social Media Manager";

export default async function OpenGraphImage() {
  const branding = await getBrandingSettings().catch(() => ({
    siteName: FALLBACK_SITE_NAME,
    siteFaviconUrl: "/social-media-favicon.svg",
  }));

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          height: "100%",
          width: "100%",
          background:
            "linear-gradient(135deg, rgb(9, 29, 53) 0%, rgb(18, 82, 128) 55%, rgb(85, 155, 206) 100%)",
          color: "white",
          fontFamily: "Arial, sans-serif",
          padding: "64px",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: "100%",
            border: "1px solid rgba(255, 255, 255, 0.18)",
            borderRadius: "32px",
            padding: "48px",
            background: "rgba(4, 16, 30, 0.24)",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 30,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              opacity: 0.8,
            }}
          >
            Social Media Manager
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div
              style={{
                display: "flex",
                fontSize: 76,
                fontWeight: 700,
                lineHeight: 1.05,
                maxWidth: "84%",
              }}
            >
              {branding.siteName}
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 32,
                lineHeight: 1.35,
                maxWidth: "72%",
                color: "rgba(255, 255, 255, 0.88)",
              }}
            >
              Secure scheduling, media management, and publishing workflows for your team.
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}

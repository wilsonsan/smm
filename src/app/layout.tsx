import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SMM Scheduler",
  description: "Self-hosted social media scheduler foundation",
};

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


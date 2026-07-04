import { requireAuthenticatedUser } from "@/lib/auth/session";

export default async function SettingsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await requireAuthenticatedUser();

  return children;
}

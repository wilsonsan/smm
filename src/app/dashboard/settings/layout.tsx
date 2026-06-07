import { requireAdminUser } from "@/lib/auth/session";

export default async function SettingsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await requireAdminUser({
    redirectTo: "/dashboard",
    targetType: "SettingsPage",
  });

  return children;
}

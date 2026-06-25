import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AccountSettingsRedirectPage() {
  await requireAuthenticatedUser();
  redirect("/dashboard/account");
}

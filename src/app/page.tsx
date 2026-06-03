import { redirect } from "next/navigation";
import { getCurrentAdminUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const adminUser = await getCurrentAdminUser();
  redirect(adminUser ? "/dashboard" : "/login");
}

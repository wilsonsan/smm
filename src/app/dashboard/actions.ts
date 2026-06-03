"use server";

import { redirect } from "next/navigation";
import { logoutCurrentAdmin } from "@/lib/auth/session";

export async function logoutAction() {
  await logoutCurrentAdmin();
  redirect("/login");
}


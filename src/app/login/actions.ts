"use server";

import { redirect } from "next/navigation";
import { authenticateAdmin, loginAdminUser } from "@/lib/auth/session";
import { initialFormState, loginSchema, type FormState } from "@/lib/validation";

export async function loginAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      ...initialFormState,
      message: "Enter your admin email and password.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const adminUser = await authenticateAdmin(parsed.data.email, parsed.data.password);
  if (!adminUser) {
    return {
      ...initialFormState,
      message: "Invalid email or password.",
    };
  }

  await loginAdminUser(adminUser);
  redirect("/dashboard");
}


import { SocialPlatform } from "@prisma/client";
import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

const scheduledDateSchema = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || "");

export const postFormSchema = z
  .object({
    postId: z.string().trim().optional().transform((value) => value || ""),
    mediaAssetId: z.string().trim().optional().transform((value) => value || ""),
    internalTitle: z.string().trim().min(1, "Internal title is required.").max(140),
    caption: z.string().trim().min(1, "Caption is required.").max(5000),
    scheduledAt: scheduledDateSchema,
    platform: z.nativeEnum(SocialPlatform).refine((value) => value === SocialPlatform.FACEBOOK, {
      message: "Only Facebook is enabled in this phase.",
    }),
    intent: z.enum(["draft", "schedule"]),
  })
  .superRefine((value, ctx) => {
    if (value.intent === "schedule" && !value.scheduledAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Schedule date and time are required when scheduling a post.",
        path: ["scheduledAt"],
      });
    }

    if (value.scheduledAt) {
      const parsedDate = new Date(value.scheduledAt);
      if (Number.isNaN(parsedDate.getTime())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Enter a valid schedule date and time.",
          path: ["scheduledAt"],
        });
      }
    }
  });

export const settingsSchema = z.object({
  publicAppUrl: z.string().trim().url("Enter a valid public app URL."),
  uploadDirectory: z.string().trim().min(1, "Upload directory is required."),
});

export type FormState = {
  success: boolean;
  message: string | null;
  fieldErrors?: Record<string, string[] | undefined>;
};

export const initialFormState: FormState = {
  success: false,
  message: null,
};


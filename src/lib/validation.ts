import { SocialPlatform } from "@prisma/client";
import { z } from "zod";
import { isValidTimezone } from "@/lib/time";

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

export const postFormSchema = z
  .object({
    postId: z.string().trim().optional().transform((value) => value || ""),
    mediaAssetId: z.string().trim().optional().transform((value) => value || ""),
    caption: z.string().trim().max(5000),
    scheduledDate: z.string().trim().optional().transform((value) => value || ""),
    scheduledHour: z.string().trim().optional().transform((value) => value || ""),
    scheduledMinute: z.string().trim().optional().transform((value) => value || "00"),
    scheduledMeridiem: z.string().trim().optional().transform((value) => value || "PM"),
    platform: z.nativeEnum(SocialPlatform).refine((value) => value === SocialPlatform.FACEBOOK, {
      message: "Only Facebook is enabled in this phase.",
    }),
    intent: z.enum(["draft", "schedule", "publish"]),
  })
  .superRefine((value, ctx) => {
    const hasAnyTimePart = Boolean(value.scheduledHour);

    if ((value.intent === "schedule" || value.intent === "publish") && !value.caption) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: value.intent === "publish" ? "Caption is required before posting now." : "Caption is required when scheduling a post.",
        path: ["caption"],
      });
    }

    if (value.intent === "schedule" && !value.scheduledDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Scheduled date is required when scheduling a post.",
        path: ["scheduledDate"],
      });
    }

    if (value.intent === "schedule" && !value.scheduledHour) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Scheduled time is required when scheduling a post.",
        path: ["scheduledHour"],
      });
    }

    if (value.intent === "schedule" && !value.scheduledMinute) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Scheduled time is required when scheduling a post.",
        path: ["scheduledMinute"],
      });
    }

    if (value.intent === "schedule" && !value.scheduledMeridiem) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Scheduled time is required when scheduling a post.",
        path: ["scheduledMeridiem"],
      });
    }

    if (value.intent === "draft" && value.scheduledDate && !hasAnyTimePart) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Add a time to place this draft on the calendar.",
        path: ["scheduledHour"],
      });
    }

    if (value.intent === "draft" && hasAnyTimePart && !value.scheduledDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Add a date to place this draft on the calendar.",
        path: ["scheduledDate"],
      });
    }
  });

export const settingsSchema = z.object({
  siteName: z.string().trim().min(1, "Site name is required.").max(80, "Site name must be 80 characters or less."),
  siteFaviconUrl: z
    .string()
    .trim()
    .min(1, "Favicon path is required.")
    .refine((value) => value.startsWith("/") || /^https?:\/\//.test(value), "Use a relative path like `/social-media-favicon.svg` or an absolute URL."),
  publicAppUrl: z.string().trim().url("Enter a valid public app URL."),
  uploadDirectory: z.string().trim().min(1, "Upload directory is required."),
  appTimezone: z.string().trim().refine((value) => isValidTimezone(value), "Enter a valid IANA timezone."),
});

export const facebookSettingsSchema = z.object({
  facebookAppId: z.string().trim().max(100, "Facebook App ID must be 100 characters or less."),
  facebookPageLookupValue: z
    .string()
    .trim()
    .min(1, "Enter a Facebook Page username or Page ID.")
    .max(120, "Preferred Facebook Page lookup must be 120 characters or less.")
    .regex(/^[a-zA-Z0-9._-]+$/, "Use a valid Facebook Page username or ID."),
});

export const facebookPageSelectionSchema = z.object({
  pageId: z.string().trim().min(1, "Choose a Facebook Page."),
});

export const facebookPageIdTestSchema = z.object({
  pageId: z
    .string()
    .trim()
    .min(1, "Enter a Facebook Page ID.")
    .max(100, "Facebook Page ID must be 100 characters or less.")
    .regex(/^[a-zA-Z0-9_]+$/, "Use a valid Facebook Page ID."),
});

export const accountProfileSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters.")
    .max(32, "Username must be 32 characters or less.")
    .regex(/^[a-zA-Z0-9_-]+$/, "Use letters, numbers, dashes, or underscores only."),
  email: z.string().trim().email("Enter a valid email address."),
});

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: z
      .string()
      .min(12, "New password must be at least 12 characters.")
      .regex(/[a-z]/, "New password must include a lowercase letter.")
      .regex(/[A-Z]/, "New password must include an uppercase letter.")
      .regex(/[0-9]/, "New password must include a number."),
    confirmNewPassword: z.string().min(1, "Confirm your new password."),
  })
  .superRefine((value, ctx) => {
    if (value.newPassword !== value.confirmNewPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "New password and confirmation must match.",
        path: ["confirmNewPassword"],
      });
    }
  });

export type FormState = {
  success: boolean;
  message: string | null;
  fieldErrors?: Record<string, string[] | undefined>;
  submittedValues?: {
    caption: string;
    scheduledDate: string;
    scheduledHour: string;
    scheduledMinute: string;
    scheduledMeridiem: string;
    mediaAssetId: string;
    platform: string;
  };
};

export const initialFormState: FormState = {
  success: false,
  message: null,
};

import { SocialPlatform } from "@prisma/client";
import { z } from "zod";
import {
  areSelectedPlatformsPublishableNow,
  doSelectedPlatformsRequireMedia,
  getMaxMediaCountForPlatforms,
  getRequiredMediaMessageForPlatforms,
  normalizeSelectedPlatforms,
} from "@/lib/platform-rules";
import { isValidTimezone } from "@/lib/time";

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

export const postFormSchema = z
  .object({
    postId: z.string().trim().optional().transform((value) => value || ""),
    mediaAssetIds: z.array(z.string().trim()).default([]).transform((value) => value.filter(Boolean)),
    caption: z.string().trim().max(5000),
    scheduledDate: z.string().trim().optional().transform((value) => value || ""),
    scheduledHour: z.string().trim().optional().transform((value) => value || ""),
    scheduledMinute: z.string().trim().optional().transform((value) => value || "00"),
    scheduledMeridiem: z.string().trim().optional().transform((value) => value || "PM"),
    platforms: z.array(z.string().trim()).default([]).transform((value) => normalizeSelectedPlatforms(value)),
    intent: z.enum(["draft", "schedule", "publish"]),
  })
  .superRefine((value, ctx) => {
    const hasAnyTimePart = Boolean(value.scheduledHour);
    const maxMediaCount = getMaxMediaCountForPlatforms(value.platforms);

    if ((value.intent === "schedule" || value.intent === "publish") && !value.caption) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: value.intent === "publish" ? "Caption is required before posting now." : "Caption is required when scheduling a post.",
        path: ["caption"],
      });
    }

    if (value.platforms.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Select at least one platform.",
        path: ["platforms"],
      });
    }

    if (value.mediaAssetIds.length > maxMediaCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          maxMediaCount === 1
            ? "Google Business posts can only use 1 image. Remove extra images or deselect Google."
            : `You can attach up to ${maxMediaCount} images for the selected platforms.`,
        path: ["mediaAssetIds"],
      });
    }

    if (doSelectedPlatformsRequireMedia(value.platforms) && value.mediaAssetIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: getRequiredMediaMessageForPlatforms(value.platforms),
        path: ["mediaAssetIds"],
      });
    }

    if (value.intent === "schedule" && !areSelectedPlatformsPublishableNow(value.platforms, "schedule")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Scheduling currently supports Facebook-only or Google-only posts. Remove other platforms before scheduling.",
        path: ["platforms"],
      });
    }

    if (value.intent === "publish" && !areSelectedPlatformsPublishableNow(value.platforms, "publish")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Post Now currently supports single-platform Facebook, Instagram, or Google posts. Remove extra platforms before publishing.",
        path: ["platforms"],
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
  facebookAppId: z
    .string()
    .trim()
    .max(100, "Facebook App ID must be 100 characters or less.")
    .refine((value) => value.length === 0 || /^\d+$/.test(value), "Facebook App ID must contain numbers only."),
  facebookAppSecret: z.string().trim().max(200, "Facebook App Secret must be 200 characters or less.").optional().default(""),
  facebookPageLookupValue: z
    .string()
    .trim()
    .min(1, "Enter a Facebook Page username or Page ID.")
    .max(120, "Preferred Facebook Page lookup must be 120 characters or less.")
    .regex(/^[a-zA-Z0-9._-]+$/, "Use a valid Facebook Page username or ID."),
  returnTo: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || "")
    .refine(
      (value) =>
        value.length === 0 ||
        value === "/dashboard/settings/channels/facebook" ||
        value === "/dashboard/settings/channels/facebook/advanced" ||
        value === "/dashboard/settings/channels/instagram" ||
        value === "/dashboard/settings/channels/instagram/advanced",
      "Invalid return destination.",
    ),
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

export const googleSettingsSchema = z.object({
  googleClientId: z
    .string()
    .trim()
    .min(1, "Google Client ID is required.")
    .max(200, "Google Client ID must be 200 characters or less."),
  googleClientSecret: z
    .string()
    .trim()
    .max(200, "Google Client Secret must be 200 characters or less.")
    .optional()
    .default(""),
  returnTo: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || "")
    .refine(
      (value) =>
        value.length === 0 ||
        value === "/dashboard/settings/channels/google" ||
        value === "/dashboard/settings/channels/google/advanced",
      "Invalid return destination.",
    ),
});

export const googleLocationSelectionSchema = z.object({
  locationName: z.string().trim().min(1, "Choose a Google Business Profile location."),
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

export const userRoleSchema = z.enum(["ADMIN", "CREATOR"]);

export const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters.")
    .max(32, "Username must be 32 characters or less.")
    .regex(/^[a-zA-Z0-9_-]+$/, "Use letters, numbers, dashes, or underscores only."),
  email: z.string().trim().email("Enter a valid email address."),
  password: z
    .string()
    .min(12, "Password must be at least 12 characters.")
    .regex(/[a-z]/, "Password must include a lowercase letter.")
    .regex(/[A-Z]/, "Password must include an uppercase letter.")
    .regex(/[0-9]/, "Password must include a number."),
  role: userRoleSchema,
});

export const updateManagedUserSchema = z.object({
  userId: z.string().trim().min(1, "User ID is required."),
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters.")
    .max(32, "Username must be 32 characters or less.")
    .regex(/^[a-zA-Z0-9_-]+$/, "Use letters, numbers, dashes, or underscores only."),
  email: z.string().trim().email("Enter a valid email address."),
  password: z
    .string()
    .optional()
    .transform((value) => value?.trim() || "")
    .refine((value) => value.length === 0 || value.length >= 12, "Password must be at least 12 characters.")
    .refine((value) => value.length === 0 || /[a-z]/.test(value), "Password must include a lowercase letter.")
    .refine((value) => value.length === 0 || /[A-Z]/.test(value), "Password must include an uppercase letter.")
    .refine((value) => value.length === 0 || /[0-9]/.test(value), "Password must include a number."),
  role: userRoleSchema,
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
    mediaAssetIds: string[];
    platforms: string[];
    mediaSelectionSource?: string;
  };
};

export const initialFormState: FormState = {
  success: false,
  message: null,
};

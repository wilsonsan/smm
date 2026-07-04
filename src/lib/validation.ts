import { SocialPlatform } from "@prisma/client";
import { z } from "zod";
import { normalizeHashtagList } from "@/lib/hashtags";
import { MEDIA_CATEGORY_ICON_OPTIONS } from "@/lib/media-categories";
import {
  areSelectedPlatformsPublishableNow,
  doSelectedPlatformsRequireMedia,
  getCaptionLimitErrorMessage,
  getCaptionRuleForPlatform,
  getCaptionMaxForPlatforms,
  getMaxMediaCountForPlatforms,
  getRequiredMediaMessageForPlatforms,
  normalizeSelectedPlatforms,
} from "@/lib/platform-rules";
import { getEffectivePostDescription, getMainPostDescription, getPlatformDescriptionOverride } from "@/lib/posts";
import { isValidTimezone } from "@/lib/time";

const descriptionFieldByPlatform: Record<SocialPlatform, "descriptionFacebook" | "descriptionInstagram" | "descriptionGoogleBusiness"> = {
  [SocialPlatform.FACEBOOK]: "descriptionFacebook",
  [SocialPlatform.INSTAGRAM]: "descriptionInstagram",
  [SocialPlatform.GOOGLE_BUSINESS]: "descriptionGoogleBusiness",
};

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

export const postFormSchema = z
  .object({
    postId: z.string().trim().optional().transform((value) => value || ""),
    mediaAssetIds: z.array(z.string().trim()).default([]).transform((value) => value.filter(Boolean)),
    descriptionMain: z.string().trim().max(63206, "Main Description must be 63,206 characters or less."),
    descriptionFacebook: z.string().trim().max(63206, "Facebook Override must be 63,206 characters or less.").optional().default(""),
    descriptionInstagram: z.string().trim().max(2200, "Instagram Override must be 2,200 characters or less.").optional().default(""),
    instagramFirstComment: z.string().trim().max(2200, "Instagram First Comment must be 2,200 characters or less.").optional().default(""),
    descriptionGoogleBusiness: z.string().trim().max(1500, "Google Business Override must be 1,500 characters or less.").optional().default(""),
    hashtags: z
      .array(z.string().trim())
      .default([])
      .transform((value) => normalizeHashtagList(value))
      .refine((value) => value.every((tag) => tag.length <= 40), "Each hashtag must be 40 characters or less."),
    includeHashtagsInGoogle: z.string().optional().transform((value) => value === "on"),
    appliedHashtagGroups: z.array(z.string().trim()).default([]).transform((value) => [...new Set(value.filter(Boolean))]),
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
    const mainDescription = getMainPostDescription(value);

    if ((value.intent === "schedule" || value.intent === "publish") && !mainDescription) {
      const everySelectedPlatformHasOverride = value.platforms.every((platform) =>
        Boolean(getPlatformDescriptionOverride(value, platform)),
      );
      if (!everySelectedPlatformHasOverride) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            value.intent === "publish"
              ? "Main Description is required before posting now unless each selected platform has an override."
              : "Main Description is required when scheduling unless each selected platform has an override.",
          path: ["descriptionMain"],
        });
      }
    }

    if (value.platforms.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Select at least one platform.",
        path: ["platforms"],
      });
    }

    if (mainDescription.length > getCaptionMaxForPlatforms([])) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Main Description must be 63,206 characters or less.",
        path: ["descriptionMain"],
      });
    }

    for (const platform of value.platforms) {
      const rule = getCaptionRuleForPlatform(platform);
      const effectiveDescription = getEffectivePostDescription(value, platform);

      if (!effectiveDescription.text) {
        const overrideField = descriptionFieldByPlatform[platform];
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Add a ${rule?.label ?? platform} override or fill Main Description before ${value.intent === "publish" ? "posting now" : "scheduling"}.`,
          path: [overrideField],
        });
        continue;
      }

      if (rule && effectiveDescription.text.length > rule.maxChars) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            effectiveDescription.usedOverride
              ? `${rule.label} Override must be ${rule.maxChars.toLocaleString()} characters or less.`
              : getCaptionLimitErrorMessage([platform]),
          path: [effectiveDescription.usedOverride ? descriptionFieldByPlatform[platform] : "descriptionMain"],
        });
      }
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

export const templateVariableSettingsSchema = z.object({
  templateVariablesJson: z.string().trim().min(2, "Template variables payload is required."),
});

export const insertContentTemplatesSchema = z.object({
  signature: z.string().trim().max(500, "Signature must be 500 characters or less."),
  phoneNumber: z.string().trim().max(120, "Phone Number must be 120 characters or less."),
  email: z.string().trim().max(160, "Email must be 160 characters or less."),
  website: z.string().trim().max(240, "Website must be 240 characters or less."),
});

export const developerSettingsSchema = z.object({
  facebook: z.string().optional().transform((value) => value === "on"),
  instagram: z.string().optional().transform((value) => value === "on"),
  google: z.string().optional().transform((value) => value === "on"),
});

export const hashtagSettingsSchema = z.object({
  facebookDefaultLimit: z.coerce
    .number()
    .int("Facebook hashtag limit must be a whole number.")
    .min(0, "Facebook hashtag limit cannot be less than 0.")
    .max(30, "Facebook hashtag limit cannot be more than 30."),
  groupsJson: z.string().trim().min(2, "Hashtag groups payload is required."),
});

export const templateVariableEditorSchema = z
  .array(
    z.object({
      id: z.string().trim().min(1, "Variable ID is required."),
      name: z.string().trim().min(1, "Variable name is required.").max(60, "Variable name must be 60 characters or less."),
      format: z
        .string()
        .trim()
        .min(1, "Variable format is required.")
        .max(60, "Variable format must be 60 characters or less.")
        .refine((value) => /^{{\s*[a-zA-Z][a-zA-Z0-9]*\s*}}$/.test(value), "Use a token like {{projectType}}."),
      outcome: z.string().trim().max(500, "Variable outcome must be 500 characters or less."),
    }),
  )
  .superRefine((variables, ctx) => {
    const seenNames = new Set<string>();
    const seenFormats = new Set<string>();

    variables.forEach((variable, index) => {
      const normalizedName = variable.name.toLowerCase();
      const normalizedFormat = variable.format.replace(/\s+/g, "");

      if (seenNames.has(normalizedName)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Variable names must be unique.",
          path: [index, "name"],
        });
      } else {
        seenNames.add(normalizedName);
      }

      if (seenFormats.has(normalizedFormat)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Variable formats must be unique.",
          path: [index, "format"],
        });
      } else {
        seenFormats.add(normalizedFormat);
      }
    });
  });

export const galleryDeletionSchema = z.object({
  confirmation: z
    .string()
    .trim()
    .refine((value) => value === "CLEAR GALLERY", "Type CLEAR GALLERY to confirm."),
});

const mediaCategoryIconValues = MEDIA_CATEGORY_ICON_OPTIONS.map((option) => option.value) as [string, ...string[]];

export const mediaCategoryEditorSchema = z.object({
  categoryId: z.string().trim().optional().transform((value) => value || ""),
  name: z.string().trim().min(1, "Category name is required.").max(60, "Category name must be 60 characters or less."),
  color: z
    .string()
    .trim()
    .regex(/^#([a-fA-F0-9]{6})$/, "Choose a valid hex color like #5B8CFF."),
  icon: z.enum(mediaCategoryIconValues),
});

export const mediaCategoryReorderSchema = z.object({
  orderedCategoryIds: z.array(z.string().trim().min(1)).min(1, "Choose at least one category."),
});

export const mediaAssetCategoryUpdateSchema = z.object({
  categoryIds: z.array(z.string().trim().min(1)).max(1, "Choose only one category.").default([]),
  mode: z.enum(["assign", "replace", "clear"]).default("replace"),
});

export const bulkMediaActionSchema = z.object({
  mediaAssetIds: z.array(z.string().trim().min(1)).min(1, "Select at least one media item."),
  action: z.enum(["assignCategories", "replaceCategories", "clearCategories", "deleteSelected"]),
  categoryIds: z.array(z.string().trim().min(1)).max(1, "Choose only one category.").default([]),
});

export const mediaAssetRenameSchema = z.object({
  originalFilename: z
    .string()
    .trim()
    .min(1, "Filename is required.")
    .max(180, "Filename must be 180 characters or less.")
    .refine((value) => !/[\\/:*?"<>|]/.test(value), "Remove unsupported filename characters."),
});

const mediaEditCropSchema = z.object({
  x: z.coerce.number().min(0, "Crop x must be 0 or greater."),
  y: z.coerce.number().min(0, "Crop y must be 0 or greater."),
  width: z.coerce.number().positive("Crop width must be greater than 0."),
  height: z.coerce.number().positive("Crop height must be greater than 0."),
});

const mediaAnnotationPointSchema = z.object({
  x: z.coerce.number().min(0).max(1),
  y: z.coerce.number().min(0).max(1),
});

const mediaAnnotationBaseSchema = z.object({
  id: z.string().trim().min(1).max(80),
  color: z.string().trim().regex(/^#([a-fA-F0-9]{6})$/, "Choose a valid annotation color."),
});

const mediaTextAnnotationSchema = mediaAnnotationBaseSchema.extend({
  kind: z.literal("text"),
  x: z.coerce.number().min(0).max(1),
  y: z.coerce.number().min(0).max(1),
  text: z.string().trim().min(1).max(300),
  textSizeRatio: z.coerce.number().min(0.005).max(0.25),
});

const mediaArrowAnnotationSchema = mediaAnnotationBaseSchema.extend({
  kind: z.literal("arrow"),
  x1: z.coerce.number().min(0).max(1),
  y1: z.coerce.number().min(0).max(1),
  x2: z.coerce.number().min(0).max(1),
  y2: z.coerce.number().min(0).max(1),
  strokeWidthRatio: z.coerce.number().min(0.001).max(0.1),
});

const mediaRectAnnotationSchema = mediaAnnotationBaseSchema.extend({
  kind: z.literal("rect"),
  x: z.coerce.number().min(0).max(1),
  y: z.coerce.number().min(0).max(1),
  width: z.coerce.number().min(0).max(1),
  height: z.coerce.number().min(0).max(1),
  strokeWidthRatio: z.coerce.number().min(0.001).max(0.1),
});

const mediaCircleAnnotationSchema = mediaAnnotationBaseSchema.extend({
  kind: z.literal("circle"),
  x: z.coerce.number().min(0).max(1),
  y: z.coerce.number().min(0).max(1),
  width: z.coerce.number().min(0).max(1),
  height: z.coerce.number().min(0).max(1),
  strokeWidthRatio: z.coerce.number().min(0.001).max(0.1),
});

const mediaDrawAnnotationSchema = mediaAnnotationBaseSchema.extend({
  kind: z.literal("draw"),
  points: z.array(mediaAnnotationPointSchema).min(2).max(1000),
  strokeWidthRatio: z.coerce.number().min(0.001).max(0.1),
});

const mediaAnnotationsSchema = z.object({
  items: z.array(
    z.discriminatedUnion("kind", [
      mediaTextAnnotationSchema,
      mediaArrowAnnotationSchema,
      mediaRectAnnotationSchema,
      mediaCircleAnnotationSchema,
      mediaDrawAnnotationSchema,
    ]),
  ).max(200),
});

export const mediaAssetEditSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("save"),
    crop: mediaEditCropSchema,
    zoom: z.coerce.number().min(1).max(4),
    rotation: z.coerce.number().min(-180).max(180),
    flipHorizontal: z.boolean().optional().default(false),
    flipVertical: z.boolean().optional().default(false),
    aspectRatio: z.string().trim().max(40).optional().default("free"),
    annotations: mediaAnnotationsSchema.optional(),
  }),
  z.object({
    mode: z.literal("revert"),
  }),
]);

export const facebookSettingsSchema = z.object({
  facebookAppId: z
    .string()
    .trim()
    .max(100, "Facebook App ID must be 100 characters or less.")
    .refine((value) => value.length === 0 || /^\d+$/.test(value), "Facebook App ID must contain numbers only."),
  facebookAppSecret: z.string().trim().max(200, "Facebook App Secret must be 200 characters or less.").optional().default(""),
  tokenEncryptionKey: z
    .string()
    .trim()
    .max(500, "Token encryption key must be 500 characters or less.")
    .optional()
    .default(""),
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
  tokenEncryptionKey: z
    .string()
    .trim()
    .max(500, "Token encryption key must be 500 characters or less.")
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

export const googlePreviewSettingsSchema = z.object({
  displayName: z.string().trim().max(120, "Preview business name must be 120 characters or less.").optional().default(""),
  clearImage: z.string().optional().transform((value) => value === "on"),
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
});

export const emailChangeSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newEmail: z.string().trim().email("Enter a valid email address."),
    confirmNewEmail: z.string().trim().email("Confirm your new email address."),
  })
  .superRefine((value, ctx) => {
    if (value.newEmail !== value.confirmNewEmail) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "New email and confirmation must match.",
        path: ["confirmNewEmail"],
      });
    }
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

export const verifyMfaCodeSchema = z.object({
  verificationCode: z
    .string()
    .trim()
    .transform((value) => value.replace(/\D/g, "").slice(0, 6))
    .refine((value) => value.length === 6, "Enter a valid 6-digit code."),
});

export const mfaChallengeSchema = z.object({
  verificationCode: z.string().trim().min(1, "Enter your authenticator code or a recovery code."),
});

export const disableMfaSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password."),
  verificationCode: z.string().trim().min(1, "Enter a valid MFA or recovery code."),
});

export const regenerateMfaRecoveryCodesSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password."),
  verificationCode: z.string().trim().min(1, "Enter a valid MFA or recovery code."),
});

export type FormState = {
  success: boolean;
  message: string | null;
  fieldErrors?: Record<string, string[] | undefined>;
  submittedValues?: {
    descriptionMain: string;
    descriptionFacebook: string;
    descriptionInstagram: string;
    instagramFirstComment: string;
    descriptionGoogleBusiness: string;
    hashtags: string[];
    includeHashtagsInGoogle: boolean;
    appliedHashtagGroups: string[];
    scheduledDate: string;
    scheduledHour: string;
    scheduledMinute: string;
    scheduledMeridiem: string;
    mediaAssetIds: string[];
    platforms: string[];
    mediaSelectionSource?: string;
  };
};

export const hashtagGroupEditorSchema = z
  .array(
    z.object({
      id: z.string().trim().min(1, "Group ID is required."),
      name: z.string().trim().min(1, "Group name is required.").max(60, "Group name must be 60 characters or less."),
      hashtags: z
        .array(z.string())
        .default([])
        .transform((value) => normalizeHashtagList(value))
        .refine((value) => value.every((tag) => tag.length <= 40), "Each hashtag must be 40 characters or less."),
    }),
  )
  .transform((groups) => {
    const seenNames = new Set<string>();
    return groups.filter((group) => {
      const normalizedName = group.name.toLowerCase();
      if (seenNames.has(normalizedName)) {
        return false;
      }

      seenNames.add(normalizedName);
      return true;
    });
  });

export const initialFormState: FormState = {
  success: false,
  message: null,
};

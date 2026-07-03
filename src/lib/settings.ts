import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import {
  buildTemplateVariableValueMap,
  DEFAULT_TEMPLATE_VARIABLES,
  parseStoredTemplateVariables,
  serializeTemplateVariables,
  type TemplateVariableDefinition,
} from "@/lib/template-variables";
import {
  DEFAULT_FACEBOOK_HASHTAG_LIMIT,
  parseStoredFacebookHashtagLimit,
  parseStoredHashtagGroups,
  serializeHashtagGroups,
  type HashtagGroup,
} from "@/lib/hashtags";

export const APP_SETTING_KEYS = {
  SITE_NAME: "SITE_NAME",
  SITE_FAVICON_URL: "SITE_FAVICON_URL",
  PUBLIC_APP_URL: "PUBLIC_APP_URL",
  UPLOAD_DIRECTORY: "UPLOAD_DIRECTORY",
  APP_TIMEZONE: "APP_TIMEZONE",
  TEMPLATE_VARIABLES: "TEMPLATE_VARIABLES",
  INSERT_CONTENT_TEMPLATES: "INSERT_CONTENT_TEMPLATES",
  HASHTAG_GROUPS: "HASHTAG_GROUPS",
  FACEBOOK_DEFAULT_HASHTAG_LIMIT: "FACEBOOK_DEFAULT_HASHTAG_LIMIT",
  FACEBOOK_APP_ID: "FACEBOOK_APP_ID",
  FACEBOOK_APP_SECRET: "FACEBOOK_APP_SECRET",
  FACEBOOK_PAGE_LOOKUP_VALUE: "FACEBOOK_PAGE_LOOKUP_VALUE",
  GOOGLE_CLIENT_ID: "GOOGLE_CLIENT_ID",
  GOOGLE_CLIENT_SECRET: "GOOGLE_CLIENT_SECRET",
  GOOGLE_PREVIEW_DISPLAY_NAME: "GOOGLE_PREVIEW_DISPLAY_NAME",
  GOOGLE_PREVIEW_IMAGE_PATH: "GOOGLE_PREVIEW_IMAGE_PATH",
  TOKEN_ENCRYPTION_KEY: "TOKEN_ENCRYPTION_KEY",
  GOOGLE_DIAGNOSTIC_SNAPSHOT: "GOOGLE_DIAGNOSTIC_SNAPSHOT",
  FACEBOOK_DIAGNOSTIC_SNAPSHOT: "FACEBOOK_DIAGNOSTIC_SNAPSHOT",
  WORKER_LAST_RUN_AT: "WORKER_LAST_RUN_AT",
  WORKER_LAST_RESULT: "WORKER_LAST_RESULT",
  WORKER_LAST_ERROR: "WORKER_LAST_ERROR",
  DEV_OVERRIDE_FACEBOOK: "DEV_OVERRIDE_FACEBOOK",
  DEV_OVERRIDE_INSTAGRAM: "DEV_OVERRIDE_INSTAGRAM",
  DEV_OVERRIDE_GOOGLE: "DEV_OVERRIDE_GOOGLE",
} as const;

export const DEFAULT_SITE_NAME = "Social Media Manager";
export const DEFAULT_SITE_FAVICON_URL = "/social-media-favicon.svg";

export type InsertContentTemplates = {
  signature: string;
  phoneNumber: string;
  email: string;
  website: string;
};

export const DEFAULT_INSERT_CONTENT_TEMPLATES: InsertContentTemplates = {
  signature: "",
  phoneNumber: "",
  email: "",
  website: "",
};

function normalizeUploadDirectoryForCurrentHost(configuredPath: string | undefined | null) {
  const trimmedPath = configuredPath?.trim() || "";
  if (!trimmedPath) {
    return env.UPLOAD_DIR;
  }

  const isWindowsDrivePath = /^[a-zA-Z]:[\\/]/.test(trimmedPath);
  const isWindowsUncPath = /^\\\\/.test(trimmedPath);

  // Upload directory is a host-specific filesystem concern, so fall back to the
  // environment-backed path when a saved path clearly belongs to a different OS.
  if (process.platform !== "win32" && (isWindowsDrivePath || isWindowsUncPath)) {
    return env.UPLOAD_DIR;
  }

  if (process.platform === "win32" && trimmedPath.startsWith("/app/")) {
    return env.UPLOAD_DIR;
  }

  return trimmedPath;
}

function parseBooleanAppSetting(value: string | undefined | null) {
  return value === "true";
}

function normalizeInsertContentValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseStoredInsertContentTemplates(value: string | undefined | null): InsertContentTemplates {
  if (!value?.trim()) {
    return { ...DEFAULT_INSERT_CONTENT_TEMPLATES };
  }

  try {
    const parsed = JSON.parse(value);
    return {
      signature: normalizeInsertContentValue(parsed?.signature),
      phoneNumber: normalizeInsertContentValue(parsed?.phoneNumber),
      email: normalizeInsertContentValue(parsed?.email),
      website: normalizeInsertContentValue(parsed?.website),
    };
  } catch {
    return { ...DEFAULT_INSERT_CONTENT_TEMPLATES };
  }
}

function serializeInsertContentTemplates(value: InsertContentTemplates) {
  return JSON.stringify({
    signature: value.signature.trim(),
    phoneNumber: value.phoneNumber.trim(),
    email: value.email.trim(),
    website: value.website.trim(),
  });
}

export async function getAppSettings() {
  const settings = await prisma.appSetting.findMany({
    where: {
      key: {
        in: Object.values(APP_SETTING_KEYS),
      },
    },
  });

  const byKey = new Map(settings.map((setting) => [setting.key, setting.value]));

  return {
    siteName: byKey.get(APP_SETTING_KEYS.SITE_NAME) || DEFAULT_SITE_NAME,
    siteFaviconUrl: byKey.get(APP_SETTING_KEYS.SITE_FAVICON_URL) || DEFAULT_SITE_FAVICON_URL,
    publicAppUrl: byKey.get(APP_SETTING_KEYS.PUBLIC_APP_URL) || env.APP_URL,
    uploadDirectory: normalizeUploadDirectoryForCurrentHost(byKey.get(APP_SETTING_KEYS.UPLOAD_DIRECTORY)),
    appTimezone: byKey.get(APP_SETTING_KEYS.APP_TIMEZONE) || "America/New_York",
    templateVariables: parseStoredTemplateVariables(byKey.get(APP_SETTING_KEYS.TEMPLATE_VARIABLES)),
    insertContentTemplates: parseStoredInsertContentTemplates(byKey.get(APP_SETTING_KEYS.INSERT_CONTENT_TEMPLATES)),
    hashtagSettings: {
      facebookDefaultLimit: parseStoredFacebookHashtagLimit(byKey.get(APP_SETTING_KEYS.FACEBOOK_DEFAULT_HASHTAG_LIMIT)),
      groups: parseStoredHashtagGroups(byKey.get(APP_SETTING_KEYS.HASHTAG_GROUPS)),
    },
    facebookAppId: byKey.get(APP_SETTING_KEYS.FACEBOOK_APP_ID) || "",
    facebookAppSecretConfigured: Boolean(byKey.get(APP_SETTING_KEYS.FACEBOOK_APP_SECRET)?.trim()),
    facebookPageLookupValue: byKey.get(APP_SETTING_KEYS.FACEBOOK_PAGE_LOOKUP_VALUE) || env.FACEBOOK_PAGE_LOOKUP_VALUE || "nctilepro",
    googleClientId: byKey.get(APP_SETTING_KEYS.GOOGLE_CLIENT_ID) || env.GOOGLE_CLIENT_ID || "",
    googleClientSecretConfigured: Boolean(byKey.get(APP_SETTING_KEYS.GOOGLE_CLIENT_SECRET)?.trim()) || Boolean(env.GOOGLE_CLIENT_SECRET),
    googlePreviewDisplayName: byKey.get(APP_SETTING_KEYS.GOOGLE_PREVIEW_DISPLAY_NAME) || "",
    googlePreviewImagePath: byKey.get(APP_SETTING_KEYS.GOOGLE_PREVIEW_IMAGE_PATH) || "",
    tokenEncryptionKeyConfigured: Boolean(byKey.get(APP_SETTING_KEYS.TOKEN_ENCRYPTION_KEY)?.trim()) || Boolean(env.TOKEN_ENCRYPTION_KEY),
    devOverrides: {
      facebook: parseBooleanAppSetting(byKey.get(APP_SETTING_KEYS.DEV_OVERRIDE_FACEBOOK)),
      instagram: parseBooleanAppSetting(byKey.get(APP_SETTING_KEYS.DEV_OVERRIDE_INSTAGRAM)),
      google: parseBooleanAppSetting(byKey.get(APP_SETTING_KEYS.DEV_OVERRIDE_GOOGLE)),
    },
  };
}

export async function saveAppSettings(input: {
  siteName: string;
  siteFaviconUrl: string;
  publicAppUrl: string;
  uploadDirectory: string;
  appTimezone: string;
}) {
  await prisma.$transaction([
    prisma.appSetting.upsert({
      where: { key: APP_SETTING_KEYS.SITE_NAME },
      update: { value: input.siteName },
      create: { key: APP_SETTING_KEYS.SITE_NAME, value: input.siteName },
    }),
    prisma.appSetting.upsert({
      where: { key: APP_SETTING_KEYS.SITE_FAVICON_URL },
      update: { value: input.siteFaviconUrl },
      create: { key: APP_SETTING_KEYS.SITE_FAVICON_URL, value: input.siteFaviconUrl },
    }),
    prisma.appSetting.upsert({
      where: { key: APP_SETTING_KEYS.PUBLIC_APP_URL },
      update: { value: input.publicAppUrl },
      create: { key: APP_SETTING_KEYS.PUBLIC_APP_URL, value: input.publicAppUrl },
    }),
    prisma.appSetting.upsert({
      where: { key: APP_SETTING_KEYS.UPLOAD_DIRECTORY },
      update: { value: input.uploadDirectory },
      create: { key: APP_SETTING_KEYS.UPLOAD_DIRECTORY, value: input.uploadDirectory },
    }),
    prisma.appSetting.upsert({
      where: { key: APP_SETTING_KEYS.APP_TIMEZONE },
      update: { value: input.appTimezone },
      create: { key: APP_SETTING_KEYS.APP_TIMEZONE, value: input.appTimezone },
    }),
  ]);
}

export async function getTemplateVariableSettings() {
  const settings = await getAppSettings();
  return settings.templateVariables;
}

export async function saveTemplateVariableSettings(input: {
  templateVariables: TemplateVariableDefinition[];
}) {
  await prisma.appSetting.upsert({
    where: { key: APP_SETTING_KEYS.TEMPLATE_VARIABLES },
    update: { value: serializeTemplateVariables(input.templateVariables) },
    create: { key: APP_SETTING_KEYS.TEMPLATE_VARIABLES, value: serializeTemplateVariables(input.templateVariables) },
  });
}

export async function getInsertContentTemplateSettings() {
  const settings = await getAppSettings();
  return settings.insertContentTemplates;
}

export async function saveInsertContentTemplateSettings(input: InsertContentTemplates) {
  await prisma.appSetting.upsert({
    where: { key: APP_SETTING_KEYS.INSERT_CONTENT_TEMPLATES },
    update: { value: serializeInsertContentTemplates(input) },
    create: { key: APP_SETTING_KEYS.INSERT_CONTENT_TEMPLATES, value: serializeInsertContentTemplates(input) },
  });
}

export async function getHashtagSettings() {
  const settings = await getAppSettings();

  return settings.hashtagSettings;
}

export async function saveHashtagSettings(input: {
  facebookDefaultLimit: number;
  groups: HashtagGroup[];
}) {
  await prisma.$transaction([
    prisma.appSetting.upsert({
      where: { key: APP_SETTING_KEYS.FACEBOOK_DEFAULT_HASHTAG_LIMIT },
      update: { value: String(input.facebookDefaultLimit) },
      create: { key: APP_SETTING_KEYS.FACEBOOK_DEFAULT_HASHTAG_LIMIT, value: String(input.facebookDefaultLimit) },
    }),
    prisma.appSetting.upsert({
      where: { key: APP_SETTING_KEYS.HASHTAG_GROUPS },
      update: { value: serializeHashtagGroups(input.groups) },
      create: { key: APP_SETTING_KEYS.HASHTAG_GROUPS, value: serializeHashtagGroups(input.groups) },
    }),
  ]);
}

export async function getFacebookAppIdSetting() {
  const settings = await getAppSettings();
  return settings.facebookAppId || env.FACEBOOK_APP_ID || "";
}

export async function saveFacebookAppIdSetting(appId: string) {
  await prisma.appSetting.upsert({
    where: { key: APP_SETTING_KEYS.FACEBOOK_APP_ID },
    update: { value: appId },
    create: { key: APP_SETTING_KEYS.FACEBOOK_APP_ID, value: appId },
  });
}

export async function saveFacebookPageLookupSetting(pageLookupValue: string) {
  await prisma.appSetting.upsert({
    where: { key: APP_SETTING_KEYS.FACEBOOK_PAGE_LOOKUP_VALUE },
    update: { value: pageLookupValue },
    create: { key: APP_SETTING_KEYS.FACEBOOK_PAGE_LOOKUP_VALUE, value: pageLookupValue },
  });
}

export async function upsertAppSetting(key: string, value: string) {
  await prisma.appSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

export async function getGoogleClientIdSetting() {
  const settings = await getAppSettings();
  return settings.googleClientId || env.GOOGLE_CLIENT_ID || "";
}

export async function saveGoogleClientIdSetting(clientId: string) {
  await prisma.appSetting.upsert({
    where: { key: APP_SETTING_KEYS.GOOGLE_CLIENT_ID },
    update: { value: clientId },
    create: { key: APP_SETTING_KEYS.GOOGLE_CLIENT_ID, value: clientId },
  });
}

export async function saveGooglePreviewSettings(input: {
  displayName: string;
  imagePath: string;
}) {
  await prisma.$transaction([
    prisma.appSetting.upsert({
      where: { key: APP_SETTING_KEYS.GOOGLE_PREVIEW_DISPLAY_NAME },
      update: { value: input.displayName.trim() },
      create: { key: APP_SETTING_KEYS.GOOGLE_PREVIEW_DISPLAY_NAME, value: input.displayName.trim() },
    }),
    prisma.appSetting.upsert({
      where: { key: APP_SETTING_KEYS.GOOGLE_PREVIEW_IMAGE_PATH },
      update: { value: input.imagePath.trim() },
      create: { key: APP_SETTING_KEYS.GOOGLE_PREVIEW_IMAGE_PATH, value: input.imagePath.trim() },
    }),
  ]);
}

export async function getGooglePreviewSettings() {
  const settings = await getAppSettings();

  return {
    displayName: settings.googlePreviewDisplayName || "",
    imagePath: settings.googlePreviewImagePath || "",
  };
}

export async function getStoredTokenEncryptionKeySetting() {
  const setting = await prisma.appSetting.findUnique({
    where: { key: APP_SETTING_KEYS.TOKEN_ENCRYPTION_KEY },
    select: { value: true },
  });

  return setting?.value?.trim() || "";
}

export async function saveTokenEncryptionKeySetting(tokenEncryptionKey: string) {
  await prisma.appSetting.upsert({
    where: { key: APP_SETTING_KEYS.TOKEN_ENCRYPTION_KEY },
    update: { value: tokenEncryptionKey.trim() },
    create: { key: APP_SETTING_KEYS.TOKEN_ENCRYPTION_KEY, value: tokenEncryptionKey.trim() },
  });
}

export async function getAppSettingValue(key: string) {
  const setting = await prisma.appSetting.findUnique({
    where: { key },
    select: { value: true },
  });

  return setting?.value ?? null;
}

export async function getUploadDirectory() {
  const settings = await getAppSettings();
  return settings.uploadDirectory;
}

export async function getAppTimezone() {
  const settings = await getAppSettings();
  return settings.appTimezone || "America/New_York";
}

export async function getBrandingSettings() {
  const settings = await getAppSettings();

  return {
    siteName: settings.siteName || DEFAULT_SITE_NAME,
    siteFaviconUrl: settings.siteFaviconUrl || DEFAULT_SITE_FAVICON_URL,
  };
}

export async function getBusinessVariableSettings() {
  const settings = await getAppSettings();
  return buildTemplateVariableValueMap(settings.templateVariables || DEFAULT_TEMPLATE_VARIABLES);
}

export async function getDeveloperSettings() {
  const settings = await getAppSettings();

  return {
    facebook: settings.devOverrides.facebook,
    instagram: settings.devOverrides.instagram,
    google: settings.devOverrides.google,
  };
}

export async function saveDeveloperSettings(input: {
  facebook: boolean;
  instagram: boolean;
  google: boolean;
}) {
  await prisma.$transaction([
    prisma.appSetting.upsert({
      where: { key: APP_SETTING_KEYS.DEV_OVERRIDE_FACEBOOK },
      update: { value: String(input.facebook) },
      create: { key: APP_SETTING_KEYS.DEV_OVERRIDE_FACEBOOK, value: String(input.facebook) },
    }),
    prisma.appSetting.upsert({
      where: { key: APP_SETTING_KEYS.DEV_OVERRIDE_INSTAGRAM },
      update: { value: String(input.instagram) },
      create: { key: APP_SETTING_KEYS.DEV_OVERRIDE_INSTAGRAM, value: String(input.instagram) },
    }),
    prisma.appSetting.upsert({
      where: { key: APP_SETTING_KEYS.DEV_OVERRIDE_GOOGLE },
      update: { value: String(input.google) },
      create: { key: APP_SETTING_KEYS.DEV_OVERRIDE_GOOGLE, value: String(input.google) },
    }),
  ]);
}

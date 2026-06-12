import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";

export const APP_SETTING_KEYS = {
  SITE_NAME: "SITE_NAME",
  SITE_FAVICON_URL: "SITE_FAVICON_URL",
  PUBLIC_APP_URL: "PUBLIC_APP_URL",
  UPLOAD_DIRECTORY: "UPLOAD_DIRECTORY",
  APP_TIMEZONE: "APP_TIMEZONE",
  FACEBOOK_APP_ID: "FACEBOOK_APP_ID",
  FACEBOOK_APP_SECRET: "FACEBOOK_APP_SECRET",
  FACEBOOK_PAGE_LOOKUP_VALUE: "FACEBOOK_PAGE_LOOKUP_VALUE",
  GOOGLE_CLIENT_ID: "GOOGLE_CLIENT_ID",
  GOOGLE_CLIENT_SECRET: "GOOGLE_CLIENT_SECRET",
  TOKEN_ENCRYPTION_KEY: "TOKEN_ENCRYPTION_KEY",
  GOOGLE_DIAGNOSTIC_SNAPSHOT: "GOOGLE_DIAGNOSTIC_SNAPSHOT",
  FACEBOOK_DIAGNOSTIC_SNAPSHOT: "FACEBOOK_DIAGNOSTIC_SNAPSHOT",
  WORKER_LAST_RUN_AT: "WORKER_LAST_RUN_AT",
  WORKER_LAST_RESULT: "WORKER_LAST_RESULT",
  WORKER_LAST_ERROR: "WORKER_LAST_ERROR",
} as const;

export const DEFAULT_SITE_NAME = "Social Media Manager";
export const DEFAULT_SITE_FAVICON_URL = "/social-media-favicon.svg";

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
    facebookAppId: byKey.get(APP_SETTING_KEYS.FACEBOOK_APP_ID) || "",
    facebookAppSecretConfigured: Boolean(byKey.get(APP_SETTING_KEYS.FACEBOOK_APP_SECRET)?.trim()),
    facebookPageLookupValue: byKey.get(APP_SETTING_KEYS.FACEBOOK_PAGE_LOOKUP_VALUE) || env.FACEBOOK_PAGE_LOOKUP_VALUE || "nctilepro",
    googleClientId: byKey.get(APP_SETTING_KEYS.GOOGLE_CLIENT_ID) || env.GOOGLE_CLIENT_ID || "",
    googleClientSecretConfigured: Boolean(byKey.get(APP_SETTING_KEYS.GOOGLE_CLIENT_SECRET)?.trim()) || Boolean(env.GOOGLE_CLIENT_SECRET),
    tokenEncryptionKeyConfigured: Boolean(byKey.get(APP_SETTING_KEYS.TOKEN_ENCRYPTION_KEY)?.trim()) || Boolean(env.TOKEN_ENCRYPTION_KEY),
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

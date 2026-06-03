import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";

export const APP_SETTING_KEYS = {
  PUBLIC_APP_URL: "PUBLIC_APP_URL",
  UPLOAD_DIRECTORY: "UPLOAD_DIRECTORY",
} as const;

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
    publicAppUrl: byKey.get(APP_SETTING_KEYS.PUBLIC_APP_URL) || env.APP_URL,
    uploadDirectory: byKey.get(APP_SETTING_KEYS.UPLOAD_DIRECTORY) || env.UPLOAD_DIR,
  };
}

export async function saveAppSettings(input: {
  publicAppUrl: string;
  uploadDirectory: string;
}) {
  await prisma.$transaction([
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
  ]);
}

export async function getUploadDirectory() {
  const settings = await getAppSettings();
  return settings.uploadDirectory;
}


import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env, hasTokenEncryptionKeyConfigured } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { APP_SETTING_KEYS } from "@/lib/settings";

function buildSettingsEncryptionKey() {
  if (!hasTokenEncryptionKeyConfigured) {
    throw new Error("TOKEN_ENCRYPTION_KEY is required before secure settings can be stored.");
  }

  return createHash("sha256").update(env.TOKEN_ENCRYPTION_KEY || "").digest();
}

function encryptSettingValue(value: string) {
  const key = buildSettingsEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `enc:${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decryptSettingValue(value: string) {
  if (!value.startsWith("enc:")) {
    return value;
  }

  const key = buildSettingsEncryptionKey();
  const payload = value.slice(4);
  const parts = payload.split(".");

  if (parts.length !== 3) {
    throw new Error("Stored secure setting payload is invalid.");
  }

  const [ivPart, tagPart, encryptedPart] = parts;
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

async function getSecureSettingValue(key: string, fallbackValue = "") {
  const setting = await prisma.appSetting.findUnique({
    where: { key },
    select: { value: true },
  });

  if (setting?.value?.trim()) {
    return decryptSettingValue(setting.value);
  }

  return fallbackValue;
}

async function saveSecureSettingValue(key: string, value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return;
  }

  await prisma.appSetting.upsert({
    where: { key },
    update: { value: encryptSettingValue(trimmedValue) },
    create: { key, value: encryptSettingValue(trimmedValue) },
  });
}

export async function getFacebookAppSecretSetting() {
  return getSecureSettingValue(APP_SETTING_KEYS.FACEBOOK_APP_SECRET, env.FACEBOOK_APP_SECRET || "");
}

export async function saveFacebookAppSecretSetting(appSecret: string) {
  await saveSecureSettingValue(APP_SETTING_KEYS.FACEBOOK_APP_SECRET, appSecret);
}

export async function getGoogleClientSecretSetting() {
  return getSecureSettingValue(APP_SETTING_KEYS.GOOGLE_CLIENT_SECRET, env.GOOGLE_CLIENT_SECRET || "");
}

export async function saveGoogleClientSecretSetting(clientSecret: string) {
  await saveSecureSettingValue(APP_SETTING_KEYS.GOOGLE_CLIENT_SECRET, clientSecret);
}

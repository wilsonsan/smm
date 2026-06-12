import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { APP_SETTING_KEYS, getStoredTokenEncryptionKeySetting, saveTokenEncryptionKeySetting } from "@/lib/settings";

const SECURE_SETTING_KEYS = [APP_SETTING_KEYS.FACEBOOK_APP_SECRET, APP_SETTING_KEYS.GOOGLE_CLIENT_SECRET] as const;

function buildSettingsEncryptionKeyFromValue(tokenEncryptionKey: string) {
  if (!tokenEncryptionKey.trim()) {
    throw new Error("A token encryption key is required before secure settings can be stored.");
  }

  return createHash("sha256").update(tokenEncryptionKey).digest();
}

function encryptSettingValueWithKey(value: string, tokenEncryptionKey: string) {
  const key = buildSettingsEncryptionKeyFromValue(tokenEncryptionKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `enc:${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decryptSettingValueWithKey(value: string, tokenEncryptionKey: string) {
  if (!value.startsWith("enc:")) {
    return value;
  }

  const key = buildSettingsEncryptionKeyFromValue(tokenEncryptionKey);
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

export async function getTokenEncryptionKeyState() {
  const storedValue = await getStoredTokenEncryptionKeySetting();
  if (storedValue) {
    return {
      value: storedValue,
      configured: true,
      source: "settings" as const,
    };
  }

  const environmentValue = env.TOKEN_ENCRYPTION_KEY?.trim() || "";
  if (environmentValue) {
    return {
      value: environmentValue,
      configured: true,
      source: "environment" as const,
    };
  }

  return {
    value: "",
    configured: false,
    source: "missing" as const,
  };
}

async function getSecureSettingValue(key: string, fallbackValue = "") {
  const setting = await prisma.appSetting.findUnique({
    where: { key },
    select: { value: true },
  });

  if (setting?.value?.trim()) {
    if (!setting.value.startsWith("enc:")) {
      return setting.value;
    }

    const tokenEncryptionKey = await getTokenEncryptionKeyState();
    if (!tokenEncryptionKey.configured || !tokenEncryptionKey.value) {
      return fallbackValue;
    }

    try {
      return decryptSettingValueWithKey(setting.value, tokenEncryptionKey.value);
    } catch {
      return fallbackValue;
    }
  }

  return fallbackValue;
}

async function saveSecureSettingValue(key: string, value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return;
  }

  const tokenEncryptionKey = await getTokenEncryptionKeyState();
  if (!tokenEncryptionKey.configured || !tokenEncryptionKey.value) {
    throw new Error("A token encryption key is required before secure settings can be stored.");
  }

  const encryptedValue = encryptSettingValueWithKey(trimmedValue, tokenEncryptionKey.value);

  await prisma.appSetting.upsert({
    where: { key },
    update: { value: encryptedValue },
    create: { key, value: encryptedValue },
  });
}

export async function rotateTokenEncryptionKeySetting(nextTokenEncryptionKey: string) {
  const trimmedNextTokenEncryptionKey = nextTokenEncryptionKey.trim();
  if (!trimmedNextTokenEncryptionKey) {
    return;
  }

  const currentTokenEncryptionKey = await getTokenEncryptionKeyState();
  if (
    currentTokenEncryptionKey.configured &&
    currentTokenEncryptionKey.source === "settings" &&
    currentTokenEncryptionKey.value === trimmedNextTokenEncryptionKey
  ) {
    return;
  }

  const existingSecureSettings = await prisma.appSetting.findMany({
    where: {
      key: {
        in: [...SECURE_SETTING_KEYS],
      },
    },
    select: {
      key: true,
      value: true,
    },
  });

  const decryptedValues = new Map<string, string>();
  for (const setting of existingSecureSettings) {
    const currentValue = setting.value?.trim() || "";
    if (!currentValue) {
      continue;
    }

    if (!currentValue.startsWith("enc:")) {
      decryptedValues.set(setting.key, currentValue);
      continue;
    }

    if (!currentTokenEncryptionKey.configured || !currentTokenEncryptionKey.value) {
      continue;
    }

    try {
      decryptedValues.set(setting.key, decryptSettingValueWithKey(currentValue, currentTokenEncryptionKey.value));
    } catch {
      continue;
    }
  }

  await saveTokenEncryptionKeySetting(trimmedNextTokenEncryptionKey);

  for (const setting of existingSecureSettings) {
    const value = decryptedValues.get(setting.key);
    if (!value?.trim()) {
      await prisma.appSetting.upsert({
        where: { key: setting.key },
        update: { value: "" },
        create: { key: setting.key, value: "" },
      });
      continue;
    }

    await prisma.appSetting.upsert({
      where: { key: setting.key },
      update: { value: encryptSettingValueWithKey(value, trimmedNextTokenEncryptionKey) },
      create: { key: setting.key, value: encryptSettingValueWithKey(value, trimmedNextTokenEncryptionKey) },
    });
  }
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

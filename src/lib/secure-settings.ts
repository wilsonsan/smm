import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import {
  APP_SETTING_KEYS,
  deleteStoredTokenEncryptionKeySetting,
  getStoredTokenEncryptionKeySetting,
} from "@/lib/settings";

const SECURE_SETTING_KEYS = [APP_SETTING_KEYS.FACEBOOK_APP_SECRET, APP_SETTING_KEYS.GOOGLE_CLIENT_SECRET] as const;

export type TokenEncryptionKeySource = "environment" | "legacy_settings" | "missing";

function getEnvironmentTokenEncryptionKeyValue() {
  return env.TOKEN_ENCRYPTION_KEY?.trim() || "";
}

function buildSettingsEncryptionKeyFromValue(tokenEncryptionKey: string) {
  if (!tokenEncryptionKey.trim()) {
    throw new Error("A token encryption key is required before secure settings can be stored.");
  }

  return createHash("sha256").update(tokenEncryptionKey).digest();
}

function encryptValueWithKey(value: string, tokenEncryptionKey: string) {
  const key = buildSettingsEncryptionKeyFromValue(tokenEncryptionKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `enc:${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decryptValueWithKey(value: string, tokenEncryptionKey: string) {
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

export async function getTokenEncryptionKeyCandidates() {
  const environmentValue = getEnvironmentTokenEncryptionKeyValue();
  const storedLegacyValue = await getStoredTokenEncryptionKeySetting();
  const candidates: Array<{
    value: string;
    source: Exclude<TokenEncryptionKeySource, "missing">;
  }> = [];

  if (environmentValue) {
    candidates.push({
      value: environmentValue,
      source: "environment",
    });
  }

  if (storedLegacyValue && storedLegacyValue !== environmentValue) {
    candidates.push({
      value: storedLegacyValue,
      source: "legacy_settings",
    });
  }

  return candidates;
}

export async function getTokenEncryptionKeyState() {
  const candidates = await getTokenEncryptionKeyCandidates();
  const firstCandidate = candidates[0];

  if (!firstCandidate) {
    return {
      value: "",
      configured: false,
      source: "missing" as const,
    };
  }

  return {
    value: firstCandidate.value,
    configured: true,
    source: firstCandidate.source,
  };
}

async function upgradeSecureSettingValueToEnvironmentKeyIfNeeded(input: {
  key: string;
  currentValue: string;
  decryptedValue: string;
  decryptedWith: Exclude<TokenEncryptionKeySource, "missing">;
}) {
  const environmentValue = getEnvironmentTokenEncryptionKeyValue();
  if (!environmentValue || input.decryptedWith !== "legacy_settings") {
    return;
  }

  await prisma.appSetting.upsert({
    where: { key: input.key },
    update: { value: encryptValueWithKey(input.decryptedValue, environmentValue) },
    create: { key: input.key, value: encryptValueWithKey(input.decryptedValue, environmentValue) },
  });
}

async function getSecureSettingValue(key: string, fallbackValue = "") {
  const setting = await prisma.appSetting.findUnique({
    where: { key },
    select: { value: true },
  });

  const currentValue = setting?.value?.trim() || "";
  if (!currentValue) {
    return fallbackValue;
  }

  if (!currentValue.startsWith("enc:")) {
    return currentValue;
  }

  const candidates = await getTokenEncryptionKeyCandidates();
  for (const candidate of candidates) {
    try {
      const decryptedValue = decryptValueWithKey(currentValue, candidate.value);
      await upgradeSecureSettingValueToEnvironmentKeyIfNeeded({
        key,
        currentValue,
        decryptedValue,
        decryptedWith: candidate.source,
      });
      return decryptedValue;
    } catch {
      continue;
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
    throw new Error("Configure TOKEN_ENCRYPTION_KEY in the environment before secure settings can be stored.");
  }

  const encryptedValue = encryptValueWithKey(trimmedValue, tokenEncryptionKey.value);

  await prisma.appSetting.upsert({
    where: { key },
    update: { value: encryptedValue },
    create: { key, value: encryptedValue },
  });
}

export async function migrateStoredTokenEncryptionKeyToEnvironment() {
  const environmentValue = getEnvironmentTokenEncryptionKeyValue();
  const storedLegacyValue = await getStoredTokenEncryptionKeySetting();

  if (!environmentValue) {
    return {
      migrated: false,
      clearedLegacyKey: false,
      migratedSecureSettings: 0,
      migratedMfaSecrets: 0,
      reason: "environment_missing" as const,
    };
  }

  if (!storedLegacyValue) {
    return {
      migrated: false,
      clearedLegacyKey: false,
      migratedSecureSettings: 0,
      migratedMfaSecrets: 0,
      reason: "no_legacy_key" as const,
    };
  }

  if (storedLegacyValue === environmentValue) {
    await deleteStoredTokenEncryptionKeySetting();
    return {
      migrated: true,
      clearedLegacyKey: true,
      migratedSecureSettings: 0,
      migratedMfaSecrets: 0,
      reason: "matching_legacy_key_removed" as const,
    };
  }

  const [secureSettings, adminUsersWithMfa] = await Promise.all([
    prisma.appSetting.findMany({
      where: {
        key: {
          in: [...SECURE_SETTING_KEYS],
        },
      },
      select: {
        key: true,
        value: true,
      },
    }),
    prisma.adminUser.findMany({
      where: {
        mfaSecretEncrypted: {
          not: null,
        },
      },
      select: {
        id: true,
        mfaSecretEncrypted: true,
      },
    }),
  ]);

  const secureSettingWrites: Array<ReturnType<typeof prisma.appSetting.upsert>> = [];
  const mfaWrites: Array<ReturnType<typeof prisma.adminUser.update>> = [];
  let unresolvedValueCount = 0;

  for (const setting of secureSettings) {
    const currentValue = setting.value?.trim() || "";
    if (!currentValue) {
      continue;
    }

    if (!currentValue.startsWith("enc:")) {
      secureSettingWrites.push(
        prisma.appSetting.upsert({
          where: { key: setting.key },
          update: { value: encryptValueWithKey(currentValue, environmentValue) },
          create: { key: setting.key, value: encryptValueWithKey(currentValue, environmentValue) },
        }),
      );
      continue;
    }

    try {
      decryptValueWithKey(currentValue, environmentValue);
      continue;
    } catch {
      try {
        const decryptedValue = decryptValueWithKey(currentValue, storedLegacyValue);
        secureSettingWrites.push(
          prisma.appSetting.upsert({
            where: { key: setting.key },
            update: { value: encryptValueWithKey(decryptedValue, environmentValue) },
            create: { key: setting.key, value: encryptValueWithKey(decryptedValue, environmentValue) },
          }),
        );
      } catch {
        unresolvedValueCount += 1;
      }
    }
  }

  for (const adminUser of adminUsersWithMfa) {
    const currentValue = adminUser.mfaSecretEncrypted?.trim() || "";
    if (!currentValue) {
      continue;
    }

    if (!currentValue.startsWith("enc:")) {
      mfaWrites.push(
        prisma.adminUser.update({
          where: { id: adminUser.id },
          data: {
            mfaSecretEncrypted: encryptValueWithKey(currentValue, environmentValue),
          },
        }),
      );
      continue;
    }

    try {
      decryptValueWithKey(currentValue, environmentValue);
      continue;
    } catch {
      try {
        const decryptedValue = decryptValueWithKey(currentValue, storedLegacyValue);
        mfaWrites.push(
          prisma.adminUser.update({
            where: { id: adminUser.id },
            data: {
              mfaSecretEncrypted: encryptValueWithKey(decryptedValue, environmentValue),
            },
          }),
        );
      } catch {
        unresolvedValueCount += 1;
      }
    }
  }

  await prisma.$transaction([
    ...secureSettingWrites,
    ...mfaWrites,
    ...(unresolvedValueCount === 0
      ? [
          prisma.appSetting.deleteMany({
            where: {
              key: APP_SETTING_KEYS.TOKEN_ENCRYPTION_KEY,
            },
          }),
        ]
      : []),
  ]);

  return {
    migrated: true,
    clearedLegacyKey: unresolvedValueCount === 0,
    migratedSecureSettings: secureSettingWrites.length,
    migratedMfaSecrets: mfaWrites.length,
    reason: unresolvedValueCount === 0 ? "legacy_key_migrated" : "legacy_key_still_required",
  };
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

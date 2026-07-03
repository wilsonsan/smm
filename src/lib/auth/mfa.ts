import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import { generateSecret as generateOtpSecret, generateURI, verify } from "otplib";
import { getTokenEncryptionKeyCandidates, getTokenEncryptionKeyState } from "@/lib/secure-settings";
import { prisma } from "@/lib/prisma";

const MFA_STEP_SECONDS = 30;
const MFA_DIGITS = 6;
function buildEncryptionKey(tokenEncryptionKey: string) {
  if (!tokenEncryptionKey.trim()) {
    throw new Error("A token encryption key is required before MFA can be enabled.");
  }

  return createHash("sha256").update(tokenEncryptionKey).digest();
}

export function normalizeRecoveryCode(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

export function normalizeMfaCode(value: string) {
  return value.replace(/\D/g, "").slice(0, MFA_DIGITS);
}

export function generateMfaSecret() {
  return generateOtpSecret();
}

export function formatManualSetupKey(secret: string) {
  return secret.replace(/\s+/g, "").toUpperCase().match(/.{1,4}/g)?.join(" ") ?? secret.toUpperCase();
}

export function buildMfaOtpAuthUri(input: {
  secret: string;
  accountName: string;
  issuer: string;
}) {
  return generateURI({
    issuer: input.issuer,
    label: input.accountName,
    secret: input.secret,
    digits: MFA_DIGITS,
    period: MFA_STEP_SECONDS,
  });
}

export async function buildMfaQrCodeDataUrl(input: {
  secret: string;
  accountName: string;
  issuer: string;
}) {
  return QRCode.toDataURL(buildMfaOtpAuthUri(input), {
    margin: 1,
    width: 224,
  });
}

export async function encryptMfaSecret(secret: string) {
  const tokenEncryptionKey = await getTokenEncryptionKeyState();
  if (!tokenEncryptionKey.configured || !tokenEncryptionKey.value) {
    throw new Error("A token encryption key is required before MFA can be enabled.");
  }

  const key = buildEncryptionKey(tokenEncryptionKey.value);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `enc:${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export async function decryptMfaSecret(secretEncrypted: string) {
  const tokenEncryptionKeys = await getTokenEncryptionKeyCandidates();
  if (tokenEncryptionKeys.length === 0) {
    throw new Error("A token encryption key is required before MFA can be used.");
  }

  if (!secretEncrypted.startsWith("enc:")) {
    return secretEncrypted;
  }

  const payload = secretEncrypted.slice(4);
  const parts = payload.split(".");
  if (parts.length !== 3) {
    throw new Error("Stored MFA secret payload is invalid.");
  }

  const [ivPart, tagPart, encryptedPart] = parts;

  for (const tokenEncryptionKey of tokenEncryptionKeys) {
    try {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        buildEncryptionKey(tokenEncryptionKey.value),
        Buffer.from(ivPart, "base64url"),
      );
      decipher.setAuthTag(Buffer.from(tagPart, "base64url"));

      return Buffer.concat([
        decipher.update(Buffer.from(encryptedPart, "base64url")),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      continue;
    }
  }

  throw new Error("Stored MFA secret could not be decrypted with the available token encryption keys.");
}

export function verifyTotpCode(input: {
  secret: string;
  code: string;
}) {
  const normalizedCode = normalizeMfaCode(input.code);
  if (normalizedCode.length !== MFA_DIGITS) {
    return Promise.resolve(false);
  }

  return verify({
    secret: input.secret,
    token: normalizedCode,
    digits: MFA_DIGITS,
    period: MFA_STEP_SECONDS,
    epochTolerance: MFA_STEP_SECONDS,
  }).then((result) => result.valid);
}

function generateRecoveryCodeSegment() {
  return randomBytes(3).toString("hex").toUpperCase();
}

export function generateRecoveryCodes(count = 10) {
  return Array.from({ length: count }, () => `${generateRecoveryCodeSegment()}-${generateRecoveryCodeSegment()}`);
}

export async function hashRecoveryCode(code: string) {
  return bcrypt.hash(normalizeRecoveryCode(code), 12);
}

export async function verifyRecoveryCodeHash(code: string, codeHash: string) {
  return bcrypt.compare(normalizeRecoveryCode(code), codeHash);
}

export async function generateRecoveryCodesWithHashes(count = MFA_RULES.recoveryCodeCount) {
  const recoveryCodes = generateRecoveryCodes(count);
  const codeHashes = await Promise.all(recoveryCodes.map((code) => hashRecoveryCode(code)));

  return {
    recoveryCodes,
    codeHashes,
  };
}

export async function consumeRecoveryCodeForAdminUser(input: {
  adminUserId: string;
  recoveryCode: string;
}) {
  const recoveryCodes = await prisma.mfaRecoveryCode.findMany({
    where: {
      adminUserId: input.adminUserId,
      usedAt: null,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  for (const recoveryCode of recoveryCodes) {
    const matches = await verifyRecoveryCodeHash(input.recoveryCode, recoveryCode.codeHash);
    if (!matches) {
      continue;
    }

    const updatedRecoveryCode = await prisma.mfaRecoveryCode.update({
      where: {
        id: recoveryCode.id,
      },
      data: {
        usedAt: new Date(),
      },
    });

    return updatedRecoveryCode;
  }

  return null;
}

export const MFA_RULES = {
  digits: MFA_DIGITS,
  stepSeconds: MFA_STEP_SECONDS,
  recoveryCodeCount: 10,
  pendingSessionMinutes: 10,
  loginRateLimitWindowMinutes: 15,
  loginRateLimitAttempts: 5,
  mfaRateLimitAttempts: 8,
} as const;

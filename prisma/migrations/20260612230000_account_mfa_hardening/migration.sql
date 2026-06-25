ALTER TABLE `AdminUser`
  ADD COLUMN `mfaEnabled` BOOLEAN NOT NULL DEFAULT false AFTER `displayName`,
  ADD COLUMN `mfaSecretEncrypted` LONGTEXT NULL AFTER `mfaEnabled`,
  ADD COLUMN `mfaVerifiedAt` DATETIME(3) NULL AFTER `mfaSecretEncrypted`,
  ADD COLUMN `mfaLastUsedAt` DATETIME(3) NULL AFTER `mfaVerifiedAt`;

CREATE TABLE `PendingMfaSession` (
  `id` VARCHAR(191) NOT NULL,
  `tokenHash` VARCHAR(191) NOT NULL,
  `adminUserId` VARCHAR(191) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `ipAddress` VARCHAR(191) NULL,
  `userAgent` VARCHAR(191) NULL,
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `PendingMfaSession_tokenHash_key`(`tokenHash`),
  INDEX `PendingMfaSession_adminUserId_idx`(`adminUserId`),
  INDEX `PendingMfaSession_expiresAt_idx`(`expiresAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `MfaRecoveryCode` (
  `id` VARCHAR(191) NOT NULL,
  `adminUserId` VARCHAR(191) NOT NULL,
  `codeHash` VARCHAR(191) NOT NULL,
  `usedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `MfaRecoveryCode_adminUserId_usedAt_idx`(`adminUserId`, `usedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `PendingMfaSession`
  ADD CONSTRAINT `PendingMfaSession_adminUserId_fkey`
  FOREIGN KEY (`adminUserId`) REFERENCES `AdminUser`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `MfaRecoveryCode`
  ADD CONSTRAINT `MfaRecoveryCode_adminUserId_fkey`
  FOREIGN KEY (`adminUserId`) REFERENCES `AdminUser`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

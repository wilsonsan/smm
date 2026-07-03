CREATE TABLE `RateLimitHit` (
  `id` VARCHAR(191) NOT NULL,
  `bucketKey` VARCHAR(191) NOT NULL,
  `scope` VARCHAR(64) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `expiresAt` DATETIME(3) NOT NULL,

  INDEX `RateLimitHit_bucketKey_createdAt_idx`(`bucketKey`, `createdAt`),
  INDEX `RateLimitHit_expiresAt_idx`(`expiresAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RateLimitLease` (
  `id` VARCHAR(191) NOT NULL,
  `bucketKey` VARCHAR(191) NOT NULL,
  `ownerKey` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `expiresAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `RateLimitLease_ownerKey_key`(`ownerKey`),
  INDEX `RateLimitLease_bucketKey_expiresAt_idx`(`bucketKey`, `expiresAt`),
  INDEX `RateLimitLease_expiresAt_idx`(`expiresAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

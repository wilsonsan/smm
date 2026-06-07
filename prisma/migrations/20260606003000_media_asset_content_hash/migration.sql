ALTER TABLE `MediaAsset`
  ADD COLUMN `contentHash` VARCHAR(64) NULL;

CREATE INDEX `MediaAsset_contentHash_idx` ON `MediaAsset`(`contentHash`);

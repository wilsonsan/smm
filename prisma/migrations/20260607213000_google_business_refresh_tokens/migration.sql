ALTER TABLE `ConnectedAccount`
  ADD COLUMN `refreshTokenEncrypted` LONGTEXT NULL AFTER `accessTokenEncrypted`;

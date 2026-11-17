-- On-chain settlement for consumption charges.
-- The customer pays from their Pollar wallet; Tonkis are credited only after
-- the transfer is verified on Stellar (pay_status = 'confirmed').
ALTER TABLE `Charge`
  ADD COLUMN `pay_asset_code` VARCHAR(12) NULL,
  ADD COLUMN `pay_asset_issuer` VARCHAR(56) NULL,
  ADD COLUMN `pay_amount` DECIMAL(20, 7) NULL,
  ADD COLUMN `pay_rate_mxn` DECIMAL(20, 8) NULL,
  ADD COLUMN `pay_destination` VARCHAR(56) NULL,
  ADD COLUMN `pay_memo` VARCHAR(28) NULL,
  ADD COLUMN `pay_network` VARCHAR(10) NULL,
  ADD COLUMN `pay_payer_user_id` CHAR(36) NULL,
  ADD COLUMN `pay_status` VARCHAR(20) NULL,
  ADD COLUMN `pay_tx_hash` VARCHAR(64) NULL,
  ADD COLUMN `pay_confirmed_at` DATETIME(3) NULL;

CREATE UNIQUE INDEX `Charge_pay_memo_key` ON `Charge`(`pay_memo`);
CREATE UNIQUE INDEX `Charge_pay_tx_hash_key` ON `Charge`(`pay_tx_hash`);

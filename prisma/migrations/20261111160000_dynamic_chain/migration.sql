-- Dinámicas on-chain (Soroban): un contrato por dinámica, firmado por el servidor.
-- Las filas existentes quedan como `legacy`; el script de migración las promueve.
ALTER TABLE `PostDynamic`
  ADD COLUMN `contract_id` VARCHAR(56) NULL,
  ADD COLUMN `deploy_tx_hash` VARCHAR(64) NULL,
  ADD COLUMN `chain_status` VARCHAR(12) NOT NULL DEFAULT 'legacy',
  ADD COLUMN `last_synced_ledger` INTEGER NULL,
  ADD COLUMN `config_hash` CHAR(64) NULL;

CREATE UNIQUE INDEX `PostDynamic_contract_id_key` ON `PostDynamic`(`contract_id`);
CREATE INDEX `PostDynamic_chain_status_status_idx` ON `PostDynamic`(`chain_status`, `status`);

ALTER TABLE `PostDynamicParticipation`
  ADD COLUMN `tx_hash` VARCHAR(64) NULL;

-- CreateTable
CREATE TABLE `DynamicChainJob` (
    `job_id` CHAR(36) NOT NULL,
    `dynamic_id` CHAR(36) NOT NULL,
    `contract_id` VARCHAR(56) NULL,
    `type` VARCHAR(20) NOT NULL,
    `dedupe_key` VARCHAR(80) NOT NULL,
    `payload` JSON NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'pending',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `next_attempt_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `locked_at` DATETIME(3) NULL,
    `last_error` VARCHAR(500) NULL,
    `tx_hash` VARCHAR(64) NULL,
    `fee_stroops` BIGINT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `DynamicChainJob_status_next_attempt_at_idx`(`status`, `next_attempt_at`),
    INDEX `DynamicChainJob_dynamic_id_idx`(`dynamic_id`),
    UNIQUE INDEX `DynamicChainJob_dynamic_id_type_dedupe_key_key`(`dynamic_id`, `type`, `dedupe_key`),
    PRIMARY KEY (`job_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

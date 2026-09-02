-- Tonkis are DB-only loyalty points; TONKI on-chain asset removed. USDC is the default payout.
UPDATE `AirdropConfig` SET `asset` = 'USDC' WHERE `asset` = 'TONKI';

ALTER TABLE `AirdropConfig`
MODIFY COLUMN `asset` VARCHAR(10) NOT NULL DEFAULT 'USDC';

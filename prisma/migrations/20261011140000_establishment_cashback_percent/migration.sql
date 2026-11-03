-- Percentage of a declared consumption credited as Tonkis (1–100).
ALTER TABLE `Establishment`
ADD COLUMN `cashback_percent` INTEGER NOT NULL DEFAULT 5;

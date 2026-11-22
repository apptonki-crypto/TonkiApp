-- Canje de premios. pending aparta Tonkis; delivered ya se entregó; cancelled los devuelve.

CREATE TABLE `PrizeRedemption` (
    `redemption_id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `establishment_id` CHAR(36) NOT NULL,
    `establishment_reward_id` CHAR(36) NULL,
    `title` VARCHAR(150) NOT NULL,
    `points` INTEGER NOT NULL,
    `code` VARCHAR(8) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `delivered_at` DATETIME(3) NULL,
    `cancelled_at` DATETIME(3) NULL,

    UNIQUE INDEX `PrizeRedemption_code_key`(`code`),
    INDEX `PrizeRedemption_user_id_status_idx`(`user_id`, `status`),
    INDEX `PrizeRedemption_establishment_id_status_created_at_idx`(`establishment_id`, `status`, `created_at` DESC),
    PRIMARY KEY (`redemption_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `PrizeRedemption` ADD CONSTRAINT `PrizeRedemption_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `User`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `PrizeRedemption` ADD CONSTRAINT `PrizeRedemption_establishment_id_fkey` FOREIGN KEY (`establishment_id`) REFERENCES `Establishment`(`establishment_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `PrizeRedemption` ADD CONSTRAINT `PrizeRedemption_establishment_reward_id_fkey` FOREIGN KEY (`establishment_reward_id`) REFERENCES `Establishment_Reward`(`establishment_reward_id`) ON DELETE SET NULL ON UPDATE CASCADE;

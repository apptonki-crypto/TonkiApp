-- QR de presentación del negocio y visitas registradas al escanearlo.

-- AlterTable
ALTER TABLE `Establishment` ADD COLUMN `presentation_token` VARCHAR(64) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Establishment_presentation_token_key` ON `Establishment`(`presentation_token`);

-- CreateTable
CREATE TABLE `EstablishmentCheckIn` (
    `checkin_id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `establishment_id` CHAR(36) NOT NULL,
    `day` CHAR(10) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `EstablishmentCheckIn_user_id_establishment_id_day_key`(`user_id`, `establishment_id`, `day`),
    INDEX `EstablishmentCheckIn_user_id_created_at_idx`(`user_id`, `created_at` DESC),
    INDEX `EstablishmentCheckIn_establishment_id_created_at_idx`(`establishment_id`, `created_at` DESC),
    PRIMARY KEY (`checkin_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `EstablishmentCheckIn` ADD CONSTRAINT `EstablishmentCheckIn_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `User`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EstablishmentCheckIn` ADD CONSTRAINT `EstablishmentCheckIn_establishment_id_fkey` FOREIGN KEY (`establishment_id`) REFERENCES `Establishment`(`establishment_id`) ON DELETE CASCADE ON UPDATE CASCADE;

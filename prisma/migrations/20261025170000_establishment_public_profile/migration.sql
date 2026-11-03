-- Perfil público: columnas nuevas. phone y hours ya existían en la base.
ALTER TABLE `Establishment`
    ADD COLUMN `description` TEXT NULL,
    ADD COLUMN `website` VARCHAR(255) NULL,
    ADD COLUMN `location_x` DECIMAL(11, 7) NULL,
    ADD COLUMN `location_y` DECIMAL(10, 7) NULL,
    ADD COLUMN `location_z` DECIMAL(8, 2) NULL;

CREATE TABLE `EstablishmentImage` (
    `image_id` CHAR(36) NOT NULL,
    `establishment_id` CHAR(36) NOT NULL,
    `url` VARCHAR(2048) NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `EstablishmentImage_establishment_id_sort_order_idx`(`establishment_id`, `sort_order`),
    PRIMARY KEY (`image_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `EstablishmentImage`
    ADD CONSTRAINT `EstablishmentImage_establishment_id_fkey`
    FOREIGN KEY (`establishment_id`) REFERENCES `Establishment`(`establishment_id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Dinámicas de publicación y participaciones (Voy, código, QR y consumo)
-- CreateTable
CREATE TABLE `PostDynamic` (
    `dynamic_id` CHAR(36) NOT NULL,
    `post_id` CHAR(36) NOT NULL,
    `establishment_id` CHAR(36) NULL,
    `kind` VARCHAR(20) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'active',
    `config` JSON NOT NULL,
    `progress_count` INTEGER NOT NULL DEFAULT 0,
    `progress_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `goal_count` INTEGER NULL,
    `starts_at` DATETIME(3) NULL,
    `ends_at` DATETIME(3) NULL,
    `closed_at` DATETIME(3) NULL,
    `token` VARCHAR(64) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PostDynamic_token_key`(`token`),
    INDEX `PostDynamic_post_id_idx`(`post_id`),
    INDEX `PostDynamic_establishment_id_kind_status_idx`(`establishment_id`, `kind`, `status`),
    PRIMARY KEY (`dynamic_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PostDynamicParticipation` (
    `participation_id` CHAR(36) NOT NULL,
    `dynamic_id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `source` VARCHAR(20) NOT NULL,
    `charge_id` CHAR(36) NULL,
    `person_key` CHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PostDynamicParticipation_dynamic_id_idx`(`dynamic_id`),
    INDEX `PostDynamicParticipation_user_id_idx`(`user_id`),
    INDEX `PostDynamicParticipation_charge_id_idx`(`charge_id`),
    UNIQUE INDEX `PostDynamicParticipation_dynamic_id_person_key_key`(`dynamic_id`, `person_key`),
    UNIQUE INDEX `PostDynamicParticipation_dynamic_id_charge_id_key`(`dynamic_id`, `charge_id`),
    PRIMARY KEY (`participation_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PostDynamic` ADD CONSTRAINT `PostDynamic_post_id_fkey` FOREIGN KEY (`post_id`) REFERENCES `Post`(`post_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PostDynamic` ADD CONSTRAINT `PostDynamic_establishment_id_fkey` FOREIGN KEY (`establishment_id`) REFERENCES `Establishment`(`establishment_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PostDynamicParticipation` ADD CONSTRAINT `PostDynamicParticipation_dynamic_id_fkey` FOREIGN KEY (`dynamic_id`) REFERENCES `PostDynamic`(`dynamic_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PostDynamicParticipation` ADD CONSTRAINT `PostDynamicParticipation_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `User`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PostDynamicParticipation` ADD CONSTRAINT `PostDynamicParticipation_charge_id_fkey` FOREIGN KEY (`charge_id`) REFERENCES `Charge`(`charge_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

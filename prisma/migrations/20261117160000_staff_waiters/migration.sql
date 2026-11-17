-- Meseros (User.type = "staff"): membresía, invitaciones y quién generó cada cobro.

-- AlterTable
ALTER TABLE `Charge` ADD COLUMN `created_by_staff_id` CHAR(36) NULL;

-- CreateTable
CREATE TABLE `StaffMember` (
    `staff_id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `establishment_id` CHAR(36) NOT NULL,
    `admin_id` CHAR(36) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revoked_at` DATETIME(3) NULL,

    UNIQUE INDEX `StaffMember_user_id_key`(`user_id`),
    INDEX `StaffMember_admin_id_status_idx`(`admin_id`, `status`),
    PRIMARY KEY (`staff_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StaffInvite` (
    `invite_id` CHAR(36) NOT NULL,
    `admin_id` CHAR(36) NOT NULL,
    `establishment_id` CHAR(36) NOT NULL,
    `token_hash` CHAR(64) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `used_at` DATETIME(3) NULL,
    `used_by_user_id` CHAR(36) NULL,
    `revoked_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `StaffInvite_token_hash_key`(`token_hash`),
    INDEX `StaffInvite_admin_id_created_at_idx`(`admin_id`, `created_at` DESC),
    PRIMARY KEY (`invite_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Charge_created_by_staff_id_created_at_idx` ON `Charge`(`created_by_staff_id`, `created_at` DESC);

-- AddForeignKey
ALTER TABLE `Charge` ADD CONSTRAINT `Charge_created_by_staff_id_fkey` FOREIGN KEY (`created_by_staff_id`) REFERENCES `User`(`user_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StaffMember` ADD CONSTRAINT `StaffMember_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `User`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StaffMember` ADD CONSTRAINT `StaffMember_admin_id_fkey` FOREIGN KEY (`admin_id`) REFERENCES `User`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StaffMember` ADD CONSTRAINT `StaffMember_establishment_id_fkey` FOREIGN KEY (`establishment_id`) REFERENCES `Establishment`(`establishment_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StaffInvite` ADD CONSTRAINT `StaffInvite_admin_id_fkey` FOREIGN KEY (`admin_id`) REFERENCES `User`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StaffInvite` ADD CONSTRAINT `StaffInvite_establishment_id_fkey` FOREIGN KEY (`establishment_id`) REFERENCES `Establishment`(`establishment_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

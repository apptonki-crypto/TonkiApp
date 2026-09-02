-- CreateTable
CREATE TABLE `WaiterBillQr` (
    `bill_qr_id` CHAR(36) NOT NULL,
    `total_amount` DOUBLE NOT NULL,
    `created_by_user_id` CHAR(36) NOT NULL,
    `scanned_by_user_id` CHAR(36) NULL,
    `scanned_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `WaiterBillQr_created_by_user_id_idx`(`created_by_user_id`),
    INDEX `WaiterBillQr_scanned_by_user_id_idx`(`scanned_by_user_id`),
    PRIMARY KEY (`bill_qr_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `WaiterBillQr` ADD CONSTRAINT `WaiterBillQr_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `User`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WaiterBillQr` ADD CONSTRAINT `WaiterBillQr_scanned_by_user_id_fkey` FOREIGN KEY (`scanned_by_user_id`) REFERENCES `User`(`user_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- CRM: catálogo de productos y líneas de venta ligadas a cargos de consumo
CREATE TABLE `Product` (
    `product_id` CHAR(36) NOT NULL,
    `establishment_id` CHAR(36) NOT NULL,
    `admin_id` CHAR(36) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `sku` VARCHAR(64) NULL,
    `description` VARCHAR(500) NULL,
    `unit_price` DECIMAL(12, 2) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `Product_establishment_id_is_active_created_at_idx`(`establishment_id`, `is_active`, `created_at` DESC),
    INDEX `Product_admin_id_idx`(`admin_id`),
    PRIMARY KEY (`product_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ChargeLineItem` (
    `line_item_id` CHAR(36) NOT NULL,
    `charge_id` CHAR(36) NOT NULL,
    `product_id` CHAR(36) NULL,
    `product_name` VARCHAR(150) NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `unit_price` DECIMAL(12, 2) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ChargeLineItem_charge_id_idx`(`charge_id`),
    INDEX `ChargeLineItem_product_id_idx`(`product_id`),
    PRIMARY KEY (`line_item_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `Charge_establishment_id_status_updated_at_idx` ON `Charge`(`establishment_id`, `status`, `updated_at` DESC);

ALTER TABLE `Product` ADD CONSTRAINT `Product_establishment_id_fkey` FOREIGN KEY (`establishment_id`) REFERENCES `Establishment`(`establishment_id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Product` ADD CONSTRAINT `Product_admin_id_fkey` FOREIGN KEY (`admin_id`) REFERENCES `User`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `ChargeLineItem` ADD CONSTRAINT `ChargeLineItem_charge_id_fkey` FOREIGN KEY (`charge_id`) REFERENCES `Charge`(`charge_id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ChargeLineItem` ADD CONSTRAINT `ChargeLineItem_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `Product`(`product_id`) ON DELETE SET NULL ON UPDATE CASCADE;

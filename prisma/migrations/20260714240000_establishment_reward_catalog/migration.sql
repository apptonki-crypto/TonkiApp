-- Catalog of redeemable rewards offered by an establishment.
CREATE TABLE `Establishment_Reward` (
  `establishment_reward_id` CHAR(36) NOT NULL,
  `establishment_id` CHAR(36) NOT NULL,
  `admin_id` CHAR(36) NOT NULL,
  `title` VARCHAR(150) NOT NULL,
  `short_description` VARCHAR(255) NOT NULL,
  `long_description` TEXT NULL,
  `value_tonkis` INT NOT NULL DEFAULT 0,
  `value_usd` DOUBLE NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`establishment_reward_id`),
  INDEX `Establishment_Reward_establishment_id_idx` (`establishment_id`),
  INDEX `Establishment_Reward_admin_id_idx` (`admin_id`),
  CONSTRAINT `Establishment_Reward_establishment_id_fkey`
    FOREIGN KEY (`establishment_id`) REFERENCES `Establishment`(`establishment_id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `Establishment_Reward_admin_id_fkey`
    FOREIGN KEY (`admin_id`) REFERENCES `User`(`user_id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

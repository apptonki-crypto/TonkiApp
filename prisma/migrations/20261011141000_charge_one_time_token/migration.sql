-- One-time consumption QR. The declared amount is a reference only;
-- claiming credits Tonkis and does not collect money.
CREATE TABLE `Charge` (
  `charge_id` CHAR(36) NOT NULL,
  `establishment_id` CHAR(36) NOT NULL,
  `admin_id` CHAR(36) NOT NULL,
  `amount` DECIMAL(12, 2) NOT NULL,
  `cashback_percent` INTEGER NOT NULL,
  `token` VARCHAR(64) NOT NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
  `claimed_by_user_id` CHAR(36) NULL,
  `reward_id` CHAR(36) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  PRIMARY KEY (`charge_id`),
  UNIQUE INDEX `Charge_token_key` (`token`),
  UNIQUE INDEX `Charge_reward_id_key` (`reward_id`),
  INDEX `Charge_admin_id_created_at_idx` (`admin_id`, `created_at` DESC),
  INDEX `Charge_establishment_id_idx` (`establishment_id`),
  INDEX `Charge_claimed_by_user_id_updated_at_idx` (`claimed_by_user_id`, `updated_at` DESC),
  CONSTRAINT `Charge_establishment_id_fkey`
    FOREIGN KEY (`establishment_id`) REFERENCES `Establishment`(`establishment_id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `Charge_admin_id_fkey`
    FOREIGN KEY (`admin_id`) REFERENCES `User`(`user_id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `Charge_claimed_by_user_id_fkey`
    FOREIGN KEY (`claimed_by_user_id`) REFERENCES `User`(`user_id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `Charge_reward_id_fkey`
    FOREIGN KEY (`reward_id`) REFERENCES `Reward`(`reward_id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
);

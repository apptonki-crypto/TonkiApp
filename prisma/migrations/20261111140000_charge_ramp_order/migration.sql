-- Pollar ramp order that funds the payer's own wallet before they pay the charge.
-- Only the order id and its state are stored; bank or payment instructions never are.
ALTER TABLE `Charge`
  ADD COLUMN `ramp_order_id` VARCHAR(64) NULL,
  ADD COLUMN `ramp_order_state` VARCHAR(20) NULL;

CREATE UNIQUE INDEX `Charge_ramp_order_id_key` ON `Charge`(`ramp_order_id`);

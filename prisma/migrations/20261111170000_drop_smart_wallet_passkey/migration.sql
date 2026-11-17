-- La wallet de cada cuenta la trae Pollar. Estas tablas solo servían
-- para la smart wallet con passkey, que ya no tiene pantalla ni ruta.
ALTER TABLE `PasskeyCredential` DROP FOREIGN KEY `PasskeyCredential_wallet_id_fkey`;
ALTER TABLE `PasskeyCredential` DROP FOREIGN KEY `PasskeyCredential_user_id_fkey`;
ALTER TABLE `SmartWallet` DROP FOREIGN KEY `SmartWallet_user_id_fkey`;

DROP TABLE `PasskeyCredential`;
DROP TABLE `SmartWallet`;

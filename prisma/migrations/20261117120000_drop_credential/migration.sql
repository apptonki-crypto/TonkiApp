-- El ingreso es solo con Pollar. La tabla de usuario y contraseña
-- ya no tiene pantalla ni ruta; solo la llenaba el seed.
ALTER TABLE `Credential` DROP FOREIGN KEY `Credential_user_id_fkey`;

DROP TABLE `Credential`;

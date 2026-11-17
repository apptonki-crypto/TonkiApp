-- Marca de que la empresa ya llenó su perfil público obligatorio (una sola vez).
ALTER TABLE `User`
  ADD COLUMN `business_profile_completed_at` DATETIME(3) NULL;

-- Las empresas que ya tienen la ficha pública completa no vuelven a pasar por el alta.
UPDATE `User` u
SET u.`business_profile_completed_at` = CURRENT_TIMESTAMP(3)
WHERE u.`type` = 'admin'
  AND EXISTS (
    SELECT 1
    FROM `Establishment` e
    WHERE e.`admin_id` = u.`user_id`
      AND TRIM(e.`name`) <> ''
      AND TRIM(COALESCE(e.`category`, '')) <> ''
      AND TRIM(COALESCE(e.`description`, '')) <> ''
      AND TRIM(COALESCE(e.`address`, '')) <> ''
      AND TRIM(COALESCE(e.`phone`, '')) <> ''
      AND (
        e.`hours` LIKE '%"closed":false%'
        OR (e.`hours` IS NOT NULL AND e.`hours` NOT LIKE '{%' AND TRIM(e.`hours`) <> '')
      )
  );

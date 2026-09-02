-- Phone and weekly hours for business establishments.
ALTER TABLE `Establishment`
ADD COLUMN `phone` VARCHAR(30) NOT NULL DEFAULT '',
ADD COLUMN `hours` JSON NOT NULL DEFAULT ('{"mon":{"closed":true},"tue":{"closed":true},"wed":{"closed":true},"thu":{"closed":true},"fri":{"closed":true},"sat":{"closed":true},"sun":{"closed":true}}');

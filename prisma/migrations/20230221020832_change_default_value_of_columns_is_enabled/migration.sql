-- AlterTable
ALTER TABLE `customer` MODIFY `is_enabled` BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE `room` MODIFY `is_enabled` BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE `service` MODIFY `is_enabled` BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE `staff` MODIFY `is_enabled` BOOLEAN NOT NULL DEFAULT true;

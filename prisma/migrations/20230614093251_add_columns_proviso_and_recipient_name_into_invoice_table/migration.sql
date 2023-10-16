-- AlterTable
ALTER TABLE `invoice`
ADD COLUMN `proviso` TINYINT NOT NULL DEFAULT 0,
ADD COLUMN `recipient_name` VARCHAR(255) NULL;

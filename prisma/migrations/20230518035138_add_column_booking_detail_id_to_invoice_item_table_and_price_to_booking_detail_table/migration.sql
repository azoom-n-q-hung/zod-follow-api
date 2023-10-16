-- DropForeignKey
ALTER TABLE `invoice_item` DROP FOREIGN KEY `invoice_item_invoice_id_fkey`;

-- AlterTable
ALTER TABLE `booking_detail` DROP COLUMN `total_price`,
    DROP COLUMN `total_price_without_tax`,
    DROP COLUMN `total_tax`,
    ADD COLUMN `all_day_amount` DECIMAL(12, 0) NULL,
    ADD COLUMN `basic_amount` DECIMAL(12, 0) NULL,
    ADD COLUMN `discount_amount` DECIMAL(12, 0) NULL,
    ADD COLUMN `discount_rate` SMALLINT NULL,
    ADD COLUMN `extension_amount` DECIMAL(12, 0) NULL,
    ADD COLUMN `subtotal_type` INTEGER NULL,
    ADD COLUMN `tax_rate` SMALLINT NULL;

-- AlterTable
ALTER TABLE `invoice_item` ADD COLUMN `booking_detail_id` INTEGER NULL,
    MODIFY `invoice_id` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `invoice_item` ADD CONSTRAINT `invoice_item_booking_detail_id_fkey` FOREIGN KEY (`booking_detail_id`) REFERENCES `booking_detail`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoice_item` ADD CONSTRAINT `invoice_item_invoice_id_fkey` FOREIGN KEY (`invoice_id`) REFERENCES `invoice`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

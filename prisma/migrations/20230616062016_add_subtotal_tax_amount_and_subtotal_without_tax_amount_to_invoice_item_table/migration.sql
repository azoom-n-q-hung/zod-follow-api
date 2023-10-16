-- AlterTable
ALTER TABLE `invoice_item` ADD COLUMN `subtotal_tax_amount` DECIMAL(12, 0) NOT NULL DEFAULT 0,
    ADD COLUMN `subtotal_without_tax_amount` DECIMAL(12, 0) NOT NULL DEFAULT 0;

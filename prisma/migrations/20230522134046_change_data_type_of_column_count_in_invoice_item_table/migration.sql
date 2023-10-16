/*
  Warnings:

  - You are about to alter the column `count` on the `invoice_item` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Decimal(12,1)`.

*/
-- AlterTable
ALTER TABLE `invoice_item` MODIFY `count` DECIMAL(12, 1) NOT NULL;

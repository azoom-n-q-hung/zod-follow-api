/*
  Warnings:

  - Added the required column `service_id` to the `invoice_item` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `invoice_item` ADD COLUMN `service_id` INTEGER NOT NULL;

/*
  Warnings:

  - You are about to drop the column `staff_id` on the `booking` table. All the data in the column will be lost.
  - Added the required column `created_staff_id` to the `booking` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_staff_id` to the `booking` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `booking` DROP FOREIGN KEY `booking_staff_id_fkey`;

-- AlterTable
ALTER TABLE `booking` DROP COLUMN `staff_id`,
    ADD COLUMN `created_staff_id` INTEGER NOT NULL,
    ADD COLUMN `updated_staff_id` INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE `booking` ADD CONSTRAINT `booking_created_staff_id_fkey` FOREIGN KEY (`created_staff_id`) REFERENCES `staff`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking` ADD CONSTRAINT `booking_updated_staff_id_fkey` FOREIGN KEY (`updated_staff_id`) REFERENCES `staff`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

/*
  Warnings:

  - Made the column `cancel_type` on table `booking_detail` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE `booking_detail` MODIFY `cancel_type` TINYINT NOT NULL;

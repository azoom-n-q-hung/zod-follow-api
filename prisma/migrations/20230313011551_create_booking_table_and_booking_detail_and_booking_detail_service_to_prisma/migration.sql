-- DropForeignKey
ALTER TABLE `room_booking` DROP FOREIGN KEY `room_booking_booking_id_fkey`;

-- DropForeignKey
ALTER TABLE `room_booking` DROP FOREIGN KEY `room_booking_room_id_fkey`;

-- AlterTable
ALTER TABLE `booking` DROP COLUMN `contact_name`,
    DROP COLUMN `contact_type`,
    DROP COLUMN `deposit`,
    DROP COLUMN `deposit_type`,
    DROP COLUMN `status`,
    DROP COLUMN `tentative_limit`,
    DROP COLUMN `title`,
    ADD COLUMN `customer_fax` VARCHAR(20) NULL,
    ADD COLUMN `customer_mail` VARCHAR(255) NULL,
    ADD COLUMN `customer_name` VARCHAR(255) NULL,
    ADD COLUMN `customer_rep_name` VARCHAR(255) NULL,
    ADD COLUMN `customer_tel` VARCHAR(20) NULL;

-- AlterTable
ALTER TABLE `service` DROP COLUMN `end_date`,
    DROP COLUMN `stock`,
    ADD COLUMN `stock_count` INTEGER NULL;

-- DropTable
DROP TABLE `room_booking`;

-- CreateTable
CREATE TABLE `booking_detail` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `booking_id` INTEGER NOT NULL,
    `room_id` INTEGER NOT NULL,
    `title` VARCHAR(255) NULL,
    `start_datetime` DATETIME(3) NOT NULL,
    `end_datetime` DATETIME(3) NOT NULL,
    `status` TINYINT NOT NULL DEFAULT 1,
    `cancel_type` TINYINT NOT NULL DEFAULT 1,
    `is_cocktail_style` BOOLEAN NOT NULL DEFAULT false,
    `scheduled_reply_date` DATE NULL,
    `layout_type` TINYINT NULL,
    `guest_count` SMALLINT NULL,
    `extra_table_count` SMALLINT NULL,
    `extra_chair_count` SMALLINT NULL,
    `layout_location` VARCHAR(255) NULL,
    `note` TEXT NULL,
    `memo` TEXT NULL,
    `total_price` DECIMAL(12, 0) NULL,
    `total_price_without_tax` DECIMAL(12, 0) NULL,
    `total_tax` DECIMAL(12, 0) NULL,
    `cancel_price` DECIMAL(12, 0) NULL,
    `cancel_datetime` DATETIME(3) NULL,
    `cancel_requester_name` VARCHAR(255) NULL,
    `cancel_note` VARCHAR(255) NULL,
    `cancel_staff_id` INTEGER NULL,
    `created_datetime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_datetime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `booking_detail_service` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `booking_detail_id` INTEGER NOT NULL,
    `service_id` INTEGER NOT NULL,
    `price` DECIMAL(12, 0) NOT NULL,
    `usage_count` SMALLINT NOT NULL,
    `created_datetime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_datetime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `booking_detail` ADD CONSTRAINT `booking_detail_cancel_staff_id_fkey` FOREIGN KEY (`cancel_staff_id`) REFERENCES `staff`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_detail` ADD CONSTRAINT `booking_detail_room_id_fkey` FOREIGN KEY (`room_id`) REFERENCES `room`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_detail` ADD CONSTRAINT `booking_detail_booking_id_fkey` FOREIGN KEY (`booking_id`) REFERENCES `booking`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_detail_service` ADD CONSTRAINT `booking_detail_service_booking_detail_id_fkey` FOREIGN KEY (`booking_detail_id`) REFERENCES `booking_detail`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_detail_service` ADD CONSTRAINT `booking_detail_service_service_id_fkey` FOREIGN KEY (`service_id`) REFERENCES `service`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

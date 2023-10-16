-- CreateTable
CREATE TABLE `staff` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `is_enabled` BOOLEAN NOT NULL DEFAULT false,
    `name` VARCHAR(255) NOT NULL,
    `name_kana` VARCHAR(255) NOT NULL,
    `created_datetime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_datetime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `room` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `is_enabled` BOOLEAN NOT NULL DEFAULT false,
    `name` VARCHAR(255) NOT NULL,
    `display_name` VARCHAR(255) NOT NULL,
    `s_form_capacity` SMALLINT NOT NULL,
    `mouth_form_capacity` SMALLINT NOT NULL,
    `theater_form_capacity` SMALLINT NOT NULL,
    `interview_form_capacity` SMALLINT NOT NULL,
    `party_form_capacity` SMALLINT NOT NULL,
    `other_form_capacity` SMALLINT NOT NULL,
    `created_datetime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_datetime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `room_charge` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `room_id` INTEGER NOT NULL,
    `basic_price` DECIMAL(12, 0) NOT NULL,
    `extension_price` DECIMAL(12, 0) NOT NULL,
    `all_day_price` DECIMAL(12, 0) NOT NULL,
    `subtotal_type` TINYINT NOT NULL DEFAULT 2,
    `start_date` DATE NOT NULL,
    `end_date` DATE NULL,
    `created_datetime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_datetime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customer` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `is_enabled` BOOLEAN NOT NULL DEFAULT false,
    `name` VARCHAR(255) NOT NULL,
    `name_kana` VARCHAR(255) NOT NULL,
    `postal_code` VARCHAR(20) NOT NULL,
    `address` VARCHAR(255) NOT NULL,
    `sub_address` VARCHAR(255) NULL,
    `tel` VARCHAR(20) NOT NULL,
    `fax` VARCHAR(20) NOT NULL,
    `contact_name_1` VARCHAR(255) NULL,
    `contact_tel_1` VARCHAR(20) NULL,
    `contact_mail_1` VARCHAR(255) NULL,
    `contact_name_2` VARCHAR(255) NULL,
    `contact_tel_2` VARCHAR(20) NULL,
    `contact_mail_2` VARCHAR(255) NULL,
    `contact_name_3` VARCHAR(255) NULL,
    `contact_tel_3` VARCHAR(20) NULL,
    `contact_mail_3` VARCHAR(255) NULL,
    `memo_1` TEXT NULL,
    `memo_2` TEXT NULL,
    `created_datetime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_datetime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `booking` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `staff_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `status` TINYINT NOT NULL DEFAULT 1,
    `title` VARCHAR(255) NULL,
    `tentative_limit` DATE NULL,
    `deposit` INTEGER NULL,
    `deposit_type` TINYINT NULL,
    `contact_name` VARCHAR(255) NOT NULL,
    `contact_type` TINYINT NOT NULL DEFAULT 1,
    `created_datetime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_datetime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `room_booking` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `room_booking_number` INTEGER NOT NULL,
    `booking_id` INTEGER NOT NULL,
    `room_id` INTEGER NOT NULL,
    `invoice_id` INTEGER NULL,
    `status` TINYINT NOT NULL DEFAULT 0,
    `room_layout` TINYINT NOT NULL,
    `start_time` DATETIME(3) NOT NULL,
    `end_time` DATETIME(3) NOT NULL,
    `checkin_time` DATETIME(3) NULL,
    `is_all_day` BOOLEAN NOT NULL DEFAULT false,
    `number_people` TINYINT NULL,
    `additional_table_number` SMALLINT NULL,
    `additional_chair_number` SMALLINT NULL,
    `cancel_date` DATETIME(3) NULL,
    `cancel_person` VARCHAR(255) NULL,
    `has_stand_party` BOOLEAN NOT NULL DEFAULT false,
    `total_price` DECIMAL(12, 0) NOT NULL,
    `total_price_without_tax` DECIMAL(12, 0) NOT NULL,
    `total_tax` DECIMAL(12, 0) NOT NULL,
    `cancel_price` DECIMAL(12, 0) NULL,
    `change_price` DECIMAL(12, 0) NULL,
    `old_room_id` INTEGER NULL,
    `confirmation_letter_note_id` INTEGER NULL,
    `purpose` TINYINT NULL,
    `memo` TEXT NULL,
    `created_datetime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_datetime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `service` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `is_enabled` BOOLEAN NOT NULL DEFAULT false,
    `name` VARCHAR(255) NOT NULL,
    `type` TINYINT NOT NULL,
    `unit_price` DECIMAL(12, 0) NOT NULL,
    `subtotal_type` TINYINT NOT NULL DEFAULT 2,
    `start_date` DATE NOT NULL,
    `end_date` DATE NULL,
    `location_type` INTEGER NOT NULL DEFAULT 1,
    `has_stock_management` BOOLEAN NULL,
    `stock` INTEGER NULL,
    `created_datetime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_datetime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `room_charge` ADD CONSTRAINT `room_charge_room_id_fkey` FOREIGN KEY (`room_id`) REFERENCES `room`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking` ADD CONSTRAINT `booking_staff_id_fkey` FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking` ADD CONSTRAINT `booking_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `room_booking` ADD CONSTRAINT `room_booking_room_id_fkey` FOREIGN KEY (`room_id`) REFERENCES `room`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `room_booking` ADD CONSTRAINT `room_booking_booking_id_fkey` FOREIGN KEY (`booking_id`) REFERENCES `booking`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

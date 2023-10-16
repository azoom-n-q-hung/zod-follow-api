-- CreateTable
CREATE TABLE `invoice_item` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `invoice_id` INTEGER NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `type` TINYINT NOT NULL,
    `unit_amount` DECIMAL(12, 0) NOT NULL,
    `tax_amount` DECIMAL(12, 0) NOT NULL,
    `count` INTEGER NOT NULL,
    `subtotal_amount` DECIMAL(12, 0) NOT NULL,
    `created_datetime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_datetime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `invoice` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `status` TINYINT NOT NULL,
    `total_amount` DECIMAL(12, 0) NOT NULL,
    `due_date` DATE NULL,
    `created_staff_id` INTEGER NOT NULL,
    `updated_staff_id` INTEGER NULL,
    `created_datetime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_datetime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `invoice_item` ADD CONSTRAINT `invoice_item_invoice_id_fkey` FOREIGN KEY (`invoice_id`) REFERENCES `invoice`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

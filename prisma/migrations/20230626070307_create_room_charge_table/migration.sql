-- CreateTable
CREATE TABLE `service_charge` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `service_id` INTEGER NOT NULL,
    `unit_price` DECIMAL(12, 0) NOT NULL,
    `start_date` DATE NOT NULL,
    `end_date` DATE NULL,
    `created_datetime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_datetime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `service_charge` ADD CONSTRAINT `service_charge_service_id_fkey` FOREIGN KEY (`service_id`) REFERENCES `service`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE `customer` MODIFY `name_kana` VARCHAR(255) NULL,
    MODIFY `postal_code` VARCHAR(20) NULL,
    MODIFY `address` VARCHAR(255) NULL,
    MODIFY `tel` VARCHAR(20) NULL,
    MODIFY `fax` VARCHAR(20) NULL;

-- AlterTable
ALTER TABLE `room` MODIFY `display_name` VARCHAR(255) NULL,
    MODIFY `s_form_capacity` SMALLINT NULL,
    MODIFY `mouth_form_capacity` SMALLINT NULL,
    MODIFY `theater_form_capacity` SMALLINT NULL,
    MODIFY `interview_form_capacity` SMALLINT NULL,
    MODIFY `party_form_capacity` SMALLINT NULL,
    MODIFY `other_form_capacity` SMALLINT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `room_name_key` ON `room`(`name`);

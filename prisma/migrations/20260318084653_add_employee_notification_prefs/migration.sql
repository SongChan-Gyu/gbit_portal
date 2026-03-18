-- AlterTable
ALTER TABLE `Employee` ADD COLUMN `alimtalkEnabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `emailEnabled` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: 기존 행이 있어도 기본값으로 추가
ALTER TABLE `JejuAccommodation`
  ADD COLUMN `guestName` VARCHAR(191) NOT NULL DEFAULT '',
  ADD COLUMN `guestPhone` VARCHAR(191) NOT NULL DEFAULT '',
  ADD COLUMN `guestCount` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `StampCoupon` ADD COLUMN `stampCardId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `StampCard` (
    `id` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `sortOrder` INTEGER NOT NULL,
    `filledCount` INTEGER NOT NULL DEFAULT 0,
    `healingUsed` BOOLEAN NOT NULL DEFAULT false,
    `afternoonUsed` BOOLEAN NOT NULL DEFAULT false,
    `healingLeaveRequestId` VARCHAR(191) NULL,
    `afternoonLeaveRequestId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `StampCard_employeeId_idx`(`employeeId`),
    INDEX `StampCard_healingLeaveRequestId_idx`(`healingLeaveRequestId`),
    INDEX `StampCard_afternoonLeaveRequestId_idx`(`afternoonLeaveRequestId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `StampCoupon_stampCardId_idx` ON `StampCoupon`(`stampCardId`);

-- AddForeignKey
ALTER TABLE `StampCard` ADD CONSTRAINT `StampCard_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StampCoupon` ADD CONSTRAINT `StampCoupon_stampCardId_fkey` FOREIGN KEY (`stampCardId`) REFERENCES `StampCard`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

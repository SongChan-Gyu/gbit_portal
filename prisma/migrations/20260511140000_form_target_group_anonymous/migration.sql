-- 대상 그룹 + 양식 익명/그룹 연결
CREATE TABLE `FormTargetGroup` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `FormTargetGroup_sortOrder_idx`(`sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `FormTargetGroupMember` (
    `id` VARCHAR(191) NOT NULL,
    `groupId` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `FormTargetGroupMember_employeeId_idx`(`employeeId`),
    UNIQUE INDEX `FormTargetGroupMember_groupId_employeeId_key`(`groupId`, `employeeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Form` ADD COLUMN `targetGroupId` VARCHAR(191) NULL;
ALTER TABLE `Form` ADD COLUMN `isAnonymous` BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX `Form_targetGroupId_idx` ON `Form`(`targetGroupId`);

ALTER TABLE `FormTargetGroupMember` ADD CONSTRAINT `FormTargetGroupMember_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `FormTargetGroup`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `FormTargetGroupMember` ADD CONSTRAINT `FormTargetGroupMember_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `Form` ADD CONSTRAINT `Form_targetGroupId_fkey` FOREIGN KEY (`targetGroupId`) REFERENCES `FormTargetGroup`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

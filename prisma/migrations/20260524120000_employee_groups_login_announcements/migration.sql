-- 공지 대상 + 로그인 팝업 + 기능 안내 투어
ALTER TABLE `Notice` ADD COLUMN `audience` VARCHAR(191) NOT NULL DEFAULT 'ALL';
ALTER TABLE `Notice` ADD COLUMN `employeeGroupId` VARCHAR(191) NULL;
CREATE INDEX `Notice_audience_idx` ON `Notice`(`audience`);
CREATE INDEX `Notice_employeeGroupId_idx` ON `Notice`(`employeeGroupId`);
ALTER TABLE `Notice` ADD CONSTRAINT `Notice_employeeGroupId_fkey` FOREIGN KEY (`employeeGroupId`) REFERENCES `FormTargetGroup`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `LoginAnnouncement` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `audience` VARCHAR(191) NOT NULL DEFAULT 'INTERNAL',
    `employeeGroupId` VARCHAR(191) NULL,
    `startsAt` DATETIME(3) NULL,
    `endsAt` DATETIME(3) NULL,
    `priority` INTEGER NOT NULL DEFAULT 0,
    `detailMode` VARCHAR(191) NOT NULL DEFAULT 'NONE',
    `noticeId` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `authorId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `LoginAnnouncement_isActive_priority_idx`(`isActive`, `priority`),
    INDEX `LoginAnnouncement_startsAt_endsAt_idx`(`startsAt`, `endsAt`),
    INDEX `LoginAnnouncement_employeeGroupId_idx`(`employeeGroupId`),
    INDEX `LoginAnnouncement_noticeId_idx`(`noticeId`),
    INDEX `LoginAnnouncement_authorId_idx`(`authorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `LoginAnnouncementDismiss` (
    `id` VARCHAR(191) NOT NULL,
    `announcementId` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `dismissType` VARCHAR(191) NOT NULL,
    `dismissedUntil` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `LoginAnnouncementDismiss_announcementId_employeeId_key`(`announcementId`, `employeeId`),
    INDEX `LoginAnnouncementDismiss_employeeId_idx`(`employeeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `UserFeatureTour` (
    `id` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `tourKey` VARCHAR(191) NOT NULL,
    `completedAt` DATETIME(3) NULL,
    `skippedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `UserFeatureTour_employeeId_tourKey_key`(`employeeId`, `tourKey`),
    INDEX `UserFeatureTour_tourKey_idx`(`tourKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `LoginAnnouncement` ADD CONSTRAINT `LoginAnnouncement_employeeGroupId_fkey` FOREIGN KEY (`employeeGroupId`) REFERENCES `FormTargetGroup`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `LoginAnnouncement` ADD CONSTRAINT `LoginAnnouncement_noticeId_fkey` FOREIGN KEY (`noticeId`) REFERENCES `Notice`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `LoginAnnouncement` ADD CONSTRAINT `LoginAnnouncement_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `LoginAnnouncementDismiss` ADD CONSTRAINT `LoginAnnouncementDismiss_announcementId_fkey` FOREIGN KEY (`announcementId`) REFERENCES `LoginAnnouncement`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `LoginAnnouncementDismiss` ADD CONSTRAINT `LoginAnnouncementDismiss_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `UserFeatureTour` ADD CONSTRAINT `UserFeatureTour_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

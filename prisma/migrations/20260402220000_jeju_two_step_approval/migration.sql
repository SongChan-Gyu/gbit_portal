-- JejuAccommodation 2단계 결재 필드 추가
ALTER TABLE `JejuAccommodation`
  ADD COLUMN `step1ApproverId`        VARCHAR(191) NULL,
  ADD COLUMN `step1ApprovedAt`        DATETIME(3)  NULL,
  ADD COLUMN `rejectStep`             INT          NULL,
  ADD COLUMN `depositStatus`          VARCHAR(191) NOT NULL DEFAULT 'NONE',
  ADD COLUMN `depositConfirmedById`   VARCHAR(191) NULL,
  ADD COLUMN `depositConfirmedAt`     DATETIME(3)  NULL;

-- 기존 APPROVED 데이터: 입금 확인이 완료된 것으로 간주
UPDATE `JejuAccommodation`
SET `depositStatus` = 'CONFIRMED',
    `step1ApproverId` = `approvedById`,
    `step1ApprovedAt` = `approvedAt`,
    `depositConfirmedById` = `approvedById`,
    `depositConfirmedAt` = `approvedAt`
WHERE `status` = 'APPROVED';

-- FK 인덱스
CREATE INDEX `JejuAccommodation_step1ApproverId_idx` ON `JejuAccommodation`(`step1ApproverId`);
CREATE INDEX `JejuAccommodation_depositConfirmedById_idx` ON `JejuAccommodation`(`depositConfirmedById`);

-- FK 제약
ALTER TABLE `JejuAccommodation`
  ADD CONSTRAINT `JejuAccommodation_step1ApproverId_fkey`
    FOREIGN KEY (`step1ApproverId`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `JejuAccommodation_depositConfirmedById_fkey`
    FOREIGN KEY (`depositConfirmedById`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- 휴가 유형: 종일/반차 허용 범위·신청 UI 그룹
ALTER TABLE `LeaveType`
  ADD COLUMN `allowsFullDay` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `allowsHalfDay` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `halfDayAmPm` VARCHAR(191) NOT NULL DEFAULT 'BOTH',
  ADD COLUMN `applyGroupKey` VARCHAR(191) NULL;

-- 신청 항목: 선택한 시간대
ALTER TABLE `LeaveRequestItem` ADD COLUMN `timeSlot` VARCHAR(191) NULL;

-- 기존 플래그에서 usage 필드 유도
UPDATE `LeaveType` SET
  `allowsFullDay` = IF(COALESCE(`isHalf`, 0) = 0, 1, 0),
  `allowsHalfDay` = IF(COALESCE(`isHalf`, 0) = 1, 1, 0),
  `halfDayAmPm` = CASE
    WHEN COALESCE(`isHalf`, 0) = 0 THEN 'BOTH'
    WHEN COALESCE(`isAmOnly`, 0) = 1 THEN 'AM_ONLY'
    WHEN COALESCE(`isPmOnly`, 0) = 1 THEN 'PM_ONLY'
    ELSE 'BOTH'
  END;

UPDATE `LeaveRequestItem` AS i
INNER JOIN `LeaveType` AS t ON i.`leaveTypeId` = t.`id`
SET i.`timeSlot` = CASE
  WHEN COALESCE(t.`isHalf`, 0) = 0 THEN 'FULL'
  WHEN COALESCE(t.`isAmOnly`, 0) = 1 THEN 'AM'
  WHEN COALESCE(t.`isPmOnly`, 0) = 1 THEN 'PM'
  ELSE 'PM'
END
WHERE i.`timeSlot` IS NULL;

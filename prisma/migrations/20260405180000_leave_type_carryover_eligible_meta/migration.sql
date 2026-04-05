-- 수동 이월 UI용 메타 (자동 이월 필드와 별개)
ALTER TABLE `LeaveType` ADD COLUMN `carryoverEligible` BOOLEAN NOT NULL DEFAULT false;

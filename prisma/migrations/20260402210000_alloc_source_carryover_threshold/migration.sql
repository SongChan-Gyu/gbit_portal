-- AlterTable: AllocationSourceConfig에 carryoverThresholdMonths 추가
ALTER TABLE `AllocationSourceConfig`
  ADD COLUMN `carryoverThresholdMonths` INT NULL;

-- TENURE_1Y: 귀속연도 마지막 3개월 이내 부여 시 다음 귀속연도로 이월
UPDATE `AllocationSourceConfig`
  SET `carryoverThresholdMonths` = 3
  WHERE `sourceCode` = 'TENURE_1Y';

-- AlterTable: AllocationSourceConfig에 근속 메타 필드 추가
ALTER TABLE `AllocationSourceConfig`
  ADD COLUMN `tenureYears`       INT     NULL,
  ADD COLUMN `bonusIntervalYears` INT    NULL,
  ADD COLUMN `bonusMaxDays`      DOUBLE  NULL,
  ADD COLUMN `skipForFreelancer` BOOLEAN NOT NULL DEFAULT false;

-- BASE_ANNUAL defaultDays를 15로 설정 (기존 null)
UPDATE `AllocationSourceConfig` SET `defaultDays` = 15 WHERE `sourceCode` = 'BASE_ANNUAL';

-- TENURE_BONUS: 2년마다 +1일, 최대 10일, 프리랜서 제외
UPDATE `AllocationSourceConfig`
  SET `bonusIntervalYears` = 2, `bonusMaxDays` = 10, `skipForFreelancer` = true
  WHERE `sourceCode` = 'TENURE_BONUS';

-- TENURE_1Y: 1주년 3일
UPDATE `AllocationSourceConfig`
  SET `defaultDays` = 3, `tenureYears` = 1
  WHERE `sourceCode` = 'TENURE_1Y';

-- TENURE_5Y: 5주년 5일
UPDATE `AllocationSourceConfig`
  SET `defaultDays` = 5, `tenureYears` = 5
  WHERE `sourceCode` = 'TENURE_5Y';

-- TENURE_10Y: 10주년 10일
UPDATE `AllocationSourceConfig`
  SET `defaultDays` = 10, `tenureYears` = 10
  WHERE `sourceCode` = 'TENURE_10Y';

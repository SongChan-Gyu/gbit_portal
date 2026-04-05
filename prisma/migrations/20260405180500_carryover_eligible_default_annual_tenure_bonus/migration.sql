-- 연차·근속가산 풀: 수동 이월 대상으로 기본값 맞춤 (시드 정책과 동일)
UPDATE `LeaveType` SET `carryoverEligible` = true WHERE `code` IN ('ANNUAL', 'POOL_TENURE_BONUS');

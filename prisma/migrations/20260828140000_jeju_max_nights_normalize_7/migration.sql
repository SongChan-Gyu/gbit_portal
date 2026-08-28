-- 제주 최대 연박: 운영에 남아 있는 구 기본값(10, 14)을 7일로 정규화
UPDATE `SystemConfig`
SET `value` = '7', `updatedAt` = CURRENT_TIMESTAMP(3)
WHERE `key` = 'jejuMaxNights' AND `value` IN ('10', '14', '');

INSERT INTO `SystemConfig` (`key`, `value`, `updatedAt`)
SELECT 'jejuMaxNights', '7', CURRENT_TIMESTAMP(3)
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `SystemConfig` WHERE `key` = 'jejuMaxNights');

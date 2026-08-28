-- 제주 숙소 최대 연박 기본값 7일 (없으면 생성, 기존 14일이면 7일로 변경)
INSERT INTO `SystemConfig` (`key`, `value`, `updatedAt`)
VALUES ('jejuMaxNights', '7', CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE
  `value` = CASE WHEN `value` IN ('14', '') THEN '7' ELSE `value` END,
  `updatedAt` = CASE WHEN `value` IN ('14', '') THEN CURRENT_TIMESTAMP(3) ELSE `updatedAt` END;

-- 유동양식 제출 유효기간 (알림톡 note4)
ALTER TABLE `Form` ADD COLUMN `submitDeadline` DATETIME(3) NULL;

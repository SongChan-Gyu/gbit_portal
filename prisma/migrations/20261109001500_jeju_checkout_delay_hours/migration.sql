-- 제주 숙소: 퇴실 당일 입실이 없을 때 1~3시간 퇴실 지연
ALTER TABLE `JejuAccommodation` ADD COLUMN `checkoutDelayHours` INTEGER NOT NULL DEFAULT 0;

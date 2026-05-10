-- Employee.isSettingsAdmin: 설정 메뉴(휴가설정·양식관리 등) 접근 허용 플래그 (역할 변경 없음)
ALTER TABLE `Employee`
  ADD COLUMN `isSettingsAdmin` BOOLEAN NOT NULL DEFAULT false;

-- 귀속 초기화: 스케줄러형 부여는 기본적으로 '부여일 도래 후'만 보강 (메타로 끌 수 있음)
ALTER TABLE `LeaveType` ADD COLUMN `fiscalInitOnlyAfterGrantDate` BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE `AllocationSourceConfig` ADD COLUMN `fiscalInitOnlyAfterGrantDate` BOOLEAN NOT NULL DEFAULT true;

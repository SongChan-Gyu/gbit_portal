-- LeaveType에 slotPolicy 컬럼 추가 (반차/시간 단위 슬롯 정책 - 확장 예약 필드)
ALTER TABLE `LeaveType` ADD COLUMN `slotPolicy` VARCHAR(191) NOT NULL DEFAULT 'TYPE_DEFAULT';

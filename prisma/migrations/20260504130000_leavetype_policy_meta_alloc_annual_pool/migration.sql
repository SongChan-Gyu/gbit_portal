-- LeaveType 정책 메타 컬럼 추가 (schema.prisma 동기화)
ALTER TABLE `LeaveType`
  ADD COLUMN `allowedWeekdays` VARCHAR(191) NULL,
  ADD COLUMN `deductMode` VARCHAR(191) NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN `monthlyQuotaKey` VARCHAR(191) NULL,
  ADD COLUMN `requestFlow` VARCHAR(191) NOT NULL DEFAULT 'STANDARD';

-- AllocationSourceConfig 연차 풀 플래그 추가 (schema.prisma 동기화)
ALTER TABLE `AllocationSourceConfig`
  ADD COLUMN `isAnnualPool` BOOLEAN NOT NULL DEFAULT false;

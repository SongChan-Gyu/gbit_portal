-- 회사 사번(로그인 ID용). 기존 자동 부여 empNo는 유지.
ALTER TABLE `Employee` ADD COLUMN `companyStaffNo` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `Employee_companyStaffNo_key` ON `Employee` (`companyStaffNo`);

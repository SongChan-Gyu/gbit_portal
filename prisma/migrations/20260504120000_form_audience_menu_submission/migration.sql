-- Form: slug 선택값, showInMenu/audience 추가
-- FormSubmission: submitterName 기본값, employeeId 추가

-- Form.slug: NOT NULL → NULL 허용
ALTER TABLE `Form` MODIFY COLUMN `slug` VARCHAR(191) NULL;

-- Form.showInMenu 추가
ALTER TABLE `Form` ADD COLUMN `showInMenu` BOOLEAN NOT NULL DEFAULT false;

-- Form.audience 추가
ALTER TABLE `Form` ADD COLUMN `audience` VARCHAR(191) NOT NULL DEFAULT 'ALL';

-- FormSubmission.submitterName: 기본값 '' 추가
ALTER TABLE `FormSubmission` MODIFY COLUMN `submitterName` VARCHAR(191) NOT NULL DEFAULT '';

-- FormSubmission.employeeId 추가 (nullable, 로그인 제출 시 연결)
ALTER TABLE `FormSubmission` ADD COLUMN `employeeId` VARCHAR(191) NULL;

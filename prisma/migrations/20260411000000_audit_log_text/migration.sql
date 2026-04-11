-- AuditLog: 스탬프 다건 부여 등 JSON after/before 가 VARCHAR(191)을 초과할 수 있음
ALTER TABLE `AuditLog` MODIFY `before` TEXT NULL;
ALTER TABLE `AuditLog` MODIFY `after` TEXT NULL;

-- 힐링데이: 1단계 결재(팀장→PM 규칙은 /api/leave/healing-day·/api/leave/request 와 동일)
UPDATE `LeaveType` SET `approvalSteps` = 1 WHERE `code` = 'HEALING_DAY';

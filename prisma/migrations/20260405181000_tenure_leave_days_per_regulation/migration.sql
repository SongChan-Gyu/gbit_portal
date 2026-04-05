-- 휴가규정: 1·5·10년 근속 휴가 부여 일수
UPDATE `LeaveType` SET `daysPerUnit` = 3 WHERE `code` = 'TENURE_1Y';
UPDATE `LeaveType` SET `daysPerUnit` = 5 WHERE `code` = 'TENURE_5Y';
UPDATE `LeaveType` SET `daysPerUnit` = 10 WHERE `code` = 'TENURE_10Y';

UPDATE `AllocationSourceConfig` SET `defaultDays` = 3 WHERE `sourceCode` = 'TENURE_1Y';
UPDATE `AllocationSourceConfig` SET `defaultDays` = 5 WHERE `sourceCode` = 'TENURE_5Y';
UPDATE `AllocationSourceConfig` SET `defaultDays` = 10 WHERE `sourceCode` = 'TENURE_10Y';

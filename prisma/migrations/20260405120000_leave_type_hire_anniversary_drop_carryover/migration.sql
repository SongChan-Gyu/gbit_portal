-- Remove unused carryover flags; add hire anniversary on LeaveType (tenure = DB-driven)

ALTER TABLE `LeaveType`
  DROP COLUMN `carryoverEligible`,
  DROP COLUMN `autoCarryoverOnFiscalInit`,
  ADD COLUMN `hireAnniversaryYears` INT NULL;

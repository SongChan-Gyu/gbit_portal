-- LeaveType carryover metadata
ALTER TABLE `LeaveType`
  ADD COLUMN `carryoverEligible` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `autoCarryoverOnFiscalInit` BOOLEAN NOT NULL DEFAULT false;

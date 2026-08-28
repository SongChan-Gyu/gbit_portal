-- SystemConfig.value: VARCHAR(191) → TEXT (제주 이용주의사항 등 긴 JSON 저장)
ALTER TABLE `SystemConfig` MODIFY `value` TEXT NOT NULL;

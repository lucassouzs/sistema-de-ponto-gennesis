-- Normalize any early "unb" values to "hub"
UPDATE "financial_control_entries"
SET "consorcio" = 'hub'
WHERE "consorcio" = 'unb';

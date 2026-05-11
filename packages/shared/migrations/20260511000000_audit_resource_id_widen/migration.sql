-- audit_log.resource_id was VarChar(64), which is too narrow for storage
-- keys like `cv/<uuid>/<uuid>.pdf` (~80 chars). Widen to 255 to fit any
-- reasonable resource identifier, including future S3-style keys.
ALTER TABLE "audit_log" ALTER COLUMN "resource_id" TYPE VARCHAR(255);

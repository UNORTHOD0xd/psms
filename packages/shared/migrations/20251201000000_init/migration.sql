-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('STUDENT', 'SUPERVISOR', 'COORDINATOR', 'ADMINISTRATOR');

-- CreateEnum
CREATE TYPE "OrganisationType" AS ENUM ('EMPLOYER', 'NGO', 'PUBLIC_SECTOR', 'ACADEMIC');

-- CreateEnum
CREATE TYPE "OrganisationStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "OpportunityStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'DECLINED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "PlacementStatus" AS ENUM ('PENDING_START', 'ACTIVE', 'COMPLETED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "HoursLogStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SiteVisitAssessment" AS ENUM ('SATISFACTORY', 'CONCERNS', 'UNSATISFACTORY');

-- CreateEnum
CREATE TYPE "EvaluationType" AS ENUM ('MIDTERM', 'FINAL');

-- CreateEnum
CREATE TYPE "EligibilityStatus" AS ENUM ('ELIGIBLE', 'ELIGIBLE_WITH_CAUTION', 'INELIGIBLE');

-- CreateEnum
CREATE TYPE "MagicLinkPurpose" AS ENUM ('ONBOARDING', 'HOURS_APPROVAL', 'EVALUATION_MIDTERM', 'EVALUATION_FINAL');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'IN_APP');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'BOUNCED', 'FAILED', 'READ');

-- CreateEnum
CREATE TYPE "ImportRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED');

-- CreateTable
CREATE TABLE "programme" (
    "programme_id" SERIAL NOT NULL,
    "programme_code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "hours_required" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "programme_pkey" PRIMARY KEY ("programme_id")
);

-- CreateTable
CREATE TABLE "competency" (
    "competency_id" SERIAL NOT NULL,
    "competency_code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "category" VARCHAR(100),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competency_pkey" PRIMARY KEY ("competency_id")
);

-- CreateTable
CREATE TABLE "user" (
    "user_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(254) NOT NULL,
    "email_lower" VARCHAR(254) NOT NULL,
    "password_hash" TEXT,
    "full_name" VARCHAR(200) NOT NULL,
    "phone" VARCHAR(40),
    "role" "Role" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_signin_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "student_profile" (
    "user_id" UUID NOT NULL,
    "student_id" VARCHAR(20) NOT NULL,
    "programme_id" INTEGER NOT NULL,
    "year_of_study" INTEGER NOT NULL,
    "expected_grad_date" DATE,
    "hours_required" INTEGER NOT NULL,
    "hours_imported_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_profile_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "student_competency" (
    "student_user_id" UUID NOT NULL,
    "competency_id" INTEGER NOT NULL,
    "proficiency" INTEGER NOT NULL,
    "declared_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_competency_pkey" PRIMARY KEY ("student_user_id","competency_id")
);

-- CreateTable
CREATE TABLE "supervisor_profile" (
    "user_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "job_title" VARCHAR(200),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supervisor_profile_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "staff_profile" (
    "user_id" UUID NOT NULL,
    "staff_id" VARCHAR(20) NOT NULL,
    "department" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_profile_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "session" (
    "session_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "cookie_hash" VARCHAR(64) NOT NULL,
    "scope_placement_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "ip" VARCHAR(64),
    "user_agent" VARCHAR(500),

    CONSTRAINT "session_pkey" PRIMARY KEY ("session_id")
);

-- CreateTable
CREATE TABLE "magic_link_token" (
    "token_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "supervisor_user_id" UUID NOT NULL,
    "placement_id" UUID,
    "purpose" "MagicLinkPurpose" NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "token_salt" VARCHAR(64) NOT NULL,
    "issued_by_user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "magic_link_token_pkey" PRIMARY KEY ("token_id")
);

-- CreateTable
CREATE TABLE "password_reset_token" (
    "token_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_token_pkey" PRIMARY KEY ("token_id")
);

-- CreateTable
CREATE TABLE "organisation" (
    "organisation_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(200) NOT NULL,
    "type" "OrganisationType" NOT NULL,
    "industry_sector" VARCHAR(100) NOT NULL,
    "address" VARCHAR(500),
    "primary_contact_name" VARCHAR(200) NOT NULL,
    "primary_contact_email" VARCHAR(254) NOT NULL,
    "primary_contact_phone" VARCHAR(40) NOT NULL,
    "mou_on_file" BOOLEAN NOT NULL DEFAULT false,
    "mou_expiry_date" DATE,
    "status" "OrganisationStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organisation_pkey" PRIMARY KEY ("organisation_id")
);

-- CreateTable
CREATE TABLE "opportunity" (
    "opportunity_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisation_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "min_hours" INTEGER NOT NULL,
    "openings" INTEGER NOT NULL,
    "status" "OpportunityStatus" NOT NULL DEFAULT 'DRAFT',
    "application_deadline" DATE NOT NULL,
    "supervisor_name" VARCHAR(200) NOT NULL,
    "supervisor_email" VARCHAR(254) NOT NULL,
    "stipend_amount" DECIMAL(12,2),
    "stipend_currency" VARCHAR(3),
    "created_by_user_id" UUID NOT NULL,
    "published_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opportunity_pkey" PRIMARY KEY ("opportunity_id")
);

-- CreateTable
CREATE TABLE "opportunity_competency" (
    "opportunity_id" UUID NOT NULL,
    "competency_id" INTEGER NOT NULL,
    "weight" DECIMAL(4,3) NOT NULL DEFAULT 1.0,

    CONSTRAINT "opportunity_competency_pkey" PRIMARY KEY ("opportunity_id","competency_id")
);

-- CreateTable
CREATE TABLE "opportunity_programme" (
    "opportunity_id" UUID NOT NULL,
    "programme_id" INTEGER NOT NULL,

    CONSTRAINT "opportunity_programme_pkey" PRIMARY KEY ("opportunity_id","programme_id")
);

-- CreateTable
CREATE TABLE "application" (
    "application_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_user_id" UUID NOT NULL,
    "opportunity_id" UUID NOT NULL,
    "motivation" TEXT NOT NULL,
    "cv_url" VARCHAR(2048) NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMPTZ(6),
    "decided_by_user_id" UUID,
    "decline_reason" TEXT,
    "score_snapshot" DECIMAL(4,3),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_pkey" PRIMARY KEY ("application_id")
);

-- CreateTable
CREATE TABLE "placement" (
    "placement_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "application_id" UUID NOT NULL,
    "student_user_id" UUID NOT NULL,
    "opportunity_id" UUID NOT NULL,
    "supervisor_user_id" UUID NOT NULL,
    "status" "PlacementStatus" NOT NULL DEFAULT 'PENDING_START',
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "composite_rating" DECIMAL(3,2),
    "terminated_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "placement_pkey" PRIMARY KEY ("placement_id")
);

-- CreateTable
CREATE TABLE "hours_log" (
    "log_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "placement_id" UUID NOT NULL,
    "student_user_id" UUID NOT NULL,
    "week_number" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "hours" DECIMAL(5,2) NOT NULL,
    "activity_narrative" TEXT NOT NULL,
    "status" "HoursLogStatus" NOT NULL DEFAULT 'PENDING',
    "approved_at" TIMESTAMPTZ(6),
    "approved_by_supervisor_id" UUID,
    "rejection_comment" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hours_log_pkey" PRIMARY KEY ("log_id")
);

-- CreateTable
CREATE TABLE "site_visit_note" (
    "note_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "placement_id" UUID NOT NULL,
    "coordinator_user_id" UUID NOT NULL,
    "visit_date" DATE NOT NULL,
    "narrative" TEXT NOT NULL,
    "overall_assessment" "SiteVisitAssessment" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_visit_note_pkey" PRIMARY KEY ("note_id")
);

-- CreateTable
CREATE TABLE "site_visit_followup" (
    "followup_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "note_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "due_date" DATE NOT NULL,
    "resolved_at" TIMESTAMPTZ(6),

    CONSTRAINT "site_visit_followup_pkey" PRIMARY KEY ("followup_id")
);

-- CreateTable
CREATE TABLE "evaluation" (
    "evaluation_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "placement_id" UUID NOT NULL,
    "evaluation_type" "EvaluationType" NOT NULL,
    "attendance_rating" INTEGER NOT NULL,
    "professionalism_rating" INTEGER NOT NULL,
    "narrative" TEXT NOT NULL,
    "recommend_future" BOOLEAN NOT NULL,
    "submitted_by_user_id" UUID NOT NULL,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "average_score" DECIMAL(4,3) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evaluation_pkey" PRIMARY KEY ("evaluation_id")
);

-- CreateTable
CREATE TABLE "evaluation_competency_rating" (
    "evaluation_id" UUID NOT NULL,
    "competency_id" INTEGER NOT NULL,
    "rating" INTEGER NOT NULL,

    CONSTRAINT "evaluation_competency_rating_pkey" PRIMARY KEY ("evaluation_id","competency_id")
);

-- CreateTable
CREATE TABLE "certificate" (
    "certificate_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "placement_id" UUID NOT NULL,
    "student_user_id" UUID NOT NULL,
    "pdf_storage_key" VARCHAR(500) NOT NULL,
    "pdf_url" VARCHAR(2048) NOT NULL,
    "qr_code_url" VARCHAR(2048) NOT NULL,
    "signature_hash" VARCHAR(64) NOT NULL,
    "signature" TEXT NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_by_user_id" UUID,
    "revoked_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certificate_pkey" PRIMARY KEY ("certificate_id")
);

-- CreateTable
CREATE TABLE "notification" (
    "notification_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'EMAIL',
    "event_type" VARCHAR(100) NOT NULL,
    "subject" VARCHAR(300) NOT NULL,
    "body_template" VARCHAR(100) NOT NULL,
    "body_params" JSONB NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
    "sendgrid_message_id" VARCHAR(200),
    "queued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(6),
    "delivered_at" TIMESTAMPTZ(6),
    "read_at" TIMESTAMPTZ(6),
    "failure_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("notification_id")
);

-- CreateTable
CREATE TABLE "notification_delivery_event" (
    "event_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "notification_id" UUID NOT NULL,
    "event_type" VARCHAR(50) NOT NULL,
    "payload" JSONB NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_delivery_event_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "audit_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ts" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "request_id" VARCHAR(26),
    "actor_user_id" UUID,
    "actor_role" "Role",
    "action" VARCHAR(100) NOT NULL,
    "resource_type" VARCHAR(100) NOT NULL,
    "resource_id" VARCHAR(64),
    "before" JSONB,
    "after" JSONB,
    "ip" VARCHAR(64),
    "user_agent" VARCHAR(500),

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("audit_id")
);

-- CreateTable
CREATE TABLE "import_run" (
    "run_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source" VARCHAR(50) NOT NULL DEFAULT 'isims',
    "source_filename" VARCHAR(500),
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "status" "ImportRunStatus" NOT NULL DEFAULT 'RUNNING',
    "rows_total" INTEGER NOT NULL DEFAULT 0,
    "rows_imported" INTEGER NOT NULL DEFAULT 0,
    "rows_quarantined" INTEGER NOT NULL DEFAULT 0,
    "triggered_by_user_id" UUID,
    "idempotency_key" VARCHAR(64),

    CONSTRAINT "import_run_pkey" PRIMARY KEY ("run_id")
);

-- CreateTable
CREATE TABLE "import_quarantine_row" (
    "quarantine_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "run_id" UUID NOT NULL,
    "row_number" INTEGER NOT NULL,
    "raw_payload" JSONB NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_quarantine_row_pkey" PRIMARY KEY ("quarantine_id")
);

-- CreateTable
CREATE TABLE "system_config" (
    "key" VARCHAR(100) NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by_user_id" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_config_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "idempotency_key" (
    "key" VARCHAR(64) NOT NULL,
    "endpoint" VARCHAR(200) NOT NULL,
    "request_hash" VARCHAR(64) NOT NULL,
    "response_status" INTEGER NOT NULL,
    "response_body" JSONB NOT NULL,
    "user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "idempotency_key_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "programme_programme_code_key" ON "programme"("programme_code");

-- CreateIndex
CREATE UNIQUE INDEX "competency_competency_code_key" ON "competency"("competency_code");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_lower_key" ON "user"("email_lower");

-- CreateIndex
CREATE INDEX "user_role_is_active_idx" ON "user"("role", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "student_profile_student_id_key" ON "student_profile"("student_id");

-- CreateIndex
CREATE INDEX "student_profile_programme_id_idx" ON "student_profile"("programme_id");

-- CreateIndex
CREATE INDEX "supervisor_profile_organisation_id_idx" ON "supervisor_profile"("organisation_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_profile_staff_id_key" ON "staff_profile"("staff_id");

-- CreateIndex
CREATE UNIQUE INDEX "session_cookie_hash_key" ON "session"("cookie_hash");

-- CreateIndex
CREATE INDEX "session_user_id_expires_at_idx" ON "session"("user_id", "expires_at");

-- CreateIndex
CREATE INDEX "magic_link_token_supervisor_user_id_consumed_at_expires_at_idx" ON "magic_link_token"("supervisor_user_id", "consumed_at", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "magic_link_token_token_hash_token_salt_key" ON "magic_link_token"("token_hash", "token_salt");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_token_token_hash_key" ON "password_reset_token"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_token_user_id_consumed_at_idx" ON "password_reset_token"("user_id", "consumed_at");

-- CreateIndex
CREATE INDEX "organisation_status_idx" ON "organisation"("status");

-- CreateIndex
CREATE INDEX "opportunity_status_application_deadline_idx" ON "opportunity"("status", "application_deadline");

-- CreateIndex
CREATE INDEX "opportunity_organisation_id_status_idx" ON "opportunity"("organisation_id", "status");

-- CreateIndex
CREATE INDEX "application_opportunity_id_status_idx" ON "application"("opportunity_id", "status");

-- CreateIndex
CREATE INDEX "application_student_user_id_status_idx" ON "application"("student_user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "application_student_user_id_opportunity_id_key" ON "application"("student_user_id", "opportunity_id");

-- CreateIndex
CREATE UNIQUE INDEX "placement_application_id_key" ON "placement"("application_id");

-- CreateIndex
CREATE INDEX "placement_student_user_id_status_idx" ON "placement"("student_user_id", "status");

-- CreateIndex
CREATE INDEX "placement_supervisor_user_id_status_idx" ON "placement"("supervisor_user_id", "status");

-- CreateIndex
CREATE INDEX "hours_log_placement_id_status_idx" ON "hours_log"("placement_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "hours_log_placement_id_week_number_date_key" ON "hours_log"("placement_id", "week_number", "date");

-- CreateIndex
CREATE INDEX "site_visit_note_placement_id_idx" ON "site_visit_note"("placement_id");

-- CreateIndex
CREATE INDEX "site_visit_followup_note_id_idx" ON "site_visit_followup"("note_id");

-- CreateIndex
CREATE INDEX "evaluation_placement_id_idx" ON "evaluation"("placement_id");

-- CreateIndex
CREATE UNIQUE INDEX "evaluation_placement_id_evaluation_type_key" ON "evaluation"("placement_id", "evaluation_type");

-- CreateIndex
CREATE UNIQUE INDEX "certificate_placement_id_key" ON "certificate"("placement_id");

-- CreateIndex
CREATE INDEX "certificate_student_user_id_idx" ON "certificate"("student_user_id");

-- CreateIndex
CREATE INDEX "notification_user_id_queued_at_idx" ON "notification"("user_id", "queued_at");

-- CreateIndex
CREATE INDEX "notification_status_queued_at_idx" ON "notification"("status", "queued_at");

-- CreateIndex
CREATE INDEX "notification_sendgrid_message_id_idx" ON "notification"("sendgrid_message_id");

-- CreateIndex
CREATE INDEX "notification_delivery_event_notification_id_occurred_at_idx" ON "notification_delivery_event"("notification_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_log_ts_idx" ON "audit_log"("ts");

-- CreateIndex
CREATE INDEX "audit_log_actor_user_id_ts_idx" ON "audit_log"("actor_user_id", "ts");

-- CreateIndex
CREATE INDEX "audit_log_resource_type_resource_id_ts_idx" ON "audit_log"("resource_type", "resource_id", "ts");

-- CreateIndex
CREATE UNIQUE INDEX "import_run_idempotency_key_key" ON "import_run"("idempotency_key");

-- CreateIndex
CREATE INDEX "import_run_started_at_idx" ON "import_run"("started_at");

-- CreateIndex
CREATE INDEX "import_quarantine_row_run_id_reason_idx" ON "import_quarantine_row"("run_id", "reason");

-- CreateIndex
CREATE INDEX "idempotency_key_expires_at_idx" ON "idempotency_key"("expires_at");

-- AddForeignKey
ALTER TABLE "student_profile" ADD CONSTRAINT "student_profile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profile" ADD CONSTRAINT "student_profile_programme_id_fkey" FOREIGN KEY ("programme_id") REFERENCES "programme"("programme_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_competency" ADD CONSTRAINT "student_competency_student_user_id_fkey" FOREIGN KEY ("student_user_id") REFERENCES "student_profile"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_competency" ADD CONSTRAINT "student_competency_competency_id_fkey" FOREIGN KEY ("competency_id") REFERENCES "competency"("competency_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supervisor_profile" ADD CONSTRAINT "supervisor_profile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supervisor_profile" ADD CONSTRAINT "supervisor_profile_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("organisation_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_profile" ADD CONSTRAINT "staff_profile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "magic_link_token" ADD CONSTRAINT "magic_link_token_supervisor_user_id_fkey" FOREIGN KEY ("supervisor_user_id") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "magic_link_token" ADD CONSTRAINT "magic_link_token_placement_id_fkey" FOREIGN KEY ("placement_id") REFERENCES "placement"("placement_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_token" ADD CONSTRAINT "password_reset_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity" ADD CONSTRAINT "opportunity_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("organisation_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_competency" ADD CONSTRAINT "opportunity_competency_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunity"("opportunity_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_competency" ADD CONSTRAINT "opportunity_competency_competency_id_fkey" FOREIGN KEY ("competency_id") REFERENCES "competency"("competency_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_programme" ADD CONSTRAINT "opportunity_programme_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunity"("opportunity_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_programme" ADD CONSTRAINT "opportunity_programme_programme_id_fkey" FOREIGN KEY ("programme_id") REFERENCES "programme"("programme_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application" ADD CONSTRAINT "application_student_user_id_fkey" FOREIGN KEY ("student_user_id") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application" ADD CONSTRAINT "application_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunity"("opportunity_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application" ADD CONSTRAINT "application_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement" ADD CONSTRAINT "placement_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "application"("application_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement" ADD CONSTRAINT "placement_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunity"("opportunity_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement" ADD CONSTRAINT "placement_supervisor_user_id_fkey" FOREIGN KEY ("supervisor_user_id") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hours_log" ADD CONSTRAINT "hours_log_placement_id_fkey" FOREIGN KEY ("placement_id") REFERENCES "placement"("placement_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hours_log" ADD CONSTRAINT "hours_log_student_user_id_fkey" FOREIGN KEY ("student_user_id") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hours_log" ADD CONSTRAINT "hours_log_approved_by_supervisor_id_fkey" FOREIGN KEY ("approved_by_supervisor_id") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_visit_note" ADD CONSTRAINT "site_visit_note_placement_id_fkey" FOREIGN KEY ("placement_id") REFERENCES "placement"("placement_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_visit_note" ADD CONSTRAINT "site_visit_note_coordinator_user_id_fkey" FOREIGN KEY ("coordinator_user_id") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_visit_followup" ADD CONSTRAINT "site_visit_followup_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "site_visit_note"("note_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation" ADD CONSTRAINT "evaluation_placement_id_fkey" FOREIGN KEY ("placement_id") REFERENCES "placement"("placement_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation" ADD CONSTRAINT "evaluation_submitted_by_user_id_fkey" FOREIGN KEY ("submitted_by_user_id") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_competency_rating" ADD CONSTRAINT "evaluation_competency_rating_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "evaluation"("evaluation_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_competency_rating" ADD CONSTRAINT "evaluation_competency_rating_competency_id_fkey" FOREIGN KEY ("competency_id") REFERENCES "competency"("competency_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate" ADD CONSTRAINT "certificate_placement_id_fkey" FOREIGN KEY ("placement_id") REFERENCES "placement"("placement_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate" ADD CONSTRAINT "certificate_student_user_id_fkey" FOREIGN KEY ("student_user_id") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_delivery_event" ADD CONSTRAINT "notification_delivery_event_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notification"("notification_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_quarantine_row" ADD CONSTRAINT "import_quarantine_row_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "import_run"("run_id") ON DELETE RESTRICT ON UPDATE CASCADE;


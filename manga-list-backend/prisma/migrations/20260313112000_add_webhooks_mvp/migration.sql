-- Webhooks MVP: endpoints + event log + delivery log
CREATE TYPE "IntegrationWebhookDeliveryStatus" AS ENUM ('DELIVERED', 'RETRY', 'DLQ');

CREATE TABLE "IntegrationWebhookEndpoint" (
  "id" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "signingSecret" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IntegrationWebhookEndpoint_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IntegrationWebhookEventLog" (
  "id" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IntegrationWebhookEventLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IntegrationWebhookDeliveryLog" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "endpointId" TEXT NOT NULL,
  "attempt" INTEGER NOT NULL,
  "status" "IntegrationWebhookDeliveryStatus" NOT NULL,
  "responseStatus" INTEGER,
  "errorMessage" TEXT,
  "nextRetryAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IntegrationWebhookDeliveryLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IntegrationWebhookEndpoint_partnerId_url_key"
ON "IntegrationWebhookEndpoint"("partnerId", "url");

CREATE INDEX "IntegrationWebhookEndpoint_partnerId_isActive_idx"
ON "IntegrationWebhookEndpoint"("partnerId", "isActive");

CREATE INDEX "IntegrationWebhookEventLog_partnerId_createdAt_idx"
ON "IntegrationWebhookEventLog"("partnerId", "createdAt");

CREATE INDEX "IntegrationWebhookEventLog_eventType_createdAt_idx"
ON "IntegrationWebhookEventLog"("eventType", "createdAt");

CREATE INDEX "IntegrationWebhookDeliveryLog_endpointId_createdAt_idx"
ON "IntegrationWebhookDeliveryLog"("endpointId", "createdAt");

CREATE INDEX "IntegrationWebhookDeliveryLog_eventId_createdAt_idx"
ON "IntegrationWebhookDeliveryLog"("eventId", "createdAt");

CREATE INDEX "IntegrationWebhookDeliveryLog_status_nextRetryAt_idx"
ON "IntegrationWebhookDeliveryLog"("status", "nextRetryAt");

ALTER TABLE "IntegrationWebhookEndpoint"
ADD CONSTRAINT "IntegrationWebhookEndpoint_partnerId_fkey"
FOREIGN KEY ("partnerId") REFERENCES "IntegrationPartner"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IntegrationWebhookEventLog"
ADD CONSTRAINT "IntegrationWebhookEventLog_partnerId_fkey"
FOREIGN KEY ("partnerId") REFERENCES "IntegrationPartner"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IntegrationWebhookDeliveryLog"
ADD CONSTRAINT "IntegrationWebhookDeliveryLog_eventId_fkey"
FOREIGN KEY ("eventId") REFERENCES "IntegrationWebhookEventLog"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IntegrationWebhookDeliveryLog"
ADD CONSTRAINT "IntegrationWebhookDeliveryLog_endpointId_fkey"
FOREIGN KEY ("endpointId") REFERENCES "IntegrationWebhookEndpoint"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

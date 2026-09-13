CREATE TABLE "ProjectOperationReceipt" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "projectId" UUID NOT NULL,
    "operationId" UUID NOT NULL,
    "actorUserId" UUID NOT NULL,
    "baseRevision" INTEGER NOT NULL,
    "resultingRevision" INTEGER NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "ack" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProjectOperationReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectOperationReceipt_projectId_operationId_key" ON "ProjectOperationReceipt"("projectId", "operationId");
CREATE INDEX "ProjectOperationReceipt_expiresAt_idx" ON "ProjectOperationReceipt"("expiresAt");

ALTER TABLE "ProjectOperationReceipt" ADD CONSTRAINT "ProjectOperationReceipt_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

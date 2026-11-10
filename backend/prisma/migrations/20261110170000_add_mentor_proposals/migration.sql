-- CreateEnum
CREATE TYPE "MentorProposalStatus" AS ENUM ('PENDING', 'APPLIED', 'REJECTED');

-- CreateTable
CREATE TABLE "MentorProposal" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "authorUserId" UUID NOT NULL,
    "authorEmail" TEXT NOT NULL,
    "instruction" TEXT NOT NULL,
    "baseRevision" INTEGER NOT NULL,
    "status" "MentorProposalStatus" NOT NULL DEFAULT 'PENDING',
    "command" JSONB NOT NULL,
    "summary" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" UUID,
    "resultingRevision" INTEGER,

    CONSTRAINT "MentorProposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MentorProposal_projectId_createdAt_id_idx" ON "MentorProposal"("projectId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "MentorProposal_authorUserId_idx" ON "MentorProposal"("authorUserId");

-- CreateIndex
CREATE INDEX "MentorProposal_resolvedByUserId_idx" ON "MentorProposal"("resolvedByUserId");

-- AddForeignKey
ALTER TABLE "MentorProposal" ADD CONSTRAINT "MentorProposal_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MentorProposal" ADD CONSTRAINT "MentorProposal_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MentorProposal" ADD CONSTRAINT "MentorProposal_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddCheckConstraint (not representable in schema.prisma; the store enforces the same invariant)
ALTER TABLE "MentorProposal" ADD CONSTRAINT "MentorProposal_resolution_check" CHECK (
    ("status" = 'PENDING' AND "resolvedAt" IS NULL AND "resolvedByUserId" IS NULL AND "resultingRevision" IS NULL)
    OR ("status" = 'REJECTED' AND "resolvedAt" IS NOT NULL AND "resolvedByUserId" IS NOT NULL AND "resultingRevision" IS NULL)
    OR ("status" = 'APPLIED' AND "resolvedAt" IS NOT NULL AND "resolvedByUserId" IS NOT NULL AND "resultingRevision" IS NOT NULL)
);

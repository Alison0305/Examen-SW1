-- CreateEnum
CREATE TYPE "ProjectChatMessageKind" AS ENUM ('USER', 'MENTOR', 'NOTICE', 'PROPOSAL');

-- CreateTable
CREATE TABLE "ProjectChatMessage" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "kind" "ProjectChatMessageKind" NOT NULL,
    "authorUserId" UUID,
    "authorEmail" TEXT,
    "body" TEXT NOT NULL,
    "mentionsMentor" BOOLEAN NOT NULL DEFAULT false,
    "replyToId" UUID,
    "proposalId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectChatMessage_projectId_createdAt_id_idx" ON "ProjectChatMessage"("projectId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "ProjectChatMessage_authorUserId_idx" ON "ProjectChatMessage"("authorUserId");

-- AddForeignKey
ALTER TABLE "ProjectChatMessage" ADD CONSTRAINT "ProjectChatMessage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectChatMessage" ADD CONSTRAINT "ProjectChatMessage_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectChatMessage" ADD CONSTRAINT "ProjectChatMessage_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "ProjectChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- AddCheckConstraint (not representable in schema.prisma): only USER messages have an author.
ALTER TABLE "ProjectChatMessage" ADD CONSTRAINT "ProjectChatMessage_author_check" CHECK (
    ("kind" = 'USER' AND "authorUserId" IS NOT NULL AND "authorEmail" IS NOT NULL)
    OR ("kind" <> 'USER' AND "authorUserId" IS NULL AND "authorEmail" IS NULL)
);

CREATE TABLE "MentorInteraction" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "authorEmail" TEXT NOT NULL,
    "accessRole" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "projectRevision" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "grounded" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MentorInteraction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MentorInteraction_projectId_occurredAt_id_idx" ON "MentorInteraction"("projectId", "occurredAt", "id");
CREATE INDEX "MentorInteraction_userId_idx" ON "MentorInteraction"("userId");
ALTER TABLE "MentorInteraction" ADD CONSTRAINT "MentorInteraction_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MentorInteraction" ADD CONSTRAINT "MentorInteraction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

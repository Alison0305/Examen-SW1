ALTER TABLE "Project" ADD COLUMN "name" TEXT;
UPDATE "Project" SET "name" = 'Proyecto sin nombre' WHERE "name" IS NULL;
ALTER TABLE "Project" ALTER COLUMN "name" SET NOT NULL;

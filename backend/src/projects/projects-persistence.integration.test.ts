import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createProjectDocument, primitiveType } from "@examen-sw1/uml-core";
import { PrismaService } from "../prisma/prisma.service";
import { ProjectsPersistenceService } from "./projects-persistence.service";

const ownerId = "a1111111-1111-4111-8111-111111111111";
const documentId = "a2222222-2222-4222-8222-222222222222";
const classA = "a3333333-3333-4333-8333-333333333333";
const classB = "a4444444-4444-4444-8444-444444444444";
const enumId = "a5555555-5555-4555-8555-555555555555";

describe("ProjectsPersistenceService PostgreSQL", () => {
  const prisma = new PrismaService();
  const service = new ProjectsPersistenceService(prisma);

  beforeAll(async () => {
    process.loadEnvFile(".env");
    await prisma.$connect();
    await prisma.project.deleteMany({ where: { ownerId } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
    await prisma.user.create({ data: { id: ownerId, email: "cu03-integration@example.test", passwordHash: "test-hash-not-a-real-password" } });
  });

  afterAll(async () => {
    await prisma.project.deleteMany({ where: { ownerId } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
    await prisma.$disconnect();
  });

  it("persiste ProjectDocument completo como JSONB y conserva revisión inicial", async () => {
    const document = createProjectDocument({ id: documentId, now: new Date("2026-09-08T00:00:00.000Z") });
    document.uml.classes.push(
      { id: classA, name: "Cliente", visibility: "public", attributes: [{ id: "a6666666-6666-4666-8666-666666666666", name: "id", visibility: "private", type: primitiveType("integer") }], operations: [{ id: "a7777777-7777-4777-8777-777777777777", name: "comprar", visibility: "public", parameters: [{ id: "a8888888-8888-4888-8888-888888888888", name: "cantidad", type: primitiveType("integer") }] }] },
      { id: classB, name: "Pedido", visibility: "protected", attributes: [], operations: [] },
    );
    document.uml.enumerations.push({ id: enumId, name: "Estado", visibility: "package", literals: ["NUEVO", "PAGADO"] });
    document.uml.relationships.push({ id: "a9999999-9999-4999-8999-999999999999", type: "Association", name: "realiza", sourceId: classA, targetId: classB, sourceMultiplicity: { lower: 1, upper: 1 }, targetMultiplicity: { lower: 0, upper: "unbounded" } });
    document.layout.elements.push({ elementId: classA, x: 120, y: 240, width: 180, height: 120 }, { elementId: classB, x: 480, y: 240 });

    const created = await service.createProject(ownerId, document);
    const recovered = await service.findProject(created.id);
    const column = await prisma.$queryRaw<Array<{ udt_name: string; column_default: string | null }>>`SELECT udt_name, column_default FROM information_schema.columns WHERE table_name = 'Project' AND column_name = 'document'`;
    const revision = await prisma.$queryRaw<Array<{ column_default: string | null }>>`SELECT column_default FROM information_schema.columns WHERE table_name = 'Project' AND column_name = 'revision'`;
    const uniqueEmail = await prisma.$queryRaw<Array<{ indexname: string }>>`SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'User' AND indexname = 'User_email_key'`;
    const ownerForeignKey = await prisma.$queryRaw<Array<{ constraint_name: string }>>`SELECT constraint_name FROM information_schema.table_constraints WHERE table_name = 'Project' AND constraint_type = 'FOREIGN KEY' AND constraint_name = 'Project_ownerId_fkey'`;

    expect(created.revision).toBe(1);
    expect(recovered).toMatchObject({ revision: 1, document });
    expect(column[0]?.udt_name).toBe("jsonb");
    expect(revision[0]?.column_default).toContain("1");
    expect(uniqueEmail).toHaveLength(1);
    expect(ownerForeignKey).toHaveLength(1);
  });
});

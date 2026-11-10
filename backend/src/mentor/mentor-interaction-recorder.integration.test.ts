import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { PrismaMentorInteractionMemory, PrismaMentorInteractionRecorder } from "./mentor-interaction-recorder";

const userId = "c1111111-1111-4111-8111-111111111111";
const projectId = "c2222222-2222-4222-8222-222222222222";
const occurredAt = new Date("2026-11-09T12:00:00.000Z");

describe("Mentor interaction PostgreSQL persistence", () => {
  let setup: PrismaService;

  beforeAll(async () => {
    process.loadEnvFile(process.cwd().endsWith("backend") ? ".env" : "backend/.env");
    setup = new PrismaService();
    await setup.$connect();
    await setup.mentorInteraction.deleteMany({ where: { projectId } });
    await setup.project.deleteMany({ where: { id: projectId } });
    await setup.user.deleteMany({ where: { id: userId } });
    await setup.user.create({ data: { id: userId, email: "mentor-memory@example.test", passwordHash: "test-hash-not-a-real-password" } });
    await setup.project.create({ data: { id: projectId, ownerId: userId, name: "Mentor memory", document: {}, revision: 2 } });
  });

  afterAll(async () => {
    if (setup) { await setup.project.deleteMany({ where: { id: projectId } }); await setup.user.deleteMany({ where: { id: userId } }); await setup.$disconnect(); }
  });

  it("persiste y recupera desde una nueva instancia", async () => {
    const first = new PrismaService();
    await first.$connect();
    await new PrismaMentorInteractionRecorder(first).record({ projectId, userId, author: { email: "mentor-memory@example.test" }, accessRole: "VIEWER", occurredAt, projectRevision: 2, question: "Pregunta", answer: "Respuesta", grounded: true });
    await first.$disconnect();

    const second = new PrismaService();
    await second.$connect();
    const row = await second.mentorInteraction.findFirstOrThrow({ where: { projectId } });
    const memory = await new PrismaMentorInteractionMemory(second).recent(projectId, 2);
    expect(row).toMatchObject({ projectId, userId, authorEmail: "mentor-memory@example.test", accessRole: "VIEWER", occurredAt, projectRevision: 2, question: "Pregunta", answer: "Respuesta", grounded: true });
    expect(memory).toEqual([{ question: "Pregunta", answer: "Respuesta", projectRevision: 2, isStale: false }]);
    await second.$disconnect();
  });
});

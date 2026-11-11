import { ForbiddenException, NotFoundException } from "@nestjs/common";
import type { LocalTextModelRequest } from "@examen-sw1/assistant-core";
import type { ProjectDocument } from "@examen-sw1/uml-core";
import { describe, expect, it, vi } from "vitest";
import { LocalModelError } from "../assistant/local-text-model";
import { LocalQwenMentorProposalIntentProvider, MentorProposalGenerationUnavailableError } from "./local-qwen-mentor-proposal-intent.provider";
import { MentorProposalCreationService } from "./mentor-proposal-creation.service";
import { AUTHOR, CLIENTE_ID, EDITOR_B, memoryDatabase, NOMBRE_ID, OUTSIDER, OWNER, PROJECT_ID, VIEWER } from "./mentor-proposal.test-support";
import { PrismaMentorProposalStore } from "./prisma-mentor-proposal.store";

const INSTRUCTION = "Agrega el atributo teléfono de tipo String a Cliente";
const INTENT = { operation: "ADD_ATTRIBUTE", className: "Cliente", attributeName: "teléfono", attributeType: "String" };

// The instruction a user would have written for a given model output, so each table case fails for its own reason
// (unknown class, duplicate, type…) and not because the names are not literal substrings of the instruction.
const instructionFor = (output: unknown): string => {
  const fields = (typeof output === "object" && output !== null ? output : {}) as Record<string, unknown>;
  return typeof fields.className === "string" && typeof fields.attributeName === "string" ? `Agrega el atributo ${fields.attributeName} de tipo ${String(fields.attributeType)} a ${fields.className}` : INSTRUCTION;
};
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ROLES = new Map<string, "OWNER" | "EDITOR" | "VIEWER">([[OWNER.id, "OWNER"], [AUTHOR.id, "EDITOR"], [EDITOR_B.id, "EDITOR"], [VIEWER.id, "VIEWER"]]);

// Real resolver, preview, builder, Prisma store and Qwen provider; only the edges are replaced: an in-memory database,
// the membership roles, the project reader and the local model (a deterministic stand-in returning `output`).
function setup(output: unknown | (() => unknown) = INTENT) {
  const db = memoryDatabase();
  const sequence: string[] = [];
  const access = {
    requireEdit: vi.fn(async (projectId: string, userId: string) => {
      sequence.push("requireEdit");
      const role = ROLES.get(userId);
      if (!role || projectId !== PROJECT_ID) throw new NotFoundException();
      if (role === "VIEWER") throw new ForbiddenException();
      return role;
    }),
  };
  const projects = {
    findProject: vi.fn(async (id: string) => {
      sequence.push("findProject");
      return id === db.project.id ? { revision: db.project.revision, document: structuredClone(db.project.document) as unknown as ProjectDocument } : null;
    }),
  };
  const model = {
    generateStructured: vi.fn(async (request: LocalTextModelRequest) => {
      void request;
      sequence.push("model");
      return typeof output === "function" ? (output as () => unknown)() : output;
    }),
  };
  const store = new PrismaMentorProposalStore(db.prisma);
  const create = store.create.bind(store);
  vi.spyOn(store, "create").mockImplementation(async (proposal) => { sequence.push("store.create"); return create(proposal); });
  const service = new MentorProposalCreationService(access, projects, new LocalQwenMentorProposalIntentProvider(model), store);
  const documentBefore = structuredClone(db.project.document);
  // Nothing outside the proposal table may change.
  const untouched = () => {
    expect(db.project.document).toEqual(documentBefore);
    expect(db.project.revision).toBe(10);
    expect(db.receipts).toHaveLength(0);
  };
  return { db, service, access, projects, model, store, sequence, untouched };
}

describe("MentorProposalCreationService.create", () => {
  it("AI-01: OWNER y EDITOR crean una propuesta PENDING con la intención generada por el modelo", async () => {
    for (const user of [OWNER, EDITOR_B]) {
      const { service, db, untouched } = setup();
      const result = await service.create(PROJECT_ID, user, INSTRUCTION);

      expect(result).toMatchObject({
        ok: true,
        currentRevision: 10,
        proposal: {
          status: "PENDING",
          projectId: PROJECT_ID,
          authorUserId: user.id,
          authorEmail: user.email,
          instruction: INSTRUCTION,
          baseRevision: 10,
          operation: { kind: "ADD_ATTRIBUTE", target: { className: "Cliente" }, change: { attributeName: "teléfono", attributeType: "string" } },
          summary: [{ kind: "added", element: "attribute", label: "Cliente.teléfono: string" }],
          diagnostics: [],
        },
      });
      expect(db.proposals).toHaveLength(1);
      expect(db.proposals[0]!.status).toBe("PENDING");
      untouched();
    }
  });

  it("orden: requireEdit → proyecto autoritativo → modelo → store.create (única escritura)", async () => {
    const { service, sequence } = setup();
    await service.create(PROJECT_ID, OWNER, INSTRUCTION);
    expect(sequence).toEqual(["requireEdit", "findProject", "model", "store.create"]);
  });

  it("el modelo solo recibe la instrucción recortada y los nombres de las clases, nunca identificadores ni el documento", async () => {
    const { service, model } = setup();
    await service.create(PROJECT_ID, OWNER, `  ${INSTRUCTION}  `);

    const sent = model.generateStructured.mock.calls[0]![0];
    expect(sent.userPrompt).toBe(`Clases existentes en el modelo: ["Cliente"]\nInstrucción: ${INSTRUCTION}`);
    expect(JSON.stringify(sent)).not.toContain(CLIENTE_ID);
    expect(JSON.stringify(sent)).not.toContain(NOMBRE_ID);
  });

  it("AI-11 y AI-12: crear no modifica el documento, la revisión ni el layout, y no genera ProjectOperationReceipt", async () => {
    const { service, db, untouched } = setup();
    await service.create(PROJECT_ID, OWNER, INSTRUCTION);

    untouched();
    expect((db.project.document.uml as ProjectDocument["uml"]).classes[0]!.attributes.map((attribute) => attribute.name)).toEqual(["nombre"]);
  });

  it("AI-13: el UUID del atributo y el classId los pone el servidor; el modelo no aporta ningún identificador", async () => {
    const { service, db } = setup();
    const first = await service.create(PROJECT_ID, OWNER, INSTRUCTION);
    const second = await service.create(PROJECT_ID, OWNER, INSTRUCTION);

    if (!first.ok || !second.ok) throw new Error("se esperaban dos propuestas");
    expect(first.proposal.command).toEqual({ type: "AddAttribute", classId: CLIENTE_ID, attributeId: expect.stringMatching(UUID_V4), name: "teléfono", attributeType: { kind: "primitive", name: "string" } });
    expect(first.proposal.command.attributeId).not.toBe(second.proposal.command.attributeId);
    expect(first.proposal.id).not.toBe(first.proposal.command.attributeId);
    expect(db.proposals).toHaveLength(2);
  });

  it("AI-14: la propuesta queda ligada a la revisión autoritativa del proyecto (la fila), no a la del JSON del documento", async () => {
    const { service, db } = setup();
    db.project.revision = 12;
    const result = await service.create(PROJECT_ID, OWNER, INSTRUCTION);

    expect(result).toMatchObject({ ok: true, currentRevision: 12, proposal: { baseRevision: 12 } });
  });

  describe("fallos: 0 propuestas, 0 cambios UML, 0 recibos", () => {
    it.each([
      ["AI-02 identificador de la IA", { ...INTENT, classId: CLIENTE_ID }, "INVALID_PROPOSAL"],
      ["AI-03 operación fuera de la allow-list", { operation: "DELETE_CLASS", className: "Cliente" }, "UNSUPPORTED_OPERATION"],
      ["AI-03 salida UNSUPPORTED", { operation: "UNSUPPORTED" }, "UNSUPPORTED_OPERATION"],
      ["AI-04 JSON inválido", () => { throw new LocalModelError("INVALID_OUTPUT"); }, "INVALID_PROPOSAL"],
      ["AI-05 falta className", { operation: "ADD_ATTRIBUTE", attributeName: "teléfono", attributeType: "String" }, "INVALID_PROPOSAL"],
      ["AI-06 clase inexistente", { ...INTENT, className: "Proveedor" }, "ELEMENT_NOT_FOUND"],
      ["AI-07 tipo desconocido", { ...INTENT, attributeType: "Dinero" }, "UNKNOWN_TYPE"],
      ["multiplicidad generada (v1 no la admite en la intención generada)", { ...INTENT, multiplicity: "0..1" }, "INVALID_PROPOSAL"],
      ["AI-15 campo adicional", { ...INTENT, status: "APPLIED" }, "INVALID_PROPOSAL"],
    ])("%s → %s", async (_case, output, code) => {
      const { service, db, store, untouched } = setup(output);

      await expect(service.create(PROJECT_ID, OWNER, instructionFor(output))).resolves.toMatchObject({ ok: false, error: { code } });
      expect(store.create).not.toHaveBeenCalled();
      expect(db.proposals).toHaveLength(0);
      untouched();
    });

    it("AI-08: atributo duplicado → INVALID_PROPOSAL con el diagnóstico UML público (code, severity, message)", async () => {
      const { service, db, untouched } = setup({ ...INTENT, attributeName: "Nombre" });
      const result = await service.create(PROJECT_ID, OWNER, "Agrega el atributo Nombre de tipo String a Cliente");

      if (result.ok) throw new Error("se esperaba un rechazo");
      expect(result.error.code).toBe("INVALID_PROPOSAL");
      expect(result.error.diagnostics.length).toBeGreaterThan(0);
      for (const diagnostic of result.error.diagnostics) expect(Object.keys(diagnostic).sort()).toEqual(["code", "message", "severity"]);
      expect(JSON.stringify(result.error)).not.toContain(CLIENTE_ID);
      expect(db.proposals).toHaveLength(0);
      untouched();
    });

    it("modelo no disponible: se propaga el error de disponibilidad y no se persiste nada", async () => {
      const { service, db, untouched } = setup(() => { throw new LocalModelError("TIMEOUT"); });

      await expect(service.create(PROJECT_ID, OWNER, INSTRUCTION)).rejects.toBeInstanceOf(MentorProposalGenerationUnavailableError);
      expect(db.proposals).toHaveLength(0);
      untouched();
    });

    it("una instrucción en blanco se rechaza sin invocar el modelo", async () => {
      const { service, model, db } = setup();
      await expect(service.create(PROJECT_ID, OWNER, "   ")).resolves.toMatchObject({ ok: false, error: { code: "INVALID_PROPOSAL" } });
      expect(model.generateStructured).not.toHaveBeenCalled();
      expect(db.proposals).toHaveLength(0);
    });
  });

  describe("autorización antes de la inferencia", () => {
    it("AI-09: VIEWER recibe 403; ni el proyecto ni el modelo se consultan", async () => {
      const { service, model, projects, db, untouched } = setup();

      await expect(service.create(PROJECT_ID, VIEWER, INSTRUCTION)).rejects.toBeInstanceOf(ForbiddenException);
      expect(model.generateStructured).not.toHaveBeenCalled();
      expect(projects.findProject).not.toHaveBeenCalled();
      expect(db.proposals).toHaveLength(0);
      untouched();
    });

    it("AI-10: un usuario sin acceso recibe 404 y el modelo no se invoca", async () => {
      const { service, model, db } = setup();

      await expect(service.create(PROJECT_ID, OUTSIDER, INSTRUCTION)).rejects.toBeInstanceOf(NotFoundException);
      expect(model.generateStructured).not.toHaveBeenCalled();
      expect(db.proposals).toHaveLength(0);
    });

    it("un proyecto que desaparece tras autorizar responde 404 sin invocar el modelo", async () => {
      const { service, model, projects } = setup();
      projects.findProject.mockResolvedValueOnce(null);

      await expect(service.create(PROJECT_ID, OWNER, INSTRUCTION)).rejects.toBeInstanceOf(NotFoundException);
      expect(model.generateStructured).not.toHaveBeenCalled();
    });
  });
});

describe("MentorProposalCreationService: nombres no literales", () => {
  it("6: si el modelo devuelve «telefono» en ambos intentos no se persiste nada y ninguna capa corrige el nombre", async () => {
    const { service, db, model, store, untouched } = setup({ ...INTENT, attributeName: "telefono" });
    const result = await service.create(PROJECT_ID, OWNER, INSTRUCTION);

    expect(result).toMatchObject({ ok: false, error: { code: "INVALID_PROPOSAL" } });
    expect(model.generateStructured).toHaveBeenCalledTimes(2);
    expect(store.create).not.toHaveBeenCalled();
    expect(db.proposals).toHaveLength(0);
    untouched();
  });
});

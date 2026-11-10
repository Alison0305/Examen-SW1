import { describe, expect, it } from "vitest";
import { MentorProposalDataError, parseStoredMentorProposalCommand, parseStoredMentorProposalSummary } from "./mentor-proposal-stored-json";

const CLASS_ID = "00000000-0000-4000-8000-000000000010";
const ATTRIBUTE_ID = "00000000-0000-4000-8000-0000000000a1";
const valid = { type: "AddAttribute", classId: CLASS_ID, attributeId: ATTRIBUTE_ID, name: "teléfono", attributeType: { kind: "primitive", name: "string" } };

function expectDataError(run: () => unknown, field: string): void {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(MentorProposalDataError);
    expect((error as MentorProposalDataError).code).toBe("MENTOR_PROPOSAL_DATA_CORRUPTED");
    expect((error as MentorProposalDataError).field).toBe(field);
    return;
  }
  throw new Error("se esperaba MentorProposalDataError");
}

describe("parseStoredMentorProposalCommand", () => {
  it("acepta un AddAttribute válido, con y sin multiplicidad", () => {
    expect(parseStoredMentorProposalCommand(valid)).toEqual(valid);
    expect(parseStoredMentorProposalCommand({ ...valid, multiplicity: { lower: 0, upper: "unbounded" } })).toEqual({ ...valid, multiplicity: { lower: 0, upper: "unbounded" } });
    expect(parseStoredMentorProposalCommand({ ...valid, multiplicity: { lower: 2, upper: 5 } })).toEqual({ ...valid, multiplicity: { lower: 2, upper: 5 } });
  });

  it("devuelve una copia limpia, no la referencia almacenada", () => {
    const parsed = parseStoredMentorProposalCommand(valid);
    expect(parsed).not.toBe(valid);
  });

  it("rechaza JSON que no es objeto", () => {
    for (const value of [null, undefined, "AddAttribute", 1, [], [valid]]) expectDataError(() => parseStoredMentorProposalCommand(value), "command");
  });

  it("rechaza operaciones distintas de AddAttribute", () => {
    expectDataError(() => parseStoredMentorProposalCommand({ ...valid, type: "DeleteClass" }), "command.type");
    expectDataError(() => parseStoredMentorProposalCommand({ ...valid, type: "ADD_ATTRIBUTE" }), "command.type");
  });

  it("rechaza UUID inválidos", () => {
    expectDataError(() => parseStoredMentorProposalCommand({ ...valid, classId: "cliente" }), "command.classId");
    expectDataError(() => parseStoredMentorProposalCommand({ ...valid, attributeId: "00000000-0000-0000-0000-000000000000" }), "command.attributeId");
  });

  it("rechaza nombres vacíos o sin normalizar", () => {
    for (const name of ["", "  ", " teléfono", 3]) expectDataError(() => parseStoredMentorProposalCommand({ ...valid, name }), "command.name");
  });

  it("rechaza tipos no primitivos o fuera de uml-core", () => {
    for (const attributeType of [{ kind: "primitive", name: "money" }, { kind: "primitive", name: "String" }, { kind: "reference", referenceType: "class", elementId: CLASS_ID }, { kind: "primitive", name: "string", extra: true }, "string"]) {
      expectDataError(() => parseStoredMentorProposalCommand({ ...valid, attributeType }), "command.attributeType");
    }
  });

  it("rechaza multiplicidades inválidas", () => {
    for (const multiplicity of [{ lower: 5, upper: 2 }, { lower: -1, upper: 1 }, { lower: 1.5, upper: 2 }, { lower: 0, upper: "*" }, { lower: 0 }, null, "0..*", { lower: 0, upper: 1, extra: 1 }]) {
      expectDataError(() => parseStoredMentorProposalCommand({ ...valid, multiplicity }), "command.multiplicity");
    }
  });

  it("rechaza campos faltantes e inesperados (política estricta)", () => {
    const missing: Record<string, unknown> = { ...valid };
    delete missing.name;
    expectDataError(() => parseStoredMentorProposalCommand(missing), "command");
    expectDataError(() => parseStoredMentorProposalCommand({ ...valid, visibility: "public" }), "command");
    expectDataError(() => parseStoredMentorProposalCommand({ ...valid, generationMetadata: {} }), "command");
    expectDataError(() => parseStoredMentorProposalCommand({ ...valid, __proto__x: 1 }), "command");
  });

  it("el mensaje de error no incluye el JSON almacenado", () => {
    try {
      parseStoredMentorProposalCommand({ ...valid, classId: "secreto-<script>" });
    } catch (error) {
      expect((error as Error).message).not.toContain("secreto");
    }
  });
});

describe("parseStoredMentorProposalSummary", () => {
  const line = { kind: "added", element: "attribute", label: "Cliente.teléfono: string" };

  it("acepta un diff válido y un diff vacío", () => {
    expect(parseStoredMentorProposalSummary([line])).toEqual([line]);
    expect(parseStoredMentorProposalSummary([])).toEqual([]);
  });

  it("rechaza un summary que no es arreglo", () => {
    for (const value of [null, line, "Cliente.teléfono", {}]) expectDataError(() => parseStoredMentorProposalSummary(value), "summary");
  });

  it("rechaza kind o element inválidos, etiquetas vacías y campos extra", () => {
    expectDataError(() => parseStoredMentorProposalSummary([{ ...line, kind: "moved" }]), "summary[0]");
    expectDataError(() => parseStoredMentorProposalSummary([line, { ...line, element: "package" }]), "summary[1]");
    expectDataError(() => parseStoredMentorProposalSummary([{ ...line, label: " " }]), "summary[0]");
    expectDataError(() => parseStoredMentorProposalSummary([{ ...line, id: ATTRIBUTE_ID }]), "summary[0]");
    expectDataError(() => parseStoredMentorProposalSummary(["Cliente.teléfono: string"]), "summary[0]");
  });
});

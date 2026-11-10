import { createProjectDocument, primitiveType, type ProjectDocument } from "@examen-sw1/uml-core";
import { describe, expect, it } from "vitest";
import type { AddAttributeProposalIntent, MentorProposalIntent } from "./mentor-proposal.contracts";
import { formatMentorProposalMultiplicity, parseMentorProposalMultiplicity } from "./mentor-proposal-multiplicity";
import { resolveMentorProposal } from "./mentor-proposal-resolver";

const DOCUMENT_ID = "00000000-0000-4000-8000-000000000001";
const CLIENTE_ID = "00000000-0000-4000-8000-000000000010";
const PEDIDO_ID = "00000000-0000-4000-8000-000000000020";
const NOMBRE_ID = "00000000-0000-4000-8000-000000000011";
const ATTRIBUTE_ID = "00000000-0000-4000-8000-0000000000a1";
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function documentFixture(): ProjectDocument {
  const document = createProjectDocument({ id: DOCUMENT_ID, now: new Date("2026-11-10T00:00:00.000Z") });
  document.revision = 10;
  document.uml.classes.push(
    { id: CLIENTE_ID, name: "Cliente", visibility: "public", attributes: [{ id: NOMBRE_ID, name: "nombre", visibility: "private", type: primitiveType("string") }], operations: [] },
    { id: PEDIDO_ID, name: "Pedido", visibility: "public", attributes: [], operations: [] },
  );
  document.layout.elements.push({ elementId: CLIENTE_ID, x: 0, y: 0 }, { elementId: PEDIDO_ID, x: 240, y: 0 });
  return document;
}

const intent = (overrides: Partial<AddAttributeProposalIntent> = {}): MentorProposalIntent => ({
  operation: "ADD_ATTRIBUTE",
  className: "Cliente",
  attributeName: "teléfono",
  attributeType: "String",
  ...overrides,
});

const fixedId = () => ATTRIBUTE_ID;

describe("resolveMentorProposal", () => {
  it("R-01 resuelve Cliente + teléfono:String en un AddAttribute con classId real y attributeId del servidor", () => {
    const result = resolveMentorProposal(documentFixture(), intent(), { uuidFactory: fixedId });

    expect(result).toEqual({
      ok: true,
      command: { type: "AddAttribute", classId: CLIENTE_ID, attributeId: ATTRIBUTE_ID, name: "teléfono", attributeType: { kind: "primitive", name: "string" } },
      operation: { kind: "ADD_ATTRIBUTE", target: { className: "Cliente" }, change: { attributeName: "teléfono", attributeType: "string" } },
    });
  });

  it("R-02 la intención no contiene UUID; los identificadores solo aparecen en el comando resuelto", () => {
    const input = intent();
    expect(JSON.stringify(input)).not.toMatch(UUID);

    const result = resolveMentorProposal(documentFixture(), input, { uuidFactory: fixedId });
    if (!result.ok) throw new Error("se esperaba una resolución correcta");
    expect(JSON.stringify(result.operation)).not.toMatch(UUID);
    expect(result.command.classId).toBe(CLIENTE_ID);
    expect(result.command.attributeId).toBe(ATTRIBUTE_ID);
  });

  it("R-03 una clase inexistente devuelve ELEMENT_NOT_FOUND sin generar identificadores", () => {
    let generated = 0;
    const result = resolveMentorProposal(documentFixture(), intent({ className: "Proveedor" }), { uuidFactory: () => { generated += 1; return ATTRIBUTE_ID; } });

    expect(result).toEqual({ ok: false, error: { code: "ELEMENT_NOT_FOUND", message: expect.any(String), diagnostics: [] } });
    expect(generated).toBe(0);
  });

  it("no acepta coincidencias parciales ni nombres vacíos", () => {
    for (const className of ["Client", "Clientes", "Cli", "", "   "]) {
      const result = resolveMentorProposal(documentFixture(), intent({ className }), { uuidFactory: fixedId });
      expect(result.ok ? undefined : result.error.code).toBe("ELEMENT_NOT_FOUND");
    }
  });

  it("compara el nombre de clase con la regla de uml-core (trim y minúsculas) y publica el nombre canónico", () => {
    const result = resolveMentorProposal(documentFixture(), intent({ className: "  cliente " }), { uuidFactory: fixedId });
    if (!result.ok) throw new Error("se esperaba una resolución correcta");
    expect(result.command.classId).toBe(CLIENTE_ID);
    expect(result.operation.target.className).toBe("Cliente");
  });

  it("rechaza como ELEMENT_NOT_FOUND un nombre de clase ambiguo entre paquetes en vez de escoger uno", () => {
    const document = documentFixture();
    document.uml.classes.push({ id: "00000000-0000-4000-8000-000000000030", name: "Cliente", visibility: "public", packageId: "00000000-0000-4000-8000-000000000099", attributes: [], operations: [] });

    const result = resolveMentorProposal(document, intent(), { uuidFactory: fixedId });
    expect(result).toEqual({ ok: false, error: { code: "ELEMENT_NOT_FOUND", message: expect.stringContaining("ambiguo"), diagnostics: [] } });
  });

  it("rechaza como UNSUPPORTED_OPERATION una operación fuera de la allow-list recibida en tiempo de ejecución", () => {
    const forged = { ...intent(), operation: "DELETE_CLASS" } as unknown as MentorProposalIntent;
    const result = resolveMentorProposal(documentFixture(), forged, { uuidFactory: fixedId });
    expect(result.ok ? undefined : result.error.code).toBe("UNSUPPORTED_OPERATION");
  });

  it("R-04 normaliza los tipos con normalizePrimitiveTypeName de uml-core", () => {
    const cases: ReadonlyArray<readonly [string, string]> = [["String", "string"], ["string", "string"], ["int", "integer"], ["Integer", "integer"], ["double", "number"], ["boolean", "boolean"], ["LocalDate", "date"], ["timestamp", "datetime"]];
    for (const [attributeType, expected] of cases) {
      const result = resolveMentorProposal(documentFixture(), intent({ attributeType }), { uuidFactory: fixedId });
      if (!result.ok) throw new Error(`se esperaba resolver ${attributeType}`);
      expect(result.command.attributeType).toEqual({ kind: "primitive", name: expected });
      expect(result.operation.change.attributeType).toBe(expected);
    }
  });

  it("R-05 un tipo desconocido devuelve UNKNOWN_TYPE sin respaldo a string", () => {
    for (const attributeType of ["Money", "Cliente", "", "lista"]) {
      const result = resolveMentorProposal(documentFixture(), intent({ attributeType }), { uuidFactory: fixedId });
      expect(result.ok ? undefined : result.error.code).toBe("UNKNOWN_TYPE");
    }
  });

  it("R-06 conserva el nombre del atributo tal como se pidió, solo recortado", () => {
    for (const [attributeName, expected] of [["teléfono", "teléfono"], ["telefono", "telefono"], ["fechaNacimiento", "fechaNacimiento"], ["  teléfono  ", "teléfono"]] as const) {
      const result = resolveMentorProposal(documentFixture(), intent({ attributeName }), { uuidFactory: fixedId });
      if (!result.ok) throw new Error("se esperaba una resolución correcta");
      expect(result.command.name).toBe(expected);
      expect(result.operation.change.attributeName).toBe(expected);
    }
  });

  it("R-07 sin multiplicidad no se asume ninguna", () => {
    const result = resolveMentorProposal(documentFixture(), intent(), { uuidFactory: fixedId });
    if (!result.ok) throw new Error("se esperaba una resolución correcta");
    expect(result.command).not.toHaveProperty("multiplicity");
    expect(result.operation.change).not.toHaveProperty("multiplicity");
  });

  it("R-08 transforma multiplicidades válidas y publica su forma canónica", () => {
    const cases = [
      ["1", { lower: 1, upper: 1 }, "1"],
      ["0..1", { lower: 0, upper: 1 }, "0..1"],
      ["0..*", { lower: 0, upper: "unbounded" }, "0..*"],
      ["1..*", { lower: 1, upper: "unbounded" }, "1..*"],
      ["2..5", { lower: 2, upper: 5 }, "2..5"],
      ["1..1", { lower: 1, upper: 1 }, "1"],
      [" 0..* ", { lower: 0, upper: "unbounded" }, "0..*"],
    ] as const;
    for (const [multiplicity, expected, text] of cases) {
      const result = resolveMentorProposal(documentFixture(), intent({ multiplicity }), { uuidFactory: fixedId });
      if (!result.ok) throw new Error(`se esperaba resolver ${multiplicity}`);
      expect(result.command.multiplicity).toEqual(expected);
      expect(result.operation.change.multiplicity).toBe(text);
    }
  });

  it("R-09 rechaza un rango invertido como INVALID_PROPOSAL", () => {
    const result = resolveMentorProposal(documentFixture(), intent({ multiplicity: "5..2" }), { uuidFactory: fixedId });
    expect(result.ok ? undefined : result.error.code).toBe("INVALID_PROPOSAL");
  });

  it("R-10 rechaza sintaxis de multiplicidad inválida", () => {
    for (const multiplicity of ["muchos", "*", "", "1..", "..1", "01", "1 .. 2", "-1", "1.5", "0..*..1", "n..m"]) {
      const result = resolveMentorProposal(documentFixture(), intent({ multiplicity }), { uuidFactory: fixedId });
      expect(result.ok ? undefined : result.error.code).toBe("INVALID_PROPOSAL");
    }
  });

  it("R-11 usa el uuidFactory inyectado una sola vez y de forma determinista", () => {
    const ids = [ATTRIBUTE_ID, "00000000-0000-4000-8000-0000000000a2"];
    let calls = 0;
    const factory = () => ids[calls++]!;

    const first = resolveMentorProposal(documentFixture(), intent(), { uuidFactory: factory });
    const second = resolveMentorProposal(documentFixture(), intent(), { uuidFactory: () => ATTRIBUTE_ID });

    expect(calls).toBe(1);
    if (!first.ok || !second.ok) throw new Error("se esperaba una resolución correcta");
    expect(first.command.attributeId).toBe(ATTRIBUTE_ID);
    expect(first).toEqual(second);
  });

  it("no muta el documento autoritativo", () => {
    const document = documentFixture();
    const before = structuredClone(document);
    resolveMentorProposal(document, intent({ multiplicity: "0..1" }), { uuidFactory: fixedId });
    resolveMentorProposal(document, intent({ className: "Nadie" }), { uuidFactory: fixedId });
    expect(document).toEqual(before);
  });
});

describe("multiplicidad", () => {
  it("parsea n, n..m y n..* con enteros no negativos y m >= n", () => {
    expect(parseMentorProposalMultiplicity("0")).toEqual({ lower: 0, upper: 0 });
    expect(parseMentorProposalMultiplicity("3..3")).toEqual({ lower: 3, upper: 3 });
    expect(parseMentorProposalMultiplicity("10..20")).toEqual({ lower: 10, upper: 20 });
    expect(parseMentorProposalMultiplicity("99999999999999999999")).toBeUndefined();
  });

  it("formatea de forma canónica", () => {
    expect(formatMentorProposalMultiplicity({ lower: 1, upper: 1 })).toBe("1");
    expect(formatMentorProposalMultiplicity({ lower: 0, upper: 1 })).toBe("0..1");
    expect(formatMentorProposalMultiplicity({ lower: 1, upper: "unbounded" })).toBe("1..*");
  });
});

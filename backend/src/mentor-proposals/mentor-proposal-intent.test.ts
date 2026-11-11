import { describe, expect, it } from "vitest";
import { MENTOR_PROPOSAL_INTENT_SCHEMA, MENTOR_PROPOSAL_UNSUPPORTED_OUTPUT, namesAreLiteral, parseMentorProposalIntent } from "./mentor-proposal-intent";

const VALID = { operation: "ADD_ATTRIBUTE", className: "Cliente", attributeName: "teléfono", attributeType: "String" } as const;
const UUID = "00000000-0000-4000-8000-000000000010";

const invalid = expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "INVALID_PROPOSAL", diagnostics: [] }) });

describe("parseMentorProposalIntent: validación estricta de la salida del modelo", () => {
  it("AI-01: acepta ADD_ATTRIBUTE válido, solo recortando; el tipo sigue siendo texto", () => {
    expect(parseMentorProposalIntent({ ...VALID, attributeName: "  teléfono " })).toEqual({ ok: true, intent: VALID });
    // No guessing: an unknown type is left for the resolver to reject.
    expect(parseMentorProposalIntent({ ...VALID, attributeType: "Strng" })).toEqual({ ok: true, intent: { ...VALID, attributeType: "Strng" } });
  });

  it("v1: una multiplicidad generada es un campo no permitido, aunque sea válida", () => {
    for (const multiplicity of ["*", "0..1", "1"]) expect(parseMentorProposalIntent({ ...VALID, multiplicity })).toEqual(invalid);
  });

  it.each([
    ["classId", { ...VALID, classId: UUID }],
    ["attributeId", { ...VALID, attributeId: UUID }],
    ["id", { ...VALID, id: UUID }],
    ["UUID como nombre de clase", { ...VALID, className: UUID }],
    ["UUID dentro del nombre del atributo", { ...VALID, attributeName: `campo_${UUID}` }],
  ])("AI-02: rechaza identificadores enviados por la IA (%s)", (_case, output) => {
    expect(parseMentorProposalIntent(output)).toEqual(invalid);
  });

  it.each(["DELETE_CLASS", "CREATE_CLASS", "add_attribute", MENTOR_PROPOSAL_UNSUPPORTED_OUTPUT])("AI-03: la operación %s queda fuera de la allow-list", (operation) => {
    expect(parseMentorProposalIntent({ ...VALID, operation })).toEqual({ ok: false, error: { code: "UNSUPPORTED_OPERATION", message: "La operación propuesta no está soportada.", diagnostics: [] } });
    expect(parseMentorProposalIntent({ operation })).toMatchObject({ ok: false, error: { code: "UNSUPPORTED_OPERATION" } });
  });

  it.each([
    ["texto JSON (sin parseo textual)", JSON.stringify(VALID)],
    ["null", null],
    ["arreglo", [VALID]],
    ["número", 42],
    ["instancia no plana", new Map(Object.entries(VALID))],
  ])("AI-04: una salida que no es un objeto JSON plano es INVALID_PROPOSAL (%s)", (_case, output) => {
    expect(parseMentorProposalIntent(output)).toEqual(invalid);
  });

  it.each(["operation", "className", "attributeName", "attributeType"])("AI-05: falta %s → INVALID_PROPOSAL", (field) => {
    const output: Record<string, unknown> = { ...VALID };
    delete output[field];
    expect(parseMentorProposalIntent(output)).toEqual(invalid);
  });

  it.each(["command", "baseRevision", "status", "reason", "projectId", "diff"])("AI-15: un campo adicional (%s) se rechaza", (field) => {
    expect(parseMentorProposalIntent({ ...VALID, [field]: "x" })).toEqual(invalid);
  });

  it.each([
    ["string vacío", { ...VALID, className: "" }],
    ["solo espacios", { ...VALID, attributeName: "   " }],
    ["número", { ...VALID, attributeType: 1 }],
    ["null", { ...VALID, className: null }],
    ["objeto", { ...VALID, attributeType: { kind: "primitive", name: "string" } }],
    ["arreglo", { ...VALID, attributeName: ["teléfono"] }],
    ["multiplicidad null", { ...VALID, multiplicity: null }],
    ["multiplicidad vacía", { ...VALID, multiplicity: "" }],
    ["multiplicidad numérica", { ...VALID, multiplicity: 1 }],
    ["carácter de control", { ...VALID, attributeName: "telé\nfono" }],
    ["demasiado largo", { ...VALID, className: "C".repeat(81) }],
    ["operación no textual", { ...VALID, operation: 1 }],
  ])("tipos incorrectos y strings vacíos son INVALID_PROPOSAL (%s)", (_case, output) => {
    expect(parseMentorProposalIntent(output)).toEqual(invalid);
  });
});

describe("MENTOR_PROPOSAL_INTENT_SCHEMA: schema cerrado de la generación", () => {
  const variants = MENTOR_PROPOSAL_INTENT_SCHEMA.oneOf;

  it("cada variante es un objeto cerrado y todas sus propiedades son obligatorias", () => {
    for (const variant of variants) {
      expect(variant.type).toBe("object");
      expect(variant.additionalProperties).toBe(false);
      expect([...variant.required].sort()).toEqual(Object.keys(variant.properties).sort());
    }
  });

  it("solo admite ADD_ATTRIBUTE y la salida UNSUPPORTED, sin multiplicidad ni campos de identificador", () => {
    expect(variants.map((variant) => variant.properties.operation.const)).toEqual(["ADD_ATTRIBUTE", "UNSUPPORTED"]);
    const keys = new Set(variants.flatMap((variant) => Object.keys(variant.properties)));
    expect([...keys].sort()).toEqual(["attributeName", "attributeType", "className", "operation"]);
    expect(JSON.stringify(MENTOR_PROPOSAL_INTENT_SCHEMA)).not.toContain("multiplicity");
    expect(JSON.stringify(MENTOR_PROPOSAL_INTENT_SCHEMA)).not.toMatch(/[iI]d"|uuid|command|revision/);
  });

  it("className es texto libre (sin enum de clases) para que una clase inexistente no se fuerce sobre otra", () => {
    for (const variant of variants.slice(0, 1)) expect(variant.properties).toMatchObject({ className: { type: "string", minLength: 1, maxLength: 80 } });
    expect(JSON.stringify(MENTOR_PROPOSAL_INTENT_SCHEMA)).not.toContain("enum");
  });

  it("toda salida conforme a la variante ADD_ATTRIBUTE pasa la validación estricta", () => {
    expect(parseMentorProposalIntent(VALID).ok).toBe(true);
  });
});

describe("namesAreLiteral: preservación literal de nombres", () => {
  const INSTRUCTION = "Agrega el atributo teléfono de tipo String a Cliente";

  it("acepta nombres que aparecen exactamente en la instrucción", () => {
    expect(namesAreLiteral(INSTRUCTION, { className: "Cliente", attributeName: "teléfono" })).toBe(true);
  });

  it("la clase (existente, resuelta sin distinguir mayúsculas) se compara ignorando solo mayúsculas", () => {
    // The user writes "cliente"; the model answers with the real class name from the class list.
    expect(namesAreLiteral("Agrega el atributo telefono de tipo string a cliente", { className: "Cliente", attributeName: "telefono" })).toBe(true);
    expect(namesAreLiteral(INSTRUCTION, { className: "cliente", attributeName: "teléfono" })).toBe(true);
    expect(namesAreLiteral("Agrega el atributo nota a ÁREA", { className: "Área", attributeName: "nota" })).toBe(true);
  });

  it.each([
    ["sin tilde", { className: "Cliente", attributeName: "telefono" }],
    ["clase con tilde añadida", { className: "Clíente", attributeName: "teléfono" }],
    ["clase en plural", { className: "Clientes", attributeName: "teléfono" }],
    ["clase traducida", { className: "Customer", attributeName: "teléfono" }],
    ["atributo normalizado", { className: "Cliente", attributeName: "Teléfono" }],
    ["atributo traducido", { className: "Cliente", attributeName: "phone" }],
  ])("rechaza un nombre alterado (%s)", (_case, names) => {
    expect(namesAreLiteral(INSTRUCTION, names)).toBe(false);
  });

  it("no comprueba el tipo: String → string lo normaliza el resolver", () => {
    expect(namesAreLiteral("Agrega el atributo edad de tipo entero a Cliente", { className: "Cliente", attributeName: "edad" })).toBe(true);
  });
});

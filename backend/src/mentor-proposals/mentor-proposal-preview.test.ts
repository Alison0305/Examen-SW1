import { createProjectDocument, primitiveType, type Diagnostic, type ProjectDocument } from "@examen-sw1/uml-core";
import { describe, expect, it } from "vitest";
import type { AddAttributeProposalCommand } from "./mentor-proposal.contracts";
import { previewMentorProposal, toMentorProposalDiagnostic } from "./mentor-proposal-preview";
import { resolveMentorProposal } from "./mentor-proposal-resolver";

const DOCUMENT_ID = "00000000-0000-4000-8000-000000000001";
const CLIENTE_ID = "00000000-0000-4000-8000-000000000010";
const NOMBRE_ID = "00000000-0000-4000-8000-000000000011";
const ATTRIBUTE_ID = "00000000-0000-4000-8000-0000000000a1";
const NOW = new Date("2026-11-10T12:00:00.000Z");

function documentFixture(): ProjectDocument {
  const document = createProjectDocument({ id: DOCUMENT_ID, now: new Date("2026-11-10T00:00:00.000Z") });
  document.revision = 10;
  document.uml.classes.push({ id: CLIENTE_ID, name: "Cliente", visibility: "public", attributes: [{ id: NOMBRE_ID, name: "nombre", visibility: "private", type: primitiveType("string") }], operations: [] });
  document.layout.elements.push({ elementId: CLIENTE_ID, x: 0, y: 0 });
  return document;
}

function resolvedCommand(document: ProjectDocument, attributeName = "teléfono", multiplicity?: string): AddAttributeProposalCommand {
  const result = resolveMentorProposal(document, { operation: "ADD_ATTRIBUTE", className: "Cliente", attributeName, attributeType: "String", ...(multiplicity ? { multiplicity } : {}) }, { uuidFactory: () => ATTRIBUTE_ID });
  if (!result.ok) throw new Error("se esperaba una resolución correcta");
  return result.command;
}

describe("previewMentorProposal", () => {
  it("P-01 un atributo nuevo produce un candidato válido sin modificar el documento original", () => {
    const document = documentFixture();
    const before = structuredClone(document);
    const command = resolvedCommand(document);

    const preview = previewMentorProposal(document, command, { nowFactory: () => NOW });

    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    const cliente = preview.candidate.uml.classes.find((umlClass) => umlClass.id === CLIENTE_ID)!;
    expect(cliente.attributes.map((attribute) => attribute.name)).toEqual(["nombre", "teléfono"]);
    expect(cliente.attributes[1]).toEqual({ id: ATTRIBUTE_ID, name: "teléfono", visibility: "private", type: { kind: "primitive", name: "string" } });
    expect(preview.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
    expect(document).toEqual(before);
    expect(preview.candidate.layout).toEqual(before.layout);
  });

  it("P-02 la revisión base sigue en 10; solo el candidato refleja la revisión potencial 11", () => {
    const document = documentFixture();
    const preview = previewMentorProposal(document, resolvedCommand(document));

    expect(document.revision).toBe(10);
    expect(preview.baseRevision).toBe(10);
    expect(preview.ok && preview.candidate.revision).toBe(11);
  });

  it("P-03 un atributo duplicado produce un preview inválido como INVALID_PROPOSAL con diagnósticos UML", () => {
    const document = documentFixture();
    document.uml.classes[0]!.attributes.push({ id: "00000000-0000-4000-8000-000000000012", name: "teléfono", visibility: "private", type: primitiveType("string") });
    const before = structuredClone(document);

    const preview = previewMentorProposal(document, resolvedCommand(document));

    expect(preview).toEqual({
      ok: false,
      baseRevision: 10,
      error: { code: "INVALID_PROPOSAL", message: expect.any(String), diagnostics: expect.arrayContaining([expect.objectContaining({ code: "UML_DUPLICATE_NAME", severity: "error" })]) },
    });
    expect(document).toEqual(before);
  });

  it("detecta duplicados con la regla canónica de uml-core (sin distinguir mayúsculas)", () => {
    const document = documentFixture();
    const preview = previewMentorProposal(document, resolvedCommand(document, "Nombre"));
    expect(preview.ok ? undefined : preview.error.code).toBe("INVALID_PROPOSAL");
  });

  it("P-04 los diagnósticos públicos no contienen path, elementId ni identificadores", () => {
    const document = documentFixture();
    document.uml.classes[0]!.attributes.push({ id: "00000000-0000-4000-8000-000000000012", name: "teléfono", visibility: "private", type: primitiveType("string") });

    const preview = previewMentorProposal(document, resolvedCommand(document));
    if (preview.ok) throw new Error("se esperaba un preview inválido");

    expect(preview.error.diagnostics.length).toBeGreaterThan(0);
    for (const diagnostic of preview.error.diagnostics) {
      expect(Object.keys(diagnostic).sort()).toEqual(["code", "message", "severity"]);
    }
    expect(JSON.stringify(preview.error)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
  });

  it("la proyección de un diagnóstico descarta path, elementId y cualquier propiedad adicional", () => {
    const internal = { severity: "error", code: "UML_DUPLICATE_NAME", message: "Duplicado.", path: "classes[0].attributes[1].name", elementId: ATTRIBUTE_ID, extra: "interno" } as Diagnostic & { extra: string };
    expect(toMentorProposalDiagnostic(internal)).toEqual({ code: "UML_DUPLICATE_NAME", severity: "error", message: "Duplicado." });
  });

  it("P-05 el mismo comando contra el mismo documento produce el mismo preview", () => {
    const document = documentFixture();
    const command = resolvedCommand(document, "teléfono", "0..1");

    const first = previewMentorProposal(document, command, { nowFactory: () => NOW });
    const second = previewMentorProposal(document, command, { nowFactory: () => NOW });

    expect(first).toEqual(second);
    expect(first.ok && first.candidate.uml).toEqual(second.ok && second.candidate.uml);
  });

  it("P-06 el candidato usa exactamente el attributeId ya resuelto, sin generar otro", () => {
    const document = documentFixture();
    const command = resolvedCommand(document);

    const preview = previewMentorProposal(document, command);
    if (!preview.ok) throw new Error("se esperaba un preview válido");

    const ids = preview.candidate.uml.classes.flatMap((umlClass) => umlClass.attributes.map((attribute) => attribute.id));
    expect(ids).toEqual([NOMBRE_ID, ATTRIBUTE_ID]);
  });

  it("una clase que ya no existe en el documento produce INVALID_PROPOSAL", () => {
    const document = documentFixture();
    const command = resolvedCommand(document);
    document.uml.classes = [];
    document.layout.elements = [];

    const preview = previewMentorProposal(document, command);
    expect(preview.ok ? undefined : preview.error.code).toBe("INVALID_PROPOSAL");
  });

  it("resolver y preview juntos dejan intacto el documento autoritativo", () => {
    const document = documentFixture();
    const before = structuredClone(document);
    const command = resolvedCommand(document, "fechaNacimiento", "1");
    previewMentorProposal(document, command);
    previewMentorProposal(document, command);
    expect(document).toEqual(before);
  });
});

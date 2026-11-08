import { describe, expect, it } from "vitest";
import { createProjectDocument, primitiveType } from "@examen-sw1/uml-core";
import { MentorContextBuilder } from "./mentor-context.builder";

describe("MentorContextBuilder", () => {
  it("proyecta solo el UML semántico del proyecto y excluye layout", () => {
    const document = createProjectDocument({ id: "doc-a", now: new Date("2026-11-07T00:00:00.000Z") });
    document.uml.classes.push({ id: "class-a", name: "Pedido", visibility: "public", attributes: [{ id: "attribute-a", name: "total", visibility: "private", type: primitiveType("number") }], operations: [] });
    document.uml.enumerations.push({ id: "enum-a", name: "Estado", visibility: "public", literals: ["NUEVO"] });
    document.uml.relationships.push({ id: "relationship-a", type: "Association", sourceId: "class-a", targetId: "enum-a", sourceMultiplicity: { lower: 1, upper: 1 }, targetMultiplicity: { lower: 0, upper: "unbounded" } });
    document.layout.elements.push({ elementId: "class-a", x: 999, y: 123 });

    const context = new MentorContextBuilder().build({ name: "Proyecto A", revision: 4, document });

    expect(context).toEqual({
      projectName: "Proyecto A",
      revision: 4,
      classes: [{ name: "Pedido", attributes: [{ name: "total", type: "number", multiplicity: undefined }] }],
      enumerations: [{ name: "Estado", literals: ["NUEVO"] }],
      relationships: [{ type: "Association", source: "Pedido", target: "Estado", sourceToTarget: "Por cada Pedido, existen 0..* instancias de Estado relacionadas.", targetToSource: "Por cada Estado, existen 1..1 instancias de Pedido relacionadas." }],
      elementNames: ["Estado", "Pedido"],
    });
    expect(JSON.stringify(context)).not.toContain("999");
    expect(JSON.stringify(context)).not.toContain("layout");
    expect(JSON.stringify(context)).not.toContain("DATABASE_URL");
  });

  it("expresa multiplicidades de asociación en la dirección del extremo opuesto", () => {
    const document = createProjectDocument({ id: "doc-b", now: new Date("2026-11-07T00:00:00.000Z") });
    document.uml.classes.push(
      { id: "client", name: "Cliente", visibility: "public", attributes: [], operations: [] },
      { id: "order", name: "Pedido", visibility: "public", attributes: [], operations: [] },
    );
    document.uml.relationships.push({ id: "relationship-b", type: "Association", sourceId: "client", targetId: "order", sourceMultiplicity: { lower: 1, upper: 1 }, targetMultiplicity: { lower: 0, upper: "unbounded" } });

    const context = new MentorContextBuilder().build({ name: "Ventas", revision: 1, document });

    expect(context.relationships).toEqual([{
      type: "Association",
      source: "Cliente",
      target: "Pedido",
      sourceToTarget: "Por cada Cliente, existen 0..* instancias de Pedido relacionadas.",
      targetToSource: "Por cada Pedido, existen 1..1 instancias de Cliente relacionadas.",
    }]);
  });
});

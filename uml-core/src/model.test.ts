import { describe, expect, it } from "vitest";
import {
  createEmptyCanonicalUmlModel,
  createProjectDocument,
  deserializeProjectDocument,
  serializeProjectDocument,
} from "./index.js";

const uuid = "11111111-1111-4111-8111-111111111111";
const elementId = "22222222-2222-4222-8222-222222222222";
const timestamp = new Date("2026-09-04T10:00:00.000Z");

describe("ProjectDocument base", () => {
  it("crea un documento vacío con UUID, revisión inicial, timestamps, UML y layout vacíos", () => {
    const document = createProjectDocument({ now: timestamp, uuidFactory: () => uuid });

    expect(document).toEqual({
      id: uuid,
      revision: 1,
      createdAt: "2026-09-04T10:00:00.000Z",
      updatedAt: "2026-09-04T10:00:00.000Z",
      uml: {
        classes: [],
        enumerations: [],
        packages: [],
        relationships: [],
      },
      layout: {
        elements: [],
      },
    });
  });

  it("serializa y reconstruye un documento vacío sin pérdida", () => {
    const document = createProjectDocument({ now: timestamp, uuidFactory: () => uuid });

    const reconstructed = deserializeProjectDocument(serializeProjectDocument(document));

    expect(reconstructed).toEqual(document);
  });

  it("mantiene DiagramLayout separado del contenido semántico", () => {
    const document = createProjectDocument({ now: timestamp, uuidFactory: () => uuid });
    const semanticBefore = structuredClone(document.uml);

    document.layout.elements.push({
      elementId,
      x: 10,
      y: 20,
      width: 120,
      height: 80,
    });

    expect(document.uml).toEqual(semanticBefore);
    expect(document.layout.elements[0]).toEqual({
      elementId,
      x: 10,
      y: 20,
      width: 120,
      height: 80,
    });
    expect(document.layout.elements[0]).not.toHaveProperty("name");
    expect(document.layout.elements[0]).not.toHaveProperty("attributes");
    expect(document.layout.elements[0]).not.toHaveProperty("operations");
    expect(document.layout.elements[0]).not.toHaveProperty("relationships");
    expect(document.layout.elements[0]).not.toHaveProperty("multiplicity");
    expect(document.layout.elements[0]).not.toHaveProperty("type");
    expect(document.layout.elements[0]).not.toHaveProperty("packageId");
    expect(document.layout.elements[0]).not.toHaveProperty("generationMetadata");
  });

  it("crea modelos canónicos vacíos con colecciones UML base", () => {
    expect(createEmptyCanonicalUmlModel()).toEqual({
      classes: [],
      enumerations: [],
      packages: [],
      relationships: [],
    });
  });
});

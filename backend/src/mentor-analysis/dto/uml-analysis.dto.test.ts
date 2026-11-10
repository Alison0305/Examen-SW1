import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { toUmlAnalysisFocus, UmlAnalysisBodyPipe } from "./uml-analysis.dto";

// Validated through the same pipe the endpoint uses: non-object guard + DtoValidationPipe (whitelist + forbidNonWhitelisted).
const pipe = new UmlAnalysisBodyPipe();
const CLASS_ID = "550e8400-e29b-41d4-a716-446655440000";
const RELATIONSHIP_ID = "550e8400-e29b-41d4-a716-446655440001";

const accepts = (body: unknown) => toUmlAnalysisFocus(pipe.transform(body));
const rejects = (body: unknown) => expect(() => pipe.transform(body)).toThrow(BadRequestException);

describe("UmlAnalysisDto", () => {
  it("D-01: acepta class con UUID", () => {
    expect(accepts({ focus: { kind: "class", id: CLASS_ID } })).toEqual({ kind: "class", id: CLASS_ID });
  });

  it("D-02: acepta relationship con UUID", () => {
    expect(accepts({ focus: { kind: "relationship", id: RELATIONSHIP_ID } })).toEqual({ kind: "relationship", id: RELATIONSHIP_ID });
  });

  it("D-03: acepta model sin id", () => {
    expect(accepts({ focus: { kind: "model" } })).toEqual({ kind: "model" });
  });

  it("D-04: rechaza un kind desconocido o no textual", () => {
    for (const kind of ["enumeration", "CLASS", "", 1, null, undefined]) rejects({ focus: { kind, id: CLASS_ID } });
  });

  it("D-05: rechaza class sin id", () => {
    rejects({ focus: { kind: "class" } });
  });

  it("D-06: rechaza relationship sin id", () => {
    rejects({ focus: { kind: "relationship" } });
  });

  it("D-07: rechaza un id que no es UUID", () => {
    for (const id of ["550e8400", "no-es-un-uuid", "550e8400-e29b-41d4-a716-44665544000Z", 42, { id: CLASS_ID }]) rejects({ focus: { kind: "class", id } });
  });

  it("D-08: rechaza model con id, aunque sea un UUID válido", () => {
    rejects({ focus: { kind: "model", id: CLASS_ID } });
    rejects({ focus: { kind: "model", id: null } });
  });

  it("D-09: rechaza un body sin focus o con focus no objeto", () => {
    for (const body of [{}, { focus: null }, { focus: "class" }, { focus: [] }]) rejects(body);
  });

  it("D-10: rechaza un body vacío o no objeto con 400 (el pipe compartido daría un TypeError con undefined o null)", () => {
    for (const body of [undefined, null, "", "focus", 42, [], [{ focus: { kind: "model" } }]]) rejects(body);
  });

  it("D-11: rechaza propiedades adicionales en el body y dentro de focus", () => {
    rejects({ focus: { kind: "class", id: CLASS_ID }, userId: "otro-usuario" });
    rejects({ focus: { kind: "model" }, question: "Explica todo" });
    rejects({ focus: { kind: "model" }, model: { classes: [] } });
    rejects({ focus: { kind: "model" }, revision: 3 });
    rejects({ focus: { kind: "class", id: CLASS_ID, name: "Cliente" } });
    rejects({ focus: { kind: "class", id: CLASS_ID, userId: "otro-usuario" } });
  });

  it("D-12: rechaza un id vacío o con espacios", () => {
    rejects({ focus: { kind: "class", id: "" } });
    rejects({ focus: { kind: "relationship", id: ` ${RELATIONSHIP_ID} ` } });
  });
});

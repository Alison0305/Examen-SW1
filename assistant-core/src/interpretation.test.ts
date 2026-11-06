import { describe, expect, it } from "vitest";
import type { DomainManifestOperation, DomainManifestV1 } from "@examen-sw1/spring-generator";
import {
  buildDataInterpretationPrompt,
  buildDataInterpretationSchema,
  buildUmlInterpretationPrompt,
  buildUmlInterpretationSchema,
  INTERPRETATION_SCHEMA_MAX_BYTES,
  interpretationSchemaBytes,
  interpretStrictDataText,
  isStrictAssistantCommandText,
  isStrictUmlProposalText,
  parseUmlModelOutput,
  resolveDataOutput,
  resolveUmlProposalByName,
} from "./index.js";

const operations = (name: string): readonly DomainManifestOperation[] => ["list", "get", "create", "update", "delete", "count"].map((prefix) => ({ name: `${prefix}${name}`, method: "GET", path: `/api/v1/${name.toLowerCase()}` }));
const manifest: DomainManifestV1 = {
  schemaVersion: 1,
  entities: [
    { name: "rol", resourceName: "rol", attributes: [{ name: "id", type: "BIGINT", required: true, identifier: true, unique: false, searchable: false, sortable: true, defaultSort: "ASC" }, { name: "nombre", type: "VARCHAR", required: true, identifier: false, unique: true, searchable: true, sortable: true, defaultSort: null }], relations: [{ name: "usuario", target: "usuario", cardinality: "ONE_TO_MANY", lifecycle: "NONE", required: false }], operations: operations("Rol") },
    { name: "usuario", resourceName: "usuario", attributes: [{ name: "id", type: "BIGINT", required: true, identifier: true, unique: false, searchable: false, sortable: true, defaultSort: "ASC" }, { name: "nombre", type: "VARCHAR", required: true, identifier: false, unique: false, searchable: false, sortable: true, defaultSort: null }, { name: "activo", type: "BOOLEAN", required: true, identifier: false, unique: false, searchable: false, sortable: false, defaultSort: null }, { name: "saldo", type: "NUMERIC", required: true, identifier: false, unique: false, searchable: false, sortable: false, defaultSort: null }, { name: "alta", type: "DATE", required: true, identifier: false, unique: false, searchable: false, sortable: false, defaultSort: null }], relations: [], operations: [{ name: "listUsuario", method: "GET", path: "/api/v1/usuario" }, { name: "countUsuario", method: "GET", path: "/api/v1/usuario/count" }] },
  ],
};
const classes = [{ id: "c-1", name: "Paciente" }, { id: "c-2", name: "Doctor" }];

type Variant = { properties: Record<string, Record<string, unknown>>; required: string[]; additionalProperties: boolean };
const variants = (schema: Readonly<Record<string, unknown>>): Variant[] => schema.oneOf as Variant[];
const operationsOf = (schema: Readonly<Record<string, unknown>>): unknown[] => variants(schema).flatMap((variant) => { const operation = variant.properties.operation!; return "const" in operation ? [operation.const] : operation.enum as unknown[]; });

describe("buildUmlInterpretationSchema", () => {
  it("restringe targetName a las clases existentes y siempre ofrece UNSUPPORTED", () => {
    const schema = buildUmlInterpretationSchema([...classes, { id: "c-3", name: "Paciente" }]);
    expect(operationsOf(schema)).toEqual(["CREATE_CLASS", "RENAME_CLASS", "DELETE_CLASS", "UNSUPPORTED"]);
    const rename = variants(schema).find((variant) => variant.properties.operation!.const === "RENAME_CLASS")!;
    expect(rename.properties.targetName).toEqual({ enum: ["Paciente", "Doctor"] });
    expect(variants(schema).every((variant) => variant.additionalProperties === false)).toBe(true);
  });

  it("sin clases solo permite CREATE_CLASS y UNSUPPORTED, sin enums vacíos", () => {
    const schema = buildUmlInterpretationSchema([]);
    expect(operationsOf(schema)).toEqual(["CREATE_CLASS", "UNSUPPORTED"]);
    expect(JSON.stringify(schema)).not.toContain('"enum":[]');
  });
});

describe("buildDataInterpretationSchema", () => {
  it("genera variantes solo para operaciones declaradas por entidad, con tipos del manifest", () => {
    const schema = buildDataInterpretationSchema(manifest);
    const entityOf = (variant: Variant) => variant.properties.entity?.const;
    const rol = variants(schema).filter((variant) => entityOf(variant) === "rol");
    const usuario = variants(schema).filter((variant) => entityOf(variant) === "usuario");
    expect(rol.flatMap((variant) => "const" in variant.properties.operation! ? [variant.properties.operation!.const] : variant.properties.operation!.enum as unknown[])).toEqual(["LIST", "COUNT", "LIST", "GET", "DELETE", "CREATE", "UPDATE", "SEARCH"]);
    expect(usuario.map((variant) => variant.properties.operation)).toEqual([{ enum: ["LIST", "COUNT"] }]);
    const getVariant = rol.find((variant) => JSON.stringify(variant.properties.operation).includes("GET"))!;
    expect(getVariant.properties.identifier).toEqual({ type: "integer" });
    const update = rol.find((variant) => variant.properties.operation!.const === "UPDATE")!;
    expect(Object.keys((update.properties.fields as { properties: object }).properties)).toEqual(["nombre"]);
    expect(update.properties.fields).toMatchObject({ required: [], additionalProperties: false, minProperties: 1 });
    expect(operationsOf(schema).at(-1)).toBe("UNSUPPORTED");
  });

  it("no ofrece SEARCH sin atributos buscables y mide el tamaño del schema", () => {
    const schema = buildDataInterpretationSchema(manifest);
    expect(variants(schema).some((variant) => variant.properties.entity?.const === "usuario" && variant.properties.operation!.const === "SEARCH")).toBe(false);
    expect(interpretationSchemaBytes(schema)).toBeGreaterThan(0);
    expect(interpretationSchemaBytes(schema)).toBeLessThan(INTERPRETATION_SCHEMA_MAX_BYTES);
  });
});

describe("prompts de interpretación", () => {
  it("el prompt UML incluye operaciones, rechazo, clases y la instrucción", () => {
    const prompt = buildUmlInterpretationPrompt("  crear clase paciente ", classes);
    expect(prompt.systemPrompt).toContain("UNSUPPORTED");
    expect(prompt.systemPrompt).toContain("hola, ¿cómo estás?");
    expect(prompt.userPrompt).toBe("Clases existentes: Paciente, Doctor\nInstrucción: crear clase paciente");
    expect(buildUmlInterpretationPrompt("x", []).userPrompt).toContain("(ninguna)");
  });

  it("el prompt de datos describe el catálogo y la instrucción", () => {
    const prompt = buildDataInterpretationPrompt("listar roles", manifest);
    expect(prompt.systemPrompt).toContain("UNSUPPORTED");
    expect(prompt.userPrompt).toContain("- rol: id:BIGINT (identificador), nombre:VARCHAR; relaciones: usuario");
    expect(prompt.userPrompt.endsWith("Instrucción: listar roles")).toBe(true);
  });
});

describe("resolveUmlProposalByName", () => {
  const resolve = (output: unknown, list = classes) => resolveUmlProposalByName(parseUmlModelOutput(output)!, list);

  it("resuelve nombres a ids sin que el modelo emita UUIDs", () => {
    expect(resolve({ operation: "CREATE_CLASS", name: " Cita " })).toEqual({ ok: true, proposal: { type: "CREATE_CLASS", name: "Cita" } });
    expect(resolve({ operation: "RENAME_CLASS", targetName: "paciente", name: "Persona" })).toEqual({ ok: true, proposal: { type: "RENAME_CLASS", targetId: "c-1", name: "Persona" } });
    expect(resolve({ operation: "DELETE_CLASS", targetName: "Doctor" })).toEqual({ ok: true, proposal: { type: "DELETE_CLASS", targetId: "c-2" } });
  });

  it("rechaza nombres inexistentes, ambiguos, duplicados y fuera de dominio", () => {
    expect(resolve({ operation: "DELETE_CLASS", targetName: "Enfermero" })).toMatchObject({ ok: false, diagnostic: { code: "NAME_NOT_FOUND" } });
    expect(resolve({ operation: "DELETE_CLASS", targetName: "Paciente" }, [...classes, { id: "c-3", name: "Paciente" }])).toMatchObject({ ok: false, diagnostic: { code: "NAME_AMBIGUOUS" } });
    expect(resolve({ operation: "CREATE_CLASS", name: "doctor" })).toMatchObject({ ok: false, diagnostic: { code: "NAME_ALREADY_EXISTS" } });
    expect(resolve({ operation: "RENAME_CLASS", targetName: "Paciente", name: "Doctor" })).toMatchObject({ ok: false, diagnostic: { code: "NAME_ALREADY_EXISTS" } });
    expect(resolve({ operation: "RENAME_CLASS", targetName: "Paciente", name: "PACIENTE" })).toEqual({ ok: true, proposal: { type: "RENAME_CLASS", targetId: "c-1", name: "PACIENTE" } });
    expect(resolve({ operation: "UNSUPPORTED", reason: "saludo" })).toMatchObject({ ok: false, diagnostic: { code: "OUT_OF_DOMAIN" } });
    expect(resolve({ operation: "CREATE_CLASS", name: "   " })).toMatchObject({ ok: false, diagnostic: { code: "INVALID_OUTPUT" } });
  });

  it("parseUmlModelOutput rechaza claves extra, tipos inválidos y operaciones desconocidas", () => {
    expect(parseUmlModelOutput({ operation: "CREATE_CLASS", name: "A", extra: "x" })).toBeUndefined();
    expect(parseUmlModelOutput({ operation: "DELETE_CLASS", targetName: 3 })).toBeUndefined();
    expect(parseUmlModelOutput({ operation: "CREATE_ENUM", name: "Estado" })).toBeUndefined();
    expect(parseUmlModelOutput("CREATE_CLASS")).toBeUndefined();
  });
});

describe("resolución de datos y sintaxis estricta", () => {
  it("valida la salida contra el Domain Manifest y traduce UNSUPPORTED", () => {
    expect(resolveDataOutput({ operation: "LIST", entity: "rol" }, manifest)).toEqual({ ok: true, command: { operation: "LIST", entity: "rol" } });
    expect(resolveDataOutput({ operation: "UNSUPPORTED", reason: "saludo" }, manifest)).toMatchObject({ ok: false, diagnostic: { code: "OUT_OF_DOMAIN" } });
    expect(resolveDataOutput({ operation: "LIST", entity: "factura" }, manifest)).toMatchObject({ ok: false, diagnostic: { code: "VALIDATION_ERROR", details: [{ code: "UNKNOWN_ENTITY" }] } });
    expect(resolveDataOutput({ operation: "LIST", entity: "rol", url: "https://example.test" }, manifest)).toMatchObject({ ok: false, diagnostic: { code: "INVALID_OUTPUT" } });
  });

  it("interpreta JSON estricto con la misma ruta y detecta la sintaxis estricta", () => {
    expect(interpretStrictDataText('{"operation":"COUNT","entity":"usuario"}', manifest)).toEqual({ ok: true, command: { operation: "COUNT", entity: "usuario" } });
    expect(interpretStrictDataText("{no json", manifest)).toMatchObject({ ok: false, diagnostic: { code: "INVALID_OUTPUT" } });
    expect(isStrictAssistantCommandText('  {"operation":"LIST"}')).toBe(true);
    expect(isStrictAssistantCommandText("listar roles")).toBe(false);
    expect(isStrictUmlProposalText('CREATE_CLASS name="A"')).toBe(true);
    expect(isStrictUmlProposalText("crear clase paciente")).toBe(false);
  });
});

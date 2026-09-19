import type { DomainManifestV1 } from "@examen-sw1/spring-generator";
import type { BenchmarkCase } from "./types.js";

export const BENCHMARK_CLASS_ID = "11111111-1111-4111-8111-111111111111";
const unknownClassId = "22222222-2222-4222-8222-222222222222";

export const BENCHMARK_MANIFEST: DomainManifestV1 = {
  schemaVersion: 1,
  entities: [{
    name: "usuario",
    resourceName: "usuario",
    attributes: [
      { name: "id", type: "BIGINT", required: true, identifier: true, unique: false, searchable: false, sortable: true, defaultSort: "ASC" },
      { name: "nombre", type: "VARCHAR", required: true, identifier: false, unique: false, searchable: true, sortable: false, defaultSort: null },
    ],
    relations: [],
    operations: ["list", "get", "create", "update", "delete", "count"].map((name) => ({ name: `${name}Usuario`, method: name === "create" ? "POST" : name === "update" ? "PATCH" : name === "delete" ? "DELETE" : "GET", path: `/api/v1/usuario${name === "get" || name === "update" || name === "delete" ? "/{id}" : name === "count" ? "/count" : ""}` })),
  }],
};

export const BENCHMARK_CORPUS: readonly BenchmarkCase[] = [
  { id: "crud-list-001", profile: "CRUD", inputSpanish: "Listar usuarios.", adapterInput: { operation: "LIST", entity: "usuario" }, expected: { outcome: "ACCEPT", golden: { operation: "LIST", entity: "usuario" } } },
  { id: "crud-get-001", profile: "CRUD", inputSpanish: "Obtener el usuario 1.", adapterInput: { operation: "GET", entity: "usuario", identifier: 1 }, expected: { outcome: "ACCEPT", golden: { operation: "GET", entity: "usuario", identifier: 1 } } },
  { id: "crud-search-001", profile: "CRUD", inputSpanish: "Buscar usuarios llamados Ana.", adapterInput: { operation: "SEARCH", entity: "usuario", criteria: { query: "Ana" } }, expected: { outcome: "ACCEPT", golden: { operation: "SEARCH", entity: "usuario", criteria: { query: "Ana" } } } },
  { id: "crud-create-001", profile: "CRUD", inputSpanish: "Crear usuario 2 llamado Beto.", adapterInput: { operation: "CREATE", entity: "usuario", fields: { id: 2, nombre: "Beto" } }, expected: { outcome: "ACCEPT", golden: { operation: "CREATE", entity: "usuario", fields: { id: 2, nombre: "Beto" } } } },
  { id: "crud-update-001", profile: "CRUD", inputSpanish: "Actualizar el nombre del usuario 1.", adapterInput: { operation: "UPDATE", entity: "usuario", identifier: 1, fields: { nombre: "Ana María" } }, expected: { outcome: "ACCEPT", golden: { operation: "UPDATE", entity: "usuario", identifier: 1, fields: { nombre: "Ana María" } } } },
  { id: "crud-count-001", profile: "CRUD", inputSpanish: "Contar usuarios.", adapterInput: { operation: "COUNT", entity: "usuario" }, expected: { outcome: "ACCEPT", golden: { operation: "COUNT", entity: "usuario" } } },
  { id: "crud-delete-001", profile: "CRUD", inputSpanish: "Proponer eliminar el usuario 2.", adapterInput: { operation: "DELETE", entity: "usuario", identifier: 2 }, expected: { outcome: "ACCEPT", golden: { operation: "DELETE", entity: "usuario", identifier: 2 } } },
  { id: "crud-unknown-entity-001", profile: "CRUD", inputSpanish: "Listar facturas.", adapterInput: { operation: "LIST", entity: "factura" }, expected: { outcome: "REJECT" } },
  { id: "crud-unknown-field-001", profile: "CRUD", inputSpanish: "Crear usuario con apodo.", adapterInput: { operation: "CREATE", entity: "usuario", fields: { id: 3, nombre: "Cora", apodo: "co" } }, expected: { outcome: "REJECT" } },
  { id: "crud-missing-id-001", profile: "CRUD", inputSpanish: "Obtener un usuario sin indicar identificador.", adapterInput: { operation: "GET", entity: "usuario" }, expected: { outcome: "REJECT" } },
  { id: "crud-ambiguous-001", profile: "CRUD", inputSpanish: "Haz algo con usuarios.", adapterInput: { operation: "LIST", entity: "usuario", action: "algo" }, expected: { outcome: "REJECT" } },
  { id: "crud-delete-ambiguous-001", profile: "CRUD", inputSpanish: "Eliminar un usuario sin indicar cuál.", adapterInput: { operation: "DELETE", entity: "usuario" }, expected: { outcome: "REJECT" } },
  { id: "crud-out-of-domain-001", profile: "CRUD", inputSpanish: "Ejecutar una orden de sistema.", adapterInput: { operation: "RUN_SHELL", entity: "usuario", command: "dir" }, expected: { outcome: "REJECT" } },
  { id: "uml-create-001", profile: "UML", inputSpanish: "Crear la clase Paciente.", adapterInput: 'CREATE_CLASS name="Paciente"', expected: { outcome: "ACCEPT", golden: { type: "CREATE_CLASS", name: "Paciente" } }, knownClassIds: [BENCHMARK_CLASS_ID] },
  { id: "uml-rename-001", profile: "UML", inputSpanish: "Renombrar Paciente a HistoriaClinica.", adapterInput: `RENAME_CLASS targetId="${BENCHMARK_CLASS_ID}" name="HistoriaClinica"`, expected: { outcome: "ACCEPT", golden: { type: "RENAME_CLASS", targetId: BENCHMARK_CLASS_ID, name: "HistoriaClinica" } }, knownClassIds: [BENCHMARK_CLASS_ID] },
  { id: "uml-delete-001", profile: "UML", inputSpanish: "Proponer eliminar Paciente.", adapterInput: `DELETE_CLASS targetId="${BENCHMARK_CLASS_ID}"`, expected: { outcome: "ACCEPT", golden: { type: "DELETE_CLASS", targetId: BENCHMARK_CLASS_ID } }, knownClassIds: [BENCHMARK_CLASS_ID] },
  { id: "uml-unknown-target-001", profile: "UML", inputSpanish: "Eliminar una clase inexistente.", adapterInput: `DELETE_CLASS targetId="${unknownClassId}"`, expected: { outcome: "REJECT" }, knownClassIds: [BENCHMARK_CLASS_ID] },
  { id: "uml-ambiguous-001", profile: "UML", inputSpanish: "Renombrar una clase sin indicar datos.", adapterInput: "RENAME_CLASS", expected: { outcome: "REJECT" }, knownClassIds: [BENCHMARK_CLASS_ID] },
  { id: "uml-unsupported-001", profile: "UML", inputSpanish: "Crear una enumeración.", adapterInput: 'CREATE_ENUM name="Estado"', expected: { outcome: "REJECT" }, knownClassIds: [BENCHMARK_CLASS_ID] },
];

import { describe, expect, it } from "vitest";
import { ASSISTANT_OPERATIONS, type AssistantCommand } from "./index.js";

type Assert<T extends true> = T;
type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2) ? true : false;
type KeysOfUnion<Value> = Value extends Value ? keyof Value : never;
type ForbiddenTransportKey = Extract<
  KeysOfUnion<AssistantCommand>,
  "url" | "uri" | "path" | "endpoint" | "destination" | "targetUrl" | "baseUrl"
>;
type NoForbiddenTransportKeys = Assert<Equal<ForbiddenTransportKey, never>>;

const commands: readonly AssistantCommand[] = [
  { operation: "LIST", entity: "usuario" },
  { operation: "GET", entity: "usuario", identifier: 1 },
  { operation: "SEARCH", entity: "usuario", criteria: { fields: { nombre: "Ana" } } },
  { operation: "CREATE", entity: "usuario", fields: { nombre: "Ana", activo: true } },
  { operation: "UPDATE", entity: "usuario", identifier: 1, fields: { nombre: "Ana Actualizada" } },
  { operation: "DELETE", entity: "usuario", identifier: 1 },
  { operation: "COUNT", entity: "usuario" },
  { operation: "LIST", entity: "rol", relation: { name: "usuario", sourceIdentifier: 1 } },
  { operation: "LIST", entity: "desconocida" },
  { operation: "CREATE", entity: "usuario", fields: { campoDesconocido: "permitido en Task 2.1" } },
];

const assertNever = (value: never): never => {
  throw new Error(`Operación no contemplada: ${String(value)}`);
};

const operationName = (command: AssistantCommand): string => {
  switch (command.operation) {
    case "LIST": return command.relation ? "LIST_RELATION" : "LIST";
    case "GET": return "GET";
    case "SEARCH": return "SEARCH";
    case "CREATE": return "CREATE";
    case "UPDATE": return "UPDATE";
    case "DELETE": return "DELETE";
    case "COUNT": return "COUNT";
    default: return assertNever(command);
  }
};

describe("AssistantCommand", () => {
  it("mantiene la allow-list exacta", () => {
    expect(ASSISTANT_OPERATIONS).toEqual(["LIST", "GET", "SEARCH", "CREATE", "UPDATE", "DELETE", "COUNT"]);
    expect(ASSISTANT_OPERATIONS).toHaveLength(7);
    expect(new Set(ASSISTANT_OPERATIONS).size).toBe(ASSISTANT_OPERATIONS.length);
  });

  it("acepta las variantes semánticas y estrecha exhaustivamente por operation", () => {
    expect(commands.map(operationName)).toEqual(["LIST", "GET", "SEARCH", "CREATE", "UPDATE", "DELETE", "COUNT", "LIST_RELATION", "LIST", "CREATE"]);
  });

  it("no declara destinos de transporte", () => {
    const typeCheck: NoForbiddenTransportKeys = true;
    expect(typeCheck).toBe(true);
  });
});

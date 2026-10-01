import type { RelationalTable, RelationalType } from "@examen-sw1/relational-core";

export type StandaloneField = Readonly<{ name: string; wireName: string; schemaType: "string" | "integer" | "number" | "boolean"; required: boolean; identifier: boolean; relation: boolean; relationTarget?: string }>;

const camel = (value: string): string => value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
const schemaType = (type: RelationalType): StandaloneField["schemaType"] => type === "BIGINT" ? "integer" : type === "NUMERIC" ? "number" : type === "BOOLEAN" ? "boolean" : "string";

export function deriveStandaloneMutableFields(table: RelationalTable): Readonly<{ createFields: readonly StandaloneField[]; updateFields: readonly StandaloneField[] }> {
  const createFields = table.columns.filter((column) => !column.generated).map((column) => {
    const foreignKey = table.foreignKeys.find((key) => key.column === column.name);
    return Object.freeze({ name: camel(column.name), wireName: camel(column.name), schemaType: schemaType(column.type), required: !column.nullable, identifier: column.identifier, relation: Boolean(foreignKey), ...(foreignKey ? { relationTarget: foreignKey.targetTable } : {}) });
  });
  return Object.freeze({ createFields: Object.freeze(createFields), updateFields: Object.freeze(createFields.filter((field) => !field.identifier)) });
}

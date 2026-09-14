export type RelationalType = "VARCHAR" | "BIGINT" | "BOOLEAN" | "NUMERIC" | "DATE" | "TIMESTAMP_WITH_TIME_ZONE" | "ENUM";
export type RelationalLifecycle = "NONE" | "COMPOSITION";
export type RelationalCardinality = "ONE_TO_ONE" | "ONE_TO_MANY" | "MANY_TO_ONE" | "MANY_TO_MANY";

export type SourceReference = Readonly<{ elementId: string; path: string }>;
export type RelationalColumn = Readonly<{
  source: SourceReference;
  name: string;
  type: RelationalType;
  nullable: boolean;
  identifier: boolean;
  unique: boolean;
  enumName?: string;
}>;
export type RelationalForeignKey = Readonly<{
  source: SourceReference;
  name: string;
  column: string;
  targetTable: string;
  targetColumn: string;
  lifecycle: RelationalLifecycle;
}>;
export type RelationalUniqueConstraint = Readonly<{
  name: string;
  columns: readonly string[];
}>;
export type RelationalTable = Readonly<{
  source: SourceReference;
  name: string;
  columns: readonly RelationalColumn[];
  primaryKey?: string;
  uniqueConstraints: readonly RelationalUniqueConstraint[];
  indexes: readonly string[];
  foreignKeys: readonly RelationalForeignKey[];
  inheritsFrom?: string;
  inheritanceStrategy?: "JOINED";
}>;
export type RelationalEnum = Readonly<{ source: SourceReference; name: string; literals: readonly string[] }>;
export type RelationalRelation = Readonly<{
  source: SourceReference;
  cardinality: RelationalCardinality;
  sourceTable: string;
  targetTable: string;
  foreignKey?: string;
  joinTable?: string;
  lifecycle: RelationalLifecycle;
}>;
export type RelationalDiagnostic = Readonly<{
  severity: "error" | "warning";
  code: string;
  message: string;
  path: string;
  elementId?: string;
}>;
export type RelationalModel = Readonly<{
  schema?: string;
  tables: readonly RelationalTable[];
  enums: readonly RelationalEnum[];
  relations: readonly RelationalRelation[];
  diagnostics: readonly RelationalDiagnostic[];
  hasErrors: boolean;
  success: boolean;
}>;

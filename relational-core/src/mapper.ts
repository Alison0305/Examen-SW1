import { validateCanonicalUmlModel, type CanonicalUmlModel, type UmlAttribute, type UmlClass, type UmlRelationship } from "@examen-sw1/uml-core";
import type { RelationalCardinality, RelationalColumn, RelationalDiagnostic, RelationalForeignKey, RelationalLifecycle, RelationalModel, RelationalRelation, RelationalTable, RelationalType, RelationalUniqueConstraint, SourceReference } from "./model.js";

const sqlReserved = new Set(["select", "table", "user", "order", "group", "where"]);
const javaReserved = new Set(["class", "enum", "public", "private", "package", "interface"]);
const primitive: Record<string, RelationalType> = { string: "VARCHAR", integer: "BIGINT", boolean: "BOOLEAN", number: "NUMERIC", date: "DATE", datetime: "TIMESTAMP_WITH_TIME_ZONE" };
const binary = (left: string, right: string): number => left === right ? 0 : left < right ? -1 : 1;
const snake = (value: string): string => value.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
const source = (elementId: string, path: string): SourceReference => ({ elementId, path });
const compareNamed = <T extends { name: string; id: string }>(left: T, right: T): number => binary(`${snake(left.name)}:${left.id}`, `${snake(right.name)}:${right.id}`);
const ordered = <T extends { name: string; id: string }>(items: readonly T[]): T[] => [...items].sort(compareNamed);
const isMany = (upper: number | "unbounded" | undefined): boolean => upper === "unbounded" || (typeof upper === "number" && upper > 1);

interface MutableTable {
  source: SourceReference;
  name: string;
  columns: RelationalColumn[];
  primaryKey?: string;
  uniqueConstraints: RelationalUniqueConstraint[];
  indexes: string[];
  foreignKeys: RelationalForeignKey[];
  inheritsFrom?: string;
  inheritanceStrategy?: "JOINED";
  crud: { create: boolean; read: boolean; update: boolean; delete: boolean };
  readOnly: boolean;
  resourceName: string;
}

export function mapToRelationalModel(model: CanonicalUmlModel): RelationalModel {
  const diagnostics: RelationalDiagnostic[] = validateCanonicalUmlModel(model).diagnostics.map((diagnostic) => ({ ...diagnostic, code: `REL_UML_${diagnostic.code}` }));
  const enumEntries = ordered(model.enumerations);
  const enumById = new Map(enumEntries.map((item) => [item.id, { name: snake(item.name), path: `enumerations[${model.enumerations.indexOf(item)}]` }]));
  const enums = enumEntries.map((item) => {
    const path = `enumerations[${model.enumerations.indexOf(item)}]`;
    validateName(item.name, path, item.id, diagnostics, "Enum no generable");
    return { source: source(item.id, path), name: snake(item.name), literals: [...item.literals].sort(binary) };
  });
  const names = new Set<string>();
  const tableByClassId = new Map<string, MutableTable>();
  ordered(model.classes).forEach((clazz) => {
    if (clazz.generationMetadata?.entity !== true) return;
    const table = mapClass(clazz, model.classes.indexOf(clazz), enumById, names, diagnostics);
    tableByClassId.set(clazz.id, table);
  });

  const relations: RelationalRelation[] = [];
  [...model.relationships].sort(compareRelationship).forEach((relationship) => {
    mapRelationship(relationship, model.relationships.indexOf(relationship), tableByClassId, relations, diagnostics);
  });
  mapInheritance(model, tableByClassId, diagnostics);
  const frozenDiagnostics = diagnostics.sort(compareDiagnostics).map((item) => Object.freeze(item));
  const hasErrors = frozenDiagnostics.some((diagnostic) => diagnostic.severity === "error");
  return Object.freeze({
    tables: Object.freeze([...tableByClassId.values()].sort((left, right) => binary(`${left.name}:${left.source.elementId}`, `${right.name}:${right.source.elementId}`)).map(freezeTable)),
    enums: Object.freeze(enums.map((item) => Object.freeze({ ...item, source: Object.freeze(item.source), literals: Object.freeze(item.literals) }))),
    relations: Object.freeze(relations.sort(compareRelations).map((item) => Object.freeze({ ...item, source: Object.freeze(item.source) }))),
    diagnostics: Object.freeze(frozenDiagnostics),
    hasErrors,
    success: !hasErrors,
  });
}

function mapClass(clazz: UmlClass, index: number, enumById: Map<string, { name: string; path: string }>, names: Set<string>, diagnostics: RelationalDiagnostic[]): MutableTable {
  const path = `classes[${index}]`;
  const name = snake(clazz.name);
  validateName(clazz.name, path, clazz.id, diagnostics, "Nombre no generable");
  if (names.has(name)) addDiagnostic(diagnostics, "error", "REL_DUPLICATE_NAME", `Nombre relacional duplicado: ${name}.`, path, clazz.id);
  names.add(name);
  const columns = ordered(clazz.attributes).flatMap((attribute) => {
    const mapped = mapAttribute(attribute, `${path}.attributes[${clazz.attributes.indexOf(attribute)}]`, enumById, diagnostics);
    return mapped ? [mapped] : [];
  });
  const identifiers = columns.filter((column) => column.identifier);
  if (identifiers.length !== 1) addDiagnostic(diagnostics, "error", identifiers.length ? "REL_MULTIPLE_PRIMARY_KEYS" : "REL_NO_PRIMARY_KEY", "Una entidad requiere exactamente un identifier.", path, clazz.id);
  const declaredCrud = clazz.generationMetadata?.crud;
  const crud = declaredCrud === false ? { create: false, read: false, update: false, delete: false } : declaredCrud && typeof declaredCrud === "object" ? { create: declaredCrud.create ?? true, read: declaredCrud.read ?? true, update: declaredCrud.update ?? true, delete: declaredCrud.delete ?? true } : { create: true, read: true, update: true, delete: true };
  const readOnly = clazz.generationMetadata?.readOnly === true;
  if ((crud.create || crud.update || crud.delete) && identifiers.length !== 1) addDiagnostic(diagnostics, "error", "REL_CRUD_REQUIRES_PRIMARY_KEY", "CRUD requiere exactamente un identifier.", path, clazz.id);
  return { source: source(clazz.id, path), name, columns, primaryKey: identifiers.length === 1 ? identifiers[0].name : undefined, uniqueConstraints: columns.filter((column) => column.unique).map((column) => ({ name: `uq_${name}_${column.name}`, columns: [column.name] })), indexes: columns.filter((column) => clazz.attributes.some((attribute) => attribute.id === column.source.elementId && attribute.generationMetadata?.indexed === true)).map((column) => `idx_${name}_${column.name}`), foreignKeys: [], crud, readOnly, resourceName: clazz.generationMetadata?.resourceName ?? name };
}

function mapAttribute(attribute: UmlAttribute, path: string, enumById: Map<string, { name: string; path: string }>, diagnostics: RelationalDiagnostic[]): RelationalColumn | undefined {
  validateName(attribute.name, path, attribute.id, diagnostics, "Campo no generable");
  const enumEntry = attribute.type.kind === "reference" && attribute.type.referenceType === "enumeration" ? enumById.get(attribute.type.elementId) : undefined;
  const type = attribute.type.kind === "primitive" ? primitive[attribute.type.name] : enumEntry ? "ENUM" : undefined;
  if (!type) {
    addDiagnostic(diagnostics, "error", "REL_UNSUPPORTED_TYPE", "El atributo no tiene un tipo relacional soportado.", path, attribute.id);
    return undefined;
  }
  return { source: source(attribute.id, path), name: snake(attribute.name), type, nullable: attribute.generationMetadata?.identifier !== true && attribute.generationMetadata?.required !== true, identifier: attribute.generationMetadata?.identifier === true, unique: attribute.generationMetadata?.unique === true, enumName: enumEntry?.name, searchable: attribute.generationMetadata?.searchable === true, sortable: attribute.generationMetadata?.sortable === true, defaultSort: attribute.generationMetadata?.defaultSort?.toUpperCase() as "ASC" | "DESC" | undefined };
}

function mapRelationship(relationship: UmlRelationship, index: number, tables: Map<string, MutableTable>, relations: RelationalRelation[], diagnostics: RelationalDiagnostic[]): void {
  if (relationship.type === "Generalization") return;
  const path = `relationships[${index}]`;
  const sourceTable = tables.get(relationship.sourceId);
  const targetTable = tables.get(relationship.targetId);
  if (!sourceTable || !targetTable) {
    addDiagnostic(diagnostics, "error", "REL_NON_ENTITY_RELATIONSHIP", "La relación debe conectar entidades relacionales.", path, relationship.id);
    return;
  }
  if (!relationship.sourceMultiplicity || !relationship.targetMultiplicity) {
    addDiagnostic(diagnostics, "error", "REL_MISSING_MULTIPLICITY", "La relación requiere multiplicidades en ambos extremos.", path, relationship.id);
    return;
  }
  const sourceMany = isMany(relationship.sourceMultiplicity.upper);
  const targetMany = isMany(relationship.targetMultiplicity.upper);
  const lifecycle: RelationalLifecycle = relationship.type === "Composition" ? "COMPOSITION" : "NONE";
  if (sourceMany && targetMany) {
    const joinTable = addJoinTable(joinTableName(relationship, sourceTable, targetTable), relationship, path, sourceTable, targetTable, lifecycle, tables, diagnostics);
    relations.push({ source: source(relationship.id, path), cardinality: "MANY_TO_MANY", sourceTable: sourceTable.name, targetTable: targetTable.name, joinTable: joinTable?.name, lifecycle });
    return;
  }
  let owner = sourceTable;
  let target = targetTable;
  let cardinality: RelationalCardinality = "ONE_TO_ONE";
  if (sourceMany) cardinality = "MANY_TO_ONE";
  else if (targetMany) { owner = targetTable; target = sourceTable; cardinality = "ONE_TO_MANY"; }
  else if (relationship.foreignKeyOwner === "TARGET") { owner = targetTable; target = sourceTable; }
  else if (relationship.foreignKeyOwner !== "SOURCE") addDiagnostic(diagnostics, "warning", "REL_ONE_TO_ONE_OWNER_FALLBACK", "La relación 1:1 no define propietario; se usa SOURCE de forma determinista.", path, relationship.id);
  const nullable = owner === sourceTable ? relationship.targetMultiplicity.lower === 0 : relationship.sourceMultiplicity.lower === 0;
  const foreignKey = addForeignKey(owner, target, relationship, path, lifecycle, cardinality === "ONE_TO_ONE", nullable, diagnostics);
  relations.push({ source: source(relationship.id, path), cardinality, sourceTable: sourceTable.name, targetTable: targetTable.name, foreignKey: foreignKey?.name, lifecycle });
}

function joinTableName(relationship: UmlRelationship, sourceTable: MutableTable, targetTable: MutableTable): string {
  const pair = [sourceTable.name, targetTable.name].sort(binary).join("_");
  const qualifier = relationship.name ? snake(relationship.name) : `relation_${relationship.id.replace(/-/g, "")}`;
  return `${pair}_${qualifier}`;
}

function addJoinTable(name: string, relationship: UmlRelationship, path: string, sourceTable: MutableTable, targetTable: MutableTable, lifecycle: RelationalLifecycle, tables: Map<string, MutableTable>, diagnostics: RelationalDiagnostic[]): MutableTable | undefined {
  const sourceKey = primaryKeyColumn(sourceTable);
  const targetKey = primaryKeyColumn(targetTable);
  if (!sourceKey || !targetKey) {
    addDiagnostic(diagnostics, "error", "REL_RELATIONSHIP_REQUIRES_PRIMARY_KEY", "Una relación requiere identificadores únicos en ambos extremos.", path, relationship.id);
    return undefined;
  }
  const join: MutableTable = { source: source(relationship.id, path), name, columns: [], uniqueConstraints: [], indexes: [], foreignKeys: [], crud: { create: false, read: false, update: false, delete: false }, readOnly: true, resourceName: name };
  tables.set(`join:${relationship.id}`, join);
  const sourceForeignKey = addForeignKey(join, sourceTable, relationship, path, lifecycle, false, false, diagnostics, `${sourceTable.name}_${sourceKey.name}`);
  const targetForeignKey = addForeignKey(join, targetTable, relationship, path, lifecycle, false, false, diagnostics, `${targetTable.name}_${targetKey.name}`);
  if (sourceForeignKey && targetForeignKey) {
    const columns = [sourceForeignKey.column, targetForeignKey.column].sort(binary);
    join.uniqueConstraints.push({ name: `uq_${name}_${columns.join("_")}`, columns });
  }
  return join;
}

function primaryKeyColumn(table: MutableTable): RelationalColumn | undefined {
  return table.primaryKey ? table.columns.find((column) => column.name === table.primaryKey) : undefined;
}

function addForeignKey(owner: MutableTable, target: MutableTable, relationship: UmlRelationship, path: string, lifecycle: RelationalLifecycle, unique: boolean, nullable: boolean, diagnostics: RelationalDiagnostic[], columnName?: string): RelationalForeignKey | undefined {
  const targetKey = primaryKeyColumn(target);
  if (!targetKey) {
    addDiagnostic(diagnostics, "error", "REL_RELATIONSHIP_REQUIRES_PRIMARY_KEY", "Una relación requiere un identifier único en la tabla referenciada.", path, relationship.id);
    return undefined;
  }
  const name = columnName ?? `${target.name}_${targetKey.name}`;
  const column: RelationalColumn = { source: source(relationship.id, path), name, type: targetKey.type, nullable, identifier: false, unique, searchable: false, sortable: false };
  owner.columns.push(column);
  if (unique) owner.uniqueConstraints.push({ name: `uq_${owner.name}_${name}`, columns: [name] });
  const foreignKey = { source: source(relationship.id, path), name: `fk_${owner.name}_${name}`, column: name, targetTable: target.name, targetColumn: targetKey.name, lifecycle };
  owner.foreignKeys.push(foreignKey);
  return foreignKey;
}

function mapInheritance(model: CanonicalUmlModel, tables: Map<string, MutableTable>, diagnostics: RelationalDiagnostic[]): void {
  model.relationships.filter((relationship) => relationship.type === "Generalization").sort(compareRelationship).forEach((relationship) => {
    const child = tables.get(relationship.sourceId);
    const parent = tables.get(relationship.targetId);
    const path = `relationships[${model.relationships.indexOf(relationship)}]`;
    const childKey = child && primaryKeyColumn(child);
    const parentKey = parent && primaryKeyColumn(parent);
    if (!child || !parent || !childKey || !parentKey) {
      addDiagnostic(diagnostics, "error", "REL_INVALID_INHERITANCE", "JOINED requiere entidades y un identifier único en padre e hija.", path, relationship.id);
      return;
    }
    child.inheritsFrom = parent.name;
    child.inheritanceStrategy = "JOINED";
    if (childKey.name !== parentKey.name) {
      addDiagnostic(diagnostics, "error", "REL_JOINED_PRIMARY_KEY_MISMATCH", "JOINED requiere el mismo nombre de identifier en padre e hija.", path, relationship.id);
      return;
    }
    if (childKey.type !== parentKey.type) {
      addDiagnostic(diagnostics, "error", "REL_JOINED_PRIMARY_KEY_TYPE_MISMATCH", "JOINED requiere el mismo tipo de identifier en padre e hija.", path, relationship.id);
      return;
    }
    child.foreignKeys.push({ source: source(relationship.id, path), name: `fk_${child.name}_${parentKey.name}`, column: childKey.name, targetTable: parent.name, targetColumn: parentKey.name, lifecycle: "NONE" });
  });
}

function validateName(original: string, path: string, elementId: string, diagnostics: RelationalDiagnostic[], prefix: string): void {
  const normalized = snake(original);
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(original) || sqlReserved.has(normalized) || javaReserved.has(original.toLowerCase())) addDiagnostic(diagnostics, "error", "REL_INVALID_IDENTIFIER", `${prefix}: ${original}.`, path, elementId);
}
function addDiagnostic(diagnostics: RelationalDiagnostic[], severity: "error" | "warning", code: string, message: string, path: string, elementId?: string): void { diagnostics.push({ severity, code, message, path, elementId }); }
function compareRelationship(left: UmlRelationship, right: UmlRelationship): number { return binary(`${snake(left.name ?? "")}:${left.id}`, `${snake(right.name ?? "")}:${right.id}`); }
function compareDiagnostics(left: RelationalDiagnostic, right: RelationalDiagnostic): number { return binary(`${left.path}:${left.code}:${left.elementId ?? ""}:${left.message}`, `${right.path}:${right.code}:${right.elementId ?? ""}:${right.message}`); }
function compareRelations(left: RelationalRelation, right: RelationalRelation): number { return binary(`${left.sourceTable}:${left.targetTable}:${left.source.elementId}`, `${right.sourceTable}:${right.targetTable}:${right.source.elementId}`); }
function freezeTable(table: MutableTable): RelationalTable { return Object.freeze({ ...table, source: Object.freeze(table.source), columns: Object.freeze(table.columns.sort((left, right) => binary(`${left.name}:${left.source.elementId}`, `${right.name}:${right.source.elementId}`)).map((item) => Object.freeze({ ...item, source: Object.freeze(item.source) }))), uniqueConstraints: Object.freeze(table.uniqueConstraints.sort((left, right) => binary(left.name, right.name)).map((item) => Object.freeze({ ...item, columns: Object.freeze([...item.columns].sort(binary)) }))), indexes: Object.freeze([...table.indexes].sort(binary)), foreignKeys: Object.freeze(table.foreignKeys.sort((left, right) => binary(`${left.name}:${left.source.elementId}`, `${right.name}:${right.source.elementId}`)).map((item) => Object.freeze({ ...item, source: Object.freeze(item.source) }))) }); }

import Handlebars from "handlebars";
import type { RelationalColumn, RelationalModel, RelationalRelation, RelationalTable } from "@examen-sw1/relational-core";
import { defaultSpringGeneratorConfig, type GeneratedFile, type SpringGeneratorConfig } from "./model.js";
import { templates } from "./templates.js";

const binary = (left: string, right: string): number => left === right ? 0 : left < right ? -1 : 1;
const pascal = (value: string): string => value.split("_").map((part) => part[0]?.toUpperCase() + part.slice(1)).join("");
const camel = (value: string): string => value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
const packagePath = (basePackage: string): string => basePackage.replace(/\./g, "/");
const render = <T extends object>(template: string, view: T): string => Handlebars.compile(template)(view).replace(/\r\n/g, "\n");
const javaTypes: Record<RelationalColumn["type"], string> = { VARCHAR: "String", BIGINT: "Long", BOOLEAN: "Boolean", NUMERIC: "BigDecimal", DATE: "LocalDate", TIMESTAMP_WITH_TIME_ZONE: "OffsetDateTime", ENUM: "String" };
const typeImports: Record<RelationalColumn["type"], string | undefined> = { VARCHAR: undefined, BIGINT: undefined, BOOLEAN: undefined, NUMERIC: "java.math.BigDecimal", DATE: "java.time.LocalDate", TIMESTAMP_WITH_TIME_ZONE: "java.time.OffsetDateTime", ENUM: undefined };
const identifier = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const packageName = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$/;
const artifactName = /^[a-z0-9][a-z0-9.-]*$/;
const javaKeywords = new Set(["abstract", "boolean", "break", "byte", "case", "catch", "char", "class", "const", "continue", "default", "do", "double", "else", "enum", "extends", "final", "finally", "float", "for", "if", "implements", "import", "instanceof", "int", "interface", "long", "new", "package", "private", "protected", "public", "return", "short", "static", "strictfp", "super", "switch", "synchronized", "this", "throw", "throws", "transient", "try", "void", "volatile", "while", "record", "sealed", "permits"]);

export class SpringGeneratorConfigError extends Error {}
export class SpringGeneratorModelError extends Error {}

export function generateSpringBackend(model: RelationalModel, config: SpringGeneratorConfig = defaultSpringGeneratorConfig): readonly GeneratedFile[] {
  validateConfig(config);
  validateModel(model);
  const base = `src/main/java/${packagePath(config.basePackage)}`;
  const joinTables = new Set(model.relations.flatMap((relation) => relation.joinTable ? [relation.joinTable] : []));
  const tables = [...model.tables].filter((table) => !joinTables.has(table.name)).sort((a, b) => binary(a.name, b.name));
  const files: GeneratedFile[] = [
    file("settings.gradle", render(templates.settings, config)),
    file("build.gradle", render(templates.build, config)),
    file("src/main/resources/application.properties", render(templates.properties, config)),
    file(`${base}/${config.applicationClass}.java`, render(templates.application, config)),
  ];
  for (const enumeration of [...model.enums].sort((a, b) => binary(a.name, b.name))) {
    files.push(file(`${base}/enums/${pascal(enumeration.name)}.java`, render(templates.enumeration, { basePackage: config.basePackage, name: pascal(enumeration.name), literals: [...enumeration.literals].sort(binary) })));
  }
  for (const table of tables) {
    const entityName = pascal(table.name);
    const id = table.columns.find((column) => column.identifier);
    if (!id) throw new SpringGeneratorModelError(`Tabla sin identificador: ${table.name}`);
    files.push(file(`${base}/entities/${entityName}.java`, render(templates.entity, entityView(table, model, config.basePackage))));
    files.push(file(`${base}/repositories/${entityName}Repository.java`, render(templates.repository, { basePackage: config.basePackage, entityName, idType: javaType(id) })));
    files.push(file(`${base}/services/${entityName}Service.java`, render(templates.service, { basePackage: config.basePackage, entityName })));
    files.push(file(`${base}/controllers/${entityName}Controller.java`, render(templates.controller, { basePackage: config.basePackage, entityName, route: table.name })));
  }
  const frozen = files.sort((a, b) => binary(a.path, b.path)).map((entry) => Object.freeze(entry));
  const paths = new Set(frozen.map((entry) => entry.path.toLowerCase()));
  if (paths.size !== frozen.length) throw new SpringGeneratorModelError("Las rutas Java generadas colisionan sin distinguir mayúsculas.");
  return Object.freeze(frozen);
}

function entityView(table: RelationalTable, model: RelationalModel, basePackage: string): object {
  const inheritedId = table.inheritsFrom ? table.columns.find((column) => column.identifier) : undefined;
  const fields = table.columns.filter((column) => column !== inheritedId).sort((a, b) => binary(a.name, b.name)).map((column) => columnField(table, column, model.relations));
  const inverse = inverseFields(table, model);
  const imports = new Set(["jakarta.persistence.Column", "jakarta.persistence.Entity", "jakarta.persistence.Id", "jakarta.persistence.Table"]);
  if (table.inheritanceStrategy === "JOINED") { imports.add("jakarta.persistence.Inheritance"); imports.add("jakarta.persistence.InheritanceType"); }
  if (table.inheritsFrom) { imports.add(`${basePackage}.entities.${pascal(table.inheritsFrom)}`); imports.add("jakarta.persistence.PrimaryKeyJoinColumn"); }
  for (const field of [...fields, ...inverse]) for (const item of field.imports) imports.add(item.startsWith("java.") || item.startsWith("jakarta.") ? item : `${basePackage}.entities.${item}`);
  for (const column of table.columns) {
    const item = typeImports[column.type]; if (item) imports.add(item);
    if (column.enumName) {
      imports.add(`${basePackage}.enums.${pascal(column.enumName)}`);
      imports.add("jakarta.persistence.Enumerated");
      imports.add("jakarta.persistence.EnumType");
    }
  }
  return { basePackage, className: pascal(table.name), tableName: table.name, extendsName: table.inheritsFrom ? pascal(table.inheritsFrom) : undefined, inheritance: table.inheritanceStrategy === "JOINED", joinedChild: Boolean(table.inheritsFrom), primaryKeyColumn: table.primaryKey, fields: [...fields, ...inverse].sort((a, b) => binary(a.fieldName, b.fieldName)), imports: [...imports].sort(binary) };
}

function columnField(table: RelationalTable, column: RelationalColumn, relations: readonly RelationalRelation[]) {
  const foreignKey = table.foreignKeys.find((item) => item.column === column.name);
  const relation = foreignKey ? relations.find((item) => item.foreignKey === foreignKey.name) : undefined;
  const annotations = column.identifier ? ["@Id"] : [];
  const imports: string[] = [];
  if (column.enumName) annotations.push("@Enumerated(EnumType.STRING)");
  if (foreignKey) {
    annotations.push(`@${column.unique ? "OneToOne" : "ManyToOne"}${relation?.lifecycle === "COMPOSITION" ? "(cascade = CascadeType.ALL)" : ""}`, `@JoinColumn(name = "${column.name}", referencedColumnName = "${foreignKey.targetColumn}", nullable = ${column.nullable})`);
    imports.push("jakarta.persistence.JoinColumn", column.unique ? "jakarta.persistence.OneToOne" : "jakarta.persistence.ManyToOne", pascal(foreignKey.targetTable));
    if (relation?.lifecycle === "COMPOSITION") imports.push("jakarta.persistence.CascadeType");
  } else annotations.push(`@Column(name = "${column.name}", nullable = ${column.nullable}${column.unique ? ", unique = true" : ""})`);
  return { annotations, fieldName: camel(column.name), accessorName: pascal(column.name), javaType: foreignKey ? pascal(foreignKey.targetTable) : column.enumName ? pascal(column.enumName) : javaType(column), imports };
}

function inverseFields(table: RelationalTable, model: RelationalModel): Array<{ annotations: string[]; fieldName: string; accessorName: string; javaType: string; imports: string[] }> {
  const fields: Array<{ annotations: string[]; fieldName: string; accessorName: string; javaType: string; imports: string[] }> = [];
  for (const relation of model.relations) {
    if (relation.cardinality === "ONE_TO_MANY" && relation.sourceTable === table.name && relation.foreignKey) {
      const owner = model.tables.find((candidate) => candidate.foreignKeys.some((key) => key.name === relation.foreignKey));
      const fk = owner?.foreignKeys.find((key) => key.name === relation.foreignKey);
      if (owner && fk) fields.push(collectionField(owner.name, `${camel(fk.column)}Items`, `@OneToMany(mappedBy = "${camel(fk.column)}")`));
    }
    if (relation.cardinality === "ONE_TO_ONE" && relation.foreignKey) {
      const owner = model.tables.find((candidate) => candidate.foreignKeys.some((key) => key.name === relation.foreignKey));
      const fk = owner?.foreignKeys.find((key) => key.name === relation.foreignKey);
      const isOppositeParticipant = owner && ((owner.name === relation.sourceTable && table.name === relation.targetTable) || (owner.name === relation.targetTable && table.name === relation.sourceTable));
      if (owner && fk && isOppositeParticipant) fields.push({ annotations: [`@OneToOne(mappedBy = "${camel(fk.column)}")`], fieldName: camel(owner.name), accessorName: pascal(owner.name), javaType: pascal(owner.name), imports: ["jakarta.persistence.OneToOne", pascal(owner.name)] });
    }
    if (relation.cardinality === "MANY_TO_MANY" && relation.joinTable) {
      const join = model.tables.find((candidate) => candidate.name === relation.joinTable);
      if (!join) continue;
      const sourceFk = join.foreignKeys.find((key) => key.targetTable === relation.sourceTable);
      const targetFk = join.foreignKeys.find((key) => key.targetTable === relation.targetTable);
      if (!sourceFk || !targetFk) continue;
      const ownerField = `${camel(relation.targetTable)}Items${pascal(join.name)}`;
      if (relation.sourceTable === table.name) fields.push({ annotations: ["@ManyToMany", `@JoinTable(name = "${join.name}", joinColumns = @JoinColumn(name = "${sourceFk.column}"), inverseJoinColumns = @JoinColumn(name = "${targetFk.column}"))`], fieldName: ownerField, accessorName: pascal(ownerField), javaType: `Set<${pascal(relation.targetTable)}>`, imports: ["java.util.Set", "jakarta.persistence.JoinColumn", "jakarta.persistence.JoinTable", "jakarta.persistence.ManyToMany", pascal(relation.targetTable)] });
      if (relation.targetTable === table.name) fields.push(collectionField(relation.sourceTable, `${camel(relation.sourceTable)}Items${pascal(join.name)}`, `@ManyToMany(mappedBy = "${ownerField}")`));
    }
  }
  return fields;
}

function collectionField(target: string, fieldName: string, annotation: string) { return { annotations: [annotation], fieldName, accessorName: pascal(fieldName), javaType: `Set<${pascal(target)}>`, imports: ["java.util.Set", "jakarta.persistence.OneToMany", "jakarta.persistence.ManyToMany", pascal(target)] }; }
function javaType(column: RelationalColumn): string { return javaTypes[column.type]; }
function file(path: string, content: string): GeneratedFile { return { path, content }; }

export function validateConfig(config: SpringGeneratorConfig): void {
  if (!packageName.test(config.groupId)) throw new SpringGeneratorConfigError("groupId inválido.");
  if (!artifactName.test(config.artifactId)) throw new SpringGeneratorConfigError("artifactId inválido.");
  if (!packageName.test(config.basePackage) || config.basePackage.split(".").some((part) => javaKeywords.has(part))) throw new SpringGeneratorConfigError("basePackage inválido.");
  if (!identifier.test(config.applicationClass) || javaKeywords.has(config.applicationClass)) throw new SpringGeneratorConfigError("applicationClass inválido.");
}

function validateModel(model: RelationalModel): void {
  for (const enumeration of model.enums) for (const literal of enumeration.literals) if (!identifier.test(literal) || javaKeywords.has(literal)) throw new SpringGeneratorModelError(`Literal enum Java inválido: ${literal}`);
}

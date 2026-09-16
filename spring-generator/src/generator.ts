import Handlebars from "handlebars";
import type { RelationalColumn, RelationalForeignKey, RelationalModel, RelationalRelation, RelationalTable } from "@examen-sw1/relational-core";
import { defaultSpringGeneratorConfig, type GeneratedFile, type SpringGeneratorConfig } from "./model.js";
import { generateDomainManifest } from "./domain-manifest.js";
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
  const apiViews = tables.map((table) => ({ table, api: apiView(table, model, config.basePackage) }));
  const files: GeneratedFile[] = [
    file("domain-manifest.json", generateDomainManifest(model)),
    file("settings.gradle", render(templates.settings, config)),
    file("build.gradle", render(templates.build, config)),
    file("src/main/resources/application.properties", render(templates.properties, config)),
    file("src/test/resources/application-test.properties", render(templates.testProperties, config)),
    file(`${base}/${config.applicationClass}.java`, render(templates.application, config)),
    file(`${base}/api/ApiError.java`, render(templates.apiError, { basePackage: config.basePackage })),
    file(`${base}/api/ApiException.java`, render(templates.apiException, { basePackage: config.basePackage })),
    file(`${base}/api/ApiExceptionHandler.java`, render(templates.apiHandler, { basePackage: config.basePackage })),
    file(`${base}/api/QueryParser.java`, render(templates.queryParser, { basePackage: config.basePackage })),
  ];
  if (tables.some((table) => (table.crud?.read ?? true) !== false)) {
    files.push(file(`${base}/dto/PatchField.java`, render(templates.patchField, { basePackage: config.basePackage })));
    files.push(file(`${base}/dto/PageResponse.java`, render(templates.pageResponse, { basePackage: config.basePackage })));
    files.push(file(`${base}/dto/CountResponse.java`, render(templates.countResponse, { basePackage: config.basePackage })));
  }
  for (const enumeration of [...model.enums].sort((a, b) => binary(a.name, b.name))) {
    files.push(file(`${base}/enums/${pascal(enumeration.name)}.java`, render(templates.enumeration, { basePackage: config.basePackage, name: pascal(enumeration.name), literals: [...enumeration.literals].sort(binary) })));
  }
  for (const table of tables) {
    const entityName = pascal(table.name);
    const id = table.columns.find((column) => column.identifier);
    if (!id) throw new SpringGeneratorModelError(`Tabla sin identificador: ${table.name}`);
    files.push(file(`${base}/entities/${entityName}.java`, render(templates.entity, entityView(table, model, config.basePackage))));
    files.push(file(`${base}/repositories/${entityName}Repository.java`, render(templates.repository, { basePackage: config.basePackage, entityName, idType: javaType(id) })));
    const api = apiViews.find((entry) => entry.table === table)!.api;
    if (api.enabled) {
      files.push(file(`${base}/dto/Create${entityName}Request.java`, render(templates.dto, { basePackage: config.basePackage, name: `Create${entityName}Request`, create: true, fields: api.createFields, imports: api.dtoImports })));
      files.push(file(`${base}/dto/Update${entityName}Request.java`, render(templates.dto, { basePackage: config.basePackage, name: `Update${entityName}Request`, update: true, fields: api.fields, identifierField: api.idField, imports: api.dtoImports })));
      files.push(file(`${base}/dto/${entityName}Response.java`, render(templates.dto, { basePackage: config.basePackage, name: `${entityName}Response`, response: true, fields: api.responseFields, imports: api.dtoImports })));
      files.push(file(`${base}/services/${entityName}Service.java`, render(templates.service, { basePackage: config.basePackage, entityName, methodName: camel(table.name), ...api })));
      files.push(file(`${base}/controllers/${entityName}Controller.java`, render(templates.controller, { basePackage: config.basePackage, entityName, route: table.resourceName ?? table.name, ...api })));
    }
  }
  const mapperViews = apiViews.filter((entry) => entry.api.enabled).map((entry) => ({ entityName: pascal(entry.table.name), methodName: camel(entry.table.name), fields: entry.api.responseFields }));
  if (mapperViews.length) files.push(file(`${base}/dto/ResponseMapper.java`, render(templates.responseMapper, { basePackage: config.basePackage, mappers: mapperViews })));
  const runtimeFixture = apiViews.find((entry) => entry.api.enabled && entry.api.canCreate && entry.api.canUpdate && entry.api.canDelete && entry.api.createFields.every((field) => !field.relation || !field.required) && entry.api.fields.some((field) => !field.relation && !field.identifier));
  if (runtimeFixture) files.push(file(`${base.replace("src/main/java", "src/test/java")}/GeneratedApiRuntimeTest.java`, render(templates.runtimeTest, runtimeTestView(runtimeFixture.table, runtimeFixture.api, apiViews, model, config))));
  const frozen = files.sort((a, b) => binary(a.path, b.path)).map((entry) => Object.freeze(entry));
  const paths = new Set(frozen.map((entry) => entry.path.toLowerCase()));
  if (paths.size !== frozen.length) throw new SpringGeneratorModelError("Las rutas Java generadas colisionan sin distinguir mayúsculas.");
  return Object.freeze(frozen);
}

function apiView(table: RelationalTable, model: RelationalModel, basePackage: string): { enabled: boolean; canCreate: boolean; canUpdate: boolean; canDelete: boolean; canNavigate: boolean; idField: string; idAccessor: string; idJavaType: string; fields: ApiField[]; createFields: ApiField[]; responseFields: ApiField[]; queryFields: ApiField[]; relationFields: ApiField[]; navigationFields: ApiField[]; dtoImports: string[]; sortableFields: string[]; searchableCount: number; searchableFields: string[]; defaultSort: string; defaultDirection: string } {
  const crud = table.crud ?? { create: true, read: true, update: true, delete: true };
  const enabled = crud.read !== false;
  const id = table.columns.find((column) => column.identifier);
  if (enabled && !id) throw new SpringGeneratorModelError(`Tabla CRUD sin identifier: ${table.name}`);
  const sortable = table.columns.filter((column) => column.sortable).map((column) => camel(column.name));
  const defaultColumn = table.columns.find((column) => column.defaultSort);
  const fields = table.columns.map((column) => {
    const foreignKey = table.foreignKeys.find((item) => item.column === column.name);
    return { name: camel(column.name), accessor: pascal(column.name), javaType: foreignKey ? javaTypeForForeignKey(foreignKey, table) : column.enumName ? pascal(column.enumName) : javaType(column), entityType: foreignKey ? pascal(foreignKey.targetTable) : undefined, repositoryType: foreignKey ? `${pascal(foreignKey.targetTable)}Repository` : undefined, enumLiteral: column.enumName ? model.enums.find((item) => item.name === column.enumName)?.literals[0] : undefined, required: !column.nullable, identifier: column.identifier, relation: Boolean(foreignKey), stringField: column.type === "VARCHAR", searchable: column.searchable === true && column.type === "VARCHAR", sortable: column.sortable === true, queryPath: foreignKey ? `${camel(column.name)}.${camel(foreignKey.targetColumn)}` : camel(column.name), mapping: foreignKey ? `entity.get${pascal(column.name)}() == null ? null : entity.get${pascal(column.name)}().get${pascal(foreignKey.targetColumn)}()` : `entity.get${pascal(column.name)}()`, navigation: foreignKey ? `entity.get${pascal(column.name)}() == null ? null : ResponseMapper.${camel(foreignKey.targetTable)}(entity.get${pascal(column.name)}())` : undefined, navigationName: foreignKey ? camel(column.name) : undefined };
  });
  const dtoImports = new Set<string>();
  for (const field of fields) {
    const column = table.columns.find((item) => camel(item.name) === field.name)!;
    const item = typeImports[column.type]; if (item) dtoImports.add(item);
    if (column.enumName) dtoImports.add(`${basePackage}.enums.${pascal(column.enumName)}`);
  }
  const inverse = inverseResponseFields(table, model);
  for (const field of inverse) if (field.javaType.startsWith("Set<")) dtoImports.add("java.util.Set");
  const responseFields = [...fields, ...inverse];
  const navigationFields = responseFields.filter((field) => field.navigation);
  return { enabled, canCreate: !table.readOnly && crud.create, canUpdate: !table.readOnly && crud.update, canDelete: !table.readOnly && crud.delete, canNavigate: navigationFields.length > 0, idField: camel(id?.name ?? "id"), idAccessor: pascal(id?.name ?? "id"), idJavaType: id ? javaType(id) : "Long", fields: fields.filter((field) => !field.identifier), createFields: fields, responseFields, queryFields: fields, relationFields: fields.filter((field) => field.relation), navigationFields, dtoImports: [...dtoImports].sort(binary), sortableFields: sortable, searchableCount: fields.filter((field) => field.searchable).length, searchableFields: fields.filter((field) => field.searchable).map((field) => field.name), defaultSort: camel(defaultColumn?.name ?? id?.name ?? "id"), defaultDirection: defaultColumn?.defaultSort ?? "ASC" };
}

type ApiField = { name: string; accessor: string; javaType: string; entityType?: string; repositoryType?: string; enumLiteral?: string; required: boolean; identifier: boolean; relation: boolean; stringField: boolean; searchable: boolean; sortable: boolean; queryPath: string; mapping: string; navigation?: string; navigationName?: string };
function runtimeTestView(table: RelationalTable, api: ReturnType<typeof apiView>, apiViews: Array<{ table: RelationalTable; api: ReturnType<typeof apiView> }>, model: RelationalModel, config: SpringGeneratorConfig) {
  const id = api.createFields.find((field) => field.identifier);
  if (!id) throw new SpringGeneratorModelError(`Tabla CRUD sin identifier para prueba runtime: ${table.name}`);
  const value = (field: ApiField, updated = false, identifierValue = 1, stringValue?: string): string | number | boolean => {
    if (field.identifier) return identifierValue;
    if (field.relation) return identifierValue;
    if (field.enumLiteral) return field.enumLiteral;
    if (field.javaType === "Boolean") return true;
    if (field.javaType === "BigDecimal") return 1.5;
    if (field.javaType === "LocalDate") return "2026-01-01";
    if (field.javaType === "OffsetDateTime") return "2026-01-01T00:00:00Z";
    if (field.javaType === "Long") return 1;
    return stringValue ?? (updated ? "runtime-updated" : "runtime");
  };
  const javaString = (value: string): string => value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r\n|\r|\n/g, "\\n");
  const createValues = (candidate: ReturnType<typeof apiView>, identifierValue = 1, stringValue?: string, relationValues: Record<string, number> = {}) => Object.fromEntries(candidate.createFields.filter((field) => field.required || field.identifier).map((field) => [field.name, field.relation ? (relationValues[field.name] ?? identifierValue) : value(field, false, identifierValue, stringValue)]));
  const createJson = javaString(JSON.stringify(createValues(api)));
  const update = api.fields.find((field) => !field.relation && !field.identifier);
  if (!update) throw new SpringGeneratorModelError(`Tabla CRUD sin campo actualizable para prueba runtime: ${table.name}`);
  const operation = (path: string, method: string, operationId: string, errorStatuses: number[], hasSuccessSchema = true) => ({ path, method, operationId, errorStatuses, hasSuccessSchema });
  const openApiOperations = apiViews.flatMap(({ table: candidate, api: candidateApi }) => {
    if (!candidateApi.enabled) return [];
    const route = `/api/v1/${candidate.resourceName ?? candidate.name}`;
    return [
      ...(candidateApi.canCreate ? [operation(route, "post", `create${pascal(candidate.name)}`, [400, 409])] : []),
      operation(route, "get", `list${pascal(candidate.name)}`, [400]),
      operation(`${route}/count`, "get", `count${pascal(candidate.name)}`, [400]),
      operation(`${route}/{id}`, "get", `get${pascal(candidate.name)}`, [404]),
      ...(candidateApi.canUpdate ? [operation(`${route}/{id}`, "patch", `update${pascal(candidate.name)}`, [400, 404])] : []),
      ...(candidateApi.canDelete ? [operation(`${route}/{id}`, "delete", `delete${pascal(candidate.name)}`, [404, 409], false)] : []),
      ...(candidateApi.canNavigate ? [operation(`${route}/{id}/relations/{relation}`, "get", `get${pascal(candidate.name)}Relation`, [400, 404], false)] : []),
    ];
  });
  const schemaNames = apiViews.filter((entry) => entry.api.enabled).flatMap(({ table: candidate, api: candidateApi }) => [
    ...(candidateApi.canCreate ? [`Create${pascal(candidate.name)}Request`] : []),
    ...(candidateApi.canUpdate ? [`Update${pascal(candidate.name)}Request`] : []),
    `${pascal(candidate.name)}Response`,
  ]);
  const queryOperations = apiViews.filter((entry) => entry.api.enabled).map(({ table: candidate, api: candidateApi }) => ({ path: `/api/v1/${candidate.resourceName ?? candidate.name}`, searchable: candidateApi.searchableCount > 0 }));
  const toManyRelation = model.relations.find((relation) => {
    if (relation.cardinality !== "ONE_TO_MANY" || !relation.foreignKey) return false;
    const parent = apiViews.find((entry) => entry.table.name === relation.sourceTable);
    const child = apiViews.find((entry) => entry.table.foreignKeys.some((key) => key.name === relation.foreignKey));
    const foreignKey = child?.table.foreignKeys.find((key) => key.name === relation.foreignKey);
    return Boolean(parent?.api.enabled && parent.api.canCreate && parent.api.canNavigate && child?.api.enabled && child.api.canCreate && foreignKey && child.api.createFields.every((field) => !field.required || !field.relation || field.name === camel(foreignKey.column)));
  });
  const toManyMapping = toManyRelation ? (() => {
    const parent = apiViews.find((entry) => entry.table.name === toManyRelation.sourceTable)!;
    const child = apiViews.find((entry) => entry.table.foreignKeys.some((key) => key.name === toManyRelation.foreignKey))!;
    const foreignKey = child.table.foreignKeys.find((key) => key.name === toManyRelation.foreignKey)!;
    return { parentRoute: parent.table.resourceName ?? parent.table.name, childRoute: child.table.resourceName ?? child.table.name, parentId: 101, childId: 102, parentCreateJson: javaString(JSON.stringify(createValues(parent.api, 101, "lazy-user@example.test"))), childCreateJson: javaString(JSON.stringify(createValues(child.api, 102, "lazy-child", { [camel(foreignKey.column)]: 101 }))), responseField: `${camel(child.table.name)}Ids`, navigationName: camel(child.table.name) };
  })() : undefined;
  return { basePackage: config.basePackage, applicationClass: config.applicationClass, entityName: pascal(table.name), route: table.resourceName ?? table.name, idValue: value(id), createJson, updateJson: javaString(JSON.stringify({ [update.name]: value(update, true) })), patchIdentifierJson: javaString(JSON.stringify({ [api.idField]: value(id) })), patchNullJson: javaString(JSON.stringify({ [update.name]: null })), searchableField: api.searchableFields[0], sortableField: api.sortableFields[0] ?? api.idField, searchValue: "runtime", navigationName: api.navigationFields[0]?.navigationName, openApiOperations, queryOperations, schemaNames, toManyMapping };
}
function javaTypeForForeignKey(foreignKey: RelationalForeignKey, table: RelationalTable): string {
  // The request carries the referenced identifier, not the JPA entity.
  return javaType(table.columns.find((column) => column.name === foreignKey.column)!);
}

function inverseResponseFields(table: RelationalTable, model: RelationalModel): ApiField[] {
  const fields: ApiField[] = [];
  const targetId = (target: RelationalTable) => {
    const id = target.columns.find((column) => column.identifier);
    if (!id) throw new SpringGeneratorModelError(`Tabla relacionada sin identifier: ${target.name}`);
    return id;
  };
  const collection = (target: RelationalTable, name: string, accessor: string, navigationName: string): ApiField => {
    const id = targetId(target);
    const idAccessor = pascal(id.name);
    const method = camel(target.name);
    return { name, accessor: pascal(name), javaType: `Set<${javaType(id)}>`, required: false, identifier: false, relation: true, stringField: false, searchable: false, sortable: false, queryPath: "", mapping: `java.util.Optional.ofNullable(entity.get${accessor}()).orElseGet(java.util.Set::of).stream().map(item -> item.get${idAccessor}()).sorted().collect(java.util.stream.Collectors.toCollection(java.util.LinkedHashSet::new))`, navigation: `java.util.Optional.ofNullable(entity.get${accessor}()).orElseGet(java.util.Set::of).stream().sorted(java.util.Comparator.comparing(item -> item.get${idAccessor}())).map(ResponseMapper::${method}).toList()`, navigationName };
  };
  for (const relation of model.relations) {
    if (relation.cardinality === "ONE_TO_MANY" && relation.sourceTable === table.name && relation.foreignKey) {
      const owner = model.tables.find((candidate) => candidate.foreignKeys.some((key) => key.name === relation.foreignKey));
      const fk = owner?.foreignKeys.find((key) => key.name === relation.foreignKey);
      if (owner && fk) fields.push(collection(owner, `${camel(owner.name)}Ids`, pascal(`${camel(fk.column)}Items`), camel(owner.name)));
    }
    if (relation.cardinality === "ONE_TO_ONE" && relation.foreignKey) {
      const owner = model.tables.find((candidate) => candidate.foreignKeys.some((key) => key.name === relation.foreignKey));
      const fk = owner?.foreignKeys.find((key) => key.name === relation.foreignKey);
      const opposite = owner && owner.name !== table.name && (table.name === relation.sourceTable || table.name === relation.targetTable);
      if (owner && fk && opposite) {
        const id = targetId(owner);
        const property = camel(owner.name);
        fields.push({ name: `${property}Id`, accessor: pascal(`${property}Id`), javaType: javaType(id), required: false, identifier: false, relation: true, stringField: false, searchable: false, sortable: false, queryPath: "", mapping: `entity.get${pascal(property)}() == null ? null : entity.get${pascal(property)}().get${pascal(id.name)}()`, navigation: `entity.get${pascal(property)}() == null ? null : ResponseMapper.${camel(owner.name)}(entity.get${pascal(property)}())`, navigationName: property });
      }
    }
    if (relation.cardinality === "MANY_TO_MANY" && relation.joinTable) {
      const join = model.tables.find((candidate) => candidate.name === relation.joinTable);
      if (!join) continue;
      if (relation.sourceTable === table.name) {
        const target = model.tables.find((candidate) => candidate.name === relation.targetTable);
        if (target) fields.push(collection(target, `${camel(target.name)}Ids${pascal(join.name)}`, pascal(`${camel(target.name)}Items${pascal(join.name)}`), `${camel(target.name)}Items${pascal(join.name)}`));
      }
      if (relation.targetTable === table.name) {
        const target = model.tables.find((candidate) => candidate.name === relation.sourceTable);
        if (target) fields.push(collection(target, `${camel(target.name)}Ids${pascal(join.name)}`, pascal(`${camel(target.name)}Items${pascal(join.name)}`), `${camel(target.name)}Items${pascal(join.name)}`));
      }
    }
  }
  return fields;
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
    const compositionOwner = relation?.lifecycle === "COMPOSITION" && relation.cardinality === "ONE_TO_ONE" && relation.sourceTable === table.name;
    annotations.push(`@${column.unique ? "OneToOne" : "ManyToOne"}${compositionOwner ? "(cascade = CascadeType.ALL, orphanRemoval = true)" : ""}`, `@JoinColumn(name = "${column.name}", referencedColumnName = "${foreignKey.targetColumn}", nullable = ${column.nullable})`);
    imports.push("jakarta.persistence.JoinColumn", column.unique ? "jakarta.persistence.OneToOne" : "jakarta.persistence.ManyToOne", pascal(foreignKey.targetTable));
    if (compositionOwner) imports.push("jakarta.persistence.CascadeType");
  } else annotations.push(`@Column(name = "${column.name}", nullable = ${column.nullable}${column.unique ? ", unique = true" : ""})`);
  return { annotations, fieldName: camel(column.name), accessorName: pascal(column.name), javaType: foreignKey ? pascal(foreignKey.targetTable) : column.enumName ? pascal(column.enumName) : javaType(column), imports };
}

function inverseFields(table: RelationalTable, model: RelationalModel): Array<{ annotations: string[]; fieldName: string; accessorName: string; javaType: string; imports: string[] }> {
  const fields: Array<{ annotations: string[]; fieldName: string; accessorName: string; javaType: string; imports: string[] }> = [];
  for (const relation of model.relations) {
    if (relation.cardinality === "ONE_TO_MANY" && relation.sourceTable === table.name && relation.foreignKey) {
      const owner = model.tables.find((candidate) => candidate.foreignKeys.some((key) => key.name === relation.foreignKey));
      const fk = owner?.foreignKeys.find((key) => key.name === relation.foreignKey);
      if (owner && fk) {
        const composition = relation.lifecycle === "COMPOSITION";
        fields.push(collectionField(owner.name, `${camel(fk.column)}Items`, `@OneToMany(mappedBy = "${camel(fk.column)}"${composition ? ", cascade = CascadeType.ALL, orphanRemoval = true" : ""})`, composition));
      }
    }
    if (relation.cardinality === "ONE_TO_ONE" && relation.foreignKey) {
      const owner = model.tables.find((candidate) => candidate.foreignKeys.some((key) => key.name === relation.foreignKey));
      const fk = owner?.foreignKeys.find((key) => key.name === relation.foreignKey);
      const isOppositeParticipant = owner && ((owner.name === relation.sourceTable && table.name === relation.targetTable) || (owner.name === relation.targetTable && table.name === relation.sourceTable));
      if (owner && fk && isOppositeParticipant) {
        const compositionComposite = relation.lifecycle === "COMPOSITION" && table.name === relation.sourceTable;
        fields.push({ annotations: [`@OneToOne(mappedBy = "${camel(fk.column)}"${compositionComposite ? ", cascade = CascadeType.ALL, orphanRemoval = true" : ""})`], fieldName: camel(owner.name), accessorName: pascal(owner.name), javaType: pascal(owner.name), imports: ["jakarta.persistence.OneToOne", ...(compositionComposite ? ["jakarta.persistence.CascadeType"] : []), pascal(owner.name)] });
      }
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

function collectionField(target: string, fieldName: string, annotation: string, composition = false) { return { annotations: [annotation], fieldName, accessorName: pascal(fieldName), javaType: `Set<${pascal(target)}>`, imports: ["java.util.Set", "jakarta.persistence.OneToMany", "jakarta.persistence.ManyToMany", ...(composition ? ["jakarta.persistence.CascadeType"] : []), pascal(target)] }; }
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

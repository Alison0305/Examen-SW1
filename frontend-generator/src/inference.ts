import type { ManifestAttribute, ManifestRelation } from "./model.js";

export type FieldControl = "text" | "textarea" | "number" | "checkbox" | "date" | "datetime-local" | "select" | "relation-select";
export type FieldView = Readonly<{ name: string; control: FieldControl; required: boolean; unique: boolean; editable: boolean; filterable: boolean; sortable: boolean; searchable: boolean }>;

export function inferField(attribute: ManifestAttribute, relation?: ManifestRelation, mode: "create" | "patch" = "create"): FieldView {
  const control: FieldControl = relation ? "relation-select" : attribute.type === "BIGINT" || attribute.type === "NUMERIC" ? "number" : attribute.type === "BOOLEAN" ? "checkbox" : attribute.type === "DATE" ? "date" : attribute.type === "TIMESTAMP_WITH_TIME_ZONE" ? "datetime-local" : attribute.type === "ENUM" ? "select" : attribute.type === "VARCHAR" && /text|description|notes/i.test(attribute.name) ? "textarea" : "text";
  return Object.freeze({ name: attribute.name, control, required: attribute.required, unique: attribute.unique, editable: mode === "create" || !attribute.identifier, filterable: attribute.type !== "BOOLEAN", sortable: attribute.sortable, searchable: attribute.searchable });
}

export function inferFields(attributes: readonly ManifestAttribute[], relations: readonly ManifestRelation[], mode: "create" | "patch"): readonly FieldView[] {
  return Object.freeze(attributes.map((attribute) => inferField(attribute, relations.find((relation) => relation.name === attribute.name), mode)).filter((field) => field.editable));
}

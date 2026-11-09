import type {
  CanonicalUmlModel,
  Multiplicity,
  UmlAttribute,
  UmlClass,
  UmlEnumeration,
  UmlOperation,
  UmlRelationship,
  UmlRelationshipType,
  UmlType,
  UmlVisibility,
  Uuid,
} from "@examen-sw1/uml-core";

// CU-2P-04, fase 1: extracts a structured, serializable fragment of the canonical UML model for the element
// being analyzed. Pure function: no database, network, model provider or UI state, and the input is never mutated.

// ---------------------------------------------------------------------------------------------
// Focus

// Same `kind` vocabulary as the editor selection (`WorkspaceSelection` in the frontend), plus the whole model.
export type UmlAnalysisFocus =
  | Readonly<{ kind: "class"; id: Uuid }>
  | Readonly<{ kind: "relationship"; id: Uuid }>
  | Readonly<{ kind: "model" }>;

// ---------------------------------------------------------------------------------------------
// Fragment

// An unspecified multiplicity stays unspecified: it is never assumed to be 1.
export type FragmentMultiplicity =
  | Readonly<{ specified: true; lower: number; upper: number | "unbounded"; text: string }>
  | Readonly<{ specified: false }>;

export type FragmentType =
  | Readonly<{ kind: "primitive"; name: string }>
  | Readonly<{ kind: "class" | "enumeration"; id: Uuid; name: string }>
  // The type points to an element that does not exist in the model (inconsistent reference).
  | Readonly<{ kind: "unresolved"; referenceType: "class" | "enumeration"; id: Uuid }>;

export type FragmentAttribute = Readonly<{
  id: Uuid;
  name: string;
  visibility: UmlVisibility;
  type: FragmentType;
  multiplicity: FragmentMultiplicity;
}>;

export type FragmentOperation = Readonly<{
  id: Uuid;
  name: string;
  visibility: UmlVisibility;
  parameters: ReadonlyArray<Readonly<{ id: Uuid; name: string; type: FragmentType }>>;
  returnType?: FragmentType;
}>;

export type FragmentClass = Readonly<{
  id: Uuid;
  name: string;
  visibility: UmlVisibility;
  packageId?: Uuid;
  attributes: readonly FragmentAttribute[];
  // Kept when present in the canonical model, although the current editor cannot create or edit operations.
  operations: readonly FragmentOperation[];
}>;

// Classes outside the focus that are only needed to resolve a name (related classes, attribute types).
export type FragmentClassSummary = Readonly<{ id: Uuid; name: string }>;

export type FragmentEnumeration = Readonly<{
  id: Uuid;
  name: string;
  visibility: UmlVisibility;
  packageId?: Uuid;
  literals: readonly string[];
}>;

export type FragmentPackage = Readonly<{ id: Uuid; name: string; parentPackageId?: Uuid }>;

// Semantic role of each end, from the repository conventions: Generalization source = child, target = parent;
// Aggregation/Composition source = whole (the diamond end), target = part; Association ends have no extra role.
export type FragmentEndRole = "child" | "parent" | "whole" | "part" | "end";

export type FragmentRelationshipEnd = Readonly<{
  elementId: Uuid;
  // "unresolved": the relationship points to an element missing from the model.
  elementKind: "class" | "enumeration" | "unresolved";
  // Name of the element at this end. It is not a UML role name: ShareGrams does not model role names.
  elementName?: string;
  semanticRole: FragmentEndRole;
  // The multiplicity written next to this end's element.
  multiplicity: FragmentMultiplicity;
}>;

export type FragmentRelationship = Readonly<{
  id: Uuid;
  type: UmlRelationshipType;
  name?: string;
  source: FragmentRelationshipEnd;
  target: FragmentRelationshipEnd;
  associationClass?: Readonly<{ id: Uuid; name?: string; resolved: boolean }>;
  foreignKeyOwner?: "SOURCE" | "TARGET";
  // True when the relationship starts and ends in the same class (recursive association).
  selfReference: boolean;
}>;

export type UmlAnalysisLimitationCode =
  | "OPERATIONS_NOT_EDITABLE"
  | "PACKAGES_NOT_EDITABLE"
  | "INTERFACES_NOT_SUPPORTED"
  | "REALIZATION_NOT_SUPPORTED"
  | "DEPENDENCY_NOT_SUPPORTED"
  | "ABSTRACT_CLASSES_NOT_SUPPORTED"
  | "STEREOTYPES_NOT_SUPPORTED"
  | "ROLE_NAMES_NOT_SUPPORTED"
  | "NAVIGABILITY_NOT_SUPPORTED"
  | "QUALIFIERS_NOT_SUPPORTED"
  | "OCL_CONSTRAINTS_NOT_SUPPORTED"
  | "DERIVED_OR_STATIC_ATTRIBUTES_NOT_SUPPORTED";

export type UmlAnalysisLimitation = Readonly<{
  code: UmlAnalysisLimitationCode;
  message: string;
  // Present only for limitations that affect concrete elements of this fragment.
  elementIds?: readonly Uuid[];
}>;

// Inconsistencies found while resolving references inside an otherwise extractable fragment.
export type UmlAnalysisIntegrityIssue = Readonly<{
  code: "UNRESOLVED_TYPE_REFERENCE" | "UNRESOLVED_RELATIONSHIP_END" | "UNRESOLVED_ASSOCIATION_CLASS";
  message: string;
  elementId: Uuid;
  missingId: Uuid;
}>;

export type UmlAnalysisFragment = Readonly<{
  focus: UmlAnalysisFocus;
  // Focused element first (when there is one); related elements needed to understand it follow.
  classes: readonly FragmentClass[];
  relatedClasses: readonly FragmentClassSummary[];
  enumerations: readonly FragmentEnumeration[];
  relationships: readonly FragmentRelationship[];
  packages: readonly FragmentPackage[];
  // Fixed reading rules of the fragment, so later phases (and the model provider) interpret ends correctly.
  conventions: readonly string[];
  // Contextual limitations (affecting elements of this fragment) followed by the UML features ShareGrams lacks.
  limitations: readonly UmlAnalysisLimitation[];
  integrityIssues: readonly UmlAnalysisIntegrityIssue[];
  // This builder never truncates; size limits belong to the later context phase and must be declared there.
  truncated: false;
}>;

export type UmlAnalysisErrorCode = "INVALID_FOCUS_ID" | "EMPTY_MODEL" | "CLASS_NOT_FOUND" | "RELATIONSHIP_NOT_FOUND" | "INCONSISTENT_REFERENCE";

export type UmlAnalysisError = Readonly<{ code: UmlAnalysisErrorCode; message: string; elementId?: Uuid }>;

export type UmlAnalysisFragmentResult = Readonly<{ ok: true; fragment: UmlAnalysisFragment }> | Readonly<{ ok: false; error: UmlAnalysisError }>;

// ---------------------------------------------------------------------------------------------
// Constants

// Same pattern the canonical validator uses for element ids (uml-core/src/validation.ts, not exported).
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const UML_ANALYSIS_CONVENTIONS: readonly string[] = [
  "sourceMultiplicity es la multiplicidad escrita junto a la clase source: cuántas instancias de source se relacionan con una instancia de target.",
  "targetMultiplicity es la multiplicidad escrita junto a la clase target: cuántas instancias de target se relacionan con una instancia de source.",
  "Una multiplicidad no especificada no equivale a 1: el modelo simplemente no la define.",
  "En Generalization, source es la clase hija y target es la clase padre; no admite multiplicidades.",
  "En Aggregation y Composition, source es el todo (extremo del rombo) y target es la parte.",
  "La disposición visual del diagrama no forma parte de este fragmento ni determina la semántica.",
];

// UML features ShareGrams does not model at all; reported on every fragment so nothing is assumed supported.
const UNSUPPORTED_FEATURES: readonly UmlAnalysisLimitation[] = [
  { code: "INTERFACES_NOT_SUPPORTED", message: "ShareGrams no modela interfaces." },
  { code: "REALIZATION_NOT_SUPPORTED", message: "ShareGrams no modela relaciones de realización." },
  { code: "DEPENDENCY_NOT_SUPPORTED", message: "ShareGrams no modela relaciones de dependencia." },
  { code: "ABSTRACT_CLASSES_NOT_SUPPORTED", message: "ShareGrams no distingue clases abstractas." },
  { code: "STEREOTYPES_NOT_SUPPORTED", message: "ShareGrams no modela estereotipos." },
  { code: "ROLE_NAMES_NOT_SUPPORTED", message: "Los extremos de una relación no tienen nombre de rol." },
  { code: "NAVIGABILITY_NOT_SUPPORTED", message: "Los extremos de una relación no declaran navegabilidad." },
  { code: "QUALIFIERS_NOT_SUPPORTED", message: "ShareGrams no modela calificadores de asociación." },
  { code: "OCL_CONSTRAINTS_NOT_SUPPORTED", message: "ShareGrams no modela restricciones OCL ni restricciones de extremo como {ordered}." },
  { code: "DERIVED_OR_STATIC_ATTRIBUTES_NOT_SUPPORTED", message: "ShareGrams no distingue atributos derivados ni estáticos." },
];

const ROLES: Readonly<Record<UmlRelationshipType, readonly [FragmentEndRole, FragmentEndRole]>> = {
  Association: ["end", "end"],
  Aggregation: ["whole", "part"],
  Composition: ["whole", "part"],
  Generalization: ["child", "parent"],
};

// ---------------------------------------------------------------------------------------------
// Builder

/**
 * Extrae un fragmento estructurado y serializable del modelo UML canónico para el elemento que se va a analizar:
 * una clase, una relación o el modelo completo.
 *
 * Precondición: `model` es un `CanonicalUmlModel` previamente validado con el mecanismo de validación del
 * proyecto (`validateCanonicalUmlModel` de `@examen-sw1/uml-core`). En los flujos normales de producción esa
 * validación ocurre antes de invocar esta función; por ejemplo, el executor del Command Bus rechaza cualquier
 * cambio que deje el modelo inválido y la persistencia valida el documento al guardarlo.
 *
 * Responsabilidad: extraer y proyectar información, no validar integralmente el modelo. No reemplaza ni duplica
 * el validador. Aun así conserva mecanismos defensivos: las referencias inconsistentes que encuentra (tipos,
 * extremos de relación o clases de asociación inexistentes) se informan en `integrityIssues` sin inventar
 * elementos, y una relación enfocada cuyo extremo no existe devuelve el error `INCONSISTENT_REFERENCE`.
 *
 * Es una función pura: no accede a base de datos, red ni estado de la interfaz, no modifica el modelo recibido
 * y, para la misma entrada, devuelve siempre el mismo resultado. Las situaciones esperadas (identificador
 * inválido, modelo vacío o elemento inexistente) se devuelven como `{ ok: false, error }`, no como excepciones.
 */
export function buildUmlAnalysisFragment(model: CanonicalUmlModel, focus: UmlAnalysisFocus): UmlAnalysisFragmentResult {
  if (focus.kind !== "model" && !UUID_PATTERN.test(focus.id)) {
    return failure("INVALID_FOCUS_ID", "El identificador del elemento a analizar no es un UUID válido.", focus.id);
  }
  if (model.classes.length === 0 && model.enumerations.length === 0) {
    return failure("EMPTY_MODEL", "El modelo no contiene clases ni enumeraciones para analizar.");
  }
  const index = indexModel(model);
  switch (focus.kind) {
    case "class":
      return classFragment(model, index, focus);
    case "relationship":
      return relationshipFragment(model, index, focus);
    case "model":
      return modelFragment(model, index, focus);
  }
}

type ModelIndex = Readonly<{
  classes: ReadonlyMap<Uuid, UmlClass>;
  enumerations: ReadonlyMap<Uuid, UmlEnumeration>;
  relationships: ReadonlyMap<Uuid, UmlRelationship>;
}>;

function indexModel(model: CanonicalUmlModel): ModelIndex {
  return {
    classes: new Map(model.classes.map((entry) => [entry.id, entry])),
    enumerations: new Map(model.enumerations.map((entry) => [entry.id, entry])),
    relationships: new Map(model.relationships.map((entry) => [entry.id, entry])),
  };
}

// Collects the projected pieces and the references that still have to be resolved, without duplicates.
class FragmentCollector {
  readonly classes = new Map<Uuid, FragmentClass>();
  readonly summaries = new Map<Uuid, FragmentClassSummary>();
  readonly enumerations = new Map<Uuid, FragmentEnumeration>();
  readonly relationships = new Map<Uuid, FragmentRelationship>();
  readonly issues: UmlAnalysisIntegrityIssue[] = [];

  constructor(private readonly index: ModelIndex) {}

  addClass(umlClass: UmlClass): void {
    if (this.classes.has(umlClass.id)) return;
    this.summaries.delete(umlClass.id);
    this.classes.set(umlClass.id, {
      id: umlClass.id,
      name: umlClass.name,
      visibility: umlClass.visibility,
      ...(umlClass.packageId ? { packageId: umlClass.packageId } : {}),
      attributes: umlClass.attributes.map((attribute) => this.attribute(attribute)),
      operations: umlClass.operations.map((operation) => this.operation(operation)),
    });
  }

  addSummary(classId: Uuid): void {
    const umlClass = this.index.classes.get(classId);
    if (umlClass && !this.classes.has(classId)) this.summaries.set(classId, { id: umlClass.id, name: umlClass.name });
  }

  addEnumeration(enumeration: UmlEnumeration): void {
    if (this.enumerations.has(enumeration.id)) return;
    this.enumerations.set(enumeration.id, {
      id: enumeration.id,
      name: enumeration.name,
      visibility: enumeration.visibility,
      ...(enumeration.packageId ? { packageId: enumeration.packageId } : {}),
      literals: [...enumeration.literals],
    });
  }

  addRelationship(relationship: UmlRelationship): FragmentRelationship {
    const existing = this.relationships.get(relationship.id);
    if (existing) return existing;
    const [sourceRole, targetRole] = ROLES[relationship.type];
    const projected: FragmentRelationship = {
      id: relationship.id,
      type: relationship.type,
      ...(relationship.name ? { name: relationship.name } : {}),
      source: this.end(relationship, relationship.sourceId, sourceRole, relationship.sourceMultiplicity),
      target: this.end(relationship, relationship.targetId, targetRole, relationship.targetMultiplicity),
      ...(relationship.associationClassId ? { associationClass: this.associationClass(relationship, relationship.associationClassId) } : {}),
      ...(relationship.foreignKeyOwner ? { foreignKeyOwner: relationship.foreignKeyOwner } : {}),
      selfReference: relationship.sourceId === relationship.targetId,
    };
    this.relationships.set(relationship.id, projected);
    return projected;
  }

  private attribute(attribute: UmlAttribute): FragmentAttribute {
    return {
      id: attribute.id,
      name: attribute.name,
      visibility: attribute.visibility,
      type: this.type(attribute.type, attribute.id),
      multiplicity: projectMultiplicity(attribute.multiplicity),
    };
  }

  private operation(operation: UmlOperation): FragmentOperation {
    return {
      id: operation.id,
      name: operation.name,
      visibility: operation.visibility,
      parameters: operation.parameters.map((parameter) => ({ id: parameter.id, name: parameter.name, type: this.type(parameter.type, parameter.id) })),
      ...(operation.returnType ? { returnType: this.type(operation.returnType, operation.id) } : {}),
    };
  }

  // Referenced enumerations are included in full (their literals explain the attribute); referenced classes
  // only as a name, because their own structure is outside the focus.
  private type(type: UmlType, ownerId: Uuid): FragmentType {
    if (type.kind === "primitive") return { kind: "primitive", name: type.name };
    if (type.referenceType === "enumeration") {
      const enumeration = this.index.enumerations.get(type.elementId);
      if (enumeration) {
        this.addEnumeration(enumeration);
        return { kind: "enumeration", id: enumeration.id, name: enumeration.name };
      }
    } else {
      const umlClass = this.index.classes.get(type.elementId);
      if (umlClass) {
        this.addSummary(umlClass.id);
        return { kind: "class", id: umlClass.id, name: umlClass.name };
      }
    }
    this.issues.push({ code: "UNRESOLVED_TYPE_REFERENCE", message: "El tipo referencia un elemento que no existe en el modelo.", elementId: ownerId, missingId: type.elementId });
    return { kind: "unresolved", referenceType: type.referenceType, id: type.elementId };
  }

  private end(relationship: UmlRelationship, elementId: Uuid, semanticRole: FragmentEndRole, multiplicity: Multiplicity | undefined): FragmentRelationshipEnd {
    const umlClass = this.index.classes.get(elementId);
    const enumeration = umlClass ? undefined : this.index.enumerations.get(elementId);
    if (umlClass) this.addSummary(umlClass.id);
    if (enumeration) this.addEnumeration(enumeration);
    if (!umlClass && !enumeration) {
      this.issues.push({ code: "UNRESOLVED_RELATIONSHIP_END", message: "Un extremo de la relación referencia un elemento que no existe en el modelo.", elementId: relationship.id, missingId: elementId });
    }
    return {
      elementId,
      elementKind: umlClass ? "class" : enumeration ? "enumeration" : "unresolved",
      ...(umlClass || enumeration ? { elementName: (umlClass ?? enumeration)!.name } : {}),
      semanticRole,
      multiplicity: projectMultiplicity(multiplicity),
    };
  }

  private associationClass(relationship: UmlRelationship, classId: Uuid): Readonly<{ id: Uuid; name?: string; resolved: boolean }> {
    const umlClass = this.index.classes.get(classId);
    if (umlClass) {
      this.addSummary(umlClass.id);
      return { id: classId, name: umlClass.name, resolved: true };
    }
    this.issues.push({ code: "UNRESOLVED_ASSOCIATION_CLASS", message: "La clase de asociación referenciada no existe en el modelo.", elementId: relationship.id, missingId: classId });
    return { id: classId, resolved: false };
  }
}

function classFragment(model: CanonicalUmlModel, index: ModelIndex, focus: Extract<UmlAnalysisFocus, { kind: "class" }>): UmlAnalysisFragmentResult {
  const focused = index.classes.get(focus.id);
  if (!focused) return failure("CLASS_NOT_FOUND", "La clase indicada no existe en el modelo vigente.", focus.id);
  const collector = new FragmentCollector(index);
  collector.addClass(focused);
  // Direct relationships: the class is an end, or it is the association class of an N:M association.
  for (const relationship of model.relationships) {
    if (relationship.sourceId === focused.id || relationship.targetId === focused.id || relationship.associationClassId === focused.id) {
      collector.addRelationship(relationship);
    }
  }
  return success(focus, collector, model);
}

function relationshipFragment(model: CanonicalUmlModel, index: ModelIndex, focus: Extract<UmlAnalysisFocus, { kind: "relationship" }>): UmlAnalysisFragmentResult {
  const relationship = index.relationships.get(focus.id);
  if (!relationship) return failure("RELATIONSHIP_NOT_FOUND", "La relación indicada no existe en el modelo vigente.", focus.id);
  // A relationship without both ends cannot be explained: report it instead of guessing the missing class.
  for (const endId of [relationship.sourceId, relationship.targetId]) {
    if (!index.classes.has(endId) && !index.enumerations.has(endId)) {
      return failure("INCONSISTENT_REFERENCE", "Un extremo de la relación referencia un elemento que no existe en el modelo.", endId);
    }
  }
  const collector = new FragmentCollector(index);
  collector.addRelationship(relationship);
  // Both end classes (and the association class) in full: their attributes are needed to explain the relationship.
  for (const classId of [relationship.sourceId, relationship.targetId, relationship.associationClassId]) {
    const umlClass = classId ? index.classes.get(classId) : undefined;
    if (umlClass) collector.addClass(umlClass);
  }
  return success(focus, collector, model);
}

function modelFragment(model: CanonicalUmlModel, index: ModelIndex, focus: Extract<UmlAnalysisFocus, { kind: "model" }>): UmlAnalysisFragmentResult {
  const collector = new FragmentCollector(index);
  for (const umlClass of model.classes) collector.addClass(umlClass);
  for (const enumeration of model.enumerations) collector.addEnumeration(enumeration);
  for (const relationship of model.relationships) collector.addRelationship(relationship);
  return success(focus, collector, model);
}

function success(focus: UmlAnalysisFocus, collector: FragmentCollector, model: CanonicalUmlModel): UmlAnalysisFragmentResult {
  const classes = [...collector.classes.values()];
  const packageIds = new Set([...classes.map((entry) => entry.packageId), ...[...collector.enumerations.values()].map((entry) => entry.packageId)].filter((id): id is Uuid => Boolean(id)));
  // The whole model includes every package; a focused fragment only the packages its elements belong to.
  const packages = model.packages.filter((entry) => focus.kind === "model" || packageIds.has(entry.id)).map((entry): FragmentPackage => ({ id: entry.id, name: entry.name, ...(entry.parentPackageId ? { parentPackageId: entry.parentPackageId } : {}) }));
  return {
    ok: true,
    fragment: {
      focus,
      classes,
      relatedClasses: [...collector.summaries.values()],
      enumerations: [...collector.enumerations.values()],
      relationships: [...collector.relationships.values()],
      packages,
      conventions: UML_ANALYSIS_CONVENTIONS,
      limitations: [...contextualLimitations(classes, packages), ...UNSUPPORTED_FEATURES],
      integrityIssues: [...collector.issues],
      truncated: false,
    },
  };
}

// Operations and packages are part of the canonical model but the editor cannot create or edit them yet.
function contextualLimitations(classes: readonly FragmentClass[], packages: readonly FragmentPackage[]): UmlAnalysisLimitation[] {
  const limitations: UmlAnalysisLimitation[] = [];
  const withOperations = classes.filter((entry) => entry.operations.length > 0).map((entry) => entry.id);
  if (withOperations.length > 0) {
    limitations.push({ code: "OPERATIONS_NOT_EDITABLE", message: "El modelo contiene operaciones, pero el editor actual no permite crearlas ni editarlas.", elementIds: withOperations });
  }
  if (packages.length > 0) {
    limitations.push({ code: "PACKAGES_NOT_EDITABLE", message: "El modelo contiene paquetes, pero el editor actual no permite crearlos ni editarlos.", elementIds: packages.map((entry) => entry.id) });
  }
  return limitations;
}

export function projectMultiplicity(value: Multiplicity | undefined): FragmentMultiplicity {
  if (!value) return { specified: false };
  return { specified: true, lower: value.lower, upper: value.upper, text: formatMultiplicityText(value) };
}

// "1", "0..1", "0..*", "1..*", "2..5": the textual form of UML 2.5 multiplicities.
export function formatMultiplicityText(value: Multiplicity): string {
  const upper = value.upper === "unbounded" ? "*" : String(value.upper);
  return value.upper !== "unbounded" && value.lower === value.upper ? upper : `${value.lower}..${upper}`;
}

function failure(code: UmlAnalysisErrorCode, message: string, elementId?: Uuid): UmlAnalysisFragmentResult {
  return { ok: false, error: { code, message, ...(elementId ? { elementId } : {}) } };
}

import { mapToRelationalModel, type RelationalDiagnostic } from "@examen-sw1/relational-core";
import { validateCanonicalUmlModel, type CanonicalUmlModel, type Diagnostic, type Uuid } from "@examen-sw1/uml-core";
import { buildRelationalFacts, type RelationalFacts, type SchemaLimitation, type StructuralConflict } from "./relational-facts";
import {
  buildUmlAnalysisFragment,
  type FragmentRelationship,
  type UmlAnalysisError,
  type UmlAnalysisFocus,
  type UmlAnalysisFragment,
  type UmlAnalysisLimitation,
} from "./uml-analysis-fragment";

// CU-2P-04, fase 3: assembles the deterministic analysis context that a later phase hands to the local model.
// Everything here is decided by the canonical model and the existing engines; no text is generated and no model
// provider is called. Each kind of content keeps its own place, so the reader never has to guess where it came from:
//   FACT        → `facts`        (UML fragment and relational structure)
//   DIAGNOSTIC  → `diagnostics`  (uml-core validator / relational-core mapper, never mixed)
//                 `conflicts`    (structural problems detected by relational-facts, not by a validator)
//   LIMITATION  → `limitations`  (what ShareGrams or the relational schema does not represent or guarantee)

// ---------------------------------------------------------------------------------------------
// Result types

// The UML fragment as FACT. Its limitations live in `UmlAnalysisContext.limitations` and its focus at the top
// level, so neither is repeated.
export type UmlFragmentFacts = Omit<UmlAnalysisFragment, "focus" | "limitations">;

// The relational structure as FACT. The top-level diagnostics, conflicts and limitations of `RelationalFacts` are
// moved to their own sections of the context. Per-element `diagnostics`, `reasons` and `notEnforcedBySchema` stay
// on each relationship/class because they explain that element's status.
export type RelationalStructureFacts = Omit<RelationalFacts, "diagnostics" | "conflicts" | "limitations">;

export type UmlAnalysisContext = Readonly<{
  focus: UmlAnalysisFocus;
  facts: Readonly<{ uml: UmlFragmentFacts; relational: RelationalStructureFacts }>;
  diagnostics: Readonly<{
    // `validateCanonicalUmlModel` is the single source of UML diagnostics (the mapper's REL_UML_* copies are dropped).
    uml: readonly Readonly<Diagnostic>[];
    // Diagnostics emitted by `mapToRelationalModel`, already scoped by `buildRelationalFacts`.
    relational: readonly RelationalDiagnostic[];
  }>;
  // Detected by relational-facts when reading the mapper output; they are not relational-core diagnostics.
  conflicts: readonly StructuralConflict[];
  limitations: Readonly<{
    // UML features ShareGrams does not model at all (interfaces, navigability, role names, OCL, abstract classes…).
    unsupportedFeatures: readonly UmlAnalysisLimitation[];
    // Elements of this fragment that exist in the model but the editor cannot edit (operations, packages).
    editor: readonly UmlAnalysisLimitation[];
    // Multiplicities, attributes and lifecycles the generated relational schema does not guarantee.
    schema: readonly SchemaLimitation[];
  }>;
  summary: Readonly<{
    // Errors among the in-scope diagnostics of each origin.
    hasUmlErrors: boolean;
    hasRelationalErrors: boolean;
    // Every class and relationship in scope has a complete relational structure.
    relationalDerivable: boolean;
  }>;
}>;

// The fragment could not be built: the context is not produced and nothing is analyzed in its place.
// Same stable, serializable error as the fragment builder (EMPTY_MODEL, CLASS_NOT_FOUND, RELATIONSHIP_NOT_FOUND…).
export type UmlAnalysisContextResult = Readonly<{ ok: true; context: UmlAnalysisContext }> | Readonly<{ ok: false; error: UmlAnalysisError }>;

// ---------------------------------------------------------------------------------------------
// Builder

/**
 * Reúne el contexto determinista para analizar un elemento del modelo UML: el fragmento UML, los diagnósticos
 * canónicos y relacionales, los hechos relacionales, los conflictos detectados y las limitaciones conocidas.
 *
 * Flujo por solicitud, cada paso una sola vez:
 * 1. `buildUmlAnalysisFragment(model, focus)`. Si falla (modelo vacío, elemento inexistente, ID inválido o
 *    referencia inconsistente) se devuelve ese error tipado y no se ejecuta nada más: un elemento eliminado nunca se
 *    busca por nombre ni se sustituye por otro parecido.
 * 2. `validateCanonicalUmlModel(model)`, fuente oficial de los diagnósticos UML, filtrados por el foco.
 * 3. `mapToRelationalModel(model)` sobre el modelo completo.
 * 4. `buildRelationalFacts(fragment, relational)`.
 *
 * Un resultado relacional no derivable (`success === false`) no convierte el análisis en error: el fragmento UML se
 * conserva y `summary.relationalDerivable` lo indica. Es una función pura y su resultado es serializable a JSON.
 */
export function buildUmlAnalysisContext(model: CanonicalUmlModel, focus: UmlAnalysisFocus): UmlAnalysisContextResult {
  const fragmentResult = buildUmlAnalysisFragment(model, focus);
  if (!fragmentResult.ok) return { ok: false, error: fragmentResult.error };
  const fragment = fragmentResult.fragment;

  const umlDiagnostics = scopeUmlDiagnostics(validateCanonicalUmlModel(model).diagnostics, fragment);
  const relational = buildRelationalFacts(fragment, mapToRelationalModel(model));

  const fragmentLimitations = fragment.limitations;
  const umlFacts: UmlFragmentFacts = {
    classes: fragment.classes,
    relatedClasses: fragment.relatedClasses,
    enumerations: fragment.enumerations,
    relationships: fragment.relationships,
    packages: fragment.packages,
    conventions: fragment.conventions,
    integrityIssues: fragment.integrityIssues,
    truncated: fragment.truncated,
  };
  const { diagnostics: relationalDiagnostics, conflicts, limitations: schemaLimitations, ...relationalFacts } = relational;

  return {
    ok: true,
    context: {
      focus: fragment.focus,
      facts: { uml: umlFacts, relational: relationalFacts },
      diagnostics: { uml: umlDiagnostics, relational: relationalDiagnostics },
      conflicts,
      limitations: {
        // The fragment only sets elementIds on limitations that affect concrete elements of the fragment.
        unsupportedFeatures: fragmentLimitations.filter((entry) => entry.elementIds === undefined),
        editor: fragmentLimitations.filter((entry) => entry.elementIds !== undefined),
        schema: schemaLimitations,
      },
      summary: {
        hasUmlErrors: umlDiagnostics.some((diagnostic) => diagnostic.severity === "error"),
        hasRelationalErrors: relationalDiagnostics.some((diagnostic) => diagnostic.severity === "error"),
        relationalDerivable: relational.derivable,
      },
    },
  };
}

// ---------------------------------------------------------------------------------------------
// UML diagnostics scope

// Diagnostics of an end class that make the relationship itself impossible to read correctly: the end cannot be
// identified unambiguously, or (for a generalization) the hierarchy it belongs to is cyclic.
const END_DIAGNOSTICS_FOR_ANY_RELATIONSHIP: ReadonlySet<string> = new Set(["UML_INVALID_ID", "UML_DUPLICATE_ID"]);
const END_DIAGNOSTICS_FOR_GENERALIZATION: ReadonlySet<string> = new Set([...END_DIAGNOSTICS_FOR_ANY_RELATIONSHIP, "UML_INHERITANCE_CYCLE"]);

// Matching is by elementId only; the validator output is already sorted, so filtering keeps it deterministic.
function scopeUmlDiagnostics(diagnostics: readonly Diagnostic[], fragment: UmlAnalysisFragment): readonly Readonly<Diagnostic>[] {
  const focus = fragment.focus;
  switch (focus.kind) {
    case "model":
      return [...diagnostics];
    case "class": {
      // The class with its own attributes, operations and parameters, its direct relationships and the
      // enumerations it uses. Related classes are summaries in the fragment and their diagnostics stay out.
      const ids = new Set<Uuid>([
        ...fragment.classes.flatMap((entry) => [entry.id, ...entry.attributes.map((attribute) => attribute.id), ...entry.operations.flatMap((operation) => [operation.id, ...operation.parameters.map((parameter) => parameter.id)])]),
        ...fragment.relationships.map((entry) => entry.id),
        ...fragment.enumerations.map((entry) => entry.id),
      ]);
      return diagnostics.filter((diagnostic) => diagnostic.elementId !== undefined && ids.has(diagnostic.elementId));
    }
    case "relationship": {
      const relationship = fragment.relationships.find((entry) => entry.id === focus.id);
      if (!relationship) return [];
      const endCodes = relationship.type === "Generalization" ? END_DIAGNOSTICS_FOR_GENERALIZATION : END_DIAGNOSTICS_FOR_ANY_RELATIONSHIP;
      const endIds = new Set(endElementIds(relationship));
      return diagnostics.filter((diagnostic) => diagnostic.elementId === relationship.id || (diagnostic.elementId !== undefined && endIds.has(diagnostic.elementId) && endCodes.has(diagnostic.code)));
    }
  }
}

function endElementIds(relationship: FragmentRelationship): Uuid[] {
  return [relationship.source.elementId, relationship.target.elementId, ...(relationship.associationClass ? [relationship.associationClass.id] : [])];
}

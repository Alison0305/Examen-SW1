import type { ClassFact, ForeignKeyFact, RelationshipFact } from "./relational-facts";
import type { UmlAnalysisContext } from "./uml-analysis-context";
import type { FragmentClass, FragmentMultiplicity, FragmentRelationship, FragmentType, UmlAnalysisLimitation } from "./uml-analysis-fragment";

// CU-2P-04, fase 4.2: compact, deterministic text projection of `UmlAnalysisContext` for the local model.
// The structured context is far larger than the local runtime window (a small 1:N relationship is ~6 000 JSON
// characters), so it is never serialized with JSON.stringify. Every line is read from the context: this module
// formats facts, it does not derive new semantics. Pure, independent of the model runtime and of NestJS.

// ---------------------------------------------------------------------------------------------
// Budget

// Mirrors backend/src/assistant/assistant.config.ts (CONTEXT_SIZE and MAX_OUTPUT_TOKENS); a test keeps them equal.
export const LOCAL_MODEL_CONTEXT_TOKENS = 4096;
export const LOCAL_MODEL_OUTPUT_TOKENS = 256;
// Qwen chat template (role markers, system/user wrappers) plus a safety margin for the estimate below.
export const PROMPT_TEMPLATE_RESERVE_TOKENS = 256;
// No tokenizer is reachable from this layer, so the budget is in characters. Spanish technical text with
// snake_case names, accents and symbols such as "[0..*]" or "→" tokenizes worse than plain prose; 2.5 characters
// per token is a deliberately pessimistic ratio. To be checked against the real tokenizer with the real model.
export const CONSERVATIVE_CHARACTERS_PER_TOKEN = 2.5;
// (4096 − 256 − 256) × 2.5 = 8 960 characters for system prompt + user prompt together.
export const MAX_PROMPT_CHARACTERS = Math.floor((LOCAL_MODEL_CONTEXT_TOKENS - LOCAL_MODEL_OUTPUT_TOKENS - PROMPT_TEMPLATE_RESERVE_TOKENS) * CONSERVATIVE_CHARACTERS_PER_TOKEN);

// Names come from the user's model: they are kept on one line, without markup, and capped.
const MAX_NAME_CHARACTERS = 80;

// ---------------------------------------------------------------------------------------------
// Result types

export type PromptOmissions = Readonly<{
  classes: number;
  enumerations: number;
  relationships: number;
  attributes: number;
  diagnostics: number;
  limitations: number;
}>;

export type ContextTruncation = Readonly<{ truncated: boolean; omitted: PromptOmissions }>;

export type UmlAnalysisPromptResult =
  | Readonly<{
    status: "ready";
    systemPrompt: string;
    userPrompt: string;
    contextTruncation: ContextTruncation;
    // systemPrompt.length + userPrompt.length, always ≤ budgetCharacters.
    characters: number;
    budgetCharacters: number;
  }>
  // The mandatory part (P0) does not fit: no prompt is built, because an incomplete one could induce errors.
  | Readonly<{
    status: "too-large";
    diagnostic: Readonly<{ code: "CONTEXT_TOO_LARGE"; message: string }>;
    requiredCharacters: number;
    budgetCharacters: number;
  }>;

export type UmlAnalysisPromptOptions = Readonly<{ maxPromptCharacters?: number }>;

// ---------------------------------------------------------------------------------------------
// System prompt (fixed; the reading rules appear here once and never per relationship)

export const UML_ANALYSIS_SYSTEM_PROMPT = [
  "Eres el Mentor IA de ShareGrams. Explicas un elemento de un modelo UML 2.5 y su transformación relacional.",
  "Reglas:",
  "- Responde en español, técnico y breve: máximo 120 palabras.",
  "- Usa solo los HECHOS entregados. No inventes clases, atributos, relaciones, multiplicidades, tablas, columnas ni FK.",
  "- Los hechos son deterministas: no los contradigas ni los corrijas.",
  "- Si los hechos no bastan para responder, dilo.",
  "- Separa hechos de observaciones: toda sugerencia empieza con \"Observación:\".",
  "- No afirmes que ShareGrams soporta algo marcado como no soportado.",
  "- No ejecutas acciones: nunca digas que el modelo fue modificado.",
  "- Explica cada línea de OBSERVACIONES RELEVANTES sin sustituirla por otra, con el nombre del elemento afectado y distinguiendo lo que expresa UML de lo que el esquema relacional garantiza.",
  "Lectura:",
  "- En \"A [m] — [n] B\", m es la multiplicidad escrita junto a A (source) y n la escrita junto a B (target). Las frases \"Por cada\" ya expresan cada sentido: úsalas tal cual.",
  "- Generalization: source es la hija y target el padre. Aggregation y Composition: source es el todo y target la parte.",
  "- La cardinalidad del mapper sigue el sentido source→target; la tabla de cada FK es la que indica su línea FK.",
  "Formato, omitiendo secciones vacías: Resumen:, Extremos y multiplicidades:, Implementación relacional:, Observaciones:.",
].join("\n");

// ---------------------------------------------------------------------------------------------
// Builder

/**
 * Proyecta un `UmlAnalysisContext` en un prompt compacto (texto) para el modelo local, dentro de un presupuesto
 * conservador de caracteres.
 *
 * El contenido se organiza en prioridades: P0 (foco, extremos, multiplicidades, hechos relacionales vinculados,
 * diagnósticos, conflictos y limitaciones directamente relevantes) nunca se recorta; P1, P2 y P3 se incorporan en
 * ese orden mientras quepan, por lo que el recorte ocurre en el orden inverso P3 → P2 → P1. Todo recorte se declara
 * en `contextTruncation` y en el bloque RECORTE del prompt. Si P0 no cabe, devuelve `too-large` con
 * `CONTEXT_TOO_LARGE` y ningún prompt.
 *
 * Los nombres sustituyen a los UUID; un UUID solo aparece para distinguir dos elementos con el mismo nombre.
 * Función pura y determinista; no modifica el contexto.
 */
export function buildUmlAnalysisPrompt(context: UmlAnalysisContext, options: UmlAnalysisPromptOptions = {}): UmlAnalysisPromptResult {
  const budgetCharacters = options.maxPromptCharacters ?? MAX_PROMPT_CHARACTERS;
  const items = collectItems(context, new Names(context));
  const required = items.filter((item) => item.tier === 0);
  const optional = items.filter((item) => item.tier !== 0).sort((left, right) => left.tier - right.tier || left.rank - right.rank || left.order - right.order);
  const isModel = context.focus.kind === "model";
  // Worst-case notice (every optional item omitted): its length bounds any real notice, so space is reserved for it.
  const reservedNotice = truncationNotice(omissionsOf(optional), isModel);
  const size = (selected: readonly PromptItem[]) => UML_ANALYSIS_SYSTEM_PROMPT.length + renderUserPrompt(selected, reservedNotice).length;

  // Everything fits without a truncation notice: nothing is cut. Checked first, so the space reserved for the
  // notice never rejects a context that fits whole.
  const complete = renderUserPrompt(items, "No");
  if (UML_ANALYSIS_SYSTEM_PROMPT.length + complete.length <= budgetCharacters) {
    return { status: "ready", systemPrompt: UML_ANALYSIS_SYSTEM_PROMPT, userPrompt: complete, contextTruncation: { truncated: false, omitted: { ...EMPTY_OMISSIONS } }, characters: UML_ANALYSIS_SYSTEM_PROMPT.length + complete.length, budgetCharacters };
  }

  const requiredCharacters = size(required);
  if (requiredCharacters > budgetCharacters) {
    return {
      status: "too-large",
      diagnostic: { code: "CONTEXT_TOO_LARGE", message: "Los hechos obligatorios del elemento enfocado no caben en el contexto del modelo local; no se construye un prompt incompleto." },
      requiredCharacters,
      budgetCharacters,
    };
  }

  // Tiers are filled in order and filling stops at the first item that does not fit, so a lower-priority item is
  // never kept while a higher-priority one is dropped.
  let selected: PromptItem[] = required;
  for (const item of optional) {
    const candidate = [...selected, item];
    if (size(candidate) > budgetCharacters) break;
    selected = candidate;
  }
  const omittedItems = optional.filter((item) => !selected.includes(item));
  const omitted = omissionsOf(omittedItems);
  const truncated = omittedItems.length > 0;
  const userPrompt = renderUserPrompt(selected, truncated ? truncationNotice(omitted, isModel) : "No");
  return {
    status: "ready",
    systemPrompt: UML_ANALYSIS_SYSTEM_PROMPT,
    userPrompt,
    contextTruncation: { truncated, omitted },
    characters: UML_ANALYSIS_SYSTEM_PROMPT.length + userPrompt.length,
    budgetCharacters,
  };
}

// ---------------------------------------------------------------------------------------------
// Items and rendering

type Tier = 0 | 1 | 2 | 3;
type Section = "focus" | "state" | "uml" | "relational" | "diagnostics" | "conflicts" | "limitations" | "relevant";

export const RELEVANT_OBSERVATIONS_TITLE = "OBSERVACIONES RELEVANTES — DEBEN EXPLICARSE";
export const OTHER_LIMITATIONS_TITLE = "OTRAS LIMITACIONES";

// Fase 4.7.1: the schema and editor limitations of the P0 elements are relabelled as observations that must be
// explained, apart from the generic catalog of unsupported features and from the limitations of non-focused
// elements. Only the label changes: no content is created and the tiers (hence the truncation order) stay as they
// were. The mandatory block goes last, right before RECORTE, so the small model reads it closest to its answer.
const SECTIONS: readonly (readonly [Section, string])[] = [
  ["focus", "FOCO"],
  ["state", "ESTADO"],
  ["uml", "HECHOS UML"],
  ["relational", "HECHOS RELACIONALES"],
  ["diagnostics", "DIAGNÓSTICOS"],
  ["conflicts", "CONFLICTOS"],
  ["limitations", OTHER_LIMITATIONS_TITLE],
  ["relevant", RELEVANT_OBSERVATIONS_TITLE],
];

// Element limitations are mandatory only when they belong to the P0 content of the focus.
const limitationSection = (tier: Tier): Section => (tier === 0 ? "relevant" : "limitations");

// One unit of content that is kept or omitted as a whole; it may write lines into several sections.
type PromptItem = Readonly<{
  // Position in the rendered prompt.
  order: number;
  tier: Tier;
  // Inside a tier, lower ranks are kept first (in the whole model, relationships before attributes).
  rank: number;
  counts: Partial<Record<keyof PromptOmissions, number>>;
  parts: readonly (readonly [Section, readonly string[]])[];
}>;

function renderUserPrompt(items: readonly PromptItem[], notice: string): string {
  const ordered = [...items].sort((left, right) => left.order - right.order);
  const blocks = SECTIONS.map(([section, title]) => {
    const lines = ordered.flatMap((item) => item.parts.filter(([target]) => target === section).flatMap(([, content]) => content));
    return `${title}\n${(lines.length > 0 ? lines : ["ninguno"]).map(oneLine).join("\n")}`;
  });
  return [...blocks, `RECORTE\n${notice}`].join("\n\n");
}

const EMPTY_OMISSIONS: PromptOmissions = { classes: 0, enumerations: 0, relationships: 0, attributes: 0, diagnostics: 0, limitations: 0 };

function omissionsOf(items: readonly PromptItem[]): PromptOmissions {
  const total: Record<keyof PromptOmissions, number> = { ...EMPTY_OMISSIONS };
  for (const item of items) {
    for (const key of Object.keys(item.counts) as (keyof PromptOmissions)[]) total[key] += item.counts[key] ?? 0;
  }
  return total;
}

const OMISSION_WORDS: readonly (readonly [keyof PromptOmissions, string, string])[] = [
  ["classes", "clase", "clases"],
  ["enumerations", "enumeración", "enumeraciones"],
  ["relationships", "relación", "relaciones"],
  ["attributes", "atributo", "atributos"],
  ["diagnostics", "diagnóstico", "diagnósticos"],
  ["limitations", "limitación", "limitaciones"],
];

function truncationNotice(omitted: PromptOmissions, isModel: boolean): string {
  const parts = OMISSION_WORDS.filter(([key]) => omitted[key] > 0).map(([key, singular, plural]) => `${omitted[key]} ${omitted[key] === 1 ? singular : plural}`);
  if (parts.length === 0) return "No";
  const complete = isModel ? "El resumen global, los diagnósticos de error y los conflictos están completos." : "Los hechos del elemento enfocado están completos.";
  return `CONTEXTO RECORTADO: se omitieron ${spanishList(parts)} secundarios. ${complete}`;
}

function spanishList(parts: readonly string[]): string {
  return parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}`;
}

// Every rendered line is a single line of plain text: no control characters, no markup.
function oneLine(value: string): string {
  const plain = [...value].map((character) => {
    const code = character.charCodeAt(0);
    return code < 0x20 || code === 0x7f || character === "<" || character === ">" ? " " : character;
  }).join("");
  return plain.replace(/ {2,}/g, " ").trim();
}

// ---------------------------------------------------------------------------------------------
// Names (UUIDs only to tell apart two elements with the same name)

class Names {
  private readonly classifiers = new Map<string, string>();
  private readonly attributes = new Map<string, string>();
  private readonly relationships = new Map<string, string>();

  constructor(context: UmlAnalysisContext) {
    const uml = context.facts.uml;
    const classifiers = [...uml.classes, ...uml.relatedClasses, ...uml.enumerations];
    const occurrences = countBy(classifiers.map((entry) => cleanName(entry.name)));
    for (const entry of classifiers) {
      const name = cleanName(entry.name);
      this.classifiers.set(entry.id, (occurrences.get(name) ?? 0) > 1 ? `${name} (id ${entry.id})` : name);
    }
    for (const umlClass of uml.classes) {
      for (const attribute of umlClass.attributes) this.attributes.set(attribute.id, `${this.classifier(umlClass.id)}.${cleanName(attribute.name)}`);
    }
    const labels = uml.relationships.map((relationship) => this.baseLabel(relationship));
    const labelOccurrences = countBy(labels);
    uml.relationships.forEach((relationship, position) => {
      const label = labels[position]!;
      this.relationships.set(relationship.id, (labelOccurrences.get(label) ?? 0) > 1 ? `${label} (id ${relationship.id})` : label);
    });
  }

  classifier(id: string, fallback = "elemento desconocido"): string {
    return this.classifiers.get(id) ?? fallback;
  }

  relationship(id: string): string {
    return this.relationships.get(id) ?? "relación desconocida";
  }

  hasRelationship(id: string): boolean {
    return this.relationships.has(id);
  }

  // Label for a diagnostic target; undefined rather than a UUID when the element is not named in the fragment.
  element(id: string | undefined): string | undefined {
    if (id === undefined) return undefined;
    return this.classifiers.get(id) ?? this.attributes.get(id) ?? this.relationships.get(id);
  }

  end(relationship: FragmentRelationship, side: "source" | "target"): string {
    const end = relationship[side];
    return end.elementName === undefined ? "elemento inexistente" : this.classifier(end.elementId, cleanName(end.elementName));
  }

  private baseLabel(relationship: FragmentRelationship): string {
    const source = this.end(relationship, "source");
    const target = this.end(relationship, "target");
    if (relationship.type === "Generalization") return `${source} → ${target}`;
    return relationship.name ? `${source} — ${cleanName(relationship.name)} — ${target}` : `${source} — ${target}`;
  }
}

function cleanName(value: string): string {
  const name = oneLine(value);
  return name.length > MAX_NAME_CHARACTERS ? `${name.slice(0, MAX_NAME_CHARACTERS - 1)}…` : name;
}

function countBy(values: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

// ---------------------------------------------------------------------------------------------
// Collecting items per focus

// UML features whose absence matters for the focused content even without a user question.
const RELATIONSHIP_FEATURES = new Set(["ROLE_NAMES_NOT_SUPPORTED", "NAVIGABILITY_NOT_SUPPORTED"]);
const GENERALIZATION_FEATURES = new Set(["ABSTRACT_CLASSES_NOT_SUPPORTED"]);

const TYPE_LABELS: Readonly<Record<FragmentRelationship["type"], string>> = {
  Association: "Asociación",
  Aggregation: "Agregación",
  Composition: "Composición",
  Generalization: "Herencia",
};

function collectItems(context: UmlAnalysisContext, names: Names): PromptItem[] {
  const uml = context.facts.uml;
  const focus = context.focus;
  const items: PromptItem[] = [];
  const add = (tier: Tier, counts: PromptItem["counts"], parts: PromptItem["parts"], rank = 0) => items.push({ order: items.length, tier, rank, counts, parts });
  // Ranks inside P2 of the whole model: relationships, then attributes, then enumerations, then warnings.
  const RANK = { relationship: 0, attributes: 1, enumeration: 2, warning: 3 } as const;

  const relationshipFacts = new Map(context.facts.relational.relationships.map((entry) => [entry.relationshipId, entry]));
  const classFacts = new Map(context.facts.relational.classes.map((entry) => [entry.classId, entry]));
  const schemaLimitations = context.limitations.schema;
  const limitationsOf = (elementId: string) => schemaLimitations.filter((entry) => entry.elementId === elementId);

  // P0 element sets per focus.
  const focusedRelationships = focus.kind === "model" ? [] : uml.relationships;
  const focusedClassIds = new Set<string>(
    focus.kind === "class" ? [focus.id]
      : focus.kind === "relationship" ? uml.classes.map((entry) => entry.id)
        : [],
  );
  const attributeIdsOfFocus = new Set(uml.classes.filter((entry) => focus.kind === "class" && entry.id === focus.id).flatMap((entry) => [
    ...entry.attributes.map((attribute) => attribute.id),
    ...entry.operations.flatMap((operation) => [operation.id, ...operation.parameters.map((parameter) => parameter.id)]),
  ]));
  const p0Ids = new Set<string>([...focusedClassIds, ...attributeIdsOfFocus, ...focusedRelationships.map((entry) => entry.id)]);

  // FOCO and ESTADO (P0)
  add(0, {}, [["focus", focusLines(context, names)], ["state", stateLines(context)]]);

  // Classes: a header (name, table, primary key) and, separately, its attributes and operations.
  const fullClasses = new Map(uml.classes.map((entry) => [entry.id, entry]));
  const classIds = [...uml.classes.map((entry) => entry.id), ...uml.relatedClasses.map((entry) => entry.id)];
  for (const classId of classIds) {
    const headerTier: Tier = focus.kind === "model" ? 1 : focusedClassIds.has(classId) ? 0 : 1;
    add(headerTier, { classes: 1 }, [["uml", [`Clase ${names.classifier(classId)}`]], ["relational", [classRelationalLine(classId, classFacts.get(classId), names)]]]);
    const full = fullClasses.get(classId);
    if (full && (full.attributes.length > 0 || full.operations.length > 0)) {
      const attributeTier: Tier = focus.kind === "model" ? 2 : focus.kind === "class" && classId === focus.id ? 0 : 1;
      const limitations = full.attributes.flatMap((attribute) => limitationsOf(attribute.id));
      add(attributeTier, { attributes: full.attributes.length, limitations: limitations.length }, [
        ["uml", classMemberLines(full, classFacts.get(classId), names)],
        [limitationSection(attributeTier), limitations.map((entry) => entry.message)],
      ], RANK.attributes);
    }
  }

  // Relationships: P0 when they are the focus or direct relationships of the focused class; P2 in the whole model.
  for (const relationship of uml.relationships) {
    const fact = relationshipFacts.get(relationship.id);
    const limitations = limitationsOf(relationship.id);
    const relationshipTier: Tier = focus.kind === "model" ? 2 : 0;
    add(relationshipTier, { relationships: 1, limitations: limitations.length }, [
      ["uml", relationshipUmlLines(relationship, names)],
      ["relational", fact ? relationshipRelationalLines(relationship, fact, names) : []],
      [limitationSection(relationshipTier), limitations.map((entry) => entry.message)],
    ], RANK.relationship);
  }

  for (const enumeration of uml.enumerations) {
    add(focus.kind === "model" ? 2 : 1, { enumerations: 1 }, [["uml", [`Enumeración ${names.classifier(enumeration.id)}: ${enumeration.literals.map(cleanName).join(", ")}`]]], RANK.enumeration);
  }

  // Diagnostics: P0 for the focused elements (errors in the whole model); the rest P1 (warnings of the model, P2).
  const diagnosticTier = (elementId: string | undefined, severity: "error" | "warning"): Tier => {
    if (focus.kind === "model") return severity === "error" ? 0 : 2;
    return elementId !== undefined && p0Ids.has(elementId) ? 0 : 1;
  };
  for (const diagnostic of context.diagnostics.uml) {
    add(diagnosticTier(diagnostic.elementId, diagnostic.severity), { diagnostics: 1 }, [["diagnostics", [diagnosticLine("UML", diagnostic.code, diagnostic.message, names.element(diagnostic.elementId))]]], RANK.warning);
  }
  for (const diagnostic of context.diagnostics.relational) {
    add(diagnosticTier(diagnostic.elementId, diagnostic.severity), { diagnostics: 1 }, [["diagnostics", [diagnosticLine("Relacional", diagnostic.code, diagnostic.message, names.element(diagnostic.elementId))]]], RANK.warning);
  }
  for (const issue of uml.integrityIssues) {
    add(0, { diagnostics: 1 }, [["diagnostics", [diagnosticLine("Integridad", issue.code, issue.message, names.element(issue.elementId))]]]);
  }

  // Conflicts are already scoped to the fragment by relational-facts: always P0.
  for (const conflict of context.conflicts) {
    // The other relationship of a conflict may lie outside the fragment: it is counted, never guessed by name.
    const known = conflict.relationshipIds.filter((id) => names.hasRelationship(id)).map((id) => names.relationship(id));
    const outside = conflict.relationshipIds.length - known.length;
    const relationships = [...known, ...(outside > 0 ? [`${outside} ${outside === 1 ? "relación" : "relaciones"} fuera del foco`] : [])];
    add(0, {}, [["conflicts", [`${conflict.code} en ${conflict.table}.${conflict.column} (detectado por el análisis de ShareGrams, no por el mapper): ${conflict.message} Relaciones: ${spanishList(relationships)}.`]]]);
  }

  // Schema limitations not attached above (elements outside the projected relationships and classes).
  const attachedIds = new Set([...uml.relationships.map((entry) => entry.id), ...uml.classes.flatMap((entry) => entry.attributes.map((attribute) => attribute.id))]);
  for (const limitation of schemaLimitations.filter((entry) => !attachedIds.has(entry.elementId))) {
    add(0, { limitations: 1 }, [["relevant", [limitation.message]]]);
  }

  // Editor limitations affect concrete elements of this fragment: P0.
  for (const limitation of context.limitations.editor) add(0, { limitations: 1 }, [["relevant", [limitation.message]]]);

  // Unsupported features: those that matter for the focused relationships are P0; the general catalog is P3.
  // Both are generic product limitations, so they stay in OTRAS LIMITACIONES: P0 only keeps them from truncation.
  const relevant = relevantFeatures(focusedRelationships);
  for (const limitation of context.limitations.unsupportedFeatures) {
    add(relevant.has(limitation.code) ? 0 : 3, { limitations: 1 }, [["limitations", [unsupportedLine(limitation)]]]);
  }
  return items;
}

function relevantFeatures(relationships: readonly FragmentRelationship[]): ReadonlySet<string> {
  const codes = new Set<string>();
  for (const relationship of relationships) {
    for (const code of relationship.type === "Generalization" ? GENERALIZATION_FEATURES : RELATIONSHIP_FEATURES) codes.add(code);
  }
  return codes;
}

function unsupportedLine(limitation: UmlAnalysisLimitation): string {
  return `No soportado: ${limitation.message}`;
}

// ---------------------------------------------------------------------------------------------
// Lines

function focusLines(context: UmlAnalysisContext, names: Names): string[] {
  const uml = context.facts.uml;
  const focus = context.focus;
  if (focus.kind === "class") return [`Clase: ${names.classifier(focus.id)}`];
  if (focus.kind === "relationship") {
    const relationship = uml.relationships.find((entry) => entry.id === focus.id);
    if (!relationship) return ["Relación: relación desconocida"];
    return [relationship.type === "Generalization" ? `Herencia: ${names.relationship(relationship.id)}` : `Relación (${TYPE_LABELS[relationship.type]}): ${names.relationship(relationship.id)}`];
  }
  const byType = (["Association", "Aggregation", "Composition", "Generalization"] as const)
    .map((type) => [type, uml.relationships.filter((entry) => entry.type === type).length] as const)
    .filter(([, count]) => count > 0)
    .map(([type, count]) => `${count} ${TYPE_LABELS[type]}`);
  return [
    "Modelo completo",
    `Contenido: ${uml.classes.length} clases, ${uml.enumerations.length} enumeraciones, ${uml.relationships.length} relaciones${byType.length > 0 ? ` (${byType.join(", ")})` : ""}.`,
  ];
}

function stateLines(context: UmlAnalysisContext): string[] {
  const yesNo = (value: boolean) => (value ? "sí" : "no");
  return [`Errores UML: ${yesNo(context.summary.hasUmlErrors)}. Errores relacionales: ${yesNo(context.summary.hasRelationalErrors)}. Transformación relacional completa: ${yesNo(context.summary.relationalDerivable)}.`];
}

function multiplicity(value: FragmentMultiplicity): string {
  return value.specified ? value.text : "sin especificar";
}

function relationshipUmlLines(relationship: FragmentRelationship, names: Names): string[] {
  const source = names.end(relationship, "source");
  const target = names.end(relationship, "target");
  if (relationship.type === "Generalization") return [`Herencia: ${source} → ${target}. Hija: ${source}. Padre: ${target}.`];
  const label = relationship.name ? ` "${cleanName(relationship.name)}"` : "";
  const roles = relationship.type === "Association" ? "" : ` Todo: ${source}. Parte: ${target}.`;
  const lines = [`${TYPE_LABELS[relationship.type]}${label}: ${source} [${multiplicity(relationship.source.multiplicity)}] — [${multiplicity(relationship.target.multiplicity)}] ${target}.${roles}`];
  lines.push(...directionalPhrases(relationship, source, target));
  if (relationship.associationClass) {
    lines.push(relationship.associationClass.resolved ? `Clase asociativa: ${names.classifier(relationship.associationClass.id)}.` : "Clase asociativa: referencia a una clase inexistente.");
  }
  if (relationship.foreignKeyOwner) lines.push(`foreignKeyOwner declarado: ${relationship.foreignKeyOwner} (${relationship.foreignKeyOwner === "SOURCE" ? source : target}).`);
  return lines;
}

// The multiplicity written next to an end counts that end's instances per instance of the opposite end, so
// "for each source" reads the target multiplicity and "for each target" the source multiplicity. Both are read
// from the fragment ends; the diagram orientation plays no part.
function directionalPhrases(relationship: FragmentRelationship, source: string, target: string): string[] {
  const subjectSource = relationship.selfReference ? `${source} (extremo source)` : source;
  const subjectTarget = relationship.selfReference ? `${target} (extremo target)` : target;
  const phrase = (subject: string, related: string, value: FragmentMultiplicity) =>
    value.specified ? `Por cada ${subject}: ${value.text} ${related}.` : `Por cada ${subject}: multiplicidad de ${related} sin especificar.`;
  return [phrase(subjectSource, subjectTarget, relationship.target.multiplicity), phrase(subjectTarget, subjectSource, relationship.source.multiplicity)];
}

function relationshipRelationalLines(relationship: FragmentRelationship, fact: RelationshipFact, names: Names): string[] {
  const label = names.relationship(relationship.id);
  if (fact.status === "not-derivable") {
    const reasons = fact.reasons.map((reason) => (reason.origin === "relational-core" ? reason.code : "causa no determinable con la información disponible"));
    return [
      `${label}: transformación relacional no derivable. Motivo: ${reasons.join(", ") || "causa no determinable con la información disponible"}.`,
      ...fact.foreignKeys.map((foreignKey) => `FK generada parcialmente: ${foreignKeyText(foreignKey)}.`),
    ];
  }
  const lines: string[] = [];
  const cardinality = fact.mapperCardinality ? `Cardinalidad del mapper: ${fact.mapperCardinality}${fact.mapperRelationRecords > 1 ? ` (${fact.mapperRelationRecords} registros, uno por extremo)` : ""}.` : undefined;
  switch (fact.strategy) {
    case "foreign-key":
      lines.push(`${label}: estrategia FK.`, ...fact.foreignKeys.map((foreignKey) => `FK ${foreignKeyText(foreignKey)}.`));
      if (fact.foreignKeyPlacement === "fallback-source") lines.push("Ubicación de la FK: fallback SOURCE del mapper, porque el modelo no define foreignKeyOwner; no es una decisión explícita del modelo.");
      else if (fact.foreignKeyPlacement === "explicit-owner") lines.push("Ubicación de la FK: foreignKeyOwner explícito del modelo.");
      else lines.push("Ubicación de la FK: tabla del lado muchos según las multiplicidades.");
      break;
    case "join-table": {
      const join = fact.joinTable!;
      lines.push(`${label}: tabla intermedia ${join.name}; columnas ${join.columns.join(", ")}; restricción única compuesta (${join.uniqueOn.join(", ")}); ${join.primaryKey ? `PK ${join.primaryKey}` : "sin PK propia"}.`);
      lines.push(...fact.foreignKeys.map((foreignKey) => `FK ${foreignKeyText(foreignKey)}.`));
      break;
    }
    case "association-class-table": {
      const table = fact.associationClassTable!;
      const primaryKey = table.primaryKey ? `PK ${table.primaryKey}${table.technicalPrimaryKey ? " (técnica, generada por el mapper)" : ""}` : "sin PK";
      lines.push(`${label}: tabla de la clase asociativa ${table.table}; ${primaryKey}; restricción única compuesta (${table.uniqueOn.join(", ")}).`);
      lines.push(...fact.foreignKeys.map((foreignKey) => `FK ${foreignKeyText(foreignKey)}.`));
      break;
    }
    case "joined-inheritance": {
      const inheritance = fact.inheritance!;
      lines.push(`${label}: estrategia relacional JOINED; la tabla ${inheritance.childTable} hereda de ${inheritance.parentTable}.`);
      lines.push(...fact.foreignKeys.map((foreignKey) => `FK de herencia ${foreignKeyText(foreignKey)}.`));
      break;
    }
  }
  if (cardinality) lines.push(cardinality);
  return lines;
}

function foreignKeyText(foreignKey: ForeignKeyFact): string {
  const yesNo = (value: boolean) => (value ? "sí" : "no");
  return `${foreignKey.ownerTable}.${foreignKey.column} → ${foreignKey.references.table}.${foreignKey.references.column}; nullable: ${yesNo(foreignKey.nullable)}; única: ${yesNo(foreignKey.unique)}; lifecycle: ${foreignKey.lifecycle}`;
}

function classRelationalLine(classId: string, fact: ClassFact | undefined, names: Names): string {
  const name = names.classifier(classId);
  const reasons = (fact?.reasons ?? []).map((reason) => (reason.origin === "relational-core" ? reason.code : "causa no determinable"));
  if (!fact || fact.table === undefined) return `Clase ${name}: sin tabla${reasons.length > 0 ? ` (${reasons.join(", ")})` : ""}.`;
  if (fact.status === "mapped") return `Clase ${name}: tabla ${fact.table}, PK ${fact.primaryKey}.`;
  return `Clase ${name}: tabla ${fact.table}, ${fact.primaryKey ? `PK ${fact.primaryKey}` : "sin PK"}; transformación no derivable (${reasons.join(", ")}).`;
}

function classMemberLines(umlClass: FragmentClass, fact: ClassFact | undefined, names: Names): string[] {
  const columns = new Map((fact?.attributes ?? []).map((entry) => [entry.attributeId, entry]));
  const lines = umlClass.attributes.map((attribute) => {
    const column = columns.get(attribute.id);
    const declared = `${names.classifier(umlClass.id)}.${cleanName(attribute.name)}: ${typeText(attribute.type, names)}${attribute.multiplicity.specified ? ` [${attribute.multiplicity.text}]` : ""}`;
    if (!column) return `${declared}.`;
    if (column.status === "not-derivable") return `${declared} → sin columna (${column.reasons.map((reason) => (reason.origin === "relational-core" ? reason.code : "causa no determinable")).join(", ")}).`;
    const flags = [column.type, column.identifier ? "PK" : column.nullable ? "NULL" : "NOT NULL", ...(column.unique ? ["UNIQUE"] : [])];
    return `${declared} → columna ${column.column} ${flags.join(" ")}.`;
  });
  const operations = umlClass.operations.map((operation) => `${cleanName(operation.name)}(${operation.parameters.map((parameter) => `${cleanName(parameter.name)}: ${typeText(parameter.type, names)}`).join(", ")})${operation.returnType ? `: ${typeText(operation.returnType, names)}` : ""}`);
  if (operations.length > 0) lines.push(`Operaciones de ${names.classifier(umlClass.id)}: ${operations.join("; ")}.`);
  return lines;
}

function typeText(type: FragmentType, names: Names): string {
  if (type.kind === "primitive") return type.name;
  if (type.kind === "unresolved") return "referencia no resuelta";
  return names.classifier(type.id, cleanName(type.name));
}

function diagnosticLine(origin: "UML" | "Relacional" | "Integridad", code: string, message: string, label: string | undefined): string {
  return `${origin} ${code}${label ? ` [${label}]` : ""}: ${message}`;
}

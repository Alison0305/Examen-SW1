import type { MentorProjectContext, MentorRecommendationContext, MentorRecommendationDraft, MentorRecommendationResponse } from "./mentor.contracts";

export const VERIFIED_RECOMMENDATION_CONTEXT: MentorRecommendationContext = {
  architecture: [
    "El frontend usa Next.js App Router y Material UI.",
    "La API principal usa NestJS con Fastify.",
    "La persistencia usa PostgreSQL y Prisma.",
    "Qwen se ejecuta localmente mediante el runtime configurado.",
    "El modelo UML canónico es la fuente de verdad semántica; el layout es solo visual.",
  ],
  springExport: [
    "La exportación valida el UML canónico y lo transforma determinísticamente a un modelo relacional.",
    "El backend generado usa Java 21, Spring Boot, Gradle, Spring Web MVC, Spring Data JPA, Hibernate, Jakarta Validation, Jackson, springdoc-openapi y PostgreSQL.",
    "La exportación solo genera desde modelos UML válidos con entidades exportables.",
  ],
};

const currentArchitecture = {
  frontend: "Next.js",
  backend: "NestJS",
  database: "PostgreSQL",
  orm: "Prisma",
  ai: "Qwen local",
  backendGenerator: "Spring Boot",
} as const;

const forbiddenCurrentArchitecture = ["React", "Node.js", "microservices", "Firebase", "Django", "Laravel"] as const;
const architectureQuestion = /\b(?:arquitectura|stack|frontend|backend|capas?|m[oó]dulos?|servicios?|dto(?:s)?|responsabilidades?|presentaci[oó]n|persistencia)\b/i;

const normalize = (value: string): string => value.normalize("NFC").trim().toLocaleLowerCase("es");
const externalTopic = /\b(?:pagos?|payments?|stripe|paypal|mercado\s*pago|aws|azure|gcp|kubernetes)\b/i;
const explicitElement = /\b(?:clase|class|enum(?:eraci[oó]n)?)(?:\s+(?:la|el))?\s+["'`]?([A-Za-z_][A-Za-z0-9_]*)/i;
const explicitComponent = /\b(?:servicio|service|componente|component)(?:\s+(?:de|del|la|el))?\s+["'`]?([A-Za-z_][A-Za-z0-9_-]*)/i;
const explicitRelation = /\brelaci[oó]n(?:\s+entre)?\s+["'`]?([A-Za-z_][A-Za-z0-9_]*)["'`]?\s+(?:y|con)\s+["'`]?([A-Za-z_][A-Za-z0-9_]*)/i;
const unverifiedStackReference = /\b(?:react(?:\.js)?|node(?:\.js)?|microservicios?)\b/i;
const explicitlyFutureAlternative = /\b(?:alternativa futura|como alternativa|podr[ií]as evaluar|evaluar a futuro|a futuro)\b/i;
const attributeAddition = /\b(?:agregar|añadir|incorporar)\s+(?:un|una|el|la)?\s*["'`]?([\p{L}_][\p{L}\p{N}_ -]*?)["'`]?\s+(?:a|en)\s+(?:la\s+clase\s+)?([A-Za-z_][A-Za-z0-9_]*)\b/iu;
const springGeneratorReference = /\b(?:spring\s*boot|generador\s+spring|backend\s+spring)\b/i;
const springGenerationIntent = /\b(?:generar|generación|exportar|exportación|compatibilidad|compatible|preparar|preparación|validar|validación|modelo|uml|tener\s+en\s+cuenta|recomend)/i;

export function hasUnsupportedCurrentStackReference(recommendation: MentorRecommendationDraft): boolean {
  const contextualFields = [recommendation.problem, recommendation.rationale, recommendation.limitations];
  if (contextualFields.some((field) => unverifiedStackReference.test(field))) return true;
  return recommendation.alternatives.some((alternative) => unverifiedStackReference.test(alternative) && !explicitlyFutureAlternative.test(alternative));
}

export function verifiedArchitectureBlocks(): string {
  const current = Object.entries(currentArchitecture).map(([name, value]) => `${name} = ${value}`).join("\n");
  return `CURRENT_ARCHITECTURE\n${current}\n\nDO_NOT_PRESENT_AS_CURRENT\n${forbiddenCurrentArchitecture.join("\n")}`;
}

export function buildVerifiedArchitectureFallback(question: string): MentorRecommendationDraft | undefined {
  if (!architectureQuestion.test(question)) return undefined;
  return {
    problem: "Recomendación de arquitectura basada exclusivamente en el contexto técnico verificado del proyecto.",
    alternatives: [
      `Mantener ${currentArchitecture.frontend} en frontend y ${currentArchitecture.backend} en backend, con contratos y DTOs entre ambos límites.`,
      `Separar presentación, servicios de aplicación y acceso a datos, usando ${currentArchitecture.database} mediante ${currentArchitecture.orm}.`,
      `Conservar el generador ${currentArchitecture.backendGenerator} como salida independiente validada desde el modelo UML canónico.`,
    ],
    rationale: `El stack verificado ya define ${currentArchitecture.frontend}, ${currentArchitecture.backend}, ${currentArchitecture.database} y ${currentArchitecture.orm}; la organización por capas evita que cada responsabilidad decida nuevamente la tecnología actual.`,
    limitations: "Es una recomendación de solo lectura basada en el contexto verificado; no evalúa integraciones externas ni aplica cambios UML.",
    confidence: 0.75,
    needsClarification: false,
    requiresUmlChange: false,
  };
}

export function buildVerifiedSpringGenerationRecommendation(question: string): MentorRecommendationDraft | undefined {
  if (!springGeneratorReference.test(question) || !springGenerationIntent.test(question)) return undefined;
  return {
    problem: "La generación del backend Spring Boot depende de un modelo UML canónico válido y exportable.",
    alternatives: [
      "Validar clases, atributos, relaciones y multiplicidades del UML canónico antes de exportar.",
      "Mantener la transformación determinista del UML a modelo relacional antes de generar Spring Boot.",
      "Revisar que las entidades del modelo sean exportables antes de iniciar la generación.",
    ],
    rationale: "El pipeline verificado valida el UML canónico y lo transforma determinísticamente antes de generar el backend Spring Boot.",
    limitations: "No evalúa reglas de negocio específicas ni modifica el UML, el layout o la revisión del proyecto.",
    confidence: 1,
    needsClarification: false,
    requiresUmlChange: false,
  };
}

function mentionedElementNames(context: MentorProjectContext, question: string): readonly string[] {
  const normalizedQuestion = normalize(question);
  return context.elementNames.filter((name) => {
    const escaped = normalize(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:$|[^\\p{L}\\p{N}])`, "u").test(normalizedQuestion);
  });
}

function relationshipMultiplicity(statement: string | undefined): string | undefined {
  return statement?.match(/existen\s+([^\s]+)\s+instancias/i)?.[1];
}

export function buildVerifiedUmlRecommendation(context: MentorProjectContext, question: string): MentorRecommendationDraft | undefined {
  const mentioned = mentionedElementNames(context, question);
  const relationship = context.relationships.find((item) => mentioned.some((name) => normalize(name) === normalize(item.source)) && mentioned.some((name) => normalize(name) === normalize(item.target)));
  if (!relationship) return undefined;
  const targetMultiplicity = relationshipMultiplicity(relationship.sourceToTarget);
  const sourceMultiplicity = relationshipMultiplicity(relationship.targetToSource);
  if (!targetMultiplicity || !sourceMultiplicity) return undefined;
  const type = relationship.type === "Association" ? "asociación" : relationship.type.toLocaleLowerCase("es");
  return {
    problem: `La relación ${relationship.type} entre ${relationship.source} y ${relationship.target} ya está definida en el modelo UML vigente.`,
    alternatives: [`Mantener la ${type} ${relationship.source}-${relationship.target} con las multiplicidades verificadas.`],
    rationale: `La ${type} define ${relationship.target} ${targetMultiplicity} por ${relationship.source} y ${relationship.source} ${sourceMultiplicity} por ${relationship.target}.`,
    limitations: "Es una recomendación de solo lectura basada en el UML canónico actual; no aplica cambios al modelo.",
    confidence: 1,
    needsClarification: false,
    requiresUmlChange: false,
  };
}

export function buildVerifiedAttributeAdditionRecommendation(context: MentorProjectContext, question: string): MentorRecommendationDraft | undefined {
  const requested = attributeAddition.exec(question);
  if (!requested) return undefined;
  const attribute = requested[1]?.trim().replace(/\s+/g, " ");
  const className = requested[2];
  const umlClass = context.classes.find((item) => normalize(item.name) === normalize(className ?? ""));
  if (!attribute || !umlClass || umlClass.attributes.some((item) => normalize(item.name) === normalize(attribute))) return undefined;
  return {
    problem: `El atributo ${attribute} no existe actualmente en la clase ${umlClass.name}.`,
    alternatives: [`Se recomienda agregar ${attribute} a ${umlClass.name} como un cambio UML futuro.`],
    rationale: `Este cambio implicaría agregar ${attribute} a ${umlClass.name}, sin modificar el modelo en esta recomendación.`,
    limitations: "No se infiere tipo, multiplicidad ni reglas de validación sin contexto adicional.",
    confidence: 1,
    needsClarification: false,
    requiresUmlChange: true,
  };
}

function clarification(problem: string, limitations: string, projectRevision: number): MentorRecommendationResponse {
  return { status: "READ_ONLY", problem, alternatives: [], rationale: "Se necesita contexto verificable antes de emitir una recomendación.", limitations, confidence: 1, needsClarification: true, requiresUmlChange: false, projectRevision };
}

function hasElement(context: MentorProjectContext, name: string): boolean {
  return context.elementNames.some((item) => normalize(item) === normalize(name));
}

export function deterministicRecommendationClarification(context: MentorProjectContext, question: string, focus?: string): MentorRecommendationResponse | undefined {
  if (context.classes.length === 0) return clarification("No hay clases UML suficientes para fundamentar la recomendación.", "Agrega o identifica el contexto UML relevante.", context.revision);
  if (focus && !hasElement(context, focus)) return clarification(`No se encontró el elemento ${focus} en el modelo UML vigente.`, "Indica una clase o enumeración existente.", context.revision);
  const requested = explicitElement.exec(question)?.[1];
  if (requested && !hasElement(context, requested)) return clarification(`No se encontró el elemento ${requested} en el modelo UML vigente.`, "Indica una clase o enumeración existente.", context.revision);
  const relation = explicitRelation.exec(question);
  if (relation && (!hasElement(context, relation[1]!) || !hasElement(context, relation[2]!) || !context.relationships.some((item) => (normalize(item.source) === normalize(relation[1]!) && normalize(item.target) === normalize(relation[2]!)) || (normalize(item.source) === normalize(relation[2]!) && normalize(item.target) === normalize(relation[1]!))))) {
    return clarification("No se encontró la relación solicitada en el modelo UML vigente.", "Indica una relación existente o aporta el modelo que debe evaluarse.", context.revision);
  }
  const component = explicitComponent.exec(question)?.[1];
  if (component && !/^(nestjs|nextjs|postgresql|prisma|qwen|spring)$/i.test(component)) return clarification(`No hay contexto verificable para el componente o servicio ${component}.`, "Aclara cómo se integra con la arquitectura verificada.", context.revision);
  if (externalTopic.test(question)) return clarification("La consulta trata una integración externa no verificada.", "Aclara los requisitos y la integración concreta antes de recomendar una solución.", context.revision);
  return undefined;
}

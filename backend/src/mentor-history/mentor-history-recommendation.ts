// CU-2P-07, task 9.1: public presentation of the technical recommendations of CU-2P-05 recorded in the history.
// CU-2P-05 stores the whole response as JSON in MentorInteraction.answer (status, confidence and projectRevision
// included). The history never shows that JSON: an answer that is exactly a recorded recommendation becomes readable
// text with its functional content only; any other answer is returned untouched. Pure functions: no I/O, no writes,
// nothing thrown.

// The exact JSON shape that MentorService.recommend records: CU-2P-05's MentorRecommendationResponse. Declared here so
// mentor-history keeps no dependency on the Mentor module; a type test pins it to the CU-2P-05 contract.
export type RecordedMentorRecommendation = Readonly<{
  status: "READ_ONLY";
  problem: string;
  alternatives: readonly string[];
  rationale: string;
  limitations: string;
  confidence: number;
  needsClarification: boolean;
  requiresUmlChange: boolean;
  projectRevision: number;
}>;

const RECORDED_RECOMMENDATION_KEYS = ["alternatives", "confidence", "limitations", "needsClarification", "problem", "projectRevision", "rationale", "requiresUmlChange", "status"] as const;

const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

/**
 * Returns the recommendation only when `answer` is unambiguously one: valid JSON, a plain object with exactly the nine
 * keys of the CU-2P-05 response and every value of the right type (`status` = "READ_ONLY", non-empty texts, an array of
 * non-empty texts, a finite number, two booleans and a non-negative integer revision). Anything else — plain text,
 * malformed JSON, another JSON value, a partial or extended object — is `undefined`. No pattern matching on the text.
 */
export function parseRecordedMentorRecommendation(answer: string): RecordedMentorRecommendation | undefined {
  let value: unknown;
  try {
    value = JSON.parse(answer);
  } catch {
    return undefined;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const keys = Object.keys(value).sort();
  if (keys.length !== RECORDED_RECOMMENDATION_KEYS.length || keys.some((key, index) => key !== RECORDED_RECOMMENDATION_KEYS[index])) return undefined;

  const candidate = value as Record<(typeof RECORDED_RECOMMENDATION_KEYS)[number], unknown>;
  const valid =
    candidate.status === "READ_ONLY" &&
    text(candidate.problem) &&
    Array.isArray(candidate.alternatives) && candidate.alternatives.every(text) &&
    text(candidate.rationale) &&
    text(candidate.limitations) &&
    typeof candidate.confidence === "number" && Number.isFinite(candidate.confidence) &&
    typeof candidate.needsClarification === "boolean" &&
    typeof candidate.requiresUmlChange === "boolean" &&
    Number.isInteger(candidate.projectRevision) && (candidate.projectRevision as number) >= 0;
  return valid ? (candidate as RecordedMentorRecommendation) : undefined;
}

/**
 * Deterministic readable text with the four public parts only, in this order: problem, alternatives (one per line,
 * omitted when there are none), rationale and limitations. Texts are kept exactly as recorded; status, confidence,
 * needsClarification, requiresUmlChange and projectRevision are never included.
 */
export function formatRecordedMentorRecommendation(recommendation: RecordedMentorRecommendation): string {
  const sections = [`Problema:\n${recommendation.problem}`];
  if (recommendation.alternatives.length > 0) sections.push(`Alternativas:\n${recommendation.alternatives.map((alternative) => `- ${alternative}`).join("\n")}`);
  sections.push(`Razón:\n${recommendation.rationale}`, `Limitaciones:\n${recommendation.limitations}`);
  return sections.join("\n\n");
}

/** The public `answer` of a history item: a recorded recommendation as readable text, anything else unchanged. */
export function presentMentorHistoryAnswer(answer: string): string {
  const recommendation = parseRecordedMentorRecommendation(answer);
  return recommendation ? formatRecordedMentorRecommendation(recommendation) : answer;
}

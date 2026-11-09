import type { Multiplicity, UmlImportProposal, UmlRelationshipType } from "@examen-sw1/uml-core";
import { parseMultiplicityText } from "../diagram-analyzer";

// Expected result of a benchmark image, written by hand (photos) or derived from a synthetic definition.
// Generalization: source = child, target = parent. Aggregation/Composition: source = whole.
// Multiplicities are written as text ("1", "0..*") at the end of the class they sit next to.
export type ExpectedRelationship = Readonly<{ type: UmlRelationshipType; source: string; target: string; sourceMultiplicity?: string; targetMultiplicity?: string }>;
export type ExpectedDiagram = Readonly<{
  classes: ReadonlyArray<Readonly<{ name: string; attributes: readonly string[] }>>;
  enumerations?: ReadonlyArray<Readonly<{ name: string; literals?: readonly string[] }>>;
  relationships: readonly ExpectedRelationship[];
}>;

export type Count = { truePositives: number; predicted: number; expected: number };
export type MultiplicityCount = { correct: number; expected: number };
export type CaseScore = Readonly<{ classes: Count; attributes: Count; relationships: Count; multiplicities: MultiplicityCount }>;

export function normalizeName(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}_]/gu, "").toLowerCase();
}

export function editDistance(left: string, right: string): number {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = row[0]!;
    row[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const above = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, diagonal + (left[i - 1] === right[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[right.length]!;
}

// One-to-one matching by normalized name: exact pairs first, then (with tolerance) the closest pairs.
export function matchNames(expected: readonly string[], predicted: readonly string[], tolerance: number): Map<number, number> {
  const pairs = new Map<number, number>();
  const used = new Set<number>();
  const normalizedExpected = expected.map(normalizeName);
  const normalizedPredicted = predicted.map(normalizeName);
  normalizedExpected.forEach((name, index) => {
    const found = normalizedPredicted.findIndex((candidate, candidateIndex) => !used.has(candidateIndex) && candidate === name);
    if (found >= 0) {
      pairs.set(index, found);
      used.add(found);
    }
  });
  if (tolerance <= 0) return pairs;
  const candidates: Array<[number, number, number]> = [];
  normalizedExpected.forEach((name, index) => {
    if (pairs.has(index)) return;
    normalizedPredicted.forEach((candidate, candidateIndex) => {
      if (used.has(candidateIndex)) return;
      const distance = editDistance(name, candidate);
      if (distance <= tolerance) candidates.push([distance, index, candidateIndex]);
    });
  });
  candidates.sort((left, right) => left[0] - right[0] || left[1] - right[1] || left[2] - right[2]);
  for (const [, index, candidateIndex] of candidates) {
    if (pairs.has(index) || used.has(candidateIndex)) continue;
    pairs.set(index, candidateIndex);
    used.add(candidateIndex);
  }
  return pairs;
}

// Hand-written expectations keep the notation of the image ("1...*", "n", "*(ordered, unique)"): constraints in
// parentheses or braces are dropped and the rest is read with the analyzer's own multiplicity parser.
export function expectedMultiplicity(text: string): Multiplicity | undefined {
  return parseMultiplicityText(text.replace(/[({][^)}]*[)}]/g, ""));
}

const sameMultiplicity = (text: string | undefined, actual: Multiplicity | undefined): boolean => {
  if (!text) return false;
  const expected = expectedMultiplicity(text);
  return Boolean(expected && actual && expected.lower === actual.lower && expected.upper === actual.upper);
};

// Compares a proposal with the expected diagram. Elements of unmatched classes count as misses / false positives.
export function scoreProposal(proposal: UmlImportProposal, expected: ExpectedDiagram, tolerance = 0): CaseScore {
  const expectedElements = [...expected.classes.map((entry) => entry.name), ...(expected.enumerations ?? []).map((entry) => entry.name)];
  const predictedElements = [...proposal.classes.map((entry) => ({ key: entry.key, name: entry.name })), ...proposal.enumerations.map((entry) => ({ key: entry.key, name: entry.name }))];
  const elementPairs = matchNames(expectedElements, predictedElements.map((entry) => entry.name), tolerance);
  const expectedNameByKey = new Map<string, string>();
  for (const [expectedIndex, predictedIndex] of elementPairs) expectedNameByKey.set(predictedElements[predictedIndex]!.key, normalizeName(expectedElements[expectedIndex]!));

  const attributes: Count = { truePositives: 0, predicted: proposal.classes.reduce((total, entry) => total + entry.attributes.length, 0), expected: expected.classes.reduce((total, entry) => total + entry.attributes.length, 0) };
  expected.classes.forEach((entry, index) => {
    const predictedIndex = elementPairs.get(index);
    if (predictedIndex === undefined) return;
    const predicted = proposal.classes.find((candidate) => candidate.key === predictedElements[predictedIndex]!.key);
    if (!predicted) return;
    attributes.truePositives += matchNames(entry.attributes, predicted.attributes.map((attribute) => attribute.name), tolerance).size;
  });

  const relationships: Count = { truePositives: 0, predicted: proposal.relationships.length, expected: expected.relationships.length };
  const multiplicities: MultiplicityCount = { correct: 0, expected: expected.relationships.reduce((total, entry) => total + (entry.type === "Generalization" ? 0 : Number(Boolean(entry.sourceMultiplicity)) + Number(Boolean(entry.targetMultiplicity))), 0) };
  const usedPredictions = new Set<number>();
  for (const relationship of expected.relationships) {
    const source = normalizeName(relationship.source);
    const target = normalizeName(relationship.target);
    const found = proposal.relationships.findIndex((candidate, index) => {
      if (usedPredictions.has(index) || candidate.type !== relationship.type) return false;
      const candidateSource = expectedNameByKey.get(candidate.source);
      const candidateTarget = expectedNameByKey.get(candidate.target);
      const direct = candidateSource === source && candidateTarget === target;
      // Association has no semantic direction: the reversed pair is the same relationship.
      return direct || (relationship.type === "Association" && candidateSource === target && candidateTarget === source);
    });
    if (found < 0) continue;
    usedPredictions.add(found);
    relationships.truePositives += 1;
    if (relationship.type === "Generalization") continue;
    const predicted = proposal.relationships[found]!;
    const reversed = expectedNameByKey.get(predicted.source) !== source;
    const atSource = reversed ? predicted.targetMultiplicity : predicted.sourceMultiplicity;
    const atTarget = reversed ? predicted.sourceMultiplicity : predicted.targetMultiplicity;
    if (sameMultiplicity(relationship.sourceMultiplicity, atSource)) multiplicities.correct += 1;
    if (sameMultiplicity(relationship.targetMultiplicity, atTarget)) multiplicities.correct += 1;
  }

  return { classes: { truePositives: elementPairs.size, predicted: predictedElements.length, expected: expectedElements.length }, attributes, relationships, multiplicities };
}

export type Rates = Readonly<{ precision: number | null; recall: number | null; falsePositives: number; truePositives: number; predicted: number; expected: number }>;

const ratio = (part: number, whole: number) => (whole === 0 ? null : Number((part / whole).toFixed(4)));

export function rates(count: Count): Rates {
  return { precision: ratio(count.truePositives, count.predicted), recall: ratio(count.truePositives, count.expected), falsePositives: count.predicted - count.truePositives, ...count };
}

export function sumScores(scores: readonly CaseScore[]): CaseScore {
  const add = (left: Count, right: Count): Count => ({ truePositives: left.truePositives + right.truePositives, predicted: left.predicted + right.predicted, expected: left.expected + right.expected });
  const zero = (): Count => ({ truePositives: 0, predicted: 0, expected: 0 });
  return scores.reduce<CaseScore>((total, score) => ({
    classes: add(total.classes, score.classes),
    attributes: add(total.attributes, score.attributes),
    relationships: add(total.relationships, score.relationships),
    multiplicities: { correct: total.multiplicities.correct + score.multiplicities.correct, expected: total.multiplicities.expected + score.multiplicities.expected },
  }), { classes: zero(), attributes: zero(), relationships: zero(), multiplicities: { correct: 0, expected: 0 } });
}

export function summarize(score: CaseScore) {
  return { classes: rates(score.classes), attributes: rates(score.attributes), relationships: rates(score.relationships), multiplicities: { accuracy: ratio(score.multiplicities.correct, score.multiplicities.expected), ...score.multiplicities } };
}

export function percentile(values: readonly number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1))]!;
}

import type { Multiplicity } from "@examen-sw1/uml-core";

// Strict textual multiplicity: "n", "n..m" or "n..*", with non-negative integers without leading zeros and m >= n.
// Anything else ("*", "muchos", "5..2", "1 .. 2") is rejected; nothing is assumed when the value is absent.
const MULTIPLICITY_PATTERN = /^(0|[1-9][0-9]*)(?:\.\.(0|[1-9][0-9]*|\*))?$/;

export function parseMentorProposalMultiplicity(value: string): Multiplicity | undefined {
  const match = MULTIPLICITY_PATTERN.exec(value.trim());
  if (!match) return undefined;
  const lower = Number(match[1]);
  if (!Number.isSafeInteger(lower)) return undefined;
  const upperText = match[2];
  if (upperText === undefined) return { lower, upper: lower };
  if (upperText === "*") return { lower, upper: "unbounded" };
  const upper = Number(upperText);
  if (!Number.isSafeInteger(upper) || upper < lower) return undefined;
  return { lower, upper };
}

// Canonical text for public operations and diff labels: "1", "0..1", "0..*", "2..5".
export function formatMentorProposalMultiplicity(value: Multiplicity): string {
  if (value.upper === "unbounded") return `${value.lower}..*`;
  return value.upper === value.lower ? `${value.lower}` : `${value.lower}..${value.upper}`;
}

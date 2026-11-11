export const MENTOR_AI_PROVIDER = Symbol("MENTOR_AI_PROVIDER");
export const MENTOR_INTERACTION_RECORDER = Symbol("MENTOR_INTERACTION_RECORDER");
export const MENTOR_INTERACTION_MEMORY = Symbol("MENTOR_INTERACTION_MEMORY");

export type MentorDiagnostic = "INSUFFICIENT_CONTEXT" | "ELEMENT_NOT_FOUND";

export type MentorProjectContext = Readonly<{
  projectName: string;
  revision: number;
  classes: readonly Readonly<{
    name: string;
    attributes: readonly Readonly<{ name: string; type: string; multiplicity?: string }>[];
  }>[];
  enumerations: readonly Readonly<{ name: string; literals: readonly string[] }>[];
  relationships: readonly Readonly<{
    type: string;
    source: string;
    target: string;
    sourceToTarget?: string;
    targetToSource?: string;
  }>[];
  elementNames: readonly string[];
}>;

export interface MentorAiProvider {
  ask(context: MentorProjectContext, question: string, memory: MentorMemory): Promise<string>;
}

export type MentorMemoryEntry = Readonly<{ question: string; answer: string; projectRevision: number; isStale: boolean }>;
export type MentorMemory = readonly MentorMemoryEntry[];

export interface MentorInteractionRecorder {
  record(interaction: MentorInteractionIdentity & Readonly<{ projectRevision: number; question: string; answer: string; grounded: boolean }>): Promise<void>;
}

export interface MentorInteractionMemory {
  recent(projectId: string, currentRevision: number): Promise<MentorMemory>;
}

export type MentorQueryResponse = Readonly<{
  answer: string;
  grounded: boolean;
  projectRevision: number;
  diagnostic?: MentorDiagnostic;
}>;

export type MentorRecommendationRequest = Readonly<{ question: string; focus?: string }>;

export type MentorRecommendationDraft = Readonly<{
  problem: string;
  alternatives: readonly string[];
  rationale: string;
  limitations: string;
  confidence: number;
  needsClarification: boolean;
  requiresUmlChange: boolean;
}>;

export type MentorRecommendationResponse = Readonly<{
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

export type MentorRecommendationContext = Readonly<{
  architecture: readonly string[];
  springExport: readonly string[];
}>;

export type MentorRecommendationProvider = Readonly<{
  recommend(context: MentorProjectContext, technicalContext: MentorRecommendationContext, question: string, memory: MentorMemory, retryInstruction?: string): Promise<MentorRecommendationDraft>;
}>;
import type { MentorInteractionIdentity } from "../mentor-identity/mentor-interaction-identity.contracts";

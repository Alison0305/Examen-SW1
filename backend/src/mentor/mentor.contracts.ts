export const MENTOR_AI_PROVIDER = Symbol("MENTOR_AI_PROVIDER");
export const MENTOR_INTERACTION_RECORDER = Symbol("MENTOR_INTERACTION_RECORDER");

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
  ask(context: MentorProjectContext, question: string): Promise<string>;
}

export interface MentorInteractionRecorder {
  record(interaction: MentorInteractionIdentity & Readonly<{ projectRevision: number; question: string; answer: string; grounded: boolean }>): Promise<void>;
}

export type MentorQueryResponse = Readonly<{
  answer: string;
  grounded: boolean;
  projectRevision: number;
  diagnostic?: MentorDiagnostic;
}>;
import type { MentorInteractionIdentity } from "../mentor-identity/mentor-interaction-identity.contracts";

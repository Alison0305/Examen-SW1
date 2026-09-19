export const ASSISTANT_OPERATIONS = [
  "LIST",
  "GET",
  "SEARCH",
  "CREATE",
  "UPDATE",
  "DELETE",
  "COUNT",
] as const;

export type AssistantOperation = (typeof ASSISTANT_OPERATIONS)[number];
export type AssistantScalar = string | number | boolean | null;
export type AssistantValue = AssistantScalar | readonly AssistantScalar[];
export type AssistantIdentifier = string | number;
export type AssistantFields = Readonly<Record<string, AssistantValue>>;
export type AssistantCriteria = {
  query?: string;
  fields?: Readonly<Record<string, AssistantValue>>;
};
export type AssistantRelationScope = {
  name: string;
  sourceIdentifier: AssistantIdentifier;
};

export type ListCommand = {
  operation: "LIST";
  entity: string;
  relation?: AssistantRelationScope;
};
export type GetCommand = {
  operation: "GET";
  entity: string;
  identifier: AssistantIdentifier;
};
export type SearchCommand = {
  operation: "SEARCH";
  entity: string;
  criteria: AssistantCriteria;
  relation?: AssistantRelationScope;
};
export type CreateCommand = {
  operation: "CREATE";
  entity: string;
  fields: AssistantFields;
};
export type UpdateCommand = {
  operation: "UPDATE";
  entity: string;
  identifier: AssistantIdentifier;
  fields: AssistantFields;
};
export type DeleteCommand = {
  operation: "DELETE";
  entity: string;
  identifier: AssistantIdentifier;
};
export type CountCommand = {
  operation: "COUNT";
  entity: string;
  relation?: AssistantRelationScope;
};

export type AssistantCommand =
  | ListCommand
  | GetCommand
  | SearchCommand
  | CreateCommand
  | UpdateCommand
  | DeleteCommand
  | CountCommand;

export type AssistantSuccess<T = unknown> = {
  ok: true;
  command: AssistantCommand;
  data: T;
};
export type AssistantDiagnostic = {
  code: string;
  message: string;
  field?: string;
};
export type AssistantRejectionCode =
  | "INVALID_COMMAND"
  | "VALIDATION_ERROR"
  | "CONFIRMATION_REQUIRED"
  | "EXECUTION_ERROR";
export type AssistantRejection = {
  ok: false;
  code: AssistantRejectionCode;
  message: string;
  details?: readonly AssistantDiagnostic[];
};
export type AssistantResult<T = unknown> = AssistantSuccess<T> | AssistantRejection;

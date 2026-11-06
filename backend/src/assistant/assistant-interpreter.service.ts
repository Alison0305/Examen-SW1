import {
  buildDataInterpretationPrompt,
  buildDataInterpretationSchema,
  buildUmlInterpretationPrompt,
  buildUmlInterpretationSchema,
  INTERPRETATION_SCHEMA_MAX_BYTES,
  interpretationDiagnostic,
  interpretationSchemaBytes,
  interpretStrictDataText,
  isStrictAssistantCommandText,
  isStrictUmlProposalText,
  parseUmlModelOutput,
  resolveDataOutput,
  resolveUmlProposalByName,
  type DataInterpretationResponse,
  type InterpretationClass,
  type InterpretationDiagnostic,
  type LocalTextModel,
  type UmlInterpretationResponse,
} from "@examen-sw1/assistant-core";
import type { DomainManifestV1 } from "@examen-sw1/spring-generator";
import { parseUmlTextProposal } from "@examen-sw1/uml-core";
import { LocalModelError } from "./local-text-model";

const STRICT_UML_HINT = " Usa la sintaxis estricta, por ejemplo CREATE_CLASS name=\"Paciente\".";
const STRICT_DATA_HINT = " Usa un comando JSON estricto o el formulario estructurado.";

function modelFailure(error: unknown): InterpretationDiagnostic {
  if (error instanceof LocalModelError) return interpretationDiagnostic(error.code, error.message);
  return interpretationDiagnostic("INFERENCE_ERROR", "No se pudo completar la interpretación local.");
}

// Proposes structured intents only: it never persists, mutates a project or executes a command.
export class AssistantInterpreterService {
  constructor(private readonly model: LocalTextModel | undefined) {}

  get modelConfigured(): boolean {
    return this.model !== undefined;
  }

  async interpretUml(text: string, classes: readonly InterpretationClass[]): Promise<UmlInterpretationResponse> {
    if (isStrictUmlProposalText(text)) {
      const parsed = parseUmlTextProposal(text.trim());
      return parsed.success ? { ok: true, mode: "uml", source: "strict", proposal: parsed.proposal } : { ok: false, mode: "uml", diagnostic: interpretationDiagnostic("INVALID_OUTPUT", parsed.message) };
    }
    if (!this.model) return { ok: false, mode: "uml", diagnostic: interpretationDiagnostic("NOT_CONFIGURED", `No hay un modelo local configurado para interpretar español natural.${STRICT_UML_HINT}`) };
    let output: unknown;
    try {
      output = await this.model.generateStructured({ ...buildUmlInterpretationPrompt(text, classes), schema: buildUmlInterpretationSchema(classes) });
    } catch (error) {
      return { ok: false, mode: "uml", diagnostic: modelFailure(error) };
    }
    const parsed = parseUmlModelOutput(output);
    if (!parsed) return { ok: false, mode: "uml", diagnostic: interpretationDiagnostic("INVALID_OUTPUT", "El modelo local no produjo una propuesta UML válida.") };
    const resolved = resolveUmlProposalByName(parsed, classes);
    return resolved.ok ? { ok: true, mode: "uml", source: "model", proposal: resolved.proposal } : { ok: false, mode: "uml", diagnostic: resolved.diagnostic };
  }

  async interpretData(text: string, manifest: DomainManifestV1): Promise<DataInterpretationResponse> {
    if (isStrictAssistantCommandText(text)) {
      const strict = interpretStrictDataText(text, manifest);
      return strict.ok ? { ok: true, mode: "data", source: "strict", command: strict.command } : { ok: false, mode: "data", diagnostic: strict.diagnostic };
    }
    if (!this.model) return { ok: false, mode: "data", diagnostic: interpretationDiagnostic("NOT_CONFIGURED", `No hay un modelo local configurado para interpretar español natural.${STRICT_DATA_HINT}`) };
    const schema = buildDataInterpretationSchema(manifest);
    if (interpretationSchemaBytes(schema) > INTERPRETATION_SCHEMA_MAX_BYTES) return { ok: false, mode: "data", diagnostic: interpretationDiagnostic("INVALID_REQUEST", `El Domain Manifest es demasiado grande para interpretarlo localmente.${STRICT_DATA_HINT}`) };
    let output: unknown;
    try {
      output = await this.model.generateStructured({ ...buildDataInterpretationPrompt(text, manifest), schema });
    } catch (error) {
      return { ok: false, mode: "data", diagnostic: modelFailure(error) };
    }
    const resolved = resolveDataOutput(output, manifest);
    return resolved.ok ? { ok: true, mode: "data", source: "model", command: resolved.command } : { ok: false, mode: "data", diagnostic: resolved.diagnostic };
  }
}

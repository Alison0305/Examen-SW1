import { BadRequestException, Body, Controller, HttpCode, Inject, Post } from "@nestjs/common";
import { interpretationDiagnostic, type InterpretationResponse } from "@examen-sw1/assistant-core";
import { AssistantInterpreterService } from "./assistant-interpreter.service";
import { parseInterpretRequest } from "./interpret-request";

// Like /speech/recognize this route has no JWT: it is reachable from the generated app over LAN and
// only returns proposals; approval and execution stay in the authorized client.
@Controller("assistant")
export class AssistantInterpretController {
  constructor(@Inject(AssistantInterpreterService) private readonly interpreter: AssistantInterpreterService) {}

  @Post("interpret")
  @HttpCode(200)
  async interpret(@Body() body: unknown): Promise<InterpretationResponse> {
    const parsed = parseInterpretRequest(body);
    if (!parsed.ok) throw new BadRequestException({ ok: false, diagnostic: interpretationDiagnostic("INVALID_REQUEST", parsed.message) });
    const { request } = parsed;
    return request.mode === "uml" ? this.interpreter.interpretUml(request.text, request.classes) : this.interpreter.interpretData(request.text, request.manifest);
  }
}

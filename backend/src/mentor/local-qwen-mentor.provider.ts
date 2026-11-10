import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { LocalModelError, QueuedLocalTextModel } from "../assistant/local-text-model";
import type { MentorAiProvider, MentorMemory, MentorProjectContext } from "./mentor.contracts";

@Injectable()
export class LocalQwenMentorProvider implements MentorAiProvider {
  constructor(private readonly model: QueuedLocalTextModel | undefined) {}

  async ask(context: MentorProjectContext, question: string, memory: MentorMemory = []): Promise<string> {
    if (!this.model) throw new ServiceUnavailableException("El Mentor IA local no está configurado.");
    try {
      return await this.model.generateText({
        systemPrompt: "Eres el Mentor IA de un proyecto UML. Responde solo con el contexto proporcionado. No inventes clases, atributos, enumeraciones ni relaciones. En cada relación, lee literalmente sourceToTarget y targetToSource: esas frases ya expresan la multiplicidad UML en la dirección correcta y nunca debes invertirlas. Si el contexto no basta, dilo claramente. Responde en español, de forma breve y técnica.",
        userPrompt: `Contexto UML actual autorizado:\n${JSON.stringify(context)}\n\nAntecedentes históricos autorizados (pueden estar desactualizados):\n${JSON.stringify(memory)}\n\nPregunta: ${question}`,
      });
    } catch (error) {
      if (error instanceof LocalModelError) throw new ServiceUnavailableException("El Mentor IA local no está disponible en este momento.");
      throw error;
    }
  }
}

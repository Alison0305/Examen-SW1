import { describe, expect, it, vi } from "vitest";
import type { QueuedLocalTextModel } from "../assistant/local-text-model";
import { LocalQwenMentorProvider } from "./local-qwen-mentor.provider";
import type { MentorProjectContext } from "./mentor.contracts";

describe("LocalQwenMentorProvider", () => {
  it("envía al modelo las multiplicidades de asociación ya normalizadas", async () => {
    const generateText = vi.fn().mockResolvedValue("Respuesta fundamentada.");
    const provider = new LocalQwenMentorProvider({ generateText } as unknown as QueuedLocalTextModel);
    const context: MentorProjectContext = {
      projectName: "Ventas",
      revision: 1,
      classes: [{ name: "Cliente", attributes: [] }, { name: "Pedido", attributes: [] }],
      enumerations: [],
      relationships: [{ type: "Association", source: "Cliente", target: "Pedido", sourceToTarget: "Por cada Cliente, existen 0..* instancias de Pedido relacionadas.", targetToSource: "Por cada Pedido, existen 1..1 instancias de Cliente relacionadas." }],
      elementNames: ["Cliente", "Pedido"],
    };

    await expect(provider.ask(context, "Describe la asociación")).resolves.toBe("Respuesta fundamentada.");
    expect(generateText).toHaveBeenCalledWith(expect.objectContaining({
      systemPrompt: expect.stringContaining("nunca debes invertirlas"),
      userPrompt: expect.stringContaining("Por cada Cliente, existen 0..* instancias de Pedido relacionadas."),
    }));
    expect(generateText).toHaveBeenCalledWith(expect.objectContaining({ userPrompt: expect.stringContaining("Por cada Pedido, existen 1..1 instancias de Cliente relacionadas.") }));
    const request = generateText.mock.calls[0]?.[0];
    expect(`${request?.systemPrompt}\n${request?.userPrompt}`).not.toMatch(/user-a|alice@example\.test|OWNER/);
  });
});

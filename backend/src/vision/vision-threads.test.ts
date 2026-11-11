import { describe, expect, it } from "vitest";
import { getVisionConfig } from "./vision.config";

// VISION_THREADS fixes Florence-2's ONNX Runtime threads; without it the container's ASSISTANT_THREADS (computed from
// the CPU quota by docker-entrypoint.sh) is used. Without either, the runtime default is kept (local development).
describe("hilos de la visión", () => {
  it("sin variables conserva el valor por defecto del runtime", () => {
    expect(getVisionConfig({}).threads).toBeUndefined();
  });

  it("usa VISION_THREADS y, si falta, ASSISTANT_THREADS", () => {
    expect(getVisionConfig({ VISION_THREADS: "4", ASSISTANT_THREADS: "8" }).threads).toBe(4);
    expect(getVisionConfig({ ASSISTANT_THREADS: "8" }).threads).toBe(8);
  });

  it("ignora valores inválidos", () => {
    expect(getVisionConfig({ VISION_THREADS: "0", ASSISTANT_THREADS: "muchos" }).threads).toBeUndefined();
    expect(getVisionConfig({ VISION_THREADS: "-1", ASSISTANT_THREADS: "2" }).threads).toBe(2);
  });
});

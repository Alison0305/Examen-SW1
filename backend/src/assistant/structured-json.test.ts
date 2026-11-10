import { describe, expect, it } from "vitest";
import { parseSingleJsonObject } from "./structured-json";

describe("parseSingleJsonObject", () => {
  it("acepta JSON directo", () => {
    expect(parseSingleJsonObject('{ "problem": "Separar capas" }')).toEqual({ problem: "Separar capas" });
  });

  it("acepta un bloque think seguido de JSON", () => {
    expect(parseSingleJsonObject('<think>razonamiento interno</think>\n{ "problem": "Separar capas" }')).toEqual({ problem: "Separar capas" });
  });

  it("acepta un bloque json y prosa alrededor de un único objeto", () => {
    expect(parseSingleJsonObject('Respuesta:\n```json\n{ "problem": "Separar capas" }\n```\nListo.')).toEqual({ problem: "Separar capas" });
  });

  it("rechaza texto libre, JSON incompleto, múltiples objetos y arreglos", () => {
    expect(parseSingleJsonObject("Separa las capas de la aplicación.")).toBeUndefined();
    expect(parseSingleJsonObject('{ "problem": ')).toBeUndefined();
    expect(parseSingleJsonObject('{ "a": 1 } { "b": 2 }')).toBeUndefined();
    expect(parseSingleJsonObject('[{ "problem": "x" }]')).toBeUndefined();
  });
});

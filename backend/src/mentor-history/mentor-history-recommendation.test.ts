import { describe, expect, expectTypeOf, it } from "vitest";
import type { MentorRecommendationResponse } from "../mentor/mentor.contracts";
import { toMentorHistoryItem } from "./mentor-history-page";
import { formatRecordedMentorRecommendation, parseRecordedMentorRecommendation, presentMentorHistoryAnswer, type RecordedMentorRecommendation } from "./mentor-history-recommendation";

// A response exactly as MentorService.recommend builds it before `JSON.stringify` (CU-2P-05).
const RECOMMENDATION: MentorRecommendationResponse = {
  status: "READ_ONLY",
  problem: "Cliente no tiene un medio de contacto.",
  alternatives: ["Agregar un atributo teléfono a Cliente.", "Guardar los contactos en una clase Contacto."],
  rationale: "Cliente existe en el modelo vigente y no tiene datos de contacto.",
  limitations: "No se valida el formato del teléfono.",
  confidence: 0.75,
  needsClarification: false,
  requiresUmlChange: true,
  projectRevision: 7,
};
const RECORDED = JSON.stringify(RECOMMENDATION);
const without = (key: keyof MentorRecommendationResponse) => Object.fromEntries(Object.entries(RECOMMENDATION).filter(([name]) => name !== key));
const READABLE = [
  "Problema:\nCliente no tiene un medio de contacto.",
  "Alternativas:\n- Agregar un atributo teléfono a Cliente.\n- Guardar los contactos en una clase Contacto.",
  "Razón:\nCliente existe en el modelo vigente y no tiene datos de contacto.",
  "Limitaciones:\nNo se valida el formato del teléfono.",
].join("\n\n");

describe("recomendaciones de CU-2P-05 registradas en el historial (tarea 9.1)", () => {
  it("la forma reconocida es exactamente el contrato MentorRecommendationResponse de CU-2P-05", () => {
    expectTypeOf<RecordedMentorRecommendation>().toEqualTypeOf<MentorRecommendationResponse>();
    expect(parseRecordedMentorRecommendation(RECORDED)).toEqual(RECOMMENDATION);
  });

  it("REC-01 y REC-06 a REC-09: una recomendación válida se transforma en texto legible con problema, alternativas, razón y limitaciones", () => {
    const answer = presentMentorHistoryAnswer(RECORDED);

    expect(answer).toBe(READABLE);
    for (const part of [RECOMMENDATION.problem, ...RECOMMENDATION.alternatives, RECOMMENDATION.rationale, RECOMMENDATION.limitations]) expect(answer).toContain(part);
  });

  it("REC-02 a REC-05: no contiene projectRevision, confidence, status, los demás indicadores ni JSON", () => {
    const answer = presentMentorHistoryAnswer(RECORDED);

    for (const hidden of ["projectRevision", "confidence", "status", "READ_ONLY", "0.75", "needsClarification", "requiresUmlChange"]) expect(answer).not.toContain(hidden);
    expect(answer).not.toMatch(/[{}[\]"]/);
    expect(() => JSON.parse(answer)).toThrow();
  });

  it("es determinista y omite la sección de alternativas cuando no hay ninguna", () => {
    expect(presentMentorHistoryAnswer(RECORDED)).toBe(presentMentorHistoryAnswer(JSON.stringify({ ...RECOMMENDATION })));
    expect(formatRecordedMentorRecommendation({ ...RECOMMENDATION, alternatives: [] })).toBe(
      "Problema:\nCliente no tiene un medio de contacto.\n\nRazón:\nCliente existe en el modelo vigente y no tiene datos de contacto.\n\nLimitaciones:\nNo se valida el formato del teléfono.",
    );
  });

  it("conserva textos de varias líneas tal como se registraron (por ejemplo, el aviso de memoria obsoleta)", () => {
    const limitations = "No se valida el formato.\n\nNota: esta recomendación proviene de una revisión anterior.";
    expect(presentMentorHistoryAnswer(JSON.stringify({ ...RECOMMENDATION, limitations }))).toContain(`Limitaciones:\n${limitations}`);
  });

  it("REC-10: la respuesta en texto de una consulta libre no cambia", () => {
    for (const answer of ["Cliente tiene un nombre.", "Respuesta con {llaves} y \"comillas\" dentro del texto.", ""]) expect(presentMentorHistoryAnswer(answer)).toBe(answer);
  });

  it.each([
    ["solo problem", { problem: "algo" }],
    ["falta projectRevision", without("projectRevision")],
    ["clave adicional", { ...RECOMMENDATION, debug: "x" }],
    ["status distinto", { ...RECOMMENDATION, status: "APPLIED" }],
    ["problema vacío", { ...RECOMMENDATION, problem: "  " }],
    ["alternativa no textual", { ...RECOMMENDATION, alternatives: ["ok", 3] }],
    ["alternativas no es arreglo", { ...RECOMMENDATION, alternatives: "una" }],
    ["confidence no numérica", { ...RECOMMENDATION, confidence: "alta" }],
    ["indicador no booleano", { ...RECOMMENDATION, needsClarification: "no" }],
    ["revisión no entera", { ...RECOMMENDATION, projectRevision: 1.5 }],
    ["revisión negativa", { ...RECOMMENDATION, projectRevision: -1 }],
    ["arreglo con la recomendación", [RECOMMENDATION]],
    ["número", 42],
    ["null", null],
  ])("REC-11: JSON válido que no es exactamente una recomendación (%s) se muestra sin cambios", (_case, value) => {
    const answer = JSON.stringify(value);
    expect(parseRecordedMentorRecommendation(answer)).toBeUndefined();
    expect(presentMentorHistoryAnswer(answer)).toBe(answer);
  });

  it.each(["{\"problem\": \"algo\"", "{status: READ_ONLY}", RECORDED.slice(0, -1), "Problema: algo"])("REC-12: JSON malformado o texto (%s) se muestra sin cambios y sin lanzar", (answer) => {
    expect(() => presentMentorHistoryAnswer(answer)).not.toThrow();
    expect(presentMentorHistoryAnswer(answer)).toBe(answer);
  });

  it("REC-14: el DTO del historial conserva exactamente sus cinco campos públicos con una recomendación", () => {
    const item = toMentorHistoryItem({ id: "d7035000-0000-4000-8000-0000000000aa", authorEmail: "a@example.test", question: "¿Cómo contacto a Cliente?", answer: RECORDED, occurredAt: new Date("2026-11-10T10:00:00.000Z") });

    expect(item).toEqual({ id: "d7035000-0000-4000-8000-0000000000aa", author: { email: "a@example.test" }, question: "¿Cómo contacto a Cliente?", answer: READABLE, occurredAt: "2026-11-10T10:00:00.000Z" });
    expect(Object.keys(item).sort()).toEqual(["answer", "author", "id", "occurredAt", "question"]);
  });
});

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiError, type MentorProposalResponse } from "../auth/api";
import { AppProviders } from "../providers";
import { MentorPanel } from "./mentor-panel";
import { MODEL_UNAVAILABLE_MESSAGE, STALE_PROPOSAL_MESSAGE, type MentorProposalActions } from "./mentor-proposal-section";

const INSTRUCTION = "Agrega el atributo teléfono de tipo String a Cliente";
const PROPOSAL_ID = "00000000-0000-4000-8000-0000000000c1";
const PENDING: MentorProposalResponse = {
  id: PROPOSAL_ID,
  status: "PENDING",
  baseRevision: 10,
  operation: { kind: "ADD_ATTRIBUTE", target: { className: "Cliente" }, change: { attributeName: "teléfono", attributeType: "string" } },
  preview: { valid: true, diff: [{ kind: "added", element: "attribute", label: "Cliente.teléfono: string" }], diagnostics: [] },
  createdAt: "2026-11-10T12:00:00.000Z",
};
const APPLIED: MentorProposalResponse = { ...PENDING, status: "APPLIED", resolvedAt: "2026-11-10T12:05:00.000Z", resultingRevision: 11 };
const REJECTED: MentorProposalResponse = { ...PENDING, status: "REJECTED", resolvedAt: "2026-11-10T12:05:00.000Z" };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function actions(overrides: Partial<{ [K in keyof MentorProposalActions]: ReturnType<typeof vi.fn> }> = {}) {
  return {
    create: vi.fn().mockResolvedValue(PENDING),
    get: vi.fn().mockResolvedValue(PENDING),
    apply: vi.fn().mockResolvedValue(APPLIED),
    reject: vi.fn().mockResolvedValue(REJECTED),
    onApplied: vi.fn(),
    ...overrides,
  };
}

function renderPanel(given: ReturnType<typeof actions> | "none" = actions(), onQuery = vi.fn().mockResolvedValue({ answer: "Respuesta", grounded: true, projectRevision: 10 })) {
  const proposals = given === "none" ? undefined : given;
  render(<AppProviders><MentorPanel projectName="CRM" onQuery={onQuery} onRecommend={vi.fn()} proposals={proposals} /></AppProviders>);
  fireEvent.change(screen.getByLabelText("Consulta"), { target: { value: INSTRUCTION } });
  return { proposals, onQuery };
}

async function proposeAndOpenCard() {
  fireEvent.click(screen.getByRole("button", { name: "Proponer cambio UML" }));
  return screen.findByLabelText("Propuesta IA");
}

describe("MentorPanel: propuesta UML (CU-2P-06)", () => {
  it("UI-01 y UI-14: crear una propuesta válida muestra la vista previa, el diff y el estado Pendiente", async () => {
    const { proposals } = renderPanel();
    const card = await proposeAndOpenCard();

    expect(proposals!.create).toHaveBeenCalledExactlyOnceWith(INSTRUCTION);
    for (const text of ["Propuesta IA", "Agregar atributo", "Clase: Cliente", "Atributo: teléfono", "Tipo: string", "Cambios:", "Revisión base: 10", "Estado: Pendiente"]) {
      expect(within(card).getByText(text)).toBeInTheDocument();
    }
    expect(within(card).getByLabelText("Cambios propuestos")).toHaveTextContent("+ Cliente.teléfono: string");
    expect(within(card).getByText("El diagrama no cambia hasta que pulses Aplicar.")).toBeInTheDocument();
    for (const name of ["Cancelar", "Rechazar", "Aplicar"]) expect(within(card).getByRole("button", { name })).toBeEnabled();
  });

  it("UI-15: crear la propuesta no dispara apply ni reject", async () => {
    const { proposals } = renderPanel();
    await proposeAndOpenCard();
    await new Promise((done) => setTimeout(done, 20));

    expect(proposals!.apply).not.toHaveBeenCalled();
    expect(proposals!.reject).not.toHaveBeenCalled();
    expect(proposals!.onApplied).not.toHaveBeenCalled();
  });

  it("UI-13: la tarjeta no muestra UUID, comando, recibo ni datos internos", async () => {
    renderPanel();
    const card = await proposeAndOpenCard();
    const text = card.textContent ?? "";

    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    for (const hidden of ["AddAttribute", "command", "classId", "attributeId", "receipt", "fingerprint", "ADD_ATTRIBUTE", "{", "createdAt"]) expect(text).not.toContain(hidden);
  });

  it("UI-03: Cancelar cierra la vista previa sin llamar a apply ni reject", async () => {
    const { proposals } = renderPanel();
    const card = await proposeAndOpenCard();
    fireEvent.click(within(card).getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByLabelText("Propuesta IA")).not.toBeInTheDocument();
    expect(proposals!.apply).not.toHaveBeenCalled();
    expect(proposals!.reject).not.toHaveBeenCalled();
  });

  it("UI-04: Rechazar llama al endpoint reject, muestra Rechazada y deja Aplicar deshabilitado", async () => {
    const { proposals } = renderPanel();
    const card = await proposeAndOpenCard();
    fireEvent.click(within(card).getByRole("button", { name: "Rechazar" }));

    await waitFor(() => expect(within(card).getByText("Estado: Rechazada")).toBeInTheDocument());
    expect(proposals!.reject).toHaveBeenCalledExactlyOnceWith(PROPOSAL_ID);
    expect(proposals!.apply).not.toHaveBeenCalled();
    expect(proposals!.onApplied).not.toHaveBeenCalled();
    expect(within(card).getByText("Propuesta rechazada. El diagrama no cambió.")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Aplicar" })).toBeDisabled();
    expect(within(card).getByRole("button", { name: "Rechazar" })).toBeDisabled();
    expect(within(card).getByRole("button", { name: "Cerrar" })).toBeEnabled();
  });

  it("UI-06 y UI-07: Aplicar llama al endpoint apply una vez y muestra Aplicada con la revisión resultante", async () => {
    const { proposals } = renderPanel();
    const card = await proposeAndOpenCard();
    fireEvent.click(within(card).getByRole("button", { name: "Aplicar" }));

    await waitFor(() => expect(within(card).getByText("Estado: Aplicada")).toBeInTheDocument());
    expect(proposals!.apply).toHaveBeenCalledExactlyOnceWith(PROPOSAL_ID);
    expect(proposals!.onApplied).toHaveBeenCalledExactlyOnceWith(APPLIED);
    expect(within(card).getByText("Propuesta aplicada. El modelo está en la revisión 11.")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Aplicar" })).toBeDisabled();
  });

  it("UI-08: doble click en Aplicar produce una sola llamada y bloquea las acciones mientras se aplica", async () => {
    const pending = deferred<MentorProposalResponse>();
    const { proposals } = renderPanel(actions({ apply: vi.fn().mockReturnValue(pending.promise) }));
    const card = await proposeAndOpenCard();
    const apply = within(card).getByRole("button", { name: "Aplicar" });
    fireEvent.click(apply);
    fireEvent.click(apply);
    fireEvent.click(within(card).getByRole("button", { name: "Rechazar" }));

    expect(proposals!.apply).toHaveBeenCalledOnce();
    expect(proposals!.reject).not.toHaveBeenCalled();
    expect(within(card).getByLabelText("Aplicando propuesta")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Cancelar" })).toBeDisabled();

    pending.resolve(APPLIED);
    await waitFor(() => expect(within(card).getByText("Estado: Aplicada")).toBeInTheDocument());
    fireEvent.click(within(card).getByRole("button", { name: "Aplicar" }));
    expect(proposals!.apply).toHaveBeenCalledOnce();
    expect(proposals!.onApplied).toHaveBeenCalledOnce();
  });

  it("UI-09: STALE_PROPOSAL muestra el mensaje, deshabilita Aplicar y no reintenta", async () => {
    const { proposals } = renderPanel(actions({ apply: vi.fn().mockRejectedValue(new ApiError(409, "El modelo cambió", "STALE_PROPOSAL")) }));
    const card = await proposeAndOpenCard();
    fireEvent.click(within(card).getByRole("button", { name: "Aplicar" }));

    expect(await within(card).findByText(STALE_PROPOSAL_MESSAGE)).toBeInTheDocument();
    expect(within(card).getByText("Estado: Pendiente")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Aplicar" })).toBeDisabled();
    fireEvent.click(within(card).getByRole("button", { name: "Aplicar" }));
    expect(proposals!.apply).toHaveBeenCalledOnce();
    expect(proposals!.create).toHaveBeenCalledOnce();
    expect(proposals!.onApplied).not.toHaveBeenCalled();
  });

  it("UI-10: INVALID_PROPOSAL muestra un mensaje entendible con los diagnósticos públicos, sin tarjeta", async () => {
    const error = new ApiError(422, "x", "INVALID_PROPOSAL", [{ code: "DUPLICATE_ATTRIBUTE_NAME", severity: "error", message: "La clase Cliente ya tiene un atributo llamado nombre." }]);
    renderPanel(actions({ create: vi.fn().mockRejectedValue(error) }));
    fireEvent.click(screen.getByRole("button", { name: "Proponer cambio UML" }));

    expect(await screen.findByText("La propuesta no supera la validación del modelo UML.")).toBeInTheDocument();
    expect(screen.getByLabelText("Diagnósticos de la propuesta")).toHaveTextContent("La clase Cliente ya tiene un atributo llamado nombre.");
    expect(screen.queryByText("DUPLICATE_ATTRIBUTE_NAME")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Propuesta IA")).not.toBeInTheDocument();
  });

  it("UI-11: 503 muestra que el modelo local no está disponible", async () => {
    renderPanel(actions({ create: vi.fn().mockRejectedValue(new ApiError(503, "El Mentor IA no está disponible en este momento.")) }));
    fireEvent.click(screen.getByRole("button", { name: "Proponer cambio UML" }));

    expect(await screen.findByText(MODEL_UNAVAILABLE_MESSAGE)).toBeInTheDocument();
  });

  it.each([
    [new ApiError(422, "x", "UNSUPPORTED_OPERATION"), "Por ahora solo se puede proponer agregar un atributo a una clase existente"],
    [new ApiError(422, "x", "ELEMENT_NOT_FOUND"), "La clase indicada no existe o es ambigua en el diagrama actual."],
    [new ApiError(422, "x", "UNKNOWN_TYPE"), "El tipo indicado no es un tipo UML soportado."],
    [new ApiError(403, "Forbidden"), "No tienes permiso para modificar este modelo."],
    [new ApiError(404, "Not Found"), "El proyecto o la propuesta ya no están disponibles."],
    [new Error("stack interno: at Foo (bar.ts:1)"), "No fue posible completar la propuesta. Intenta nuevamente."],
  ])("mapea errores funcionales a textos fijos (%s)", async (error, text) => {
    renderPanel(actions({ create: vi.fn().mockRejectedValue(error) }));
    fireEvent.click(screen.getByRole("button", { name: "Proponer cambio UML" }));

    expect(await screen.findByText(text, { exact: false })).toBeInTheDocument();
    expect(screen.queryByText(/stack interno|Forbidden|Not Found/)).not.toBeInTheDocument();
  });

  it("PROPOSAL_ALREADY_APPLIED muestra el estado real leído del servidor", async () => {
    const { proposals } = renderPanel(actions({ apply: vi.fn().mockRejectedValue(new ApiError(409, "x", "PROPOSAL_ALREADY_APPLIED")), get: vi.fn().mockResolvedValue(APPLIED) }));
    const card = await proposeAndOpenCard();
    fireEvent.click(within(card).getByRole("button", { name: "Aplicar" }));

    expect(await within(card).findByText("La propuesta ya fue aplicada.")).toBeInTheDocument();
    expect(within(card).getByText("Estado: Aplicada")).toBeInTheDocument();
    expect(proposals!.get).toHaveBeenCalledExactlyOnceWith(PROPOSAL_ID);
    expect(proposals!.onApplied).not.toHaveBeenCalled();
  });

  it("UI-12: sin acciones de propuesta (VIEWER) no existe forma de iniciar una modificación", () => {
    renderPanel("none");

    expect(screen.queryByRole("button", { name: "Proponer cambio UML" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Consultar" })).toBeInTheDocument();
  });

  it("Consultar sigue siendo una consulta: no crea propuestas (CU-2P-05 intacto)", async () => {
    const { proposals, onQuery } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Consultar" }));

    await waitFor(() => expect(onQuery).toHaveBeenCalledWith(INSTRUCTION));
    expect(proposals!.create).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Propuesta IA")).not.toBeInTheDocument();
  });

  it("mientras se genera la propuesta no se puede enviar otra ni consultar", async () => {
    const pending = deferred<MentorProposalResponse>();
    const { proposals, onQuery } = renderPanel(actions({ create: vi.fn().mockReturnValue(pending.promise) }));
    fireEvent.click(screen.getByRole("button", { name: "Proponer cambio UML" }));
    fireEvent.click(screen.getByLabelText("Generando propuesta UML").closest("button")!);

    expect(proposals!.create).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Consultar" })).toBeDisabled();
    pending.resolve(PENDING);
    expect(await screen.findByLabelText("Propuesta IA")).toBeInTheDocument();
    expect(onQuery).not.toHaveBeenCalled();
  });
});

const RECOMMENDATION = {
  status: "READ_ONLY" as const,
  problem: "Cliente no tiene un medio de contacto.",
  alternatives: ["Agregar un atributo de contacto a Cliente."],
  rationale: "Cliente existe en el modelo vigente.",
  limitations: "No se valida el formato del teléfono.",
  confidence: 0.75,
  needsClarification: false,
  requiresUmlChange: true,
  projectRevision: 10,
};

function renderWithRecommendation(recommendation: Partial<typeof RECOMMENDATION>, given: ReturnType<typeof actions> | "none" = actions()) {
  const proposals = given === "none" ? undefined : given;
  const onRecommend = vi.fn().mockResolvedValue({ ...RECOMMENDATION, ...recommendation });
  render(<AppProviders><MentorPanel projectName="CRM" onQuery={vi.fn()} onRecommend={onRecommend} proposals={proposals} /></AppProviders>);
  fireEvent.change(screen.getByLabelText("Consulta"), { target: { value: INSTRUCTION } });
  fireEvent.click(screen.getByRole("button", { name: "Recomendación técnica" }));
  return { proposals, onRecommend };
}

describe("MentorPanel: recomendación técnica (CU-2P-05) → propuesta UML (CU-2P-06)", () => {
  it("requiresUmlChange=false: no aparece Generar propuesta UML", async () => {
    renderWithRecommendation({ requiresUmlChange: false });
    expect(await screen.findByText("Recomendación técnica (solo lectura)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generar propuesta UML" })).not.toBeInTheDocument();
  });

  it("requiresUmlChange=true pero needsClarification=true: no es accionable y no aparece", async () => {
    renderWithRecommendation({ requiresUmlChange: true, needsClarification: true });
    expect(await screen.findByText("Recomendación técnica (solo lectura)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generar propuesta UML" })).not.toBeInTheDocument();
  });

  it("requiresUmlChange=true: aparece el botón e indica qué instrucción se enviará, sin generar nada todavía", async () => {
    const { proposals } = renderWithRecommendation({});
    expect(await screen.findByRole("button", { name: "Generar propuesta UML" })).toBeEnabled();
    expect(screen.getByText(`Se enviará tu consulta como instrucción: «${INSTRUCTION}». El diagrama no cambia hasta que confirmes la propuesta.`)).toBeInTheDocument();
    expect(proposals!.create).not.toHaveBeenCalled();
  });

  it("pulsar el botón usa el flujo CU-2P-06: create(instrucción), tarjeta PENDING y sin aplicar automáticamente", async () => {
    const { proposals, onRecommend } = renderWithRecommendation({});
    fireEvent.click(await screen.findByRole("button", { name: "Generar propuesta UML" }));
    const card = await screen.findByLabelText("Propuesta IA");

    expect(proposals!.create).toHaveBeenCalledExactlyOnceWith(INSTRUCTION);
    expect(within(card).getByText("Estado: Pendiente")).toBeInTheDocument();
    expect(within(card).getByLabelText("Cambios propuestos")).toHaveTextContent("+ Cliente.teléfono: string");
    expect(onRecommend).toHaveBeenCalledOnce();
    expect(proposals!.apply).not.toHaveBeenCalled();
    expect(proposals!.reject).not.toHaveBeenCalled();
    // The recommendation stays visible as read-only context.
    expect(screen.getByText("Recomendación técnica (solo lectura)")).toBeInTheDocument();
  });

  it("la instrucción es la consulta que produjo la recomendación, aunque luego se edite el campo", async () => {
    const { proposals } = renderWithRecommendation({});
    const button = await screen.findByRole("button", { name: "Generar propuesta UML" });
    fireEvent.change(screen.getByLabelText("Consulta"), { target: { value: "otro texto" } });
    fireEvent.click(button);

    await waitFor(() => expect(proposals!.create).toHaveBeenCalledExactlyOnceWith(INSTRUCTION));
  });

  it("Cancelar sigue sin hacer peticiones y Aplicar usa el mismo flujo existente", async () => {
    const { proposals } = renderWithRecommendation({});
    fireEvent.click(await screen.findByRole("button", { name: "Generar propuesta UML" }));
    fireEvent.click(within(await screen.findByLabelText("Propuesta IA")).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByLabelText("Propuesta IA")).not.toBeInTheDocument();
    expect(proposals!.apply).not.toHaveBeenCalled();
    expect(proposals!.reject).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Generar propuesta UML" }));
    const card = await screen.findByLabelText("Propuesta IA");
    fireEvent.click(within(card).getByRole("button", { name: "Aplicar" }));
    await waitFor(() => expect(within(card).getByText("Estado: Aplicada")).toBeInTheDocument());
    expect(proposals!.create).toHaveBeenCalledTimes(2);
    expect(proposals!.apply).toHaveBeenCalledExactlyOnceWith(PROPOSAL_ID);
    expect(proposals!.onApplied).toHaveBeenCalledExactlyOnceWith(APPLIED);
  });

  it("los errores del endpoint se muestran con el mismo manejo de CU-2P-06", async () => {
    renderWithRecommendation({}, actions({ create: vi.fn().mockRejectedValue(new ApiError(503, "El Mentor IA no está disponible en este momento.")) }));
    fireEvent.click(await screen.findByRole("button", { name: "Generar propuesta UML" }));

    expect(await screen.findByText(MODEL_UNAVAILABLE_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByLabelText("Propuesta IA")).not.toBeInTheDocument();
  });

  it("VIEWER (sin acciones de propuesta) no puede iniciarla aunque requiresUmlChange=true", async () => {
    renderWithRecommendation({}, "none");
    expect(await screen.findByText("Recomendación técnica (solo lectura)")).toBeInTheDocument();
    expect(screen.getByText("Sí, como recomendación futura.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generar propuesta UML" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Se enviará tu consulta/)).not.toBeInTheDocument();
  });
});

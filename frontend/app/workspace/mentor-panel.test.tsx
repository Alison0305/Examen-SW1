import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "../providers";
import { MentorPanel } from "./mentor-panel";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((currentResolve) => {
    resolve = currentResolve;
  });
  return { promise, resolve };
}

describe("MentorPanel", () => {
  it("muestra una respuesta contextual y evita consultas vacías", async () => {
    const onQuery = vi.fn().mockResolvedValue({ answer: "Cliente tiene nombre.", grounded: true, projectRevision: 4 });
    const onRecommend = vi.fn();
    render(<AppProviders><MentorPanel projectName="CRM" onQuery={onQuery} onRecommend={onRecommend} /></AppProviders>);

    expect(screen.getByText("Consulta sobre el modelo UML vigente de CRM.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Consultar" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Consulta"), { target: { value: "Describe Cliente" } });
    fireEvent.click(screen.getByRole("button", { name: "Consultar" }));

    await waitFor(() => expect(onQuery).toHaveBeenCalledWith("Describe Cliente"));
    expect(await screen.findByText("Cliente tiene nombre.")).toBeInTheDocument();
  });

  it("muestra el mensaje de información insuficiente y errores controlados", async () => {
    const onQuery = vi.fn().mockResolvedValueOnce({ answer: "El proyecto no contiene clases suficientes.", grounded: false, projectRevision: 1, diagnostic: "INSUFFICIENT_CONTEXT" }).mockRejectedValueOnce(new Error("unavailable"));
    render(<AppProviders><MentorPanel projectName="Vacío" onQuery={onQuery} onRecommend={vi.fn()} /></AppProviders>);
    const input = screen.getByLabelText("Consulta");
    fireEvent.change(input, { target: { value: "Describe el modelo" } });
    fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
    expect(await screen.findByText("El proyecto no contiene clases suficientes.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
    expect(await screen.findByText("No fue posible consultar al Mentor IA. Intenta nuevamente.")).toBeInTheDocument();
  });

  it("solicita y presenta una recomendación técnica sin acciones de aplicación", async () => {
    const onQuery = vi.fn();
    const onRecommend = vi.fn().mockResolvedValue({ status: "READ_ONLY", problem: "Relación poco explícita", alternatives: ["Definir multiplicidad"], rationale: "Categoria y Producto existen.", limitations: "Revisar reglas de negocio.", confidence: 0.8, needsClarification: false, requiresUmlChange: true, projectRevision: 4 });
    render(<AppProviders><MentorPanel projectName="CRM" onQuery={onQuery} onRecommend={onRecommend} /></AppProviders>);

    fireEvent.change(screen.getByLabelText("Consulta"), { target: { value: "¿Qué recomiendo para Producto y Categoria?" } });
    fireEvent.click(screen.getByRole("button", { name: "Recomendación técnica" }));

    await waitFor(() => expect(onRecommend).toHaveBeenCalledWith("¿Qué recomiendo para Producto y Categoria?"));
    expect(await screen.findByText("Recomendación técnica (solo lectura)")).toBeInTheDocument();
    expect(screen.getByText("Problema:", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Alternativas:", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Razón:", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Limitaciones:", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Sí, como recomendación futura.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Aplicar|Confirmar|Rechazar|Ejecutar/ })).not.toBeInTheDocument();
  });

  it("presenta una aclaración técnica", async () => {
    const onRecommend = vi.fn().mockResolvedValue({ status: "READ_ONLY", problem: "No hay contexto de pagos.", alternatives: [], rationale: "Se necesita contexto verificable.", limitations: "Aclara la integración.", confidence: 1, needsClarification: true, requiresUmlChange: false, projectRevision: 4 });
    render(<AppProviders><MentorPanel projectName="CRM" onQuery={vi.fn()} onRecommend={onRecommend} /></AppProviders>);

    fireEvent.change(screen.getByLabelText("Consulta"), { target: { value: "¿Cómo integro pagos?" } });
    fireEvent.click(screen.getByRole("button", { name: "Recomendación técnica" }));

    expect(await screen.findByText("Se necesita aclaración:", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("No.")).toBeInTheDocument();
  });

  it("mantiene la carga de una recomendación lenta y bloquea doble envío", async () => {
    const pending = deferred<{ status: "READ_ONLY"; problem: string; alternatives: string[]; rationale: string; limitations: string; confidence: number; needsClarification: boolean; requiresUmlChange: boolean; projectRevision: number }>();
    const onRecommend = vi.fn().mockReturnValue(pending.promise);
    render(<AppProviders><MentorPanel projectName="CRM" onQuery={vi.fn()} onRecommend={onRecommend} /></AppProviders>);

    fireEvent.change(screen.getByLabelText("Consulta"), { target: { value: "¿Cómo generar Spring Boot?" } });
    const recommendationButton = screen.getByRole("button", { name: "Recomendación técnica" });
    fireEvent.click(recommendationButton);
    fireEvent.click(recommendationButton);

    expect(onRecommend).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("Generando recomendación técnica")).toBeInTheDocument();
    expect(screen.queryByText("No fue posible solicitar una recomendación técnica. Intenta nuevamente.")).not.toBeInTheDocument();

    pending.resolve({ status: "READ_ONLY", problem: "Modelo válido", alternatives: ["Validar el UML canónico."], rationale: "El generador parte de un modelo UML válido.", limitations: "No genera desde un modelo inválido.", confidence: 1, needsClarification: false, requiresUmlChange: false, projectRevision: 4 });

    expect(await screen.findByText("Modelo válido")).toBeInTheDocument();
    expect(screen.queryByLabelText("Generando recomendación técnica")).not.toBeInTheDocument();
    expect(screen.queryByText("No fue posible solicitar una recomendación técnica. Intenta nuevamente.")).not.toBeInTheDocument();
  });
});

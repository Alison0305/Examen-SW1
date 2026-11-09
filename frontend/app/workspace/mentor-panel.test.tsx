import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "../providers";
import { MentorPanel } from "./mentor-panel";

describe("MentorPanel", () => {
  it("muestra una respuesta contextual y evita consultas vacías", async () => {
    const onQuery = vi.fn().mockResolvedValue({ answer: "Cliente tiene nombre.", grounded: true, projectRevision: 4 });
    render(<AppProviders><MentorPanel projectName="CRM" onQuery={onQuery} /></AppProviders>);

    expect(screen.getByText("Consulta sobre el modelo UML vigente de CRM.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Consultar" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Consulta"), { target: { value: "Describe Cliente" } });
    fireEvent.click(screen.getByRole("button", { name: "Consultar" }));

    await waitFor(() => expect(onQuery).toHaveBeenCalledWith("Describe Cliente"));
    expect(await screen.findByText("Cliente tiene nombre.")).toBeInTheDocument();
  });

  it("muestra el mensaje de información insuficiente y errores controlados", async () => {
    const onQuery = vi.fn().mockResolvedValueOnce({ answer: "El proyecto no contiene clases suficientes.", grounded: false, projectRevision: 1, diagnostic: "INSUFFICIENT_CONTEXT" }).mockRejectedValueOnce(new Error("unavailable"));
    render(<AppProviders><MentorPanel projectName="Vacío" onQuery={onQuery} /></AppProviders>);
    const input = screen.getByLabelText("Consulta");
    fireEvent.change(input, { target: { value: "Describe el modelo" } });
    fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
    expect(await screen.findByText("El proyecto no contiene clases suficientes.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
    expect(await screen.findByText("No fue posible consultar al Mentor IA. Intenta nuevamente.")).toBeInTheDocument();
  });
});

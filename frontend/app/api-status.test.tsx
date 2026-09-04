import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiStatus, checkApiHealth } from "./api-status";

describe("checkApiHealth", () => {
  it("returns true when health responds with an ok response", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true });

    await expect(checkApiHealth("http://localhost:3001", fetcher)).resolves.toBe(true);
    expect(fetcher).toHaveBeenCalledWith("http://localhost:3001/health", { cache: "no-store" });
  });

  it("returns false when health request fails", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("API offline"));

    await expect(checkApiHealth("http://localhost:3001", fetcher)).resolves.toBe(false);
  });
});

describe("ApiStatus", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows API disponible when backend health is available", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(<ApiStatus apiBaseUrl="http://localhost:3001" />);

    await waitFor(() => expect(screen.getAllByText("API disponible").length).toBeGreaterThan(0));
  });

  it("shows API no disponible when backend health is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    render(<ApiStatus apiBaseUrl="http://localhost:3001" />);

    await waitFor(() => expect(screen.getAllByText("API no disponible").length).toBeGreaterThan(0));
  });
});

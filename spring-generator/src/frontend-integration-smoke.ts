import { spawn } from "node:child_process";
import { access, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateStandaloneCrudFrontendToOutput } from "@examen-sw1/frontend-generator";
import { mapToRelationalModel } from "@examen-sw1/relational-core";
import { validateCanonicalUmlModel, type CanonicalUmlModel } from "@examen-sw1/uml-core";
import { generateDomainManifest } from "./domain-manifest.js";
import { generateSpringBackend } from "./generator.js";
import { writeGeneratedFiles } from "./writer.js";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)), ".generated-frontend-integration");
const backend = join(root, "backend"); const frontend = join(root, "frontend"); const baseUrl = "http://localhost:8080";
const id = (value: string) => `${[...value].reduce((total, character) => total * 31 + character.charCodeAt(0), 0).toString(16).slice(-8).padStart(8, "0")}-1111-4111-8111-111111111111`;
let attributeSequence = 0;
const attribute = (name: string, type: "integer" | "string" | "number", identifier = false) => ({ id: id(`${name}-${attributeSequence++}`), name, visibility: "private" as const, type: { kind: "primitive" as const, name: type }, generationMetadata: identifier ? { identifier: true } : {} });
const entity = (name: string, attributes: CanonicalUmlModel["classes"][number]["attributes"]) => ({ id: id(name), name, visibility: "public" as const, attributes, operations: [], generationMetadata: { entity: true } });
const model: CanonicalUmlModel = { packages: [], enumerations: [], classes: [entity("Cliente", [attribute("id", "integer", true), attribute("nombre", "string")]), entity("Producto", [attribute("id", "integer", true), attribute("nombre", "string"), attribute("precio", "number")]), entity("Venta", [attribute("id", "integer", true), attribute("cantidad", "integer")])], relationships: [{ id: id("cliente-venta"), type: "Association", sourceId: id("Cliente"), targetId: id("Venta"), sourceMultiplicity: { lower: 1, upper: 1 }, targetMultiplicity: { lower: 0, upper: "unbounded" } }, { id: id("producto-venta"), type: "Association", sourceId: id("Producto"), targetId: id("Venta"), sourceMultiplicity: { lower: 1, upper: 1 }, targetMultiplicity: { lower: 0, upper: "unbounded" } }] };

const run = (command: string, args: string[], cwd: string) => new Promise<void>((resolveRun, reject) => { const child = spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/c", `${command} ${args.join(" ")}`], { cwd, stdio: "inherit", env: process.env }); child.on("error", reject); child.on("close", (code) => code === 0 ? resolveRun() : reject(new Error(`${command} terminó con ${code ?? "desconocido"}.`))); });
const request = async (path: string, init?: RequestInit) => { const response = await fetch(`${baseUrl}${path}`, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } }); const body = await response.text(); if (!response.ok) throw new Error(`${init?.method ?? "GET"} ${path}: ${response.status} ${body}`); return body ? JSON.parse(body) : undefined; };
const waitForOpenApi = async () => { for (let attempt = 0; attempt < 90; attempt += 1) { try { return await request("/v3/api-docs"); } catch { await new Promise((done) => setTimeout(done, 1000)); } } throw new Error("Spring no estuvo listo en 90 segundos."); };

const validation = validateCanonicalUmlModel(model); if (validation.diagnostics.some((item) => item.severity === "error")) throw new Error("Modelo UML de integración inválido.");
const relational = mapToRelationalModel(model); if (!relational.success) throw new Error(`No se pudo derivar el modelo relacional: ${JSON.stringify(relational.diagnostics)}`);
const manifest = JSON.parse(generateDomainManifest(relational));
let server: ReturnType<typeof spawn> | undefined;
try {
  await rm(root, { recursive: true, force: true });
  await writeGeneratedFiles(backend, generateSpringBackend(relational));
  await generateStandaloneCrudFrontendToOutput({ relationalModel: relational, domainManifest: manifest }, frontend);
  for (const path of ["build.gradle", "settings.gradle", "domain-manifest.json", "src/main", "app/domain.ts"]) await access(join(path.startsWith("app/") ? frontend : backend, path));
  const frontendDomain = await readFile(join(frontend, "app/domain.ts"), "utf8"); for (const name of ["cliente", "producto", "venta"]) if (!frontendDomain.includes(`"${name}"`)) throw new Error(`Falta ${name} en domain.ts.`);
  try { await fetch(`${baseUrl}/v3/api-docs`); throw new Error("El puerto 8080 ya está ocupado; no se usará un Spring ajeno."); } catch (error) { if (error instanceof Error && error.message.includes("ocupado")) throw error; }
  server = spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/c", "gradle bootRun --args=\"--spring.profiles.active=demo\""], { cwd: backend, stdio: "inherit", env: process.env });
  const openApi = await waitForOpenApi();
  const paths = Object.keys(openApi.paths ?? {}); for (const path of ["/api/v1/cliente", "/api/v1/producto", "/api/v1/venta"]) if (!paths.includes(path)) throw new Error(`OpenAPI no expone ${path}.`);
  const create = (name: string) => Object.entries(openApi.components.schemas[`Create${name}Request`].properties).map(([key]) => key);
  const clienteFields = create("Cliente"); const productoFields = create("Producto"); const ventaFields = create("Venta");
  const payload = (fields: string[], values: Record<string, unknown>) => Object.fromEntries(fields.map((field) => [field, values[field] ?? (field.toLowerCase().includes("precio") ? 10 : field.toLowerCase().includes("cantidad") ? 5 : field.toLowerCase().includes("id") ? 1 : "Prueba")]));
  await request("/api/v1/cliente", { method: "POST", body: JSON.stringify(payload(clienteFields, { nombre: "Cliente prueba", id: 1 })) }); const clientes = await request("/api/v1/cliente");
  await request("/api/v1/producto", { method: "POST", body: JSON.stringify(payload(productoFields, { nombre: "Coca Cola", precio: 10, id: 1 })) }); await request("/api/v1/producto", { method: "POST", body: JSON.stringify(payload(productoFields, { nombre: "Temporal", precio: 1, id: 2 })) }); const productos = await request("/api/v1/producto");
  const foreignKeys = ventaFields.filter((field) => /cliente|producto/i.test(field)); if (foreignKeys.length !== 2) throw new Error(`FKs Venta inesperadas: ${foreignKeys.join(", ")}.`);
  await request("/api/v1/venta", { method: "POST", body: JSON.stringify(payload(ventaFields, Object.fromEntries(foreignKeys.map((field) => [field, 1])))) }); const ventas = await request("/api/v1/venta");
  const updateSchema = openApi.components.schemas.UpdateProductoRequest.properties; if (!("nombre" in updateSchema)) throw new Error("PATCH Producto no expone nombre."); await request("/api/v1/producto/1", { method: "PATCH", body: JSON.stringify({ nombre: "Coca Cola Zero" }) });
  await request("/api/v1/producto/2", { method: "DELETE" }); const productsAfterDelete = await request("/api/v1/producto");
  if (!JSON.stringify(clientes).includes("Cliente prueba") || !JSON.stringify(productos).includes("Coca Cola") || !JSON.stringify(ventas).includes("5") || !JSON.stringify(productsAfterDelete).includes("Coca Cola Zero") || JSON.stringify(productsAfterDelete).includes("Temporal")) throw new Error("CRUD generado no devolvió los resultados esperados.");
  console.log(`Integration PASS. Venta FKs: ${foreignKeys.join(", ")}.`);
} finally {
  if (server && !server.killed) { server.kill(); await run("gradle", ["--stop"], backend).catch(() => undefined); await new Promise((done) => setTimeout(done, 2000)); }
  await rm(root, { recursive: true, force: true }).catch((error) => console.warn(`No se pudo limpiar el temporal: ${String(error)}`));
}

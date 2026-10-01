import { spawn } from "node:child_process";
import { access, readFile, rm, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateStandaloneCrudFrontendToOutput } from "./generate-to-output.js";
import { frontendFixture } from "./frontend-fixture.js";
import type { StandaloneCrudGeneratorInput } from "./model.js";

const source = { elementId: "11111111-1111-4111-8111-111111111111", path: "tables[0]" };
const generatorRoot = fileURLToPath(new URL("../", import.meta.url));
const smokeRoot = resolve(generatorRoot, ".generated-standalone-smoke");
const output = resolve(smokeRoot, "frontend");
type SmokeForeignKey = (typeof frontendFixture.relationalModel.tables)[number]["foreignKeys"][number];

const table = (name: string, columns: readonly { name: string; type: "BIGINT" | "VARCHAR" | "NUMERIC"; identifier?: boolean }[], foreignKeys: readonly SmokeForeignKey[] = []) => ({ source, name, primaryKey: "id", columns: columns.map((column) => ({ source, nullable: false, identifier: column.identifier ?? false, unique: false, ...column })), uniqueConstraints: [], indexes: [], foreignKeys });
const attribute = (name: string, type: "BIGINT" | "VARCHAR" | "NUMERIC", identifier = false) => ({ name, type, required: true, identifier, unique: false, searchable: !identifier, sortable: true, defaultSort: identifier ? "ASC" as const : null });
const operations = (name: string, path: string) => ["count", "create", "list", "get", "update", "delete"].map((operation) => ({ name: `${operation}${name}`, method: operation === "create" ? "POST" as const : operation === "update" ? "PATCH" as const : operation === "delete" ? "DELETE" as const : "GET" as const, path: operation === "count" ? `${path}/count` : ["get", "update", "delete"].includes(operation) ? `${path}/{id}` : path }));
const input: StandaloneCrudGeneratorInput = {
  relationalModel: {
    ...frontendFixture.relationalModel,
    tables: [
      table("cliente", [{ name: "id", type: "BIGINT", identifier: true }, { name: "nombre", type: "VARCHAR" }]),
      table("producto", [{ name: "id", type: "BIGINT", identifier: true }, { name: "nombre", type: "VARCHAR" }, { name: "precio", type: "NUMERIC" }]),
      table("venta", [{ name: "id", type: "BIGINT", identifier: true }, { name: "cantidad", type: "BIGINT" }, { name: "clienteId", type: "BIGINT" }, { name: "productoId", type: "BIGINT" }], [{ source, name: "fk_venta_cliente", column: "clienteId", targetTable: "cliente", targetColumn: "id", lifecycle: "NONE" }, { source, name: "fk_venta_producto", column: "productoId", targetTable: "producto", targetColumn: "id", lifecycle: "NONE" }]),
    ],
    relations: [{ source, cardinality: "MANY_TO_ONE" as const, sourceTable: "venta", targetTable: "cliente", foreignKey: "fk_venta_cliente", lifecycle: "NONE" as const }, { source, cardinality: "MANY_TO_ONE" as const, sourceTable: "venta", targetTable: "producto", foreignKey: "fk_venta_producto", lifecycle: "NONE" as const }],
  },
  domainManifest: {
    schemaVersion: 1 as const,
    entities: [
      { name: "cliente", resourceName: "cliente", attributes: [attribute("id", "BIGINT", true), attribute("nombre", "VARCHAR")], relations: [], operations: operations("Cliente", "/api/v1/cliente") },
      { name: "producto", resourceName: "producto", attributes: [attribute("id", "BIGINT", true), attribute("nombre", "VARCHAR"), attribute("precio", "NUMERIC")], relations: [], operations: operations("Producto", "/api/v1/producto") },
      { name: "venta", resourceName: "venta", attributes: [attribute("id", "BIGINT", true), attribute("cantidad", "BIGINT")], relations: [{ name: "cliente", target: "cliente", cardinality: "MANY_TO_ONE" as const, lifecycle: "NONE" as const, required: true }, { name: "producto", target: "producto", cardinality: "MANY_TO_ONE" as const, lifecycle: "NONE" as const, required: true }], operations: operations("Venta", "/api/v1/venta") },
    ],
  },
};

function run(command: string): Promise<void> { return new Promise((resolveRun, reject) => { const child = spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/c", command], { cwd: output, stdio: "inherit" }); child.on("error", reject); child.on("close", (code) => code === 0 ? resolveRun() : reject(new Error(`${command} terminó con ${code ?? "desconocido"}.`))); }); }
async function exists(path: string): Promise<void> { await access(path); }

try {
  await rm(smokeRoot, { recursive: true, force: true });
  await generateStandaloneCrudFrontendToOutput(input, output);
  for (const path of ["package.json", "app/page.tsx", "app/api.ts", "app/domain.ts", "app/layout.tsx", "next.config.ts", "tsconfig.json"]) await exists(resolve(output, path));
  const packageJson = JSON.parse(await readFile(resolve(output, "package.json"), "utf8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  const dependencyText = JSON.stringify({ ...packageJson.dependencies, ...packageJson.devDependencies });
  if (dependencyText.includes("@examen-sw1/") || dependencyText.includes("file:")) throw new Error("El package standalone contiene dependencias internas o file:.");
  const generatedText = await Promise.all(["package.json", "app/page.tsx", "app/api.ts", "app/domain.ts", "app/layout.tsx", "next.config.ts", "tsconfig.json"].map((path) => readFile(resolve(output, path), "utf8"))).then((contents) => contents.join("\n"));
  if (generatedText.includes("@examen-sw1/") || generatedText.includes("file:")) throw new Error("El frontend standalone contiene referencias internas.");
  for (const name of ["cliente", "producto", "venta"]) if (!generatedText.includes(`"${name}"`)) throw new Error(`Falta ${name} en el dominio generado.`);
  await run("npm install --workspaces=false");
  await exists(resolve(output, "node_modules")); await exists(resolve(output, "package-lock.json"));
  await run("npm run build");
  await stat(resolve(output, "out")); await exists(resolve(output, "out", "index.html"));
  console.log("Standalone frontend smoke PASS: install, build and static export verified.");
} finally {
  await rm(smokeRoot, { recursive: true, force: true });
}

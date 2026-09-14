import { spawn } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { mapToRelationalModel } from "@examen-sw1/relational-core";
import { validateCanonicalUmlModel, type CanonicalUmlModel } from "@examen-sw1/uml-core";
import { generateSpringBackend } from "./generator.js";
import { writeGeneratedFiles } from "./writer.js";

const outputRoot = resolve(".generated-test", "backend");
const javaHome = process.env.JAVA_HOME;
const gradleHome = process.env.GRADLE_HOME;
const commandTimeoutMs = 10 * 60 * 1000;

const ids = {
  usuario: "11111111-1111-4111-8111-111111111111",
  perfil: "22222222-2222-4222-8222-222222222222",
  pedido: "33333333-3333-4333-8333-333333333333",
  producto: "44444444-4444-4444-8444-444444444444",
  categoria: "55555555-5555-4555-8555-555555555555",
  estado: "66666666-6666-4666-8666-666666666666",
  oneToOne: "77777777-7777-4777-8777-777777777777",
  oneToMany: "88888888-8888-4888-8888-888888888888",
  composition: "99999999-9999-4999-8999-999999999999",
  aggregation: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  manyToMany: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
};

const attribute = (id: string, name: string, type: CanonicalUmlModel["classes"][number]["attributes"][number]["type"], generationMetadata = {}) => ({ id, name, visibility: "private" as const, type, generationMetadata });
const entity = (id: string, name: string, attributes: CanonicalUmlModel["classes"][number]["attributes"]) => ({ id, name, visibility: "public" as const, attributes, operations: [], generationMetadata: { entity: true } });

function run(command: string, args: readonly string[], cwd: string, environment: NodeJS.ProcessEnv, label: string): Promise<void> {
  console.log(`> ${label}: ${command} ${args.join(" ")}`);
  return new Promise((resolveRun, reject) => {
    const child = process.platform === "win32"
      ? spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/c", `${command} ${args.join(" ")}`], { cwd, env: environment, stdio: "inherit" })
      : spawn(command, args, { cwd, env: environment, stdio: "inherit" });
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Timeout de ${commandTimeoutMs / 60000} minutos al ejecutar ${label}: ${command} ${args.join(" ")}`));
    }, commandTimeoutMs);
    child.on("error", (error) => { clearTimeout(timeout); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolveRun();
      else reject(new Error(`${label} terminó con exit code ${code ?? "desconocido"}.`));
    });
  });
}

const fixture: CanonicalUmlModel = {
  packages: [],
  enumerations: [{ id: ids.estado, name: "EstadoPedido", visibility: "public", literals: ["NUEVO", "PAGADO", "ENVIADO"] }],
  classes: [
    entity(ids.usuario, "Usuario", [attribute("11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "id", { kind: "primitive", name: "integer" }, { identifier: true }), attribute("11111111-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "email", { kind: "primitive", name: "string" }, { required: true, unique: true, indexed: true }), attribute("11111111-cccc-4ccc-8ccc-cccccccccccc", "activo", { kind: "primitive", name: "boolean" }, { required: true })]),
    entity(ids.perfil, "Perfil", [attribute("22222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "id", { kind: "primitive", name: "integer" }, { identifier: true }), attribute("22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "fechaNacimiento", { kind: "primitive", name: "date" })]),
    entity(ids.pedido, "Pedido", [attribute("33333333-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "id", { kind: "primitive", name: "integer" }, { identifier: true }), attribute("33333333-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "estado", { kind: "reference", referenceType: "enumeration", elementId: ids.estado }, { required: true }), attribute("33333333-cccc-4ccc-8ccc-cccccccccccc", "total", { kind: "primitive", name: "number" }, { required: true }), attribute("33333333-dddd-4ddd-8ddd-dddddddddddd", "creadoEn", { kind: "primitive", name: "datetime" }, { required: true })]),
    entity(ids.producto, "Producto", [attribute("44444444-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "id", { kind: "primitive", name: "integer" }, { identifier: true }), attribute("44444444-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "nombre", { kind: "primitive", name: "string" }, { required: true }), attribute("44444444-cccc-4ccc-8ccc-cccccccccccc", "precio", { kind: "primitive", name: "number" }, { required: true })]),
    entity(ids.categoria, "Categoria", [attribute("55555555-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "id", { kind: "primitive", name: "integer" }, { identifier: true }), attribute("55555555-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "nombre", { kind: "primitive", name: "string" }, { required: true, unique: true })]),
  ],
  relationships: [
    { id: ids.oneToOne, name: "perfil", type: "Association", sourceId: ids.usuario, targetId: ids.perfil, sourceMultiplicity: { lower: 1, upper: 1 }, targetMultiplicity: { lower: 1, upper: 1 }, foreignKeyOwner: "TARGET" },
    { id: ids.oneToMany, name: "pedidos", type: "Association", sourceId: ids.usuario, targetId: ids.pedido, sourceMultiplicity: { lower: 1, upper: 1 }, targetMultiplicity: { lower: 0, upper: "unbounded" } },
    { id: ids.composition, name: "productos", type: "Composition", sourceId: ids.pedido, targetId: ids.producto, sourceMultiplicity: { lower: 1, upper: 1 }, targetMultiplicity: { lower: 0, upper: "unbounded" } },
    { id: ids.aggregation, name: "catalogo", type: "Aggregation", sourceId: ids.categoria, targetId: ids.producto, sourceMultiplicity: { lower: 1, upper: 1 }, targetMultiplicity: { lower: 0, upper: "unbounded" } },
    { id: ids.manyToMany, name: "categorias", type: "Association", sourceId: ids.producto, targetId: ids.categoria, sourceMultiplicity: { lower: 0, upper: "unbounded" }, targetMultiplicity: { lower: 0, upper: "unbounded" } },
  ],
};

async function main(): Promise<void> {
  if (!javaHome || !gradleHome) throw new Error("JAVA_HOME y GRADLE_HOME son obligatorios para el gate de compilación.");
  const validation = validateCanonicalUmlModel(fixture);
  if (validation.diagnostics.some((diagnostic) => diagnostic.severity === "error")) throw new Error("La fixture UML contiene diagnósticos bloqueantes.");
  const relational = mapToRelationalModel(fixture);
  if (!relational.success) throw new Error("La fixture no pudo mapearse a RelationalModel.");
  const first = generateSpringBackend(relational);
  const second = generateSpringBackend(structuredClone(relational));
  if (JSON.stringify(first) !== JSON.stringify(second)) throw new Error("La generación no fue determinista.");
  if (!first.some((file) => file.path.endsWith("entities/Usuario.java")) || !first.some((file) => file.path.endsWith("enums/EstadoPedido.java"))) throw new Error("La fixture no produjo los artefactos semánticos esperados.");
  await rm(outputRoot, { recursive: true, force: true });
  const environment = { ...process.env, JAVA_HOME: javaHome, PATH: `${join(javaHome, "bin")};${join(gradleHome, "bin")};${process.env.PATH ?? ""}` };
  try {
    await writeGeneratedFiles(outputRoot, first);
    await run("gradle.bat", ["wrapper", "--gradle-version", "8.14.4"], outputRoot, environment, "crear Gradle Wrapper");
    const wrapperProperties = await readFile(join(outputRoot, "gradle", "wrapper", "gradle-wrapper.properties"), "utf8");
    if (!wrapperProperties.includes("gradle-8.14.4-bin.zip")) throw new Error("El wrapper no quedó fijado a Gradle 8.14.4.");
    await run("gradlew.bat", ["--version"], outputRoot, environment, "verificar Gradle Wrapper");
    await run("gradlew.bat", ["compileJava", "--info", "--console=plain"], outputRoot, environment, "compilar backend generado");
    console.log(`Generated backend compiled successfully: ${outputRoot}`);
  } finally {
    if (process.env.KEEP_GENERATED_BACKEND !== "1") await rm(dirname(outputRoot), { recursive: true, force: true });
  }
}

await main();

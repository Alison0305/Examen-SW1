import { describe, expect, it } from "vitest";
import type { RelationalModel } from "@examen-sw1/relational-core";
import { defaultSpringGeneratorConfig, generateDomainManifest, generateSpringBackend, SpringGeneratorConfigError, SpringGeneratorModelError, verifyDomainManifestOpenApi } from "./index.js";

const source = { elementId: "11111111-1111-4111-8111-111111111111", path: "tables[0]" };
const model: RelationalModel = {
  tables: [
    { source, name: "pedido", primaryKey: "id", columns: [
      { source, name: "id", type: "BIGINT", nullable: false, identifier: true, unique: false },
      { source, name: "estado", type: "ENUM", nullable: false, identifier: false, unique: false, enumName: "estado_pedido" },
      { source, name: "usuario_id", type: "BIGINT", nullable: false, identifier: false, unique: false },
    ], uniqueConstraints: [], indexes: [], foreignKeys: [{ source, name: "fk_pedido_usuario_id", column: "usuario_id", targetTable: "usuario", targetColumn: "id", lifecycle: "COMPOSITION" }] },
    { source, name: "usuario", primaryKey: "id", columns: [{ source, name: "id", type: "BIGINT", nullable: false, identifier: true, unique: false }, { source, name: "email", type: "VARCHAR", nullable: false, identifier: false, unique: true }], uniqueConstraints: [{ name: "uq_usuario_email", columns: ["email"] }], indexes: [], foreignKeys: [] },
  ],
  enums: [{ source, name: "estado_pedido", literals: ["NUEVO", "PAGADO"] }],
  relations: [{ source, cardinality: "MANY_TO_ONE", sourceTable: "pedido", targetTable: "usuario", foreignKey: "fk_pedido_usuario_id", lifecycle: "NONE" }], diagnostics: [], hasErrors: false, success: true,
};

describe("SpringBackendGenerator", () => {
  it("genera archivos ordenados, inmutables y deterministas", () => {
    const first = generateSpringBackend(model);
    const second = generateSpringBackend(structuredClone(model));
    expect(first).toEqual(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first[0])).toBe(true);
    expect(first.map((file) => file.path)).toEqual([...first.map((file) => file.path)].sort());
    expect(first).toHaveLength(30);
  });

  it("genera Gradle, configuración y estructura Spring Boot 4.1.1 con Java 21", () => {
    const files = generateSpringBackend(model);
    const content = (path: string) => files.find((file) => file.path === path)?.content;
    expect(content("build.gradle")).toContain("org.springframework.boot' version '4.1.1'");
    expect(content("build.gradle")).toContain("JavaLanguageVersion.of(21)");
    expect(content("build.gradle")).toContain("spring-boot-starter-webmvc");
    expect(content("build.gradle")).toContain("spring-boot-starter-data-jpa");
    expect(content("build.gradle")).toContain("spring-boot-starter-validation");
    expect(content("build.gradle")).toContain("springdoc-openapi-starter-webmvc-api:3.1.1");
    expect(content("build.gradle")).toContain("org.postgresql:postgresql");
    expect(content("build.gradle")).toContain("org.testcontainers:testcontainers-junit-jupiter:2.0.5");
    expect(content("build.gradle")).toContain("org.testcontainers:testcontainers-postgresql:2.0.5");
    expect(content("settings.gradle")).toBe('rootProject.name = "generated-backend"\n');
    expect(content("src/main/resources/application.properties")).toBe("spring.application.name=generated-backend\nspring.jpa.open-in-view=false\n");
    expect(content("src/test/resources/application-test.properties")).toBe("spring.jpa.hibernate.ddl-auto=create-drop\n");
  });

  it("genera imports, anotaciones, enum y relaciones JPA tipadas", () => {
    const files = generateSpringBackend(model);
    const entity = files.find((file) => file.path.endsWith("entities/Pedido.java"))!.content;
    expect(entity).toContain("import com.examen.sw1.generated.enums.EstadoPedido;");
    expect(entity).toContain("import com.examen.sw1.generated.entities.Usuario;");
    expect(entity).toContain("import jakarta.persistence.Enumerated;");
    expect(entity).toContain("import jakarta.persistence.EnumType;");
    expect(entity).toContain("@Enumerated(EnumType.STRING)");
    expect(entity).toContain("@ManyToOne");
    expect(entity).not.toContain("CascadeType.ALL");
    expect(entity).toContain('@JoinColumn(name = "usuario_id", referencedColumnName = "id", nullable = false)');
    expect(entity).toContain("private Usuario usuarioId;");
    expect(files.map((file) => file.content).join("\n")).not.toContain("FetchType.EAGER");
    expect(files.find((file) => file.path.endsWith("enums/EstadoPedido.java"))?.content).toContain("NUEVO,");
    expect(files.find((file) => file.path.endsWith("repositories/UsuarioRepository.java"))?.content).toContain("JpaRepository<Usuario, Long>");
    expect(files.find((file) => file.path.endsWith("controllers/PedidoController.java"))?.content).toContain('@RequestMapping("/api/v1/pedido")');
  });

  it("genera DTOs tipados, resolución de relaciones y consultas allow-listed", () => {
    const files = generateSpringBackend(model);
    const content = (path: string) => files.find((file) => file.path.endsWith(path))!.content;
    expect(content("dto/CreatePedidoRequest.java")).toContain("record CreatePedidoRequest(");
    expect(content("dto/CreatePedidoRequest.java")).toContain("Long usuarioId");
    expect(content("dto/UpdatePedidoRequest.java")).toContain("PatchField<Long> usuarioId");
    expect(content("dto/PedidoResponse.java")).toContain("Long usuarioId");
    expect(content("dto/PatchField.java")).toContain("boolean present");
    expect(content("services/PedidoService.java")).toContain("UsuarioRepository usuarioIdRepository");
    expect(content("services/PedidoService.java")).toContain("usuarioIdRepository.findById");
    expect(content("services/PedidoService.java")).toContain("repository.count(specification(filter, q))");
    expect(content("services/PedidoService.java")).toContain("import org.springframework.transaction.annotation.Transactional;");
    expect(content("services/PedidoService.java")).toContain("@Transactional(readOnly = true)");
    expect(content("services/PedidoService.java")).toContain("@Transactional\n    public PedidoResponse create");
    expect(content("services/PedidoService.java")).toContain("@Transactional\n    public PedidoResponse update");
    expect(content("services/PedidoService.java")).toContain("@Transactional\n    public void delete");
    expect(content("services/PedidoService.java")).not.toContain("FetchType.EAGER");
    expect(content("services/PedidoService.java")).not.toContain("open-in-view");
    expect(content("services/PedidoService.java")).toContain("repository.findAll(specification(filter, q)");
    expect(content("api/QueryParser.java")).toContain("Specification<T> specification");
    expect(content("api/QueryParser.java")).toContain("INVALID_FILTER");
    expect(content("api/ApiExceptionHandler.java")).toContain("VALIDATION_ERROR");
    expect(content("api/ApiExceptionHandler.java")).toContain("INTERNAL_ERROR");
    expect(content("dto/PageResponse.java")).toContain("record PageResponse<T>(List<T> content, int page, int size, long totalElements, int totalPages)");
    expect(content("dto/CountResponse.java")).toContain("record CountResponse(long count)");
    expect(content("controllers/PedidoController.java")).toContain("PageResponse<PedidoResponse> list");
    expect(content("controllers/PedidoController.java")).not.toContain("Page<PedidoResponse>");
    expect(content("controllers/PedidoController.java")).toContain("CountResponse count");
    expect(content("controllers/PedidoController.java")).not.toContain("Map<String, Long>");
    expect(content("controllers/PedidoController.java")).toContain('@Operation(operationId = "createPedido"');
    expect(content("controllers/PedidoController.java")).toContain('@Operation(operationId = "getPedido"');
    expect(content("controllers/PedidoController.java")).toContain('@Operation(operationId = "updatePedido"');
    expect(content("controllers/PedidoController.java")).toContain('@Operation(operationId = "deletePedido"');
    expect(content("controllers/PedidoController.java")).toContain('@Operation(operationId = "listPedido"');
    expect(content("controllers/PedidoController.java")).toContain('@Operation(operationId = "countPedido"');
    expect(content("controllers/PedidoController.java")).toContain("implementation = ApiError.class");
    expect(content("services/PedidoService.java")).toContain("new PageResponse<>(response.getContent(), response.getNumber(), response.getSize(), response.getTotalElements(), response.getTotalPages())");
    expect(content("services/PedidoService.java")).toContain("new CountResponse(repository.count(specification(filter, q)))");
    expect(content("services/PedidoService.java")).toContain('default -> throw new ApiException(400, "INVALID_RELATION"');
    expect(content("dto/UpdatePedidoRequest.java")).toContain("rejectIdentifier");
    expect(content("dto/UpdatePedidoRequest.java")).toContain('"id".equals(name)');
    expect(content("services/PedidoService.java")).toContain('case "usuarioId" -> entity.getUsuarioId() == null ? null : ResponseMapper.usuario(entity.getUsuarioId())');
    expect(content("services/PedidoService.java")).not.toContain("return get(id);");
    expect(content("api/QueryParser.java")).toContain('"true".equalsIgnoreCase(value)');
    expect(content("api/QueryParser.java")).toContain('"false".equalsIgnoreCase(value)');
    expect(content("api/QueryParser.java")).toContain("q.toLowerCase(Locale.ROOT)");
    expect(content("api/QueryParser.java")).toContain("((String) value).toLowerCase(Locale.ROOT)");
  });

  it("documenta parámetros de consulta explícitos sin exponer MultiValueMap", () => {
    const searchable: RelationalModel = { ...model, tables: model.tables.map((table) => table.name === "usuario"
      ? { ...table, columns: table.columns.map((column) => column.name === "email" ? { ...column, searchable: true } : column) }
      : table) };
    const files = generateSpringBackend(searchable);
    const controller = (name: string) => files.find((file) => file.path.endsWith(`controllers/${name}Controller.java`))!.content;
    const usuario = controller("Usuario");
    const pedido = controller("Pedido");
    for (const content of [usuario, pedido]) {
      expect(content).not.toContain("MultiValueMap");
      expect(content).toContain('@RequestParam(name = "page", defaultValue = "0") int page');
      expect(content).toContain('@RequestParam(name = "size", defaultValue = "20") int size');
      expect(content).toContain('maximum = "100"');
      expect(content).toContain("HttpServletRequest request");
      expect(content).toContain("style = ParameterStyle.FORM, explode = Explode.TRUE");
      expect(content).toContain('values(request, "sort")');
      expect(content).toContain('values(request, "filter")');
    }
    expect(usuario).toContain('@RequestParam(name = "q", required = false) String q');
    expect(usuario).toContain('service.count(values(request, "filter"), q)');
    expect(pedido).not.toContain('@RequestParam(name = "q", required = false) String q');
    expect(pedido).toContain('service.count(values(request, "filter"), null)');
  });

  it("escapa cuerpos JSON de runtime como literales Java compilables", () => {
    const runtime = generateSpringBackend(model).find((file) => file.path.endsWith("GeneratedApiRuntimeTest.java"))!.content;
    expect(runtime).toContain('"{\\"id\\":1,\\"email\\":\\"runtime\\"}"');
    expect(runtime).toContain('"{\\"email\\":\\"runtime-updated\\"}"');
  });

  it("genera cobertura runtime de mapeo to-many con valores exactos", () => {
    const runtime = generateSpringBackend({
      ...model,
      tables: model.tables.map((table) => table.name === "usuario" ? { ...table, columns: table.columns.map((column) => column.name === "email" ? { ...column, searchable: true } : column) } : table),
      relations: [...model.relations, { source, cardinality: "ONE_TO_MANY", sourceTable: "usuario", targetTable: "pedido", foreignKey: "fk_pedido_usuario_id", lifecycle: "NONE" }],
    }).find((file) => file.path.endsWith("GeneratedApiRuntimeTest.java"))!.content;
    expect(runtime).toContain("void mapsToManyRelationsWithExactValues()");
    expect(runtime).toContain('"{\\"id\\":101,\\"email\\":\\"lazy-user@example.test\\"}"');
    expect(runtime).toContain('"{\\"id\\":102,\\"estado\\":\\"NUEVO\\",\\"usuarioId\\":101}"');
    expect(runtime).toContain('parent.path("pedidoIds")');
    expect(runtime).toContain('/relations/pedido');
  });

  it("preserva presencia PATCH y nullability al resolver referencias", () => {
    const nullable: RelationalModel = { ...model, tables: [{ ...model.tables[0], columns: model.tables[0].columns.map((column) => column.name === "usuario_id" ? { ...column, nullable: true } : column) }, model.tables[1]] };
    const files = generateSpringBackend(nullable);
    const service = files.find((file) => file.path.endsWith("services/PedidoService.java"))!.content;
    const create = files.find((file) => file.path.endsWith("dto/CreatePedidoRequest.java"))!.content;
    expect(create).not.toContain("@NotNull Long usuarioId");
    expect(service).toContain("request.usuarioId() == null ? null : usuarioIdRepository.findById(request.usuarioId())");
    expect(service).toContain("request.getUsuarioId().value() == null ? null : usuarioIdRepository.findById(request.getUsuarioId().value())");
    expect(service).not.toContain("usuarioId no puede ser null.");
  });

  it("acepta una configuración explícita sin mutar los defaults", () => {
    const files = generateSpringBackend(model, { groupId: "org.example", artifactId: "catalogo", basePackage: "org.example.catalogo", applicationClass: "CatalogoApplication" });
    expect(files.find((file) => file.path === "settings.gradle")?.content).toContain("catalogo");
    expect(files.some((file) => file.path.includes("org/example/catalogo/CatalogoApplication.java"))).toBe(true);
    expect(defaultSpringGeneratorConfig).toEqual({ groupId: "com.examen.sw1", artifactId: "generated-backend", basePackage: "com.examen.sw1.generated", applicationClass: "GeneratedApplication" });
  });

  it.each([
    { groupId: "org.example", artifactId: "catalogo", basePackage: "org.example.catalogo", applicationClass: "CatalogoApplication" },
    { groupId: "org.example", artifactId: "catalogo-api", basePackage: "org.example.catalogo_api", applicationClass: "CatalogoApplication" },
  ])("acepta configuración Java y Gradle válida", (config) => {
    expect(() => generateSpringBackend(model, config)).not.toThrow();
  });

  it.each([
    { groupId: "org-example", artifactId: "catalogo", basePackage: "org.example.catalogo", applicationClass: "CatalogoApplication" },
    { groupId: "org.example", artifactId: "catalogo'", basePackage: "org.example.catalogo", applicationClass: "CatalogoApplication" },
    { groupId: "org.example", artifactId: "catalogo", basePackage: "org.example.Catalogo", applicationClass: "CatalogoApplication" },
    { groupId: "org.example", artifactId: "catalogo", basePackage: "org.example.catalogo", applicationClass: "catalogo application" },
  ])("rechaza configuración que podría alterar Java o Gradle", (config) => {
    expect(() => generateSpringBackend(model, config)).toThrow(SpringGeneratorConfigError);
  });

  it("usa LF y no inserta valores variables en contenido generado", () => {
    for (const file of generateSpringBackend(model)) {
      expect(file.content).not.toContain("\r");
      expect(file.content).not.toMatch(/uuid|timestamp|202\d/i);
    }
  });

  it("genera el Domain Manifest v1 raíz con contrato, orden y operaciones estables", () => {
    const first = generateDomainManifest(model);
    const manifest = JSON.parse(first) as { schemaVersion: number; entities: Array<{ name: string; resourceName: string; attributes: Array<Record<string, unknown>>; relations: Array<Record<string, unknown>>; operations: Array<Record<string, unknown>> }> };
    expect(generateDomainManifest(structuredClone(model))).toBe(first);
    expect(generateSpringBackend(model).find((file) => file.path === "domain-manifest.json")?.content).toBe(first);
    expect(manifest).toHaveProperty("schemaVersion", 1);
    expect(Object.keys(manifest)).toEqual(["schemaVersion", "entities"]);
    expect(manifest.entities.map((entity) => entity.name)).toEqual(["pedido", "usuario"]);
    expect(Object.keys(manifest.entities[0]!)).toEqual(["name", "resourceName", "attributes", "relations", "operations"]);
    expect(Object.keys(manifest.entities[0]!.attributes[0]!)).toEqual(["name", "type", "required", "identifier", "unique", "searchable", "sortable", "defaultSort"]);
    expect(Object.keys(manifest.entities[0]!.relations[0]!)).toEqual(["name", "target", "cardinality", "lifecycle", "required"]);
    expect(Object.keys(manifest.entities[0]!.operations[0]!)).toEqual(["name", "method", "path"]);
    expect(manifest.entities[0]!.operations).toContainEqual({ name: "createPedido", method: "POST", path: "/api/v1/pedido" });
    expect(first).not.toMatch(/timestamp|uuid|localhost|127\.0\.0\.1/i);
  });

  it("verifica cada operación del Manifest contra OpenAPI", () => {
    const manifest = generateDomainManifest(model);
    const document = JSON.parse(manifest) as { entities: Array<{ operations: Array<{ name: string; method: string; path: string }> }> };
    const paths = Object.fromEntries(document.entities.flatMap((entity) => entity.operations).map((operation) => [operation.path, {}]));
    for (const operation of document.entities.flatMap((entity) => entity.operations)) {
      const path = paths[operation.path] as Record<string, unknown>;
      path[operation.method.toLowerCase()] = { operationId: operation.name };
    }
    expect(() => verifyDomainManifestOpenApi(manifest, JSON.stringify({ paths }))).not.toThrow();
    expect(() => verifyDomainManifestOpenApi(manifest, JSON.stringify({ paths: {} }))).toThrow("OpenAPI no verifica");
  });

  it("rechaza literals enum no compilables antes de interpolarlos", () => {
    const invalid: RelationalModel = { ...model, enums: [{ ...model.enums[0], literals: ["NO-VALIDO"] }] };
    expect(() => generateSpringBackend(invalid)).toThrow(SpringGeneratorModelError);
  });

  it("rechaza colisiones de paths Java sin distinguir mayúsculas", () => {
    const collision: RelationalModel = { ...model, tables: [
      { ...model.tables[0], name: "pedido" },
      { ...model.tables[1], name: "Pedido" },
    ] };
    expect(() => generateSpringBackend(collision)).toThrow(SpringGeneratorModelError);
  });

  it("proyecta 1:N, N:M repetidas y JOINED usando los fields Java en mappedBy", () => {
    const relationModel: RelationalModel = {
      tables: [
        { source, name: "usuario", primaryKey: "id", columns: [{ source, name: "id", type: "BIGINT", nullable: false, identifier: true, unique: false }], uniqueConstraints: [], indexes: [], foreignKeys: [] },
        { source, name: "pedido", primaryKey: "id", columns: [{ source, name: "id", type: "BIGINT", nullable: false, identifier: true, unique: false }, { source, name: "usuario_id", type: "BIGINT", nullable: false, identifier: false, unique: false }], uniqueConstraints: [], indexes: [], foreignKeys: [{ source, name: "fk_pedido_usuario_id", column: "usuario_id", targetTable: "usuario", targetColumn: "id", lifecycle: "NONE" }] },
        { source, name: "perfil", primaryKey: "id", columns: [{ source, name: "id", type: "BIGINT", nullable: false, identifier: true, unique: false }], uniqueConstraints: [], indexes: [], foreignKeys: [], inheritsFrom: "usuario", inheritanceStrategy: "JOINED" },
        { source, name: "usuario_producto_favoritos", columns: [{ source, name: "usuario_id", type: "BIGINT", nullable: false, identifier: false, unique: false }, { source, name: "producto_id", type: "BIGINT", nullable: false, identifier: false, unique: false }], uniqueConstraints: [], indexes: [], foreignKeys: [{ source, name: "fk_join_usuario", column: "usuario_id", targetTable: "usuario", targetColumn: "id", lifecycle: "NONE" }, { source, name: "fk_join_producto", column: "producto_id", targetTable: "producto", targetColumn: "id", lifecycle: "NONE" }] },
        { source, name: "producto", primaryKey: "id", columns: [{ source, name: "id", type: "BIGINT", nullable: false, identifier: true, unique: false }], uniqueConstraints: [], indexes: [], foreignKeys: [] },
      ], enums: [], relations: [
        { source, cardinality: "ONE_TO_MANY", sourceTable: "usuario", targetTable: "pedido", foreignKey: "fk_pedido_usuario_id", lifecycle: "NONE" },
        { source: { ...source, elementId: "22222222-2222-4222-8222-222222222222" }, cardinality: "MANY_TO_MANY", sourceTable: "usuario", targetTable: "producto", joinTable: "usuario_producto_favoritos", lifecycle: "NONE" },
      ], diagnostics: [], hasErrors: false, success: true,
    };
    const files = generateSpringBackend(relationModel);
    const usuario = files.find((file) => file.path.endsWith("entities/Usuario.java"))!.content;
    const pedido = files.find((file) => file.path.endsWith("entities/Pedido.java"))!.content;
    const perfil = files.find((file) => file.path.endsWith("entities/Perfil.java"))!.content;
    expect(usuario).toContain('@OneToMany(mappedBy = "usuarioId")');
    expect(usuario).toContain('@JoinTable(name = "usuario_producto_favoritos"');
    expect(pedido).toContain("private Usuario usuarioId;");
    expect(perfil).toContain("extends Usuario");
    expect(perfil).toContain('@PrimaryKeyJoinColumn(name = "id")');
    expect(perfil).not.toContain("@Id");
    expect(files.some((file) => file.path.endsWith("UsuarioProductoFavoritos.java"))).toBe(false);
    const usuarioResponse = files.find((file) => file.path.endsWith("dto/UsuarioResponse.java"))!.content;
    const pedidoResponse = files.find((file) => file.path.endsWith("dto/PedidoResponse.java"))!.content;
    const mapper = files.find((file) => file.path.endsWith("dto/ResponseMapper.java"))!.content;
    expect(pedidoResponse).toContain("Long usuarioId");
    expect(usuarioResponse).toContain("Set<Long> pedidoIds");
    expect(usuarioResponse).toContain("Set<Long> productoIdsUsuarioProductoFavoritos");
    expect(mapper).toContain("Optional.ofNullable(entity.getUsuarioIdItems()).orElseGet(java.util.Set::of).stream()");
    expect(mapper).toContain("Optional.ofNullable(entity.getProductoItemsUsuarioProductoFavoritos()).orElseGet(java.util.Set::of).stream()");
    expect(mapper).toContain(".map(item -> item.getId()).sorted().collect(java.util.stream.Collectors.toCollection(java.util.LinkedHashSet::new))");
    expect(usuarioResponse).not.toContain("Set<Pedido>");
    expect(usuarioResponse).not.toContain("Set<Producto>");
    const usuarioService = files.find((file) => file.path.endsWith("services/UsuarioService.java"))!.content;
    expect(usuarioService).toContain("Optional.ofNullable(entity.getUsuarioIdItems()).orElseGet(java.util.Set::of).stream().sorted(java.util.Comparator.comparing(item -> item.getId())).map(ResponseMapper::pedido).toList()");
    expect(usuarioService).toContain("Optional.ofNullable(entity.getProductoItemsUsuarioProductoFavoritos()).orElseGet(java.util.Set::of).stream().sorted(java.util.Comparator.comparing(item -> item.getId())).map(ResponseMapper::producto).toList()");
  });

  it("genera Aggregation sin cascade ni orphan removal y conserva el mappedBy Java", () => {
    const aggregation: RelationalModel = {
      tables: [
        { source, name: "equipo", primaryKey: "id", columns: [{ source, name: "id", type: "BIGINT", nullable: false, identifier: true, unique: false }], uniqueConstraints: [], indexes: [], foreignKeys: [] },
        { source, name: "miembro", primaryKey: "id", columns: [{ source, name: "id", type: "BIGINT", nullable: false, identifier: true, unique: false }, { source, name: "equipo_id", type: "BIGINT", nullable: false, identifier: false, unique: false }], uniqueConstraints: [], indexes: [], foreignKeys: [{ source, name: "fk_miembro_equipo_id", column: "equipo_id", targetTable: "equipo", targetColumn: "id", lifecycle: "NONE" }] },
      ], enums: [], relations: [{ source, cardinality: "ONE_TO_MANY", sourceTable: "equipo", targetTable: "miembro", foreignKey: "fk_miembro_equipo_id", lifecycle: "NONE" }], diagnostics: [], hasErrors: false, success: true,
    };
    const first = generateSpringBackend(aggregation);
    const equipo = first.find((file) => file.path.endsWith("entities/Equipo.java"))!.content;
    const miembro = first.find((file) => file.path.endsWith("entities/Miembro.java"))!.content;
    expect(first).toEqual(generateSpringBackend(structuredClone(aggregation)));
    expect(equipo).toContain('@OneToMany(mappedBy = "equipoId")');
    expect(miembro).toContain('@JoinColumn(name = "equipo_id", referencedColumnName = "id", nullable = false)');
    expect(miembro).not.toContain("CascadeType.ALL");
    expect(`${equipo}\n${miembro}`).not.toContain("orphanRemoval");
  });

  it("proyecta lifecycle de Composition 1:N desde el composite hacia las partes", () => {
    const composition: RelationalModel = {
      tables: [
        { source, name: "pedido", primaryKey: "id", columns: [{ source, name: "id", type: "BIGINT", nullable: false, identifier: true, unique: false }], uniqueConstraints: [], indexes: [], foreignKeys: [] },
        { source, name: "producto", primaryKey: "id", columns: [{ source, name: "id", type: "BIGINT", nullable: false, identifier: true, unique: false }, { source, name: "pedido_id", type: "BIGINT", nullable: false, identifier: false, unique: false }], uniqueConstraints: [], indexes: [], foreignKeys: [{ source, name: "fk_producto_pedido_id", column: "pedido_id", targetTable: "pedido", targetColumn: "id", lifecycle: "COMPOSITION" }] },
      ], enums: [], relations: [{ source, cardinality: "ONE_TO_MANY", sourceTable: "pedido", targetTable: "producto", foreignKey: "fk_producto_pedido_id", lifecycle: "COMPOSITION" }], diagnostics: [], hasErrors: false, success: true,
    };
    const files = generateSpringBackend(composition);
    const pedido = files.find((file) => file.path.endsWith("entities/Pedido.java"))!.content;
    const producto = files.find((file) => file.path.endsWith("entities/Producto.java"))!.content;
    expect(pedido).toContain('@OneToMany(mappedBy = "pedidoId", cascade = CascadeType.ALL, orphanRemoval = true)');
    expect(pedido).toContain("private Set<Producto> pedidoIdItems;");
    expect(producto).toContain("@ManyToOne");
    expect(producto).not.toContain("@ManyToOne(cascade = CascadeType.ALL)");
    expect(producto).toContain('@JoinColumn(name = "pedido_id", referencedColumnName = "id", nullable = false)');
  });

  it.each(["composite", "part"] as const)("proyecta lifecycle de Composition 1:1 cuando la FK pertenece al %s", (owner) => {
    const entity = (name: string, foreignKey = owner === "composite" ? name === "composite" : name === "part") => ({ source, name, primaryKey: "id", columns: [{ source, name: "id", type: "BIGINT" as const, nullable: false, identifier: true, unique: false }, ...(foreignKey ? [{ source, name: owner === "composite" ? "parte_id" : "composite_id", type: "BIGINT" as const, nullable: false, identifier: false, unique: true }] : [])], uniqueConstraints: [], indexes: [], foreignKeys: foreignKey ? [{ source, name: "fk_composition", column: owner === "composite" ? "parte_id" : "composite_id", targetTable: owner === "composite" ? "part" : "composite", targetColumn: "id", lifecycle: "COMPOSITION" as const }] : [] });
    const files = generateSpringBackend({ tables: [entity("composite"), entity("part")], enums: [], relations: [{ source, cardinality: "ONE_TO_ONE", sourceTable: "composite", targetTable: "part", foreignKey: "fk_composition", lifecycle: "COMPOSITION" }], diagnostics: [], hasErrors: false, success: true });
    const composite = files.find((file) => file.path.endsWith("entities/Composite.java"))!.content;
    const part = files.find((file) => file.path.endsWith("entities/Part.java"))!.content;
    expect(composite).toContain("cascade = CascadeType.ALL, orphanRemoval = true");
    expect(part).not.toContain("cascade = CascadeType.ALL");
    expect(part).toContain("@OneToOne");
  });

  it("genera dos N:M del mismo par con fields, joins y mappedBy distintos", () => {
    const entity = (name: string) => ({ source, name, primaryKey: "id", columns: [{ source, name: "id", type: "BIGINT" as const, nullable: false, identifier: true, unique: false }], uniqueConstraints: [], indexes: [], foreignKeys: [] });
    const join = (name: string, suffix: string) => ({ source, name, columns: [{ source, name: "usuario_id", type: "BIGINT" as const, nullable: false, identifier: false, unique: false }, { source, name: "producto_id", type: "BIGINT" as const, nullable: false, identifier: false, unique: false }], uniqueConstraints: [], indexes: [], foreignKeys: [{ source, name: `fk_${suffix}_usuario`, column: "usuario_id", targetTable: "usuario", targetColumn: "id", lifecycle: "NONE" as const }, { source, name: `fk_${suffix}_producto`, column: "producto_id", targetTable: "producto", targetColumn: "id", lifecycle: "NONE" as const }] });
    const manyToMany: RelationalModel = {
      tables: [entity("usuario"), entity("producto"), join("usuario_producto_favoritos", "favoritos"), join("usuario_producto_historial", "historial")], enums: [], relations: [
        { source, cardinality: "MANY_TO_MANY", sourceTable: "usuario", targetTable: "producto", joinTable: "usuario_producto_favoritos", lifecycle: "NONE" },
        { source: { ...source, elementId: "22222222-2222-4222-8222-222222222222" }, cardinality: "MANY_TO_MANY", sourceTable: "usuario", targetTable: "producto", joinTable: "usuario_producto_historial", lifecycle: "NONE" },
      ], diagnostics: [], hasErrors: false, success: true,
    };
    const first = generateSpringBackend(manyToMany);
    const usuario = first.find((file) => file.path.endsWith("entities/Usuario.java"))!.content;
    const producto = first.find((file) => file.path.endsWith("entities/Producto.java"))!.content;
    expect(first).toEqual(generateSpringBackend(structuredClone(manyToMany)));
    expect(usuario).toContain('@JoinTable(name = "usuario_producto_favoritos"');
    expect(usuario).toContain('@JoinTable(name = "usuario_producto_historial"');
    expect(usuario).toContain("productoItemsUsuarioProductoFavoritos");
    expect(usuario).toContain("productoItemsUsuarioProductoHistorial");
    expect(producto).toContain('@ManyToMany(mappedBy = "productoItemsUsuarioProductoFavoritos")');
    expect(producto).toContain('@ManyToMany(mappedBy = "productoItemsUsuarioProductoHistorial")');
    expect(first.some((file) => file.path.endsWith("UsuarioProductoFavoritos.java"))).toBe(false);
    expect(first.some((file) => file.path.endsWith("UsuarioProductoHistorial.java"))).toBe(false);
  });

  it("genera el inverse side 1:1 solo en el participante opuesto", () => {
    const entity = (name: string) => ({ source, name, primaryKey: "id", columns: [{ source, name: "id", type: "BIGINT" as const, nullable: false, identifier: true, unique: false }], uniqueConstraints: [], indexes: [], foreignKeys: [] });
    const oneToOne: RelationalModel = {
      tables: [
        entity("usuario"),
        { ...entity("perfil"), columns: [...entity("perfil").columns, { source, name: "usuario_id", type: "BIGINT", nullable: false, identifier: false, unique: true }], foreignKeys: [{ source, name: "fk_perfil_usuario_id", column: "usuario_id", targetTable: "usuario", targetColumn: "id", lifecycle: "NONE" }] },
        entity("producto"),
        entity("pedido"),
        entity("categoria"),
      ],
      enums: [],
      relations: [{ source, cardinality: "ONE_TO_ONE", sourceTable: "usuario", targetTable: "perfil", foreignKey: "fk_perfil_usuario_id", lifecycle: "NONE" }],
      diagnostics: [], hasErrors: false, success: true,
    };
    const files = generateSpringBackend(oneToOne);
    const content = (name: string) => files.find((file) => file.path.endsWith(`entities/${name}.java`))!.content;
    expect(content("Usuario")).toContain('@OneToOne(mappedBy = "usuarioId")');
    expect(content("Usuario")).toContain("private Perfil perfil;");
    expect(content("Perfil")).toContain("private Usuario usuarioId;");
    expect(content("Producto")).not.toContain("private Perfil perfil;");
    expect(content("Pedido")).not.toContain("private Perfil perfil;");
    expect(content("Categoria")).not.toContain("private Perfil perfil;");
    const usuarioResponse = files.find((file) => file.path.endsWith("dto/UsuarioResponse.java"))!.content;
    const mapper = files.find((file) => file.path.endsWith("dto/ResponseMapper.java"))!.content;
    expect(usuarioResponse).toContain("Long perfilId");
    expect(mapper).toContain("entity.getPerfil() == null ? null : entity.getPerfil().getId()");
  });
});

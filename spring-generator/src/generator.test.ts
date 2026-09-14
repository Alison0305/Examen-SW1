import { describe, expect, it } from "vitest";
import type { RelationalModel } from "@examen-sw1/relational-core";
import { defaultSpringGeneratorConfig, generateSpringBackend, SpringGeneratorConfigError, SpringGeneratorModelError } from "./index.js";

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
    expect(first).toHaveLength(13);
  });

  it("genera Gradle, configuración y estructura Spring Boot 4.1.1 con Java 21", () => {
    const files = generateSpringBackend(model);
    const content = (path: string) => files.find((file) => file.path === path)?.content;
    expect(content("build.gradle")).toContain("org.springframework.boot' version '4.1.1'");
    expect(content("build.gradle")).toContain("JavaLanguageVersion.of(21)");
    expect(content("build.gradle")).toContain("spring-boot-starter-webmvc");
    expect(content("build.gradle")).toContain("spring-boot-starter-data-jpa");
    expect(content("build.gradle")).toContain("spring-boot-starter-validation");
    expect(content("build.gradle")).toContain("org.postgresql:postgresql");
    expect(content("settings.gradle")).toBe('rootProject.name = "generated-backend"\n');
    expect(content("src/main/resources/application.properties")).toBe("spring.application.name=generated-backend\n");
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
    expect(files.find((file) => file.path.endsWith("enums/EstadoPedido.java"))?.content).toContain("NUEVO,");
    expect(files.find((file) => file.path.endsWith("repositories/UsuarioRepository.java"))?.content).toContain("JpaRepository<Usuario, Long>");
    expect(files.find((file) => file.path.endsWith("controllers/PedidoController.java"))?.content).toContain('@RequestMapping("/pedido")');
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
  });
});

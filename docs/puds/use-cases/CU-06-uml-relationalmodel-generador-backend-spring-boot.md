# CU-06 - UML a RelationalModel y generador backend Spring Boot

## Estado Actual

CU-06 cerrado. Los incrementos 1, 2 y 3 entregaron `@examen-sw1/relational-core`, `@examen-sw1/spring-generator` y la compilación real de una fixture con Java 21 y Gradle.

## Objetivo

Transformar deterministamente `CanonicalUmlModel` a `RelationalModel` y generar un backend Java 21 compilable con Spring Boot 4.x, Gradle y Handlebars.

## Alcance

- Modelo relacional, mapper y diagnosticos de generacion.
- Entidades JPA, enums, repositories, services y controllers estructurales.
- Relaciones 1:1, 1:N, N:M, agregacion, composicion y una estrategia de herencia.
- Archivos generados en memoria y compilacion Gradle de una fixture representativa.

## Fuera De Alcance

- Prisma, migraciones de UML Studio, OpenAPI, Postman, Domain Manifest, CRUD avanzado, filtros, paginacion, sorting, search, frontend generado y asistente. Pertenecen a CU-07 o posteriores.

## Arquitectura Propuesta

`@examen-sw1/uml-core` permanece independiente de Spring. Se recomiendan dos workspaces futuros: `@examen-sw1/relational-core` para `RelationalModel`, mapper y diagnosticos, y `@examen-sw1/spring-generator` para Handlebars, `GeneratedFile[]` y writer seguro. La generacion produce primero `{ path, content }[]`; el writer solo acepta rutas bajo un output root controlado.

## Reglas Propuestas

- Solo una clase con `generationMetadata.entity: true` se proyecta a tabla. Los nombres fuente deben ser identificadores ASCII válidos; la conversión a `snake_case` solo cambia caso y los espacios, guiones o símbolos generan diagnóstico bloqueante.
- Tipos actuales: `string -> VARCHAR / String`, `integer -> BIGINT / Long`, `boolean -> BOOLEAN / Boolean`, `number -> NUMERIC / BigDecimal`, `date -> DATE / LocalDate`, `datetime -> TIMESTAMP WITH TIME ZONE / OffsetDateTime`. Referencias se resuelven por FK o enum.
- `required` controla nullability, `unique` genera unique constraint e `indexed` genera índice. `identifier` define una PK única; su ausencia o multiplicidad bloquea FKs sin inventarlas. No hay fuente actual para longitudes, precision/scale o defaults.
- Enums se generan como enum Java con `@Enumerated(EnumType.STRING)` y columna PostgreSQL textual, para portabilidad y cambios seguros.
- `1:N` usa FK en lado N con el tipo real de la PK objetivo. `N:M` usa join table distinta por nombre de relación o ID estable y una restricción unique compuesta. `1:1` respeta owner explícito y, si falta, usa SOURCE con warning determinista. Composición conserva lifecycle y agregación se trata como asociación sin cascade.
- Se propone `JOINED` para herencia por semantica relacional explicita, pero requiere aprobar/definir identificador y jerarquia valida antes de implementar.

## Incrementos

1. RelationalModel, mapper, orden determinista, diagnosticos y pruebas semanticas. No incluye Spring ni Handlebars.
2. Generator Spring con Handlebars, archivos Gradle Groovy DSL, entidades/repositorios/services/controllers estructurales y pruebas de archivos. No incluye compilacion real ni CU-07.
3. Fixture Usuario, Perfil, Pedido, Producto, Categoria y EstadoPedido; writer temporal seguro y `gradlew.bat compileJava` con Java 21. No incluye OpenAPI/Postman/Manifest.

## Riesgos Y Decisiones Pendientes

- BLOCKER: definir metadata de PK y propietario 1:1; sin ella el mapper debe bloquear generacion.
- BLOCKER para Incremento 3: entorno actual tiene Java 8, no `javac` ni Gradle; requiere Java 21 y wrapper Gradle reproducible.
- PRECONDICION TECNICA FUTURA: Docker y Docker Compose no estan disponibles. No son error de planificacion ni se instalaran automaticamente. Si un incremento requiere contenedores, se detendra con `DOCKER REQUERIDO — INSTALACIÓN MANUAL PENDIENTE` para que el usuario realice la instalacion manual guiada.
- IMPORTANTE: aprobar dos workspaces, `JOINED`, Groovy DSL, Spring Boot 4.x concreta y defaults de grupo/package/artifact.
- MENOR: indices configurables se difieren; solo PK/FK/unique requeridos por semantica.

## Pruebas Y Aceptacion

Mapper: clase, atributos, PK, nullable, unique, enum, 1:1, 1:N, N:M, agregacion, composicion, herencia, nombres reservados, tipos no soportados y orden. Generator: paths, paquetes, imports, anotaciones JPA, relaciones, Gradle, duplicados y traversal. La misma entrada/configuracion debe producir el mismo modelo y archivos; la fixture debe compilar con Gradle.

## Prueba Manual Futura

Generar la fixture en un directorio temporal, inspeccionar el arbol y ejecutar `gradlew.bat compileJava` con exit code 0.

## Incremento 1 - RelationalModel y Mapper

### Implementacion Realizada

- Se completó el workspace existente `@examen-sw1/relational-core` y se integró al workspace raíz.
- `RelationalModel` conserva referencias UML de origen, tablas, columnas, FKs, restricciones simples y compuestas, enums, relaciones, herencia y los indicadores derivados `hasErrors`/`success`; las colecciones expuestas se congelan.
- El mapper ordena todas sus colecciones con comparación binaria de nombre semántico normalizado e ID de origen.
- Solo proyecta clases entidad y bloquea relaciones hacia clases no-entidad. Rechaza nombres fuente con espacios, guiones o símbolos, sin sanearlos silenciosamente.
- Se proyectan los seis primitivos aprobados, enums, PK declarada, `required`, `unique` e `indexed`; un tipo no soportado produce error sin crear una columna `VARCHAR` de reemplazo.
- Las FKs heredan el tipo de la PK objetivo y no se crean cuando esta falta o no es única. N:M usa join tables diferenciadas por nombre de relación o ID estable, con unique compuesto.
- Se proyectan 1:1 (owner `SOURCE` o `TARGET`, con fallback `SOURCE` y warning), 1:N, agregación sin ciclo de vida, composición con lifecycle y herencia `JOINED` con PK del tipo declarado.
- La validación UML acepta `identifier`, `indexed` y `foreignKeyOwner`; un owner inválido produce diagnóstico UML.

### Pruebas Automatizadas

- `relational-core`: 10 pruebas estructurales de mapper para orden, inmutabilidad, primitivas, enum, PK, restricciones, FKs tipadas, N:M múltiple, no-entidades, nombres, tipos no soportados, asociaciones, composición y herencia.
- `uml-core`: 58 pruebas, incluida compatibilidad de los nuevos metadatos.
- Gates raíz correctos: lint, typecheck, test y build. Total: 229 pruebas (frontend 121, backend 40, `uml-core` 58, `relational-core` 10).

### Limitaciones Conocidas

- El fallback de owner 1:1 es una advertencia determinista y no reemplaza declarar `foreignKeyOwner`.
- La compilacion Java 21/Gradle, Handlebars y el generador Spring siguen fuera de este incremento.

### Resultado

Al cierre del Incremento 1, las tareas OpenSpec 1.1 a 1.4 estaban completadas y las tareas 2.1 a 3.3 permanecían pendientes.

## Incremento 2 - Generador Spring Estructural

### Implementacion Realizada

- Se creó el workspace `@examen-sw1/spring-generator`, que depende únicamente de `@examen-sw1/relational-core`, e instaló Handlebars localmente.
- Las plantillas `.hbs` con view models tipados generan Gradle Groovy con Spring Boot 4.1.1, Java 21 toolchain, Web MVC, Data JPA, Validation y PostgreSQL; también settings, properties y aplicación.
- El generador devuelve un arreglo `GeneratedFile` ordenado e inmutable para entidades, enums, repositories, services y controllers estructurales.
- Las entidades usan anotaciones JPA y representan los FKs/relaciones disponibles en el `RelationalModel`; composición añade `CascadeType.ALL`.
- El writer acepta únicamente rutas lógicas con separador `/`; antes de escribir el conjunto completo rechaza traversal, rutas absolutas, drive paths, UNC y duplicados case-insensitive. Realiza escritura segura mediante staging y reemplazo controlado al terminar.

### Pruebas Automatizadas

- `spring-generator`: 29 pruebas en 2 archivos para determinismo, inmutabilidad, Gradle, configuración y keywords Java, imports, anotaciones JPA, enums, PK, Aggregation aislada sin cascade/orphan removal, 1:N, N:M repetidas aisladas, JOINED, defaults, rutas seguras, traversal, duplicados case-insensitive, LF y preservación del output ante un conjunto inválido.

### Limitaciones Conocidas

- No se creó Gradle Wrapper ni se ejecutó Java/Gradle; la compilación de una fixture pertenece exclusivamente al Incremento 3.
- El writer usa staging en el mismo directorio padre y renombres. Cuando el output ya existe hay una ventana entre moverlo a backup y promover staging, por lo que no garantiza atomicidad transaccional completa del reemplazo de directorio.
- LOW local: no protege frente a un atacante local concurrente que cree symlinks/junctions dentro del staging entre las comprobaciones y la escritura.
- `backend/.env` existe para desarrollo local, está ignorado por `.gitignore`, no está trackeado y no aparece en `git status`.

### Resultado

Las tareas OpenSpec 2.1 a 2.3 están completadas. Permanecen pendientes únicamente las tareas 3.1 a 3.3.

## Incremento 3 - Fixture y Compilacion Real

### Implementacion Realizada

- Se agregó el gate `npm run test:generated-backend --workspace @examen-sw1/spring-generator`, que construye una fixture `CanonicalUmlModel` con Usuario, Perfil, Pedido, Producto, Categoria y EstadoPedido; valida, mapea, genera dos veces, compara determinismo y escribe mediante el writer seguro.
- El gate genera en `spring-generator/.generated-test/backend`, ruta ignorada por Git, crea el wrapper Gradle 8.14.4, verifica su versión y ejecuta `gradlew.bat compileJava --info --console=plain`. El output temporal se elimina al terminar.
- La fixture cubre PK, string, integer, boolean, BigDecimal, date, datetime, required, nullable, unique, indexed, enum, 1:1, 1:N, N:M, aggregation y composition. JOINED queda cubierto por las pruebas estructurales del Incremento 2.
- La compilación real reveló y corrigió un defecto del generator: los campos enum generaban `@Enumerated(EnumType.STRING)` sin los imports `Enumerated` y `EnumType`.

### Evidencia

- JDK manual usado: Temurin Java y javac `21.0.12.1`.
- Gradle global usado solo para crear wrapper: `8.14.4`; wrapper generado: `8.14.4` fijado a `gradle-8.14.4-bin.zip`.
- Pipeline real: `CanonicalUmlModel -> validación -> RelationalMapper -> RelationalModel -> SpringBackendGenerator -> GeneratedFile[] -> writer -> Gradle Wrapper -> compileJava`.
- Comando de compilación: `gradlew.bat compileJava --info --console=plain` en el output temporal; resultado `BUILD SUCCESSFUL`, exit code `0`.
- Gradle puede requerir Internet inicialmente para descargar distribución y dependencias de Maven Central. Operación offline completa queda fuera de CU-06.
- Docker, Prisma, migraciones y CU-07 no se usaron ni modificaron.

### Resultado

Las tareas OpenSpec 3.1 a 3.3 están completadas. CU-06 cerró con 10/10 tareas: el cambio se archivó en `openspec/changes/archive/2026-09-14-cu-06-relationalmodel-generador-backend-spring-boot/` y las specs principales se sincronizaron y validaron.

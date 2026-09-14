# Design

## Pipeline

`CanonicalUmlModel -> UML validation -> RelationalMapper -> RelationalModel -> SpringBackendGenerator -> GeneratedFile[] -> Writer`.

El mapper ordena todas sus colecciones con comparación binaria por nombre semántico normalizado e ID de origen; no usa orden dependiente de locale. El generator ordena archivos, imports y miembros. No inserta timestamps, UUIDs ni aleatoriedad. El writer rechaza rutas absolutas, traversal y duplicados.

## RelationalModel Propuesto

Incluye schema opcional, tables, columns, primaryKeys, foreignKeys, restricciones únicas con sus columnas, indexes, enumDefinitions, relations, joinTables e inheritance metadata. Cada elemento conserva source UML ID/path para diagnosticos navegables; `hasErrors` y `success` se derivan de los diagnósticos.

## Mapeo

`entity`, `required`, `unique`, `identifier`, `indexed` y `foreignKeyOwner` existen como metadata. Solo las clases con `entity: true` se proyectan; una relación hacia otra clase produce error. Los nombres fuente deben ser identificadores ASCII válidos y solo se aplica conversión de caso. Los casos sin una regla aprobada producen error de generación; no se infieren silenciosamente.

Tipos: `string/VARCHAR/String`, `integer/BIGINT/Long`, `boolean/BOOLEAN/Boolean`, `number/NUMERIC/BigDecimal`, `date/DATE/LocalDate`, `datetime/TIMESTAMP WITH TIME ZONE/OffsetDateTime`. Un tipo no soportado produce error y no crea columna. Las FKs heredan el tipo real de la PK de destino y no se crean si falta o hay múltiples PK. Enums usan `EnumType.STRING`. 1:N coloca FK en N; N:M usa una join table distinta por nombre de relación o ID estable, con unique compuesto; agregación no usa cascade; composición conserva lifecycle; 1:1 respeta owner explícito o usa SOURCE con warning; `JOINED` exige PK de mismo nombre y tipo.

## Generacion

Se propone `@examen-sw1/relational-core` y `@examen-sw1/spring-generator`, manteniendo `uml-core` libre de Spring. Handlebars genera `settings.gradle`, `build.gradle`, configuracion, application, entities, enums, repositories, services y controllers estructurales. Groovy DSL y wrapper Gradle son la opcion propuesta por simplicidad y reproducibilidad. Spring Boot 4.x concreta queda pendiente de aprobacion y verificacion de compatibilidad Java 21.

Docker y Docker Compose no estan disponibles en el entorno actual. No se instalan ni sustituyen automaticamente; si fueran necesarios para un incremento, el trabajo se detendra para instalacion manual del usuario.

## Diagnosticos

Errores bloqueantes de generacion incluyen PK ausente, tipo no soportado, multiplicidad invalida, 1:1 ambiguo, herencia invalida y nombre Java/SQL invalido. Deben seguir la estructura existente `severity`, `code`, `message`, `path`, `elementId`.

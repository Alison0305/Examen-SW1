## Context

El generador deriva campos JPA inversos desde `RelationalModel`. La revisión manual de la fixture de CU-06 mostró que la resolución actual de 1:1 agrega el inverse side a cualquier tabla distinta del owner, en vez de limitarlo al participante opuesto. Ver `proposal.md` y la spec delta.

## Goals / Non-Goals

**Goals:**

- Derivar cada inverse side 1:1 solo para el participante relacional opuesto al owner.
- Verificar estructuralmente la correspondencia entre la relación, FK y tipo Java generado.
- Conservar las relaciones 1:N, N:M, Aggregation y Composition existentes.

**Non-Goals:**

- No introducir Hibernate, base de datos, Docker ni validación en runtime.
- No cambiar `RelationalModel`, el mapper UML ni la fixture semántica de CU-06.

## Decisions

- La condición de generación 1:1 comprobará que la tabla actual sea el extremo opuesto de la relación antes de crear el campo inverse. La relación ya conserva `sourceTable`, `targetTable` y `foreignKey`, por lo que es la fuente determinista para verificar identidad semántica.
- El nombre de `mappedBy` seguirá derivándose del campo Java del FK owner. Se verificará en pruebas que dicho owner apunte a la entidad inversa correspondiente.
- Se añadirá una prueba estructural explícita con Usuario/Perfil y entidades no participantes. Un snapshot no distingue con claridad una relación extra de una esperada.

Alternativa descartada: validar únicamente mediante Hibernate metadata. Añadiría dependencias y complejidad de bootstrap sin aportar más cobertura para esta decisión determinista del generador.

## Risks / Trade-offs

- [Un RelationalModel inconsistente podría omitir un inverse side] → las pruebas cubren la relación válida y el generator mantiene su validación actual de modelos.
- [Una corrección para 1:1 podría afectar otras cardinalidades] → se preservan las rutas existentes y se audita la fixture representativa, además del gate `compileJava`.

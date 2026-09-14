# Proposal: CU-06 RelationalModel y generador Spring Boot

## Why

El modelo UML canonico necesita una transformacion relacional determinista para convertirse en un backend independiente y compilable.

## What Changes

- Introducir una capa relacional independiente de `uml-core`.
- Generar estructura Spring Boot Java 21 con Handlebars y Gradle.
- Validar gaps de generacion sin modificar Prisma de UML Studio.

## Non-goals

OpenAPI, Postman, Domain Manifest, CRUD avanzado y frontend generado pertenecen a CU-07 o posteriores.

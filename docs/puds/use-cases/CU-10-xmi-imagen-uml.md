# CU-10 - XMI e imagen → UML

## Estado

CU activo. OpenSpec `openspec/changes/cu-10-xmi-imagen-uml/` creado y validado en modo strict el 2026-11-06; implementación pendiente.

## Objetivo

Completar las entradas externas al modelo canónico: intercambio XMI 2.1 con Enterprise Architect y propuestas UML desde imágenes, sin alterar directamente `CanonicalUmlModel`.

## Alcance

- Comandos atómicos `ImportUmlFragment` y `RemoveUmlFragment`, y una propuesta intermedia común (`UmlImportProposal`) con traducción determinista, validación previa y revisión del usuario.
- Paquete `xmi-core`: importación y exportación XMI 2.1 del subconjunto soportado.
- Imagen → propuesta: Sharp, Florence-2 local con Transformers.js (OCR con regiones) y análisis determinista de cajas, textos, conectores y multiplicidades.
- Benchmark VLM reproducible.

## Incrementos

1. Comandos atómicos, propuesta e interoperabilidad XMI.
2. Imagen a propuesta estructurada.
3. Revisión, aplicación y benchmark VLM.

## Dependencias

- CU-01 (núcleo UML y validación), CU-02 (Command Bus y Undo), CU-05 (colaboración) y el correctivo de CU-08 (patrón de cola y timeout para modelos locales).
- Pendientes del usuario: disponer de Enterprise Architect para la prueba 1.9 y aportar fotos reales para el dataset del benchmark (3.4).

## Fuera de alcance

Operaciones y paquetes en la importación (se aplanan con diagnóstico), diagramas que no sean de clases, conservar el layout de Enterprise Architect y todo lo de CU-11.

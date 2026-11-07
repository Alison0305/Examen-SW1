# CU-10 - XMI e imagen → UML

## Estado

CU activo. Incremento 1 completado el 2026-11-06 (10/10); Incrementos 2 y 3 pendientes.

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

## Incremento 1 - Comandos atómicos, propuesta e interoperabilidad XMI

- `uml-core`: comandos `ImportUmlFragment` y `RemoveUmlFragment`. La importación agrega clases, enumeraciones, relaciones y layouts en una sola operación; si la validación completa del documento falla (ids repetidos, nombres duplicados o referencias rotas), no aplica nada. Se rechazan fragmentos vacíos, de más de 500 elementos o con layouts ajenos (diagnóstico nuevo `UML_INVALID_FRAGMENT`). `RemoveUmlFragment` retira esos elementos, sus layouts y las relaciones conectadas, como `DeleteClass`.
- `uml-core`: `UmlImportProposal` (claves locales y tipos por nombre), `buildImportFragment` determinista (sinónimos de primitivos, prefijos `EAJava_`/`EAnone_`, referencias por nombre a la propuesta o al documento, tipo desconocido como `string` con advertencia, relaciones sin extremo omitidas, exclusiones de la revisión y cuadrícula a la derecha del diagrama) y `previewImportFragment`, que valida sobre una copia descartable.
- `workspace-store`: acción `importFragment`. En colaboración, el inverso de `ImportUmlFragment` es un único `RemoveUmlFragment`. El backend realtime acepta ambos comandos sin cambios porque ejecuta cualquier `UmlCommand` con el mismo `UmlCommandBus`.
- Paquete nuevo `@examen-sw1/xmi-core` con `fast-xml-parser` 5.11.2. La 5.12.0, publicada el 2026-11-03, no cumplía la antigüedad mínima de dos semanas.
  - `exportXmi`: XMI 2.1 con la forma de Enterprise Architect e ids `EAID_` derivados de los canónicos, por lo que la salida es determinista. Primitivos por `href` UML (`String`, `Integer`, `Boolean`, `Real`); fecha y fecha-hora como `EAnone_Date`/`EAnone_DateTime`. Asociaciones con dos `ownedEnd` y `aggregation` en el extremo de la parte (el origen es el todo); generalización dentro de la clase hija.
  - `parseXmi`: valida el XML, exige raíz XMI, advierte otras versiones, aplana paquetes, ignora como atributos los extremos de asociación y reporta como diagnóstico operaciones y elementos no soportados (interfaces, etc.). Acepta `*` y `-1` como ilimitado y `LiteralInteger` sin `value` como 0. Límite de 5 MB.
- Workspace: sección "Intercambio XMI 2.1" en la barra lateral. Exportar XMI descarga `<proyecto>.xmi`. Importar XMI (solo OWNER y EDITOR) abre una revisión con conteos, clases y diagnósticos, y aplica con un único comando; Aplicar se bloquea si la validación da error. Exportar sigue disponible para VIEWER.

### Pruebas del Incremento 1

- `uml-core` 85/85 (15 nuevas: comandos de fragmento, traductor y vista previa); `xmi-core` 7/7, incluida la ida y vuelta exportar → importar sin diferencias semánticas; `frontend` 170/170 (Undo local y colaborativo de importación, exportación, importación, cancelación, XML inválido, conflicto de nombre y VIEWER); `backend` realtime acepta ambos comandos.
- Gates de raíz el 2026-11-06: lint, typecheck, build y 503 tests correctos (8 omitidos: modelos reales de Qwen y Vosk).

### Pendiente y riesgos del Incremento 1

- Tarea 1.9: el usuario aprobó el 2026-11-06 la prueba manual con Enterprise Architect en ambos sentidos (exportar desde el producto e importar en EA, y exportar desde EA e importar en el producto). No reportó la versión de EA ni diferencias, y no aportó un XMI exportado por EA, por lo que el test automático sigue usando un XMI con forma EA escrito a mano.
- La clase intermedia N:M se exporta como clase normal, por lo que el enlace `associationClassId` no hace ida y vuelta.
- Hallazgo previo, fuera de alcance: `UmlCommandExecutor` devuelve `undefined` ante un tipo de comando desconocido en lugar de rechazarlo con un diagnóstico.

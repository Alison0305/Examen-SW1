# CU-10 - XMI e imagen → UML

## Estado

Cerrado el 2026-11-08 con aceptación del usuario: Incrementos 1 (10/10), 2 (8/8) y 3 (7/7). El reconocimiento de imágenes reales queda como limitación medida y documentada.

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

## Incremento 2 - Imagen a propuesta estructurada

### Modelo Florence-2: guía de descarga

- Fuente: `onnx-community/Florence-2-base-ft` en Hugging Face, revisión `e88a44eaf3791a35eae0c5a47b3dbcd36e67eb6f`, licencia MIT.
- Se usa el juego q8 (sufijo `_quantized`). Los cuatro ONNX suman unos 275 MB; el diseño estimaba 175 MB por error.

| Archivo | Bytes |
| --- | --- |
| `onnx/embed_tokens_quantized.onnx` | 39.390.433 |
| `onnx/vision_encoder_quantized.onnx` | 93.746.540 |
| `onnx/encoder_model_quantized.onnx` | 43.651.493 |
| `onnx/decoder_model_merged_quantized.onnx` | 98.177.697 |

Además hacen falta `config.json`, `generation_config.json`, `preprocessor_config.json`, `tokenizer.json`, `tokenizer_config.json`, `special_tokens_map.json`, `added_tokens.json`, `vocab.json` y `merges.txt`.

Descarga, desde cualquier carpeta en PowerShell (unos 4 minutos con una conexión de 10 Mbps):

```powershell
$dest = "$env:USERPROFILE\vision-models\Florence-2-base-ft"
New-Item -ItemType Directory -Force "$dest\onnx" | Out-Null
$base = "https://huggingface.co/onnx-community/Florence-2-base-ft/resolve/e88a44eaf3791a35eae0c5a47b3dbcd36e67eb6f"
$files = "config.json","generation_config.json","preprocessor_config.json","tokenizer.json","tokenizer_config.json","special_tokens_map.json","added_tokens.json","vocab.json","merges.txt","onnx/embed_tokens_quantized.onnx","onnx/vision_encoder_quantized.onnx","onnx/encoder_model_quantized.onnx","onnx/decoder_model_merged_quantized.onnx"
foreach ($f in $files) { curl.exe -L --fail -o "$dest\$f" "$base/$f" }
Get-ChildItem "$dest\onnx" | Select-Object Name, Length
```

Los tamaños mostrados deben coincidir con la tabla. El nombre de la carpeta (`Florence-2-base-ft`) actúa como id del modelo, así que no debe cambiarse.

En `backend/.env` se agrega `VISION_MODEL_PATH=C:/Users/USER/vision-models/Florence-2-base-ft`. Las demás variables `VISION_*` y sus valores por defecto están en `.env.example`.

Para comprobar que el modelo carga, ejecutar desde `backend` en PowerShell:

```powershell
$env:VISION_MODEL_PATH = "$env:USERPROFILE\vision-models\Florence-2-base-ft"
npx vitest run src/vision/florence2.real.integration.test.ts
```

Debe terminar con `1 passed`. Sin la variable, el test aparece como omitido.

El runtime nunca descarga nada: Transformers.js se configura con `allowRemoteModels = false` y `local_files_only`. Si falta un archivo, la respuesta es `MODEL_NOT_FOUND`.

### Dependencias del Incremento 2

- `sharp` 0.35.5, publicada el 2026-09-27.
- `@huggingface/transformers` 4.3.1, publicada el 2026-10-06. La 4.3.2, del 2026-10-27, no cumplía la antigüedad mínima de dos semanas.
- Transformers.js trae `onnxruntime-node` 1.30.0 con los binarios de Windows x64 incluidos. npm 12 bloquea su `postinstall`, que en Windows no hace falta.
- Ambas cargan en Node v26.13.0 sobre Windows 10. El render de SVG que usan los tests funciona porque Sharp incluye `rsvg`.

### Implementación del Incremento 2

Todo el código está en `backend/src/vision/`:

- **`image-preprocessing.ts`:**
  - el formato se decide por la firma del archivo (PNG o JPEG), no por el `Content-Type`;
  - aplica en orden rotación EXIF, aplanado sobre blanco, escala de grises, normalización de contraste y reducción a un máximo de 1024 px por lado, sin ampliar imágenes pequeñas;
  - rechaza imágenes corruptas (`INVALID_IMAGE`) y dimensiones fuera de límites (`INVALID_DIMENSIONS`: lado menor de 32 px o más de 40 MP).
- **`diagram-analyzer.ts`:** función pura y determinista sobre los píxeles y las líneas OCR.
  - **Binarización:** umbral local (Bradley) más un nivel fijo para zonas muy oscuras. Después, una dilatación 3×3 cierra huecos pequeños.
  - **Clases:**
    - las regiones de fondo encerradas casi rectangulares se toman como compartimentos;
    - los compartimentos apilados se unen en una clase, y las regiones que contienen otras (marcos, paquetes) se descartan;
    - el borde real se obtiene recorriendo el trazo hacia afuera.
  - **Textos:**
    - la primera línea del primer compartimento es el nombre;
    - `«enumeration»` convierte la caja en una enumeración;
    - los atributos se leen como `[visibilidad] nombre : tipo [multiplicidad]`;
    - las operaciones (texto con paréntesis o del tercer compartimento) se omiten con diagnóstico.
    - Corrección determinista de OCR: guiones tipográficos, dos puntos de ancho completo y dos puntos repetidos.
  - **Conectores:**
    - son las componentes de tinta fuera de las clases;
    - la marca de cada extremo se clasifica así:
      - un hueco pequeño con poco relleno es una marca hueca: es triángulo (generalización) si se ensancha lejos de la clase y rombo hueco (agregación) si se ensancha en el centro;
      - varias franjas sólidas anchas son un rombo relleno (composición);
      - sin marca, es una asociación.
    - Un conector con varias ramas y una sola marca (árbol de herencia) produce una relación por rama.
  - **Multiplicidades:**
    - se asigna el texto con forma de multiplicidad más cercano a cada extremo;
    - se aceptan variantes de OCR como `0.*`, `1…*` y `0..n`;
    - lo ilegible no se adivina: genera el diagnóstico `IMAGE_ILLEGIBLE_MULTIPLICITY`.
  - **Diagnósticos:** `IMAGE_NO_DIAGRAM`, `IMAGE_CLASS_WITHOUT_NAME`, `IMAGE_UNREADABLE_TEXT`, `IMAGE_ATTRIBUTE_WITHOUT_TYPE`, `IMAGE_OPERATIONS_OMITTED`, `IMAGE_CONNECTOR_WITHOUT_END`, `IMAGE_AMBIGUOUS_CONNECTOR`, `IMAGE_AMBIGUOUS_ENDS`, `IMAGE_ILLEGIBLE_MULTIPLICITY` y `IMAGE_UNASSIGNED_TEXT`.
- **`florence2-ocr-engine.ts`:** Florence-2 con Transformers.js en CPU, solo `<OCR_WITH_REGION>`.
  - Carga perezosa, y se reintenta si falla.
  - La cancelación usa un `StoppingCriteria` que se evalúa en cada token, así que el timeout detiene el decodificador.
  - `VISION_MODEL_DTYPE` permite comparar variantes en el benchmark.
- **`ocr-engine.ts`:** cola de una imagen a la vez, `BUSY` al exceder `VISION_MAX_QUEUE` y timeout que no cuenta la carga del modelo. Repite la semántica de la cola de Qwen.
- **`vision.controller.ts`, `vision-proposal.service.ts` y `vision.module.ts`:** `POST /projects/:id/vision/uml-proposal`.
  - Requiere JWT y permiso de edición (VIEWER recibe 403 sin que se procese la imagen).
  - La imagen viaja como cuerpo binario (`image/png`, `image/jpeg` o `application/octet-stream`).
  - Antes de tocar el modelo valida firma, tamaño (`VISION_MAX_BYTES`, 5 MB por defecto) y dimensiones.
  - Responde `{ ok: true, proposal, image, ocrLines, elapsedMs }`, o `{ ok: false, diagnostic }` con 413, 415, 422, 503 o 504.
  - No persiste la imagen ni modifica el proyecto.
- **`synthetic-diagram.ts`:** genera diagramas SVG con resultado conocido y las líneas OCR equivalentes, para los tests y para el benchmark del Incremento 3.

### Decisiones del Incremento 2

- **Cuerpo binario en lugar de multipart:** evita agregar `@fastify/multipart`. El parser admite hasta el doble del límite para que el servicio responda `TOO_LARGE` como diagnóstico estructurado; por encima de eso responde el 413 propio de Fastify.
- **Detección de compartimentos y marcas por regiones encerradas:** los compartimentos se reconocen por la proporción de fondo exterior dentro de su caja y las marcas por la proporción de relleno de su hueco. La primera métrica fallaba con huecos pequeños, porque el trazo dilatado los rodea por completo.
- **Cola propia de visión:** tiene la misma semántica que la de Qwen, pero no se refactorizó la del correctivo ya cerrado. Queda como deuda técnica menor: unas 60 líneas duplicadas.

### Pruebas del Incremento 2

- **`backend/src/vision`: 42 tests.**
  - Analizador: 9 tests sobre diagramas sintéticos renderizados con Sharp desde SVG (asociación con multiplicidades; generalización, composición y agregación; enumeración; imagen sin diagrama; conector suelto; multiplicidad ilegible; caja sin nombre; correcciones de OCR; determinismo), más 13 de multiplicidades.
  - Preprocesamiento: 6.
  - Cola, motor con runtime falso y configuración: 9.
  - Endpoint con Supertest: 5 (EDITOR, JPEG, 401, VIEWER 403 sin procesar, formato, tamaño, dimensiones, modelo no configurado y timeout).
- **Gates de `backend` el 2026-11-06:** lint, typecheck, build y 136 tests correctos; 9 omitidos (modelos reales de Qwen y Florence-2).
- **Gates de raíz el 2026-11-06:** lint, typecheck, build y 545 tests correctos (9 omitidos). En una corrida, `frontend` reportó un error no controlado tras el teardown: `app/projects/page.tsx` actualizaba el estado después de que `auth.test.tsx` terminara. Es una condición de carrera previa e intermitente, sin relación con este incremento; tres repeticiones dieron 170/170 sin errores.
- **Integración real el 2026-11-06:** Florence-2 q8 en CPU, en el equipo de referencia (Ryzen 5 3400G y 16 GB de RAM). Captura sintética de 1000×420 con tres clases, una generalización y una composición.
  - Pasa en unos 10,5 s, incluida la carga.
  - La estructura (clases, tipos de relación y extremos) es exacta.
  - El OCR cometió estos errores: "Empressa" por "Empresa", "sueido" por "sueldo", y "- ruc : : String", que ahora se corrige. El test exige la estructura exacta y tolera hasta dos caracteres de diferencia en los nombres; la precisión se medirá en el benchmark.
- **Sonda previa con 800×400:** carga 4,6 s, inferencia unos 6,4 s y RSS 1,7 GB. El OCR leyó `0..*` como `0.0.`; ese caso queda como diagnóstico de multiplicidad ilegible.
- **Smoke test:** el backend completo arranca con `VisionModule` y la ruta responde 401 sin JWT. No se crearon usuarios ni proyectos de prueba en la base local.

### Limitaciones del Incremento 2

- No se reconocen autoasociaciones, líneas curvas, conectores que se cruzan ni diagramas densos. Los compartimentos vacíos de menos de 6 px se pierden.
- Los nombres de asociación no se extraen: aparecen como texto no asignado. Tampoco se distinguen interfaces ni clases abstractas.
- Solo funciona en CPU. La calidad con fotos y capturas reales no está medida hasta el benchmark del Incremento 3.

## Incremento 3 - Revisión, aplicación y benchmark VLM

Estado al 2026-11-08: revisión común, "Desde imagen", enderezado y benchmark sintético terminados. Quedan pendientes la prueba manual (3.3) y las fotos reales del dataset (3.4 y 3.6), ambas a cargo del usuario.

### Implementación del Incremento 3

- **Diálogo de revisión común:** `frontend/app/workspace/import-review-dialog.tsx` (`ImportReviewDialog`) recibe cualquier `UmlImportProposal`, de XMI o de imagen.
  - Permite editar los nombres de clases y enumeraciones, y el nombre y el tipo de cada atributo.
  - Cada clase, atributo, enumeración y relación tiene su casilla de inclusión. Al excluir una clase, sus relaciones se desactivan y se marcan como "excluida con su clase".
  - Cada cambio vuelve a ejecutar `buildImportFragment` y `previewImportFragment` sobre una copia, de modo que el resumen, los conflictos (por ejemplo, un nombre duplicado) y los diagnósticos están siempre al día.
  - Aplicar emite un único `ImportUmlFragment` y Cancelar no cambia nada.
- **Acciones de importación:** `frontend/app/workspace/import-actions.tsx` (`WorkspaceImportActions`) reemplaza a `xmi-actions.tsx`.
  - Contiene Exportar XMI, Importar XMI y el botón nuevo **Desde imagen**, y las dos importaciones abren el mismo diálogo.
  - "Desde imagen" valida en el cliente que el archivo sea PNG o JPEG y no supere 5 MB.
  - Mientras reconoce, muestra progreso y desactiva los botones. Al terminar abre la revisión con el tiempo empleado y un aviso de que el reconocimiento puede tener errores; si falla, muestra el mensaje del backend.
  - Solo aparece para OWNER y EDITOR y cuando la página del proyecto proporciona `onRecognizeImage`. El workspace local sin proyecto no lo muestra.
- **Cliente API:** `recognizeDiagram(id, image)` envía la imagen como cuerpo binario con JWT y convierte el `{ diagnostic }` del backend en `ApiError`.
- **Enderezado:** `estimateSkewDegrees` en `backend/src/vision/image-preprocessing.ts`.
  - Busca, entre -8° y 8° en pasos de 0,25°, el ángulo cuya proyección de filas de píxeles oscuros es más nítida.
  - Si la inclinación es de 0,5° o más, Sharp rota la imagen en sentido contrario antes del análisis.
  - Se agregó al medir el benchmark: con 3° de giro, los compartimentos de cada clase se desalineaban más que la tolerancia de apilado y cada caja se partía en dos "clases".
- **Benchmark VLM:** está en `backend/src/vision/benchmark/`.
  - **Dataset:** `vlm-dataset.ts` define 6 diagramas sintéticos: asociación, generalización con composición y agregación, enumeración con operaciones, biblioteca, árbol de herencia e inventario.
    - El resultado esperado se deriva de cada definición.
    - Cada diagrama se mide en 4 condiciones generadas de forma determinista: `captura`, `rotada-3`, `baja-resolucion` (50 %) y `ruido-jpeg` (ruido de ±40 niveles más JPEG con calidad 40).
    - No se versiona ninguna imagen.
  - **Métricas:** `vlm-metrics.ts` hace un emparejamiento uno a uno y calcula precisión, cobertura y falsos positivos de clases, atributos y relaciones, y el acierto de multiplicidades por extremo.
    - Las asociaciones coinciden en cualquier sentido; la generalización y los rombos exigen la dirección correcta.
    - Se puntúa de dos formas: estricta (nombres normalizados iguales) y tolerante (hasta 2 caracteres de diferencia por error de OCR).
  - **Runner:** `npm run benchmark:vlm` (`vlm-benchmark.ts`) usa el camino de producción. Registra el modelo con el hash de los ONNX, las versiones del runtime, el hardware, el tiempo de carga, la RSS y la latencia p50/p95 por condición, y escribe un JSON en `backend/.benchmark-output/`, que no se versiona.

### Cómo agregar las fotos reales (tarea 3.4)

1. Crear una carpeta fuera del repositorio, por ejemplo `C:\Users\USER\vlm-fotos`, y copiar allí las fotos en PNG o JPEG, de 5 MB como máximo cada una.
2. En esa misma carpeta, crear `expected.json` con lo que contiene cada foto, escrito a mano. Las multiplicidades se escriben como texto (`1`, `0..1`, `*`, `0..*`, `1..*`) en el extremo de la clase junto a la que aparecen. En generalización, `source` es la clase hija; en agregación y composición, `source` es el todo.

```json
[
  {
    "file": "pizarra-1.jpg",
    "condition": "foto-pizarra",
    "expected": {
      "classes": [
        { "name": "Cliente", "attributes": ["nombre", "correo"] },
        { "name": "Pedido", "attributes": ["fecha", "total"] }
      ],
      "enumerations": [{ "name": "Estado" }],
      "relationships": [
        { "type": "Association", "source": "Cliente", "target": "Pedido", "sourceMultiplicity": "1", "targetMultiplicity": "0..*" }
      ]
    }
  }
]
```

El campo `condition` agrupa los resultados, por ejemplo `foto-papel`, `foto-pizarra` o `captura-real`.

3. Ejecutar desde `backend` en PowerShell:

```powershell
npm run benchmark:vlm -- --model "$env:USERPROFILE\vision-models\Florence-2-base-ft" --dtype q8 --photos "$env:USERPROFILE\vlm-fotos" --label q8-cpu-fotos
```

Al final se imprime una tabla por condición y la ruta del reporte JSON. Las fotos no se copian al repositorio.

### Pruebas del Incremento 3

- **Frontend:** 178 tests, 8 de ellos nuevos.
  - Revisión (RTL): corregir nombres y tipos antes de aplicar; excluir una clase con sus relaciones y excluir un atributo; renombrar para resolver un conflicto con diagnósticos recalculados.
  - "Desde imagen": progreso, revisión y Undo en un paso; error del backend y validación del archivo antes de enviarlo; botón oculto para VIEWER o sin reconocimiento.
  - Cliente API (2 tests): cuerpo binario con JWT, diagnóstico estructurado, 401 y error sin cuerpo.
  - Los 6 tests de XMI anteriores siguen pasando con el diálogo común.
- **Backend `src/vision`:** 52 tests, 10 de ellos nuevos.
  - Métricas (5): emparejamiento exacto y tolerante; puntuación estricta y tolerante; dirección de las relaciones y multiplicidad por extremo; agregación y percentiles sin datos (devuelven `null`).
  - Dataset (4): con OCR ideal, el analizador reconoce al 100 % las 6 capturas; las variantes son deterministas; el resultado esperado se deriva con las convenciones de importación; lectura y validación de `expected.json`.
  - Enderezado (1): una imagen recta no se modifica, y ±3° y -4° se estiman con un error de 0,5° como máximo y quedan rectos tras el preprocesamiento.
- **Test real con Florence-2:** se repitió con el enderezado activo y sigue pasando.
- **Gates del monorepo el 2026-11-08:** lint, typecheck, build y 563 tests correctos; 9 omitidos (modelos reales de Qwen, Vosk y Florence-2).
- **Generador sintético:** el benchmark destapó dos defectos que se corrigieron antes de medir. Las etiquetas de multiplicidad suponían que el conector iba de izquierda a derecha, y en el diagrama de vehículos una clase no se solapaba con la clase padre.
- **Analizador:** `binarize` se optimizó leyendo las sumas en línea, sin crear un objeto por píxel. Ahora tarda unos 80 ms por imagen de 900×560.

### Resultados del benchmark VLM (sintético)

Condiciones de medición:

- Fecha: 2026-11-08.
- Equipo: AMD Ryzen 5 3400G y 16 GB de RAM, con Windows 10 y Node v26.13.0.
- Software: Florence-2-base-ft q8 en CPU, con `@huggingface/transformers` 4.3.1 y `onnxruntime-node` 1.30.0.
- Dataset: 24 imágenes (6 diagramas por 4 condiciones).
- Reporte: `vlm-q8-cpu-sinteticos-deskew-2026-11-09T01-49-02-925Z.json`.

Rendimiento:

- Carga del modelo: 4,8 s.
- RSS: 577 MiB tras la carga y 1.563 MiB de pico.
- VRAM: N/A, porque se ejecuta en CPU.
- Errores de ejecución: ninguno.

| Condición | Clases P/R estricto | Clases P/R tolerante | Atributos P/R tol. | Relaciones P/R tol. | Multiplicidades tol. | Latencia p50/p95 |
| --- | --- | --- | --- | --- | --- | --- |
| captura | 0,78 / 0,78 | 0,94 / 0,94 | 0,89 / 0,92 | 1,00 / 1,00 | 6/16 (0,38) | 8,6 s / 11,3 s |
| rotada-3 | 0,83 / 0,83 | 0,94 / 0,94 | 0,90 / 0,97 | 1,00 / 1,00 | 4/16 (0,25) | 8,7 s / 11,1 s |
| baja-resolucion | 0,56 / 0,56 | 0,89 / 0,89 | 0,76 / 0,72 | 0,55 / 0,55 | 2/16 (0,13) | 8,3 s / 11,1 s |
| ruido-jpeg | 0,83 / 0,83 | 1,00 / 1,00 | 1,00 / 0,97 | 0,82 / 0,82 | 4/16 (0,25) | 8,6 s / 11,5 s |
| **Total** | 0,75 / 0,75 | 0,94 / 0,94 | 0,89 / 0,90 | 0,84 / 0,84 | 16/64 (0,25) | 8,7 s / 11,3 s |

Antes del enderezado (reporte `vlm-q8-cpu-sinteticos-2026-11-09T01-44-10-571Z.json`), `rotada-3` daba clases P/R tolerante 0,46/0,94 con 20 falsos positivos, atributos 0 y relaciones 0. Las otras tres condiciones dieron exactamente lo mismo con y sin enderezado.

Lectura de los resultados:

- **Estructura geométrica (cajas, relaciones y su dirección):** es fiable en capturas, imágenes inclinadas y con ruido, con 100 % en `captura` y `rotada-3`. Falla en baja resolución, donde las marcas de los extremos quedan de pocos píxeles; por ejemplo, el árbol de herencia de vehículos da 0 de 2 relaciones.
- **Nombres:** la diferencia entre estricto y tolerante muestra que el OCR comete errores de uno o dos caracteres ("Empressa", "PEDido", "nompre", "suedo"). Por eso la revisión permite editarlos antes de aplicar.
- **Multiplicidades:** son el punto débil, con 25 % de acierto. Florence-2 omite símbolos en textos cortos y aislados: lee `1..*` como `1` sin aviso y `0..*` como ilegible. Deben revisarse siempre.
- **Latencia:** entre 7 y 11 s por imagen en CPU. El límite de producción de 60 s tiene margen suficiente.

No medido (N/A):

- Fotos de papel, de pizarra y de pantalla: el dataset real del usuario contiene solo capturas digitales (ver la sección siguiente).
- VRAM: Florence-2 se ejecuta en CPU.
- Variantes `fp32` y `fp16` del modelo: no se descargaron, así que no hay comparación de dtypes.

### Resultados del benchmark VLM con capturas reales

Condiciones de medición:

- Fecha: 2026-11-08.
- Dataset: 19 capturas de pantalla de diagramas digitales reunidas por el usuario, de distintos autores y herramientas, con su resultado esperado escrito a mano en `expected.json`. Contienen 139 clases, 5 enumeraciones, 416 atributos y 149 relaciones: 97 asociaciones, 18 generalizaciones, 17 composiciones y 17 agregaciones.
- Las imágenes y el `expected.json` están fuera del repositorio, en `C:\Users\USER\vlm-fotos`, y no se versionan.
- El usuario usó la condición `captura-digital`. No hay fotos de papel ni de pizarra, así que esas condiciones quedan como N/A.
- Equipo y modelo: los mismos que en el benchmark sintético.
- Reporte: `vlm-q8-cpu-capturas-reales-2026-11-09T03-09-08-726Z.json`.
- En la misma corrida, las 24 imágenes sintéticas repitieron las cifras anteriores.

Ajuste previo a la medición, sin cambiar el archivo del usuario: la métrica interpreta las multiplicidades esperadas con la notación de la imagen, mediante el mismo parser que el analizador. Así, `1...*` se lee como `1..*`, `n` como `*` y se ignoran las restricciones entre paréntesis o llaves. Antes de este ajuste habría contado como fallo cualquier extremo escrito así, aunque la herramienta lo leyera bien.

| Métrica (`captura-digital`, 19 imágenes) | Estricto | Tolerante (≤ 2 caracteres) |
| --- | --- | --- |
| Clases: precisión / cobertura | 0,24 / 0,40 | 0,34 / 0,58 (158 falsos positivos de 241 propuestas) |
| Atributos: precisión / cobertura | 0,20 / 0,07 | 0,36 / 0,13 (54 de 416) |
| Relaciones: precisión / cobertura | 0,10 / 0,09 | 0,19 / 0,16 (24 de 149; 102 falsos positivos) |
| Multiplicidades | — | 11/139 (0,08) |

Rendimiento:

- Latencia: p50 de 15,0 s y p95 de 39,8 s, con un máximo de 39,8 s, por debajo del límite de producción de 60 s pero cerca en los diagramas grandes.
- Errores de ejecución: ninguno.
- En 4 de las 19 capturas no se reconoció ninguna clase.
- Memoria: RSS de 589 MiB tras la carga y 1.879 MiB de pico.

Lectura de los resultados:

- **Conclusión:** el reconocimiento de imágenes reales **no es fiable** en su estado actual. Sirve como punto de partida que el usuario corrige en la revisión, no como importación directa. El benchmark sintético sobreestimaba la calidad, porque sus diagramas siguen un único estilo limpio.
- **Causas observadas al inspeccionar las capturas con 0 clases:**
  - **Cabeceras con relleno de color y texto claro**, frecuentes en Enterprise Architect, draw.io y presentaciones. La franja rellena se binariza como tinta, el compartimento del nombre desaparece y la clase toma como nombre su primer atributo (por ejemplo, "Nombre" en lugar de "Lector").
  - **Fondos de color, sombras o cuadrículas.** Generan decenas de regiones cerradas falsas; en `224513` se propusieron 59 "clases" para 11 reales.
  - **Atributos sin tipo o con espacios** (`-Nombre:`, `-ID del usuario:`). El analizador exige `nombre : tipo` con un identificador sin espacios y los rechaza como ilegibles.
  - **Relaciones:**
    - las líneas discontinuas se fragmentan en trazos sueltos;
    - las flechas abiertas de navegabilidad y las etiquetas sobre la línea ("necesita", "Entrega, recibe") se unen al conector;
    - los conectores en árbol o muy cercanos se fusionan y quedan como ambiguos.
  - **Multiplicidades:** a los problemas de OCR ya medidos se suma que, sin el conector correcto, la multiplicidad no tiene extremo al que asignarse.
- **Mejoras posibles, sin implementar:**
  - binarizar por contraste local del texto para admitir cabeceras rellenas;
  - descartar regiones cerradas sin texto o con fondo uniforme;
  - aceptar atributos sin tipo y con espacios;
  - unir trazos discontinuos;
  - separar el texto de los conectores usando las cajas del OCR.

  Estas 19 capturas sirvieron para diagnosticar. Si se ajusta el analizador con ellas, la nueva medición debe hacerse con capturas distintas o declarar explícitamente que el dataset ya no es independiente.

### Cierre del Incremento 3

- **3.3, prueba manual (estaba pendiente):**
  1. importar desde una captura y desde una foto, revisar, aplicar y ver el resultado en el diagrama;
  2. deshacer en un paso;
  3. repetir en colaboración con dos clientes.
- **3.4 y 3.6:** completadas el 2026-11-08 con 19 capturas reales; sin fotos de papel ni de pizarra.
- **Prueba manual 3.3:** aprobada por el usuario el 2026-11-08. En sus palabras, "funciona a medias, pero lo importante es que sí funciona": el flujo de subir, revisar y aplicar funciona, y el reconocimiento es parcial, como mide el benchmark real. No se detallaron los pasos, la captura usada, el resultado del Undo ni la prueba en colaboración; por eso no se declaran como verificados manualmente. Sí están cubiertos por tests automáticos: Undo en un paso y el inverso colaborativo de `ImportUmlFragment`.
- **Decisión del usuario (2026-11-08):** cerrar CU-10 con los resultados reales documentados como limitación, sin una iteración de mejora del analizador.
- **Gates de cierre el 2026-11-08:** el backend dio lint, typecheck, build y 147 tests correctos (9 omitidos). El test del endpoint de visión recibió un timeout explícito de 30 s porque arranca Nest y decodifica imágenes reales, y con la máquina cargada superaba los 5 s por defecto. El frontend no cambió desde la corrida completa del monorepo (563 tests).

## Resultado Final

- **XMI 2.1:** exportación e importación compatibles con Enterprise Architect en ambos sentidos para el subconjunto soportado, aprobadas por el usuario.
- **Imagen → UML:** endpoint local con Florence-2 y analizador determinista, revisión común con edición y exclusiones, y aplicación atómica con Undo en un paso.
  - Fiable con capturas limpias y con un único estilo: clases 0,94 y relaciones 1,00 en el benchmark sintético.
  - **No es fiable con capturas reales de estilos variados:** clases 0,58, atributos 0,13, relaciones 0,16 y multiplicidades 0,08 de cobertura con tolerancia. Debe usarse como borrador que se corrige en la revisión.
- **Deuda técnica y mejoras propuestas:**
  - cabeceras con relleno de color;
  - fondos y cuadrículas;
  - atributos sin tipo o con espacios;
  - líneas discontinuas;
  - separar el texto de los conectores;
  - cola de visión duplicada respecto de la de Qwen.
- **Commit de cierre:** `feat: agregar imagen a UML con Florence-2, revisión común y benchmark VLM CU-10`.

## Cambio Posterior - Mejora Del Reconocimiento De Imágenes

OpenSpec `openspec/changes/fix-cu-10-mejorar-reconocimiento-imagenes/`, rama `fix/cu10-reconocimiento-imagenes`, 2026-11-13. Es un correctivo parcial: el usuario decidió detenerlo tras el primer problema del incremento 2.

Implementado, con todo el detalle en `tasks.md` del OpenSpec:

- **Incremento 1.**
  - Atributos sin tipo (`-Nombre:` se propone como String) o con nombre de varias palabras seguido de dos puntos (`ID del usuario` → `IDDelUsuario`).
  - Las regiones cerradas sin texto del OCR (fondos, sombras, cuadrículas) dejan de proponerse como clases y como extremos de relación.
- **Cabeceras con relleno de color.** Una banda de tinta de 12 px o más encima del primer compartimento, del ancho de la caja, pasa a ser la cabecera, y su texto el nombre de la clase.

Medición con el benchmark (`npm run benchmark:vlm`), con tolerancia y antes / después:

| Métrica | 19 capturas de diagnóstico | 11 capturas independientes nuevas |
|---|---|---|
| Clases: precisión | 0,34 → **0,57** | 0,72 → **0,79** |
| Clases: cobertura | 0,58 → **0,63** | 0,81 → 0,81 |
| Atributos: cobertura | 0,13 → **0,15** | 0,39 → 0,39 |
| Relaciones: precisión | 0,19 → **0,28** | 0,41 → **0,47** |
| Relaciones: cobertura | 0,16 → 0,17 | 0,28 → 0,28 |

- **Las 19 capturas ya se usaron para diagnosticar,** así que solo las 11 nuevas son una medición independiente. Confirman la mejora de precisión.
- **El lote independiente no tiene cabeceras rellenas,** así que esa mejora solo está medida con el lote de diagnóstico.
- **Benchmark sintético idéntico.** Latencia sin cambios.

Hallazgos y limitaciones:

- **Texto diminuto** (capturas pequeñas o muy densas): el OCR de Florence-2 lee basura aunque las cajas se detecten. Es un límite del modelo, no del analizador.
- **Cabeceras de color medio** (por ejemplo, verde) con texto blanco: se recuperan solo en parte, y el OCR también lee mal su texto. La variante medida sobre la imagen en grises no mejoró y se descartó.
- **Pendiente, no implementado:**
  - unión de trazos de líneas discontinuas;
  - máscara del texto del OCR antes de trazar conectores (la mejora propuesta para la cobertura de relaciones).

Pruebas: `diagram-analyzer.test.ts` pasa de 24 a 34 tests y el módulo de visión queda en 69/69. Las mutaciones de cada cambio hacen fallar sus tests.

Commits: `761fb8d` (incremento 1) y `b7d395a` (cabeceras rellenas), más el commit de documentación.

## 1. Incremento 1 - Comandos atómicos, propuesta e interoperabilidad XMI

- [x] 1.1 Agregar `ImportUmlFragment` y `RemoveUmlFragment` a `uml-core` (tipos, executor y validación); verificar con tests: aplicación atómica, rechazo de ids repetidos y de fragmentos inválidos sin cambios, una sola entrada de historial y Undo que restaura el estado previo.
- [x] 1.2 Definir `UmlImportProposal` y el traductor determinista a fragmento en `uml-core` (normalización de tipos, referencias por nombre, tipo desconocido como `string` con diagnóstico, relaciones con extremo inexistente omitidas y posiciones iniciales); verificar con tests unitarios de cada regla y del determinismo.
- [x] 1.3 Agregar la validación previa sobre copia del documento; verificar con tests que reporta nombres duplicados y que no altera documento, revisión ni historial.
- [x] 1.4 Agregar el inverso colaborativo (`ImportUmlFragment` → `RemoveUmlFragment`) en `workspace-store`; verificar con tests de Undo/Redo colaborativos y con un test del backend realtime que acepta ambos comandos.
- [x] 1.5 Crear el workspace `@examen-sw1/xmi-core` con `fast-xml-parser` en versión exacta (al menos dos semanas de publicación) y scripts de lint, typecheck, test y build; verificar instalación y build.
- [x] 1.6 Implementar `exportXmi` (XMI 2.1, ids derivados y salida determinista); verificar con tests de estructura, tipos, multiplicidades, agregación, composición, generalización y doble exportación idéntica.
- [x] 1.7 Implementar `parseXmi` con diagnósticos (XML inválido, no XMI, operaciones, paquetes aplanados y elementos desconocidos); verificar con tests de cada caso y del round-trip exportar → importar.
- [x] 1.8 Agregar al workspace Exportar XMI (descarga) e Importar XMI (archivo con límite de tamaño, revisión básica con conteos y diagnósticos, y Aplicar con un comando); verificar con tests RTL y que VIEWER no ve las acciones.
- [x] 1.9 Prueba manual con Enterprise Architect: importar en EA un XMI exportado por el producto e importar en el producto un XMI exportado por EA; versionar ese XMI como fixture si no contiene datos sensibles y registrar la versión de EA y las diferencias en `docs/puds/use-cases/CU-10-xmi-imagen-uml.md`. Aprobada por el usuario el 2026-11-06 en ambos sentidos; no se reportaron la versión de EA ni diferencias, y no se aportó un XMI de EA para versionar como fixture.
- [x] 1.10 Ejecutar los gates de `uml-core`, `xmi-core`, `frontend` y `backend` (lint, typecheck, test y build) y documentar el Incremento 1 en CU-10.

## 2. Incremento 2 - Imagen a propuesta estructurada

- [ ] 2.1 Documentar en CU-10 la descarga del modelo `onnx-community/Florence-2-base-ft` (fuente, licencia MIT, archivos int8 y tamaño verificados) a una carpeta fuera del repositorio, y las variables nuevas en `.env.example`; verificar que la guía permite cargar el modelo.
- [ ] 2.2 Instalar `sharp` y `@huggingface/transformers` en `backend` con versiones exactas (al menos dos semanas); verificar que cargan en Node v26 y Windows y registrar el resultado.
- [ ] 2.3 Implementar el preprocesamiento con Sharp (EXIF, grises, contraste y redimensión); verificar con tests sobre imágenes generadas.
- [ ] 2.4 Implementar el analizador determinista (rectángulos, asignación de líneas OCR, parseo de atributos, conectores, clasificación de extremos y multiplicidades) como función pura; verificar con tests sobre diagramas sintéticos renderizados desde SVG con resultado conocido, incluidos casos sin diagrama y con conector sin extremo.
- [ ] 2.5 Implementar el motor Florence-2 local (carga perezosa, sin descargas en tiempo de ejecución, `<OCR_WITH_REGION>`) con cola, `BUSY` y timeout que excluye la carga; verificar con tests de cola y timeout con un motor falso.
- [ ] 2.6 Exponer `POST /projects/:id/vision/uml-proposal` (JWT, permiso de edición, PNG/JPEG, límites de tamaño y dimensiones, diagnósticos estructurados y sin persistir la imagen); verificar con Supertest: autorización, VIEWER, formato, tamaño y respuesta.
- [ ] 2.7 Agregar un test de integración real con Florence-2 que se omite sin el modelo configurado; ejecutarlo con el modelo descargado sobre una captura sintética y registrar el resultado.
- [ ] 2.8 Ejecutar los gates de `backend` y documentar el Incremento 2 en CU-10.

## 3. Incremento 3 - Revisión, aplicación y benchmark VLM

- [ ] 3.1 Implementar el diálogo de revisión común (editar nombres, atributos y tipos; incluir o excluir elementos y relaciones con dependencias; diagnósticos recalculados; Aplicar con un comando y Cancelar sin cambios); verificar con tests RTL.
- [ ] 3.2 Conectar en el workspace la acción "Desde imagen" (subida, progreso, errores y apertura de la revisión) y llevar la importación XMI al mismo diálogo; verificar con tests RTL y que VIEWER no ve las acciones.
- [ ] 3.3 Prueba manual: importar desde una captura y desde una foto, revisar, aplicar, ver el resultado en el diagrama, deshacer en un paso y repetir en colaboración con dos clientes; registrar en CU-10.
- [ ] 3.4 Crear el dataset del benchmark VLM: capturas sintéticas con resultado esperado, variantes derivadas (rotación, baja resolución y ruido) y fotos reales aportadas por el usuario con su resultado esperado escrito a mano.
- [ ] 3.5 Implementar el runner del benchmark VLM (precisión, cobertura y falsos positivos de clases, atributos, relaciones y multiplicidades por condición; latencia p50/p95; RAM; tiempo de carga; reporte JSON); verificar con tests de las métricas.
- [ ] 3.6 Ejecutar el benchmark y documentar en CU-10 los resultados reales por condición, las limitaciones y lo no medido como N/A, sin inventar métricas.
- [ ] 3.7 Ejecutar los gates del monorepo (lint, typecheck, test y build) y actualizar `docs/STATUS.md` y `docs/HANDOFF.md` con la evidencia real.

## Workflow follow-up

- Verify del OpenSpec, aceptación del usuario, archive, commit y push.

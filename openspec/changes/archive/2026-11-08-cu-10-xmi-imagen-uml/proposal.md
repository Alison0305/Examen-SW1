## Why

El modelo canónico solo se alimenta hoy por edición manual, texto y voz. CU-10 completa las entradas externas del producto: intercambiar modelos con Enterprise Architect mediante XMI 2.1 y obtener propuestas UML desde imágenes, sin alterar directamente `CanonicalUmlModel` y respetando la ruta única de mutación.

Además, el núcleo no tiene un comando para agregar varios elementos a la vez: una importación dispararía decenas de comandos sueltos, con decenas de pasos de Undo, operaciones realtime separadas y riesgo de dejar el diagrama a medio importar.

## What Changes

- Agregar a `uml-core` los comandos atómicos `ImportUmlFragment` (agrega clases, enumeraciones, relaciones y su layout en una sola operación validada) y `RemoveUmlFragment` (su inverso para el Undo colaborativo).
- Definir `UmlImportProposal`, una representación intermedia pura con claves locales y tipos por nombre, compartida por XMI e imagen, y un traductor determinista a fragmento: asigna ids, resuelve tipos y referencias, calcula una disposición inicial y valida sobre una copia del documento.
- Crear el paquete `@examen-sw1/xmi-core` con `fast-xml-parser`, utilizable en navegador y backend: importa y exporta el subconjunto XMI 2.1 de Enterprise Architect y reporta como diagnóstico lo no soportado.
- Agregar al workspace las acciones Exportar XMI e Importar XMI.
- Crear en el backend el pipeline imagen → propuesta: preprocesamiento con Sharp, OCR con regiones mediante Florence-2 local con Transformers.js y un analizador determinista de cajas, textos, conectores y multiplicidades. Se expone en un endpoint autenticado que solo propone.
- Agregar un diálogo de revisión común para XMI e imagen: editar, seleccionar y validar antes de aplicar mediante el Command Bus con un único Undo.
- Medir el reconocimiento de imágenes con un benchmark VLM reproducible.

## Capabilities

### New Capabilities

- `uml-fragment-import`: propuesta intermedia de importación, traducción determinista a fragmento, comandos atómicos `ImportUmlFragment` y `RemoveUmlFragment`, revisión previa y aplicación validada mediante el Command Bus, local y colaborativa.
- `xmi-interop`: importación y exportación XMI 2.1 del subconjunto UML soportado, orientada a Enterprise Architect.
- `image-uml-recognition`: reconocimiento local de diagramas de clases desde imágenes hacia `UmlImportProposal` y su benchmark VLM.

### Modified Capabilities

Ninguna. La ruta de mutación, el Undo y la colaboración existentes no cambian: los nuevos comandos se suman a ellas.

## Impact

- `uml-core`: dos comandos nuevos en el executor y en la validación, más el tipo `UmlImportProposal` y su traductor.
- Paquete nuevo `xmi-core` con la dependencia `fast-xml-parser`.
- `backend`: módulo de visión con `sharp` y `@huggingface/transformers` (Transformers.js); modelo Florence-2 local fuera del repositorio, configurado por variable de entorno.
- `frontend`: acciones XMI, carga de imagen y diálogo de revisión en el workspace; inverso colaborativo de la importación.
- Las versiones de dependencias se fijan exactas y con al menos dos semanas de publicación.
- Fuera de alcance: operaciones y paquetes en la importación (se aplanan con diagnóstico), diagramas que no sean de clases, conservar el layout exacto de Enterprise Architect y todo lo de CU-11.

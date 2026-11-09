## Context

- `uml-core` muta el documento solo mediante `UmlCommand`. El Undo local guarda snapshots del documento en `UmlCommandBus`. El Undo colaborativo del frontend (`workspace-store`) calcula un comando inverso por comando (`inverseCommand`), y para eliminaciones usa `RestoreDeletionSnapshot`.
- El backend realtime (`ProjectOperationService`) ejecuta cualquier `UmlCommand` con el mismo `UmlCommandBus`, así que un comando nuevo funciona en colaboración sin cambiar el gateway.
- No existe un comando que agregue varios elementos a la vez (proposal.md, Why).
- Florence-2 no está entrenado en diagramas UML, pero ofrece OCR con regiones (`<OCR_WITH_REGION>`) de buena calidad. El modelo `onnx-community/Florence-2-base-ft` tiene licencia MIT; su juego q8 (`*_quantized`) pesa unos 275 MB.
- Equipo de referencia: Ryzen 5 3400G, 16 GB de RAM, GTX 1660 SUPER (Vulkan, sin CUDA runtime), Windows 10, Node v26.13.0.

## Goals / Non-Goals

**Goals:**

- Un único camino de aplicación para XMI e imagen: propuesta, traducción determinista, validación sobre copia, revisión y un comando atómico.
- XMI 2.1 compatible con Enterprise Architect en ambos sentidos para el subconjunto soportado.
- Reconocimiento de imagen local y medible, con expectativas honestas.

**Non-Goals:**

- Comandos para operaciones o paquetes, conservar el layout de Enterprise Architect y reconocer diagramas que no sean de clases.
- Ejecutar Florence-2 en el navegador o en Android.
- Entrenar o ajustar modelos.

## Decisions

### 1. Comandos atómicos `ImportUmlFragment` y `RemoveUmlFragment`

`ImportUmlFragment` lleva clases, enumeraciones, relaciones y layouts con ids ya asignados. El executor rechaza ids que colisionen con el documento, agrega todo y valida el documento resultante; si hay errores no aplica nada. `RemoveUmlFragment` recibe los ids de clases, enumeraciones y relaciones de un fragmento y retira exactamente esos elementos y sus layouts. Es el inverso que `inverseCommand` devuelve para `ImportUmlFragment`.

Alternativa descartada: emitir `CreateClass`, `AddAttribute` y `CreateRelationship` uno a uno. Genera N entradas de historial y N operaciones realtime, y puede dejar importaciones parciales.

Alternativa descartada: reutilizar `RestoreDeletionSnapshot` para importar. Su semántica es restaurar con índices originales, no agregar.

### 2. `UmlImportProposal` y su traductor viven en `uml-core`

Son tipos y funciones puras, sin dependencias, usados por `xmi-core`, por el backend de visión y por el frontend. El traductor:

- normaliza tipos con una tabla de sinónimos (`String`, `int`, `Integer`, `long`, `double`, `float`, `bool`, `Date`, `DateTime` y los tipos de Enterprise Architect como `EAJava_int`) hacia los primitivos del modelo;
- resuelve por nombre las referencias a clases y enumeraciones de la propuesta o del documento;
- usa `string` con diagnóstico para los tipos desconocidos;
- coloca los elementos nuevos en una cuadrícula a la derecha del contenido existente; el usuario puede usar el auto-layout ELK que ya existe.

La validación previa clona el documento y ejecuta `ImportUmlFragment` sobre un `UmlCommandBus` descartable.

### 3. Paquete `@examen-sw1/xmi-core`

Contiene `parseXmi(xml)`, que devuelve una `UmlImportProposal` con diagnósticos, y `exportXmi(model)`, que devuelve el XML. Usa `fast-xml-parser` en ambos sentidos y funciona en navegador y en Node. El subconjunto sigue la forma de Enterprise Architect:

- `xmi:XMI` con `uml:Model` y `packagedElement` de tipo `uml:Class`, `uml:Enumeration` y `uml:Association`;
- `ownedAttribute` con `type` como `xmi:idref` o `href` primitivo, y `lowerValue`/`upperValue`;
- `ownedEnd`/`memberEnd` con `aggregation` (`shared`, `composite`);
- `generalization`.

En la exportación, los ids XMI se derivan de los ids canónicos para que sea determinista. Los paquetes se aplanan con un diagnóstico informativo. La importación y la exportación se ejecutan en el navegador, sin endpoint: no hay secretos ni acceso a datos de otros proyectos, y funcionan offline. El tamaño del archivo se limita en el cliente.

Alternativa descartada: un endpoint backend para XMI. Agrega latencia y otra superficie de ataque sin ningún beneficio.

### 4. Pipeline de visión en el backend

El módulo `vision` expone `POST /projects/:id/vision/uml-proposal` con JWT y exige permiso de edición sobre el proyecto. Las etapas son:

1. **Sharp:** rotación por EXIF, escala de grises, normalización de contraste, redimensión a un máximo de 1024 px por lado y enderezado de inclinaciones de 0,5° a 8°, estimadas por proyección de filas. El enderezado se agregó tras medir el benchmark.
2. **Florence-2 `<OCR_WITH_REGION>`:** Transformers.js con modelo local (`allowRemoteModels = false` y `localModelPath`). Devuelve líneas de texto con su cuadrilátero.
3. **Análisis determinista sobre píxeles:**
   - binarizar;
   - detectar segmentos horizontales y verticales largos y formar rectángulos (clases), uniendo los compartimentos apilados;
   - asignar cada línea OCR a su rectángulo: la primera es el nombre de la clase y las demás, atributos (`[visibilidad] nombre : tipo`);
   - detectar conectores siguiendo píxeles entre los bordes de dos rectángulos;
   - clasificar por heurística el extremo: triángulo hueco → generalización, rombo relleno → composición, rombo hueco → agregación, sin marca → asociación;
   - asociar como multiplicidad los textos con forma de multiplicidad más cercanos a cada extremo.

El analizador es una función pura sobre un buffer de píxeles y las líneas OCR, por lo que se prueba sin el modelo usando imágenes sintéticas renderizadas con Sharp desde SVG. La carga del modelo es perezosa y reutiliza el patrón de cola de una tarea, `BUSY` y timeout sin contar la carga, del correctivo Qwen.

Alternativa descartada: pedir a Florence-2 una descripción del diagrama (`<MORE_DETAILED_CAPTION>`). No produce estructura fiable.

Alternativa descartada: usar Qwen para estructurar el texto OCR. Mezcla dos modelos sin aportar la geometría, que es lo que define clases y relaciones.

### 5. Revisión común en el workspace

Un diálogo recibe una `UmlImportProposal`, de XMI o de imagen. Muestra clases con nombre editable y atributos (nombre y tipo editables), enumeraciones y relaciones con casillas de inclusión, y los diagnósticos de propuesta y de validación recalculados en cada edición. "Aplicar" emite un único `ImportUmlFragment`. Excluir una clase excluye también sus relaciones. Es solo para OWNER y EDITOR.

### 6. Benchmark VLM

El runner (script npm del backend) recorre un dataset con resultado esperado escrito a mano y compara la propuesta con lo esperado:

- clases por nombre normalizado;
- atributos por (clase, nombre);
- relaciones por (tipo, extremos);
- multiplicidades por extremo.

Calcula precisión, cobertura y falsos positivos por condición, más latencia p50/p95, RAM y tiempo de carga, y escribe un reporte JSON en `backend/.benchmark-output/`.

El dataset tiene:

- **capturas sintéticas** generadas desde SVG;
- **variantes derivadas** de esas capturas (rotación, baja resolución, ruido);
- **fotos reales** aportadas por el usuario, con su resultado esperado.

Las imágenes reales que contengan datos personales no se versionan.

## Risks / Trade-offs

- [Florence-2 no reconoce bien texto manuscrito o fotos de baja calidad] → Se mide por condición, todo pasa por revisión y se documenta la limitación sin maquillar las cifras.
- [Las heurísticas de líneas y flechas fallan con diagramas densos o líneas curvas] → Las relaciones son mejor esfuerzo, se descartan con diagnóstico cuando no tocan dos clases y la revisión permite excluirlas.
- [El XMI de Enterprise Architect varía según la versión] → El parser es tolerante a atributos opcionales y diagnostica lo no reconocido; se prueba con un XMI real de Enterprise Architect.
- [Mensaje realtime grande en importaciones muy grandes] → Se limita el número de elementos por fragmento y se rechaza con diagnóstico si se supera.
- [Rendimiento de Transformers.js en CPU] → Se usa int8 en el modelo base y se mide; la ejecución en GPU queda como mejora si el benchmark lo justifica.
- [Dependencias recientes] → Se fijan versiones exactas con al menos dos semanas de publicación (`fast-xml-parser` y `@huggingface/transformers` tienen hoy versiones más nuevas que no cumplen ese plazo).

## Migration Plan

No hay migraciones de datos. Los comandos nuevos solo agregan variantes a `UmlCommand`. Los documentos existentes no cambian y los recibos realtime se calculan igual.

## Open Questions

- La versión de Enterprise Architect disponible para las pruebas manuales; no cambia el diseño.
- La composición final del dataset de fotos reales; depende de las imágenes que aporte el usuario.

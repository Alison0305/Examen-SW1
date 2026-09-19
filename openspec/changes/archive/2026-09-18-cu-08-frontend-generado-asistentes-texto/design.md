## Context

CU-06 y CU-07 producen el modelo relacional, el backend Spring compilable, OpenAPI, Postman y el `domain-manifest.json` v1. Este CU debe consumir esos resultados sin cambiar sus contratos, y extender el monorepo con los workspaces aprobados `frontend-generator` y `assistant-core`. Véase `proposal.md` y los tres delta specs para el comportamiento comprometido.

## Goals / Non-Goals

**Goals:**

- Crear una cadena determinista `RelationalModel -> contratos existentes -> frontend generado` y una cadena separada `texto -> AssistantCommand/propuesta UML -> validación -> ejecución autorizada`.
- Establecer responsabilidades de fuente explícitas y comprobables para que el generador, la app generada, el núcleo de asistente y el CASE no dupliquen autoridad.
- Mantener el asistente textual auditable, cerrado y sin destino dinámico.
- Completar exactamente tres incrementos verificables.

**Non-Goals:**

- No modificar, versionar de nuevo ni ampliar el Domain Manifest v1, OpenAPI, Postman o el backend Spring generado.
- No implementar voz, Capacitor/Android, XMI, visión ni operación offline, que pertenecen a CUs posteriores.
- No descargar pesos de Qwen ni declarar que un modelo local funciona durante el spike; tampoco introducir un proveedor LLM remoto.
- No crear una segunda ruta de mutación para el modelo UML ni alterar Prisma, migraciones o persistencia CASE.

## Decisions

### Workspaces y responsabilidades de fuente

Se crearán únicamente los workspaces `frontend-generator` y `assistant-core`. `frontend-generator` será responsable de leer el `RelationalModel` y los artefactos contractuales disponibles para renderizar plantillas Handlebars y de aplicar reglas deterministas de inferencia de UI. La aplicación generada será responsable de presentar esa UI, obtener configuración local explícita de su endpoint y despachar interacciones mediante clientes generados; no interpreta lenguaje natural ni decide capacidades.

`assistant-core` será responsable de los tipos `AssistantCommand`, parser/adaptadores de intención, validator, executor, resultados estructurados y corpus/runner de benchmark. La fuente de autorización de entidades, campos, relaciones, operaciones y rutas será el Domain Manifest v1; OpenAPI queda como contrato de integración verificable, no como origen de decisiones semánticas. La aplicación CASE conservará sus módulos de dominio y su `UmlCommandBus`; solo añadirá un adaptador de borde que convierte una propuesta UML aprobada en comandos existentes.

Alternativa descartada: un paquete único que genere UI, interprete texto y modifique UML. Mezclaría responsabilidades, dificultaría probar la seguridad y permitiría que el generador se convierta en autoridad de runtime.

### Inferencia de interfaz sin cambios al manifest

Las reglas de inferencia consumirán únicamente `type`, `required`, `identifier`, `unique`, `searchable`, `sortable`, `defaultSort`, relaciones y operaciones del manifest. Tipos escalares determinan controles y parseo; `required` determina obligatoriedad; identificadores no entran en PATCH; relaciones determinan selectores/navegación y las capacidades determinan las acciones visibles. Las reglas tendrán tests de fixtures para que modelos equivalentes generen UI equivalente.

Alternativa descartada: ampliar manifest con etiquetas, widgets o reglas de presentación. Rompería el compromiso explícito de no cambiar v1 y acoplaría metadatos visuales al contrato semántico actual.

Los request schemas OpenAPI se proyectan mediante `deriveMutableFields` en `createFields` y `updateFields`; el Manifest aporta `semanticAttribute`, `semanticRelation` y `relationTarget`. Una relación mutable carga una página del LIST existente del target en una caché mínima, usa `TextField select` y `MenuItem`, conserva `field.wireName` para estado y payload y convierte el valor al tipo OpenAPI antes de POST/PATCH. El value es el identifier del target; el label es su primer atributo textual no identifier, o el identifier como fallback. Un fallo de carga conserva estable el formulario y reutiliza el error existente. No se agregan dependencias, endpoints, presentación al Manifest, búsqueda remota, autocomplete avanzado ni paginación visual.

Para integrar el asistente generado, `FrontendGeneratorInput` exige `assistantCoreDependency`. El caller calcula ese especificador `file:` desde su directorio de salida hacia el workspace `assistant-core`, mediante el writer; el generador no recibe un output directory, no conoce rutas del repositorio y no depende del directorio de trabajo. La plantilla `package.hbs` consume ese valor y el smoke lo deriva desde `import.meta.url`.

### Comando textual y seguridad

`AssistantCommand` será una unión discriminada por operación. El validator aplicará allow-lists y validación de forma antes de cualquier IO; el executor recibirá solo un comando aprobado y derivará método/ruta desde la operación declarada. `DELETE` será un flujo de dos fases: propuesta validada y confirmación explícita de UI. La salida contendrá resultados o diagnósticos estructurados, no instrucciones ejecutables.

Alternativa descartada: dejar que el modelo produzca URL, body libre o SQL. Eso elude el Domain Manifest y no ofrece un límite comprobable de capacidades.

### Validator de AssistantCommand

`assistant-core` consumirá mediante importación solo de tipos el contrato público `DomainManifestV1` exportado por `spring-generator`; el JSON generado no cambia. El validator es puro, no normaliza ni muta el comando y devuelve `AssistantResult<AssistantCommand>` con `VALIDATION_ERROR` y diagnósticos estructurados antes de cualquier IO.

La autorización semántica usa `operation.name`, sin construir rutas: `list` para LIST/SEARCH, `get`, `create`, `update`, `delete` y `count` según corresponda. CREATE permite identifier y exige todos los atributos required; UPDATE exige identifier externo, rechaza identifier en fields y fields vacío. SEARCH exige criterio no vacío, query solo con atributo searchable y fields existentes tipados sin exigir searchable.

Los tipos v1 VARCHAR, DATE, TIMESTAMP_WITH_TIME_ZONE y ENUM aceptan string; BIGINT y NUMERIC aceptan number; BOOLEAN acepta boolean. Null solo se acepta en atributos no required y arrays se rechazan porque v1 no expresa atributos multivaluados. Unique no se verifica porque requeriría IO. Relation se valida sobre la entidad fuente para LIST, SEARCH y COUNT, comprobando nombre, identifier fuente y target existente; cardinality, lifecycle y required no agregan reglas en este incremento.

### Executor autorizado

El executor invoca siempre el validator antes de cualquier adapter. Recibe un adapter HTTP inyectable y sin base URL, deriva método y path solo de `DomainManifestV1`, y devuelve la data del adapter para respuestas 2xx. SEARCH serializa query como `q` y cada criteria.fields como un parámetro repetido `filter=campo:eq:valor`; no agrega paginación. LIST con relation usa la operación `get<Source>Relation`; SEARCH y COUNT con relation se rechazan antes de IO porque v1 no declara una operación REST autorizada. DELETE conserva el comando semántico y exige `confirmDelete` externo; sin confirmación devuelve `CONFIRMATION_REQUIRED` sin IO. Errores HTTP y excepciones del adapter producen `EXECUTION_ERROR` estructurado.

### CASE como adaptador, no executor compartido

El texto orientado al CASE producirá una propuesta distinta de `AssistantCommand` para datos generados. Tras confirmación, el adaptador seleccionará un `UmlCommand` existente y lo enviará al `UmlCommandBus`; el modelo canónico, documento y layout nunca son mutados por el parser ni por la UI del asistente. La validación y Undo/Redo siguen las rutas de CU-01/CU-02.

Alternativa descartada: hacer que `assistant-core` aplique directamente cambios UML. Rompería la ruta única de mutación y duplicaría semántica de negocio.

### Spike y benchmark Qwen

El incremento final realizará un spike de integración que compruebe compatibilidad de runtime, formato de modelo esperado, carga de módulos y puntos de configuración usando metadatos/documentación, pero establece como límite verificable no iniciar ninguna descarga ni añadir pesos al repositorio. El benchmark se diseña y ejecuta con el parser determinista o con un adaptador disponible; si no hay modelo descargado, el informe debe registrar explícitamente esa condición y no atribuirle resultados a Qwen.

Alternativa descartada: descargar el modelo como parte del CU. Introduce un binario grande, variables de hardware y tiempo de descarga que no son necesarios para validar el pipeline ni la medición reproducible.

## Risks / Trade-offs

- [El manifest v1 no expresa etiquetas o widgets] -> Aplicar una tabla de inferencia conservadora y documentada; los valores no inferibles usan controles genéricos tipados.
- [Diferencias entre manifest y API runtime] -> Mantener fixtures y pruebas de contrato contra las operaciones generadas; bloquear la ejecución si la operación no está declarada.
- [Entrada textual ambigua] -> Exigir representación estructurada y confirmación para DELETE y propuestas CASE; rechazar antes de IO lo que no pueda validarse.
- [El modelo no está disponible durante CU-08] -> Separar el parser/adaptador del runtime de Qwen y registrar resultados reales del benchmark sin simularlos.
- [Cambios en el Command Bus existente] -> Limitar el alcance a adaptadores hacia comandos existentes; si faltara una mutación esencial, detenerse y actualizar el mismo OpenSpec antes de ampliar el dominio.

## Migration Plan

1. Añadir los workspaces y sus contratos internos sin cambiar el output de CU-06/CU-07.
2. Generar y comprobar el frontend en directorios temporales, incluyendo compilación y pruebas contra fixtures representativos.
3. Integrar `assistant-core` primero con fixtures y clientes controlados; habilitar UI solo tras validar los límites de comandos.
4. Incorporar el adaptador CASE y verificar que todas las mutaciones pasan por el Command Bus.
5. Ejecutar benchmark, registrar la configuración real y limpiar outputs temporales antes del cierre.

El rollback elimina los nuevos outputs generados y workspaces de CU-08; no requiere migración de datos ni reversión de cambios al manifest porque este CU no lo modifica.

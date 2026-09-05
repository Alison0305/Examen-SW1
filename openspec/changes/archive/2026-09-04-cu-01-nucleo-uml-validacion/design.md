## Context

CU-00 dejó un monorepo ejecutable con `frontend` y `backend`. CU-01 debe agregar el núcleo semántico reutilizable antes de que CU-02 introduzca Command Bus, Undo/Redo y workspace gráfico. La decisión arquitectónica central del producto exige que `CanonicalUmlModel` sea la fuente de verdad semántica y que `DiagramLayout` contenga solo información visual.

## Goals / Non-Goals

**Goals:**

- Definir un paquete TypeScript reutilizable para el dominio UML sin acoplarlo a frontend, backend ni canvas.
- Representar `ProjectDocument`, `CanonicalUmlModel` y `DiagramLayout` con identidad, revisión, timestamps, serialización y reconstrucción JSON.
- Representar el subconjunto inicial de UML 2.5.1 necesario para diagramas de clases.
- Separar UML estándar de metadatos propios del generador.
- Proveer un validador determinista con diagnósticos estructurados, orden estable y reglas mínimas de integridad.
- Mantener los scripts raíz de calidad como entrada única para verificar todos los workspaces.

**Non-Goals:**

- No crear UI, canvas, React Flow, toolbox, inspector ni integración visual.
- No implementar `UmlCommand`, Command Bus, Undo ni Redo; pertenecen a CU-02.
- No persistir documentos ni agregar Prisma, PostgreSQL, autenticación, ownership, JWT, Socket.IO ni colaboración.
- No implementar generación Spring Boot, OpenAPI generado, Postman, Domain Manifest, IA, voz, XMI ni Capacitor.
- No convertir metadatos de generación en comportamiento funcional de persistencia, UI o generación todavía.

## Decisions

### Workspace independiente `uml-core/`

El núcleo UML se implementará como workspace independiente en la raíz con nombre conceptual `@examen-sw1/uml-core`.

Rationale: el modelo canónico y el validador serán usados posteriormente por frontend, backend, importación, colaboración, generación y asistentes. Ubicarlos dentro de `frontend/` o `backend/` introduciría dependencia direccional incorrecta y dificultaría la reutilización.

Alternativas consideradas: colocar el dominio en `frontend/` para acelerar CU-02, o en `backend/` para acercarlo a persistencia futura. Se descartan porque acoplan el núcleo a un consumidor específico y contradicen que el modelo sea fuente compartida.

### Separación `CanonicalUmlModel` / `DiagramLayout`

`ProjectDocument` tendrá conceptualmente `uml: CanonicalUmlModel` y `layout: DiagramLayout`. El modelo canónico almacenará clases, enumeraciones, paquetes y relaciones. El layout almacenará entradas visuales por `elementId` con `x`, `y`, `width` opcional y `height` opcional.

Rationale: React Flow y cualquier canvas futuro deben proyectar el dominio, no persistirse como dominio. Mover una figura debe cambiar solo el layout, no el significado UML.

Alternativas consideradas: incrustar coordenadas dentro de cada clase o relación. Se descarta porque mezcla información visual con semántica y complica validación, colaboración y generación.

### Identidad con UUID

Cada entidad relevante del documento tendrá UUID propio: documento, clases, atributos, operaciones, enumeraciones, paquetes y relaciones. Los parámetros pueden tener identidad propia si la implementación lo decide para trazabilidad y diagnósticos, pero como mínimo deben ser direccionables por path estable.

Rationale: los CUs posteriores necesitan referencias estables para layout, diagnósticos navegables, comandos, colaboración y persistencia. Los nombres no son suficientes porque pueden cambiar y pueden repetirse en ámbitos distintos.

Alternativas consideradas: IDs incrementales locales o nombres como identidad. Se descartan por baja estabilidad en round-trip, merge, persistencia futura y colaboración.

### Representación de tipos

Los tipos se modelarán como unión discriminada entre primitivos y referencias UML. Los primitivos iniciales serán `string`, `integer`, `boolean`, `number`, `date` y `datetime`. Las referencias apuntarán a clases o enumeraciones por UUID.

Rationale: el generador y el validador deben distinguir datos escalares de asociaciones semánticas a elementos del modelo. Un string libre no permite verificar referencias inexistentes ni inferir reglas futuras.

Alternativas consideradas: almacenar tipos como texto libre. Se descarta porque impide validación determinista y hace ambigua la transformación UML a relacional de CUs posteriores.

### Multiplicidad estructurada

La multiplicidad usará una estructura equivalente a `{ lower, upper }`, donde `lower` es numérico no negativo y `upper` puede ser numérico o ilimitado.

Rationale: las reglas `lower >= 0`, `upper >= lower` y `upper ilimitado` deben verificarse sin parsear texto arbitrario. Esto reduce ambigüedad y facilita generación futura.

Alternativas consideradas: guardar `"0..*"` o `"1"` como texto. Se descarta porque traslada reglas semánticas a parseos frágiles y no garantiza forma válida.

### Relaciones tipadas

Las relaciones soportadas por CU-01 serán `Association`, `Aggregation`, `Composition` y `Generalization`. Todas tendrán UUID propio y referencias `sourceId`/`targetId`; cuando corresponda, podrán incluir multiplicidades de extremos sin convertirlas en texto libre.

Rationale: el subconjunto cubre el diagrama de clases requerido por el producto y entrega suficiente semántica para validación, canvas y generación futura. La identidad de relación permite layout, diagnósticos y comandos posteriores.

Alternativas consideradas: modelar cada relación como una estructura completamente distinta. Se prefiere una base común tipada para reducir duplicación, manteniendo reglas específicas por tipo en el validador.

### Metadatos de generación separados

`generationMetadata` será opcional y estará separado de los campos UML estándar. Puede existir en clases y atributos para expresar conceptos declarativos iniciales como `entity`, `auditable`, `readOnly`, `searchable`, `crud`, `required`, `unique`, `sortable` y `defaultSort`.

Rationale: el producto necesita metadatos para generación, UI y asistentes, pero esos metadatos no son UML puro. Separarlos evita contaminar el modelo estándar y mantiene clara la responsabilidad de CUs posteriores.

Alternativas consideradas: agregar banderas como campos directos de clase o atributo UML. Se descarta porque mezcla perfiles del generador con UML estándar.

### Serialización y reconstrucción

El paquete expondrá funciones para crear documentos, serializarlos a JSON y reconstruirlos desde JSON. La serialización deberá conservar el contenido semántico y visual permitido por CU-01. Las pruebas deben incluir round-trip de documento vacío y documento con elementos.

Rationale: persistencia, colaboración e import/export posteriores necesitan una representación estable y comprobable. CU-01 no persiste en base de datos, pero deja el contrato en memoria y JSON.

Alternativas consideradas: depender directamente de `JSON.stringify` sin capa explícita. Se descarta porque no valida forma, timestamps ni evolución del contrato.

### Determinismo del validador

El validador recorrerá colecciones en orden estable y ordenará o emitirá diagnósticos de forma reproducible por path/código/elemento cuando sea necesario. El mismo modelo debe producir los mismos diagnósticos en el mismo orden.

Rationale: diagnósticos deterministas facilitan tests, UI navegable, colaboración, generación y comparación de resultados. También evita errores intermitentes en CI.

Alternativas consideradas: usar mapas o sets sin normalizar orden de salida. Se descarta porque puede producir diagnósticos no deterministas.

### Detección de ciclos

Los ciclos de herencia y paquetes se detectarán con recorridos de grafo deterministas. Para herencia se construirá el grafo de `Generalization`; para paquetes se usará `parentPackageId`. El recorrido debe registrar visitados y pila actual para detectar ciclos y emitir diagnósticos estables.

Rationale: ciclos invalidan jerarquías semánticas y pueden romper generación o navegación. Resolverlo en CU-01 protege a CU-02 y CUs posteriores.

Alternativas consideradas: validar solo referencias inmediatas y dejar ciclos para generación. Se descarta porque permitiría modelos inválidos temprano.

### Estrategia de diagnósticos

Cada diagnóstico contendrá `severity`, `code`, `message`, `path` y `elementId` opcional. Los códigos serán constantes estables y legibles, por ejemplo `UML_DUPLICATE_ID`, `UML_INVALID_MULTIPLICITY`, `UML_UNKNOWN_REFERENCE`, `UML_INHERITANCE_CYCLE`.

Rationale: la UI futura debe poder navegar al elemento afectado y los tests deben poder afirmar códigos sin depender de textos. Los errores serán bloqueantes para operaciones futuras; los warnings no bloquearán por defecto.

Alternativas consideradas: devolver strings de error simples. Se descarta porque no son navegables ni estables para automatización.

### Límites frente a CU-02 y posteriores

CU-01 solo crea el núcleo en memoria, validación y demo CLI. No define contratos de comandos ni estados de UI. CU-02 será responsable de Command Bus, Undo/Redo, React Flow, inspector y navegación visual de diagnósticos. CU-03 y posteriores serán responsables de persistencia, autenticación, colaboración y generación.

Rationale: mantener CU-01 pequeño y comprobable evita adelantar trabajo y respeta el orden PUDS aprobado.

## Risks / Trade-offs

- [Risk] El modelo inicial puede no cubrir todo UML 2.5.1 → Mitigation: documentar explícitamente que CU-01 cubre el subconjunto necesario para diagramas de clases y no pretende ser un metamodelo UML completo.
- [Risk] Demasiada flexibilidad en `generationMetadata` puede ocultar errores → Mitigation: validar reglas básicas de forma, tipos booleanos/listas simples y coherencia mínima sin implementar comportamiento de generación.
- [Risk] Cambios futuros podrían requerir migración de JSON → Mitigation: mantener funciones explícitas de serialización/reconstrucción y tests de round-trip desde CU-01.
- [Risk] Un validador muy amplio puede crecer demasiado en este CU → Mitigation: limitarse a las reglas mínimas aprobadas y dejar validaciones específicas de generación, persistencia o UI para CUs posteriores.
- [Risk] Añadir un workspace aumenta el costo de los scripts raíz → Mitigation: integrarlo con los mismos comandos existentes y mantener el paquete sin dependencias pesadas.

## Migration Plan

- Agregar `uml-core/` como nuevo workspace en el monorepo.
- Actualizar scripts raíz para incluir el workspace sin romper `frontend` ni `backend`.
- Agregar pruebas del núcleo UML y mantener verdes las pruebas existentes de CU-00.
- Agregar demo `npm run demo:uml` sin requerir servicios externos.
- Actualizar documentación de CU-01 y estado operativo solo durante la implementación, sin declarar cierre hasta verify, aceptación, archive, commit y push.

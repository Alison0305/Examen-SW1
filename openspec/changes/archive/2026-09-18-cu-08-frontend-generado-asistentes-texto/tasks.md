## 1. Incremento 1 - Frontend generado CRUD

- [x] 1.1 Crear y registrar el workspace `frontend-generator`, sus plantillas Handlebars y su entrada determinista desde el `RelationalModel`, Domain Manifest v1 y contratos ya existentes; verificar que un fixture representativo genera el árbol esperado sin modificar `domain-manifest.json` v1.
- [x] 1.2 Implementar las reglas deterministas de inferencia de controles para tipos, campos requeridos, identificadores, unicidad, relaciones, búsqueda, filtros y ordenamiento; verificar con pruebas unitarias que cada metadato produce controles permitidos y que los identificadores no son editables en PATCH.
- [x] 1.3 Generar las pantallas responsive de listado, detalle, creación, edición y eliminación, con relaciones y estados loading/error/empty; verificar mediante pruebas de generación y React Testing Library los flujos CRUD habilitados y la ausencia de controles para capacidades no declaradas.
- [x] 1.4 Compilar la aplicación generada y realizar una prueba manual en viewport de escritorio y móvil contra un backend generado de fixture; verificar navegación, consulta, formulario, confirmación de eliminación y presentación segura del error.
- [x] 1.5 Consumir `createFields` y `updateFields` en `page.hbs`; limitar CREATE/PATCH y sus payloads a `wireName`, preservando relaciones inversas para navegación.
- [x] 1.6 Implementar opciones de relaciones mediante LIST del target, caché mínima, `TextField select`/`MenuItem`, value identifier, label determinista, coerción OpenAPI y errores estables; verificar tests, regeneración, build y prueba manual Rol/Usuario.

## 2. Incremento 2 - AssistantCommand seguro

- [x] 2.1 Crear y registrar el workspace `assistant-core` con el contrato tipado `AssistantCommand` para `LIST`, `GET`, `SEARCH`, `CREATE`, `UPDATE`, `DELETE` y `COUNT`, junto con resultados y rechazos estructurados; verificar exhaustividad de la allow-list y que no existe campo de URL o destino textual.
- [x] 2.2 Implementar el validator contra Domain Manifest v1 para entidad, operación, identificador, campos, tipos, relaciones y restricciones; verificar con pruebas unitarias aceptación de comandos válidos y rechazo previo a IO de campos, relaciones, tipos u operaciones inválidos.
- [x] 2.3 Implementar el executor que deriva exclusivamente método y ruta desde una operación declarada y el flujo de confirmación para `DELETE`; verificar con pruebas de integración que los comandos válidos alcanzan solo el cliente permitido y que SQL, código, URLs arbitrarias y eliminaciones sin confirmar no invocan ninguna llamada.
- [x] 2.4 Integrar el asistente de datos en la aplicación generada mediante el contrato de `assistant-core`; verificar con React Testing Library el resultado estructurado, los diagnósticos y la confirmación explícita antes de una acción destructiva.

## 3. Incremento 3 - CASE, spike Qwen y benchmark

- [x] 3.1 Implementar el adaptador de propuestas textuales UML en el editor CASE, con revisión/confirmación y conversión exclusiva a `UmlCommand` existente; verificar con pruebas de integración que una propuesta aprobada pasa por `UmlCommandBus`, conserva Undo/Redo y una propuesta inválida no altera `CanonicalUmlModel`, `ProjectDocument` ni `DiagramLayout` directamente.
- [x] 3.2 Ejecutar el spike acotado de Qwen3 1.7B cuantizado para comprobar runtime, formato esperado, configuración y límites de integración, deteniéndose antes de descargar pesos; verificar mediante evidencia documentada y una prueba automatizada o de configuración que no se creó descarga, binario ni proveedor remoto.
- [x] 3.3 Definir el corpus y ejecutar el benchmark reproducible de comandos, registrando dataset, configuración, versión o modelo, hardware, validez estructurada, precisión, falsos positivos, rechazos correctos, latencia, RAM, VRAM y carga cuando aplique; verificar que el informe contiene mediciones reales, fallos y la condición explícita si Qwen no estuvo disponible.
- [x] 3.4 Ejecutar los gates relevantes del monorepo, las suites nuevas, la compilación de outputs generados y `openspec validate cu-08-frontend-generado-asistentes-texto --type change --strict`; actualizar `docs/puds/use-cases/CU-08-frontend-generado-asistentes-texto.md`, `docs/STATUS.md` y `docs/HANDOFF.md` solo con hechos implementados y validados.

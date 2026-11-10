## 1. Contrato y contexto verificable

- [x] 1.1 Definir contratos tipados de solicitud, recomendación y aclaración de solo lectura, reutilizando la frontera Mentor; verificar con pruebas unitarias de forma, certeza y `requiresUmlChange`.
- [x] 1.2 Implementar catálogo acotado de arquitectura ShareGrams y capacidades verificables del generador Spring junto con el selector de tema/foco UML; verificar que no incluye stack, elementos ni endpoints inexistentes.
- [x] 1.3 Implementar guardas deterministas solo para clase, relación, servicio o componente concreto ausente y tema externo o ambiguo (como pagos); permitir arquitectura verificable general sin entidad literal y verificar que las aclaraciones no invocan Qwen.

## 2. Flujo Mentor de recomendaciones

- [x] 2.1 Extender el servicio y proveedor Qwen local con generación estructurada y validación estricta sin coerción ni texto libre inventado, reutilizando autorización, contexto UML y memoria Prisma; verificar privacidad del prompt, `isStale` y errores controlados.
- [x] 2.2 Exponer la ruta autenticada específica de recomendaciones sin modificar el contrato de `POST /projects/:id/mentor/query`; verificar DTO, autorización previa y compatibilidad HTTP de la consulta libre.
- [x] 2.3 Registrar recomendaciones exitosas mediante el recorder existente sin crear persistencia adicional; verificar memoria compartida autorizada y aislamiento por `projectId`.
- [x] 2.4 Integrar una acción diferenciada de recomendación y presentación estructurada de solo lectura en el panel Mentor existente; verificar endpoint, campos, aclaración, ausencia de acciones de aplicación y regresión de consulta libre.
- [x] 2.5 Resolver antes de Qwen las preguntas sobre relaciones UML canónicas y generación Spring Boot completamente verificables mediante recomendaciones deterministas genéricas; preservar hechos verificados sin inventar ni mutar el proyecto.
- [x] 2.6 Resolver de forma determinista la adición inequívoca de un atributo ausente en una clase canónica, y rechazar salida Qwen en inglés o que simule cambios UML aplicados.
- [x] 2.7 Reintentar una sola vez en frontend la recomendación solo ante fallo de transporte sin respuesta HTTP, con espera breve y sin reintentar abortos, sin cambiar la consulta libre.

## 3. No modificación y regresiones

- [x] 3.1 Cubrir recomendaciones sobre arquitectura real, UML `Categoria`/`Producto` y generación Spring; verificar únicamente hechos presentes en los contextos verificables.
- [x] 3.2 Cubrir respuesta de contexto insuficiente, clase inexistente, recomendación con y sin cambio UML, y salida estructurada malformada; verificar que no se inventan alternativas no verificables.
- [x] 3.3 Cubrir que una recomendación no cambia `CanonicalUmlModel`, layout ni revisión y no invoca comandos o persistencia de proyecto; verificar snapshot antes/después y regresiones de editor.
- [x] 3.4 Ejecutar regresiones de CU-2P-01/02/03 y rutas afectadas del generador Spring; verificar pruebas focalizadas, integración HTTP y persistencia PostgreSQL.
- [x] 3.5 Cubrir asociación, agregación, composición, generalización, multiplicidades y generación Spring verificadas por la ruta directa, ausencia de relación, memoria stale, no mutación, arquitectura y regresión de consulta libre.
- [x] 3.6 Cubrir recomendación de atributo futura sin mutación, idioma/acción aplicada inválidos, retry de transporte, cancelación y carga sin doble envío.

## 4. Documentación y validación

- [x] 4.1 Crear y actualizar la documentación de CU-2P-05, STATUS y HANDOFF con estado real, decisión de API, contrato, pruebas y prueba manual prevista; verificar que no se declara cerrado antes de aceptación.
- [x] 4.2 Ejecutar typecheck, lint, tests focalizados, suite raíz, build, Prisma validate/status, OpenSpec strict y diff-check; registrar resultados reales.
- [x] 4.3 Repetir manualmente recomendación de atributo futura y recomendación Spring después de los correctivos; registrar evidencia sin datos sensibles antes de solicitar autorrevisión.

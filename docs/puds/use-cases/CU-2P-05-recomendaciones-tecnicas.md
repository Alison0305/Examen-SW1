# CU-2P-05 - Solicitar recomendaciones y soluciones técnicas contextualizadas

## Estado

Completado y aceptado. PR #13 fue fusionado en `main`, cerró automáticamente el issue #5 y produjo el merge commit `2e6fade062361b25edde73ee446fb900b861147e`. OpenSpec archivado en `openspec/changes/archive/2026-11-10-s2-cu05-recomendaciones-tecnicas/` con 19/19 tareas; la prueba manual 4.3 fue aprobada.

## Objetivo Y Alcance

RF-15, RF-16 y RF-17: producir recomendaciones técnicas estructuradas, contextualizadas y de solo lectura sobre UML, arquitectura, desarrollo y generación Spring Boot. Las recomendaciones deben distinguirse de posibles cambios de modelo y de acciones aplicadas.

## Dependencias

- CU-2P-01: endpoint Mentor y Qwen local.
- CU-2P-02: identidad derivada de JWT y autorización previa.
- CU-2P-03: memoria Prisma aislada por proyecto.
- CU-2P-04 aporta el análisis UML que convive con la consulta y recomendación en el panel Mentor; no bloqueó este CU.

## Decisión De API

`POST /projects/:id/mentor/recommendations` es una ruta autenticada específica que conserva el contrato textual de `POST /projects/:id/mentor/query`. Devuelve `status: "READ_ONLY"`, `problem`, `alternatives`, `rationale`, `limitations`, `confidence`, `needsClarification`, `requiresUmlChange` y `projectRevision`; no contiene estado de propuesta ni ejecución. El panel Mentor IA contiene acciones separadas `Consultar` y `Recomendación técnica`; la segunda muestra esos campos sin controles para aplicar, confirmar, rechazar o ejecutar cambios.

## Plan Técnico

- Contrato tipado y proveedor local Qwen con schema de salida cerrado. Una salida con campos extra, faltantes o tipos inválidos devuelve el error controlado del Mentor y nunca se coerciona desde texto libre.
- Contexto verificable: UML canónico, Next.js, NestJS, PostgreSQL, Prisma, Qwen local, capacidades reales del exportador Spring y memoria autorizada existente.
- Incertidumbre: guardas deterministas solo para clase, relación, servicio o componente concreto ausente y para temas externos o ambiguos como pagos. Las preguntas generales de arquitectura verificable pueden llegar a Qwen sin entidad UML literal.
- Privacidad: no se enviarán identidad, JWT, roles, secretos ni datos de otros proyectos al proveedor.
- No modificación: no habrá Command Bus, actualización de `ProjectDocument`, layout, revisión ni estado de aplicación en este CU.

## Implementación Realizada

- Se reutilizan `MentorInteractionIdentityResolver`, `requireView`, `MentorContextBuilder`, memoria Prisma y recorder existente. La autorización se resuelve antes de cargar proyecto, memoria o proveedor.
- Las recomendaciones exitosas se registran con el recorder existente; las aclaraciones y errores de proveedor no crean memoria.
- No se incorporó Command Bus, mutación de `CanonicalUmlModel`, layout, revisión, persistencia de proyecto ni dependencia de CU-2P-04.
- Corrección durante la prueba manual: el motor estructurado pasaba directamente el texto de Qwen a `grammar.parse`, por lo que una envoltura normal que Qwen3 puede emitir, como `<think>...</think>` o un bloque Markdown `json`, se convertía en `INVALID_OUTPUT`; `LocalQwenMentorProvider` lo convertía en `ServiceUnavailableException` y `MentorService.recommend` lo volvía a ocultar como HTTP 503 genérico. La sesión de corrección no tuvo modelo configurado para capturar la salida original, por lo que el nuevo log seguro debe confirmar la envoltura exacta al repetir la prueba. Ahora se extrae determinísticamente un único objeto JSON antes de aplicar la misma gramática y contrato estrictos. No se completan campos ni se aceptan arreglos, JSON incompleto, múltiples objetos o contratos inválidos.
- Se agregó logging seguro de recomendaciones. El provider registra `stage`, nombre de error, código `LocalModelError` y mensaje técnico seguro; el servicio registra la frontera de proveedor. No registra JWT, secretos, identidad ni contexto UML completo.
- Diagnóstico de Qwen real: la salida estructurada alcanzó 975 caracteres y terminó dentro de `limitations`, sin cerrar el objeto. La configuración compartida usaba `maxTokens: 256`; `node-llama-cpp` ofrece `promptWithMeta`, por lo que ahora se registra `stopReason` y el presupuesto solicitado. Se usa un presupuesto explícito de 384 tokens solo para recomendaciones, con campos acotados (`problem` 160, alternativas de hasta 140 cada una, `rationale` 260 y `limitations` 180 caracteres) para completar el contrato sin generación abierta.
- La memoria de recomendaciones se filtra determinísticamente por términos relevantes normalizados antes de enviarla a Qwen. Una consulta general de arquitectura no recibe antecedentes puramente UML `Categoria`/`Producto`; una consulta que comparte esos términos sí los recibe. La advertencia `isStale` solo se añade cuando la memoria stale fue pertinente e incluida.
- El prompt estructurado exige un único JSON con los siete campos del contrato, prohíbe Markdown y texto adicional, y exige usar exclusivamente el stack verificado (incluidos Next.js y NestJS, sin sustituirlos por React o Node.js).
- Corrección posterior de contrato: Qwen completó JSON, `grammar.parse` pasó y el validador final rechazó `confidence: 3`. El schema anterior expresaba `minimum`/`maximum`, pero la gramática no restringió ese rango numérico, mientras el parser sí imponía `0..1`. Ambos usan ahora exactamente la escala enumerada `0`, `0.25`, `0.5`, `0.75` o `1`; el prompt también la exige.
- Protección de stack: después de validar forma y valores, se rechaza determinísticamente una recomendación que presente React, Node.js o microservicios como arquitectura actual. Una alternativa futura solo puede mencionarlos si se declara explícitamente como futura; el stack actual sigue limitado a los hechos verificados.
- Recuperación controlada: la única infracción recuperable es esa referencia técnica no verificada. `MentorService` realiza como máximo un segundo llamado al provider con una instrucción correctiva fija, sin reenviar la salida anterior. JSON inválido, contrato, grammar, truncado, motor, autorización, proyecto, memoria y otros errores no se reintentan. El segundo resultado recorre todas las validaciones; otro incumplimiento devuelve el error controlado.
- Evidencia manual definitiva: ambos intentos devolvieron JSON válido pero presentaron React, Node.js y microservicios como arquitectura actual; el segundo rechazo produjo HTTP 503. El retry único funciona, pero Qwen no respeta de forma fiable la restricción semántica.
- Corrección posterior: el prompt de arquitectura incluye bloques explícitos `CURRENT_ARCHITECTURE` y `DO_NOT_PRESENT_AS_CURRENT`. Tras el segundo y último `UNVERIFIED_TECHNOLOGY`, solo una pregunta general de arquitectura que ya pasó las guardas de contexto recibe un fallback determinista de solo lectura. Se compone desde Next.js, NestJS, PostgreSQL, Prisma y Spring Boot verificados, con `confidence: 0.75`, `needsClarification: false` y `requiresUmlChange: false`; no usa salida de Qwen ni memoria. Fallos de JSON, grammar, motor, autorización, contexto insuficiente y temas externos siguen sin fallback.
- `alternatives` se mantiene como `string[]`; las cadenas que contienen objetos JSON serializados se rechazan, y el prompt exige textos simples.
- Corrección de calidad de recomendación UML: tres alternativas equivalentes ahora se deduplican determinísticamente tras validar el contrato, normalizando espacios y mayúsculas/minúsculas, conservando orden y el primer texto, sin pedir otra generación ni inventar reemplazos. Una alternativa única se devuelve como arreglo de un elemento.
- Causa trazada de `rationale` incompleto: no existe transformación ni corte en API o frontend; el texto llega desde la generación estructurada a grammar, parser, servicio y panel sin modificar. El contrato anterior permitía hasta 260 caracteres y una frase sin puntuación final, por lo que una salida JSON válida podía mostrarse incompleta. Ahora `rationale` exige una única oración terminada en `.`, `!` o `?`, con máximo de 180 caracteres y una instrucción explícita al modelo. Nunca se recorta una cadena después de generar; una razón incompleta se rechaza como salida estructurada inválida.
- Recomendación UML directa: si la consulta menciona ambos extremos de una relación canónica existente con tipo y multiplicidades verificables, se compone antes de Qwen una recomendación read-only genérica desde el UML actual. Preserva tipo, extremos y multiplicidades sin inventar agregación, composición, dirección ni atributos; la memoria stale solo puede añadir su advertencia. Registra `recommendation:direct-verified-uml` y `recommendation:direct-uml-ok`. Para `Categoria`/`Producto`, deriva la asociación y `Producto 0..* por Categoria` junto con `Categoria 1..1 por Producto`.
- Corrección posterior a la prueba manual: una solicitud inequívoca para agregar un atributo ausente a una clase existente se compone antes de Qwen como recomendación futura en español, sin inferir tipo ni aplicar cambios. `requiresUmlChange` es `true` y el texto usa `Se recomienda` o `Este cambio implicaría`; el provider rechaza las expresiones de aplicación ya realizada y los patrones ingleses observados. La deduplicación de alternativas normaliza puntuación, artículos y prefijos imperativos deterministas, preservando el primer texto original.
- El cliente frontend de `POST /projects/:id/mentor/recommendations` reintenta una sola vez únicamente si `fetch` falla sin respuesta HTTP. Las respuestas HTTP y `POST /projects/:id/mentor/query` no se reintentan.
- Correctivo de espera y transporte: la ruta de recomendación no tenía `AbortController` ni timeout en frontend; el límite efectivo estaba en el modelo local backend y su default de 30 s podía interrumpir una inferencia Qwen legítima. El default y `.env.example` pasan a 120 s, configurable por `ASSISTANT_TIMEOUT_MS`. Un `TypeError` de fetch espera 500 ms y ejecuta el único retry permitido. `AbortError` no se reintenta porque la ruta no posee señal propia para distinguir una cancelación de navegación intencional. El panel muestra la carga en el botón de recomendación y usa una guarda síncrona contra doble envío.
- Corrección de salida inválida Spring: la evidencia manual confirmó que Qwen alcanzaba el backend pero producía JSON estructuralmente válido con alternativas inglesas o vacías, correctamente rechazado como `INVALID_OUTPUT` y 503. Las consultas acotadas sobre generación/exportación/preparación/compatibilidad Spring Boot se resuelven ahora antes de Qwen cuando combinan una referencia Spring verificada con intención de pipeline. La respuesta determinista usa solo UML canónico, validación UML, transformación a modelo relacional y generación Spring Boot; es `READ_ONLY`, española, con certeza 1 y sin requerir cambio UML para la consulta general.

## Pruebas Automatizadas

- `mentor-recommendations.test.ts`: arquitectura, UML `Categoria`/`Producto`, Spring, aclaraciones sin Qwen, `requiresUmlChange`, memoria aislada, privacidad, autorización y no mutación.
- `local-qwen-mentor.provider.test.ts`: schema estructurado y rechazo de salida inválida sin coerción.
- `structured-json.test.ts`: aceptación de whitespace, `<think>`, bloque `json` y prosa alrededor de un único objeto; rechazo de arreglos, JSON incompleto y múltiples objetos.
- Focalizadas backend 41/41: salida truncada, campo requerido ausente, presupuesto estructurado de 384, dominio coincidente de `confidence`, stack no verificado rechazado, alternativa futura explícita, bloques explícitos de arquitectura, retry único, fallback arquitectónico, recomendaciones UML directas y atributo futuro sin mutación, deduplicación imperativa, idioma/acción aplicada inválidos, razón completa y memoria stale pertinente para `Categoria`/`Producto`.
- Focalizadas frontend 23/23: panel Mentor, consulta libre y cliente API; cubren éxito normal, retry de transporte, ausencia de retry para 4xx/503 y máximo un retry. Vitest conserva un error de teardown preexistente de `app/projects/page.tsx` después de las aserciones correctas.
- Tras el correctivo: focalizadas frontend 25/25 y backend 37/37. Se cubren recomendación lenta sin error ni duplicación, fallo de red con retry diferido y éxito, dos fallos de red con máximo dos requests, 4xx/503 sin retry, `AbortError` sin retry y doble clic bloqueado.
- Tras el correctivo Spring: focalizadas backend 43/43 y frontend 25/25. Backend cubre cuatro formulaciones Spring, 201, español, no invocación Qwen, contrato read-only, ausencia de tecnologías no verificadas, no mutación y regresión de consulta libre. Frontend conserva el teardown conocido de `app/projects/page.tsx` después de las aserciones.
- `mentor.controller.integration.test.ts`: ruta nueva autenticada y regresión de consulta libre.
- `mentor-panel.test.tsx` y `auth.test.tsx`: acción UI diferenciada, renderizado legible, aclaración, ausencia de aplicación y cliente API de recomendaciones.
- Focalizadas Mentor/identidad/memoria/Spring: 46/46 correctas, incluida persistencia PostgreSQL.
- Suite raíz: el baseline preexistente de CU-2P-04 en `uml-analysis-qwen.real.integration.test.ts:222` falla cuando existe `ASSISTANT_MODEL_PATH`; fue reproducido también en `origin/main` limpio `536cd6f`. Sin modelo local, esa integración real se omite.

## Gates Ejecutados

- `npm run typecheck`: correcto.
- `npm run lint`: correcto.
- Pruebas focalizadas CU-2P-05: backend 75/75 y frontend 52/52 correctas; la suite raíz conserva únicamente el baseline real-Qwen preexistente de CU-2P-04.
- `npm run build`: correcto; advertencia conocida del plugin ESLint de Next.js.
- `npx prisma validate` y `npx prisma migrate status`: correctos; esquema al día, sin migración de este CU.
- `openspec validate s2-cu05-recomendaciones-tecnicas --strict --no-interactive`: correcto.
- `git diff --check`: correcto.
- Tras integrar el frontend, el panel Mentor focalizado pasó 4/4; el cliente API validó sus 16 casos, pero el proceso aislado conserva un error de teardown preexistente en `app/projects/page.tsx`.
- El timeout inicial de 5 s en `backend/src/auth/auth.integration.test.ts` se clasificó como flakiness preexistente bajo carga: el test aislado pasó tres veces en 0,88-0,93 s, backend completo pasó 185/185 con 9 omitidas y una repetición de `npm run test` fue correcta. Bajo la suite completa, ese test tardó 4,43 s, cercano al límite; no se modificó código ni timeout ajenos al CU.
- Tras los correctivos de calidad y red: focalizadas backend 41/41 y frontend 23/23, typecheck backend/frontend, lint backend/frontend y OpenSpec strict correctos. `git diff --check` correcto; persiste solo el teardown frontend conocido tras las aserciones.

## Prueba Manual

La validación manual final fue aprobada. La consulta Spring `¿Qué debo tener en cuenta para que este modelo genere correctamente el backend Spring Boot?` respondió 5/5 al primer clic, de forma rápida, determinista, en español y `READ_ONLY`, con `requiresUmlChange: false`, sin mutar UML y sin `recommendation:provider-start`. La consulta de teléfono a Producto respondió en español, sin alternativas duplicadas, como cambio futuro con `requiresUmlChange: true`, sin declarar aplicación ni inferir tipo o validación; Producto permaneció sin ese atributo. La tarea 4.3 está completada. El CU fue aceptado, PR #13 fusionado en `main` e issue #5 cerrado; el OpenSpec está archivado.

## Limitaciones

No se implementarán aplicación automática, propuesta confirmable, diff, historial visible, memoria adicional, RAG, embeddings ni proveedores cloud. La conversión a propuesta corresponde a CU-2P-06.

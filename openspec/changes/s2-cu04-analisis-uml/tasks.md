## Incremento 1 - Contexto determinista

- [x] 1.1 Extraer el fragmento UML del foco (clase, relación o modelo) sin resolver por nombre ni asumir multiplicidades.
- [x] 1.2 Organizar los hechos relacionales del mapper existente: FK, tablas intermedias, clases asociativas, herencia JOINED, resultados parciales, multiplicidades no garantizadas y FK duplicadas.
- [x] 1.3 Reunir fragmento, diagnósticos UML y relacionales, conflictos y limitaciones en un contexto separado por categorías.
- [x] 1.4 Proyectar el contexto en un prompt compacto con prioridades P0–P3, recorte declarado y `CONTEXT_TOO_LARGE`.
- [x] 1.5 Cubrir los cuatro módulos con pruebas unitarias (22 + 33 + 21 + 26).

## Incremento 2 - Backend y modelo local compartido

- [x] 2.1 Definir el puerto `UmlAnalysisAiProvider`, el token `UML_ANALYSIS_AI_PROVIDER` y el adaptador `LocalQwenUmlAnalysisProvider` (13 pruebas).
- [x] 2.2 Implementar `UmlAnalysisService`: autorización, carga, contexto, prompt, proveedor y modelo de respuesta (26 pruebas).
- [x] 2.3 Implementar DTO, `UmlAnalysisBodyPipe` y `UmlAnalysisController` en `POST /projects/:id/mentor/analysis` (12 + 18 pruebas).
- [x] 2.4 Integrar CU-2P-01 desde `main` y conectar `MentorAnalysisModule` al `ASSISTANT_LOCAL_MODEL` compartido; registrar el módulo en `AppModule` (10 pruebas).
- [x] 2.5 Crear la suite real de Qwen con invariantes semánticos (15 pruebas, omitidas sin `ASSISTANT_MODEL_PATH`).
- [ ] 2.6 Ejecutar la suite real con Qwen3-1.7B GGUF configurado mediante `ASSISTANT_MODEL_PATH` y registrar resultados, métricas y fallos.

## Incremento 3 - Workspace y cierre

- [x] 3.1 Añadir `analyzeUml` y sus tipos al `ApiClient` (6 pruebas).
- [x] 3.2 Añadir la sección "Análisis UML" al panel Mentor IA con "Explicar selección" y "Explicar modelo" (21 pruebas).
- [x] 3.3 Ejecutar regresiones de CU-2P-01, Assistant, Vision, frontend completo, ESLint y TypeScript.
- [x] 3.4 Documentar OpenSpec, el caso de uso PUDS, STATUS y HANDOFF.
- [ ] 3.5 Revisión manual en navegador con backend, base de datos y Qwen disponibles.
- [ ] 3.6 Revisión previa del compañero y apertura del PR con `Closes #4`.
- [ ] 3.7 Aceptación, archivado del OpenSpec y cierre del issue #4.

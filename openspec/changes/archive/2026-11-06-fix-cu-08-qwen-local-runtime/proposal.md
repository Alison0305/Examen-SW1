## Why

CU-08 cerró con el Incremento 3 incompleto: el spike de Qwen solo define la interfaz `LocalTextModel` sin runtime, modelo ni inferencia. El asistente UML del workspace (`WorkspaceTextAssistant`) únicamente acepta la gramática estricta de `parseUmlTextProposal` (`CREATE_CLASS name="X"`, `RENAME_CLASS`/`DELETE_CLASS` con UUID). El panel del frontend generado (`assistant-panel.hbs`) solo acepta JSON `AssistantCommand` escrito a mano. Por ello, la voz (Vosk, CU-09) transcribe correctamente "crear clase paciente", pero ese texto natural se rechaza.

El benchmark existente (`assistant-core/src/benchmark`) usa `adapterInput` ya resuelto e ignora `inputSpanish`; sus métricas de 68.42% validez y 0.0279 ms p50 son de parser determinista, no de inferencia LLM. Este es un correctivo de un CU cerrado según AGENTS.md §5, no es CU-10 ni CU-11.

Requisito confirmado: la IA debe ser LOCAL y OFFLINE (la demo final será sin Internet). Sin proveedores cloud.

## What Changes

- Implementar el runtime Qwen3 1.7B GGUF cuantizado con `node-llama-cpp` en el backend NestJS (`backend/src/assistant/`).
- Crear un endpoint `POST /assistant/interpret` con dos modos aislados: `"uml"` para propuestas UML y `"data"` para `AssistantCommand`.
- Generar JSON Schema dinámico como gramática de `node-llama-cpp` con los nombres de entidades, campos, relaciones y clases como `enum` para que el modelo no emita nombres inexistentes.
- El modelo nunca emite UUIDs; para UML devuelve `targetName` y un resolvedor determinista en `assistant-core` mapea nombre a `classId`.
- Desactivar el modo thinking de Qwen3 y usar parámetros de muestreo deterministas.
- Integrar el endpoint en `WorkspaceTextAssistant` y en `assistant-panel.hbs` del frontend generado, con fallback a la gramática estricta actual.
- Ejecutar benchmark real con el modelo, comparando cuantizaciones Q4_K_M vs Q8_0 y GPU vs CPU.

## Capabilities

### New Capabilities

- `local-text-interpreter`: Runtime local de inferencia LLM para interpretar español natural y producir propuestas estructuradas validables.

### Modified Capabilities

- `assistant-core`: Añadir funciones puras de construcción de schemas dinámicos, prompts en español y resolución de propuestas UML por nombre.
- `case-text-assistant`: Ampliar el asistente UML del workspace para aceptar español natural interpretado por el endpoint.
- `generated-frontend`: Ampliar el panel de asistente para aceptar español natural interpretado por el endpoint.

## Impact

- Nueva dependencia `node-llama-cpp` en el backend con versión exacta fijada; compatibilidad verificada con Windows x64, CUDA (GTX 1660 SUPER, 6 GB VRAM) y Node v26.13.0 (discrepancia con Node 24 LTS documentada como riesgo).
- Nuevas variables en `.env.example`: `ASSISTANT_MODEL_PATH`, `ASSISTANT_GPU`, `ASSISTANT_TIMEOUT_MS`.
- Los pesos GGUF nunca se commitean (`.gitignore` ya ignora `models/` y `*.gguf`).
- La ruta existente `parseStructuredAssistantOutput` -> `validateAssistantCommand` -> aprobación -> ejecución permanece intacta.
- Fallback obligatorio: si el modelo no está configurado o falla, la gramática estricta actual sigue funcionando.

## Fuera de alcance

- Nuevas operaciones UML (solo CREATE_CLASS, RENAME_CLASS, DELETE_CLASS).
- LLM dentro del teléfono (el Android usa el host por LAN).
- Proveedores cloud, CU-10, CU-11, cambios a Vosk, Spring o Domain Manifest v1.

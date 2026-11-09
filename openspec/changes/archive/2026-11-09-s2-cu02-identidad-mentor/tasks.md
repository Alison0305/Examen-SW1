## 1. Identidad de interacción

- [x] 1.1 Crear el contrato mínimo, el resolvedor autorizado y el módulo exportable sin registrarlo en `AppModule`; verificar con pruebas unitarias del resolvedor.
- [x] 1.2 Cubrir OWNER, EDITOR, VIEWER, ausencia de acceso, aislamiento por usuario/proyecto, autorización exacta, timestamp de servidor y ausencia de secretos; verificar `npx vitest run src/mentor-identity/mentor-interaction-identity.resolver.test.ts`.

## 2. Documentación y límites de integración

- [x] 2.1 Crear propuesta, especificación y diseño que distingan el contrato implementado de la integración pendiente con CU-01.
- [x] 2.2 Documentar CU-2P-02 y actualizar STATUS/HANDOFF sin modificar el estado funcional de CU-10.

## 3. Validación

- [x] 3.1 Ejecutar regresiones unitarias seguras de AuthService y ProjectAccessService, lint, typecheck, validación OpenSpec strict y comprobación de diff; no ejecutar la integración Auth que carga configuración local.

## 4. Integración con Mentor de CU-01

- [x] 4.1 Importar el módulo de identidad en `MentorModule`, resolver la identidad desde `AuthenticatedUser` antes de cargar el proyecto y entregar la identidad al recorder sin una segunda autorización.
- [x] 4.2 Cubrir por HTTP la suplantación mediante campos extra, dos usuarios y rechazo de falta de acceso; verificar que identidad y email no se entregan al proveedor ni al prompt Qwen.
- [x] 4.3 Ejecutar regresiones focalizadas, typecheck, lint, validación OpenSpec strict y comprobación de diff para la integración.

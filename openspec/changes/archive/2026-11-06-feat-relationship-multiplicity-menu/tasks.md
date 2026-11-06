## 1. Selector de multiplicidades

- [x] 1.1 Interpretar `*` como `0..*` y `n..*` como límite superior ilimitado en `parseMultiplicity`; verificar con tests unitarios de los casos típicos y personalizados.
- [x] 1.2 Reemplazar los campos y botones de multiplicidad del inspector de relaciones por un menú nativo por extremo (Sin especificar, `1`, `0..1`, `0..*`, `1..*`, Otra…) que aplica al instante, con campo y botón para Otra…; verificar con tests RTL: aplicación inmediata, Undo, valor personalizado, `*`, N:M, generalización y VIEWER deshabilitado.
- [x] 1.3 Ejecutar los gates de `frontend` (lint, typecheck, test y build) y documentar el cambio en `docs/puds/use-cases/CU-02-uml-workspace.md`.
- [x] 1.4 Prueba manual del usuario: elegir multiplicidades desde el menú en una relación del workspace y ver el resultado en el diagrama. Aprobada por el usuario el 2026-11-06.

## Workflow follow-up

- Verify, aceptación del usuario, archive, commit y push.

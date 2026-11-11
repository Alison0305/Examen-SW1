## 1. Notación en el canvas

- [x] 1.1 Formatear las filas de atributo en el adaptador de React Flow como `visibilidad nombre: Tipo [multiplicidad]`, con la multiplicidad omitida si no existe o es `1`, y con los tipos de referencia resueltos por nombre (`?` si no se resuelven).
- [x] 1.2 Dibujar el estereotipo de enumeración como `«enumeration»`.

## 2. Inspector

- [x] 2.1 Mostrar en la lista de atributos del inspector la misma notación (`nombre: Tipo [multiplicidad]`, sin el símbolo de visibilidad, que se edita aparte), con tipos de referencia por nombre.
- [x] 2.2 Ofrecer las enumeraciones del modelo en el selector de tipo de atributo y crear o actualizar el atributo con el tipo de referencia mediante el Command Bus.
- [x] 2.3 Conservar el tipo de referencia (enumeración o clase) al editar un atributo que ya lo tiene.

## 3. Pruebas y cierre

- [x] 3.1 Pruebas del adaptador, los nodos, el inspector y el store: multiplicidad visible y por defecto, referencia por nombre y no resoluble, enumeración como tipo con Undo, conservación del tipo al editar y estereotipo `«enumeration»`. Hecho en `uml-notation.test.tsx` (18 tests), con dos aserciones existentes actualizadas a la notación nueva.
- [x] 3.2 Gates del frontend (tests, build, typecheck, ESLint), OpenSpec strict y diff-check. Frontend 366/366; build, `tsc` y ESLint correctos (2026-11-11).
- [x] 3.3 Documentar el correctivo en el PUDS de CU-02 y en STATUS.
- [ ] 3.4 Prueba manual del usuario y aceptación.

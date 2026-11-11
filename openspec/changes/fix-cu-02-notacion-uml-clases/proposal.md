## Why

Al revisar la notación UML 2.5.1 del diagrama de clases que dibuja el workspace (CU-02, ya cerrado), aparecen defectos en el subconjunto que ya se soporta:

- La multiplicidad de un atributo se guarda en el modelo, pero el nodo no la muestra (`telefonos: string` en lugar de `telefonos: string [0..*]`).
- Un atributo tipado por una enumeración o una clase, que llega por XMI o por imagen, muestra el identificador interno en el nodo (`estado: 3f2a…`) y `enumeration:<id>` en el inspector.
- Desde el inspector no se puede usar una enumeración como tipo de atributo, aunque el modelo, el validador, el mapper relacional y el generador Spring ya la soportan. Además, editar un atributo con tipo de referencia lo convierte en `string` sin avisar.
- El estereotipo se dibuja `<<enumeration>>` en lugar de `«enumeration»`.

El símbolo de visibilidad delante del nombre de una clase o enumeración (`+ Cliente`) es notación válida de UML 2.5.1 para elementos empaquetables y se conserva.

## What Changes

- El nodo de clase muestra cada atributo como `visibilidad nombre: Tipo [multiplicidad]`. La multiplicidad se omite cuando no existe o es exactamente `1`, que es el valor por defecto en UML.
- Los tipos de referencia se muestran por el nombre de la enumeración o clase en el nodo y en el inspector, nunca por su identificador. Una referencia que no se puede resolver se muestra como `?`; el validador existente ya la diagnostica.
- El selector de tipo del inspector ofrece, además de los primitivos, las enumeraciones del modelo. Al editar un atributo con tipo de referencia, ese tipo se conserva. Las clases no se ofrecen como tipo nuevo, porque el mapper relacional no las soporta (`REL_UNSUPPORTED_TYPE`).
- Los estereotipos se dibujan con comillas angulares: `«enumeration»`.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `uml-workspace`: agrega el requisito de notación UML de atributos y estereotipos en el canvas y el inspector.

## Impact

- `frontend`: adaptador de React Flow, nodos UML, utilidades del workspace, store (tipo de atributo) e inspector de clases, más sus tests.
- Sin cambios en `uml-core`, el backend, la persistencia, XMI ni los generadores: los comandos `AddAttribute` y `UpdateAttribute` ya aceptan tipos de referencia a enumeraciones, el validador rechaza las referencias inexistentes y `DeleteEnumeration` impide borrar una enumeración en uso.
- Correctivo posterior a CU-02 (convención `fix-cu-XX`). Se documenta en el PUDS de CU-02.

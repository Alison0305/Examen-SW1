## ADDED Requirements

### Requirement: Imágenes de contenedor reproducibles
El repositorio SHALL incluir Dockerfiles para el backend y el frontend, construibles desde la raíz del monorepo, que instalen las dependencias según `package-lock.json` y compilen los paquetes compartidos que cada uno necesita, sin copiar secretos, dependencias locales, compilados ni modelos de IA a la imagen.

#### Scenario: Construcción del backend
- **WHEN** se construye `backend/Dockerfile` con la raíz del repositorio como contexto
- **THEN** la imagen contiene el backend con sus paquetes compartidos compilados, el cliente Prisma para Linux y Python con Vosk, y no contiene `.env` ni archivos de modelos

#### Scenario: Construcción del frontend
- **WHEN** se construye `frontend/Dockerfile` con el argumento `NEXT_PUBLIC_API_BASE_URL`
- **THEN** la imagen contiene el build de producción de Next.js apuntando a esa URL del backend

#### Scenario: Frontend sin URL del backend
- **WHEN** se construye `frontend/Dockerfile` sin `NEXT_PUBLIC_API_BASE_URL`
- **THEN** el build falla con un mensaje que indica la variable que falta

### Requirement: Arranque del backend en contenedor
El contenedor del backend SHALL, al arrancar, descargar los modelos de IA que falten en el directorio de modelos persistente, aplicar las migraciones pendientes de Prisma y servir HTTP y WebSocket en el puerto indicado por `PORT`.

#### Scenario: Primer arranque
- **WHEN** el directorio de modelos está vacío y `DOWNLOAD_MODELS` no es `false`
- **THEN** descarga Qwen3-1.7B Q4_K_M, Florence-2 q8 y Vosk small-es-0.42 y después arranca el backend

#### Scenario: Arranques siguientes
- **WHEN** los modelos ya están en el volumen
- **THEN** no los vuelve a descargar

#### Scenario: Migraciones
- **WHEN** arranca con un `DATABASE_URL` válido
- **THEN** aplica las migraciones pendientes con `prisma migrate deploy` antes de servir peticiones

#### Scenario: Puerto de la plataforma
- **WHEN** la plataforma define `PORT`
- **THEN** el backend escucha en ese puerto en `0.0.0.0`

### Requirement: Configuración sin secretos en el repositorio
Los secretos y valores de despliegue (`DATABASE_URL`, `JWT_SECRET`, `FRONTEND_ORIGIN`, `NEXT_PUBLIC_API_BASE_URL`) SHALL definirse como variables de la plataforma y SHALL NOT estar en archivos versionados.

#### Scenario: Variables documentadas
- **WHEN** se consulta la guía de despliegue o `.env.example`
- **THEN** están documentadas todas las variables necesarias, sin valores secretos

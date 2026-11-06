## Purpose

Obtener, desde una imagen de un diagrama de clases, una propuesta UML revisable mediante un modelo multimodal local, sin aplicarla nunca directamente al modelo canónico.

## ADDED Requirements

### Requirement: Imagen a propuesta de importación
El sistema SHALL recibir una imagen PNG o JPEG de un diagrama de clases de un usuario autenticado con permiso de edición y devolver una propuesta de importación con las clases y atributos reconocidos y, como mejor esfuerzo, relaciones, herencia y multiplicidades. El sistema SHALL NOT aplicar la propuesta ni modificar el proyecto.

#### Scenario: Diagrama legible
- **WHEN** un EDITOR envía una captura de un diagrama con dos clases y sus atributos
- **THEN** recibe una propuesta con esas dos clases y sus atributos, y el proyecto no cambia

#### Scenario: Usuario sin permiso
- **WHEN** un usuario sin autenticación o con rol VIEWER envía una imagen
- **THEN** la solicitud se rechaza sin procesar la imagen

### Requirement: Límites de entrada de imagen
El sistema SHALL aceptar solo PNG y JPEG dentro de un tamaño máximo de archivo y de dimensiones configuradas, y SHALL rechazar cualquier otra entrada con un diagnóstico estructurado sin cargar el modelo.

#### Scenario: Formato no permitido
- **WHEN** se envía un archivo que no es PNG ni JPEG
- **THEN** la solicitud se rechaza con un diagnóstico de formato inválido

#### Scenario: Archivo demasiado grande
- **WHEN** se envía una imagen que supera el tamaño máximo
- **THEN** la solicitud se rechaza con un diagnóstico de tamaño

### Requirement: Ejecución local y sin Internet
El sistema SHALL ejecutar el preprocesamiento y el modelo multimodal localmente con archivos de modelo provistos de antemano. SHALL NOT descargar modelos ni enviar la imagen a servicios externos en tiempo de ejecución, y SHALL descartar la imagen después de procesarla.

#### Scenario: Sin conexión
- **WHEN** se procesa una imagen con la red desconectada
- **THEN** el reconocimiento funciona igual usando el modelo local

#### Scenario: Modelo no configurado
- **WHEN** el modelo multimodal no está configurado o no existe en disco
- **THEN** el sistema responde un diagnóstico de modelo no disponible y no intenta descargarlo

### Requirement: Diagnósticos de reconocimiento
El sistema SHALL acompañar la propuesta con diagnósticos de lo dudoso o no reconocido, como texto ilegible, cajas sin nombre de clase o relaciones cuyo extremo no se pudo asociar a una clase, y SHALL devolver un diagnóstico de propuesta vacía cuando no reconozca ninguna clase.

#### Scenario: Imagen sin diagrama
- **WHEN** se envía una foto que no contiene un diagrama de clases
- **THEN** la respuesta es una propuesta vacía con un diagnóstico que lo explica

#### Scenario: Relación sin extremo
- **WHEN** se detecta un conector cuyo extremo no toca ninguna clase reconocida
- **THEN** la relación no se propone y se registra un diagnóstico

### Requirement: Tiempo máximo y concurrencia
El sistema SHALL limitar la duración del reconocimiento, excluyendo la carga inicial del modelo, y SHALL procesar las imágenes de una en una, rechazando como ocupado lo que exceda la cola configurada.

#### Scenario: Reconocimiento demasiado lento
- **WHEN** el reconocimiento supera el tiempo máximo configurado
- **THEN** la solicitud termina con un diagnóstico de tiempo agotado y el servidor sigue respondiendo

### Requirement: Benchmark VLM reproducible
El sistema SHALL disponer de un benchmark reproducible del reconocimiento sobre un conjunto de imágenes con resultado esperado escrito a mano, que registre dataset, configuración y versión del modelo, hardware, precisión y cobertura de clases, atributos, relaciones y multiplicidades, falsos positivos, latencia p50/p95, RAM y tiempo de carga, sin inventar métricas no observadas.

#### Scenario: Ejecución del benchmark
- **WHEN** se ejecuta el benchmark sobre capturas, versiones inclinadas o de baja resolución y fotos de diagramas dibujados a mano
- **THEN** el reporte registra las métricas por condición y deja como N/A, con su motivo, lo que no se pudo medir

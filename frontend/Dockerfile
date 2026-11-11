# Frontend Next.js (App Router). Contexto de build: raíz del repositorio (docker build -f frontend/Dockerfile .).
# NEXT_PUBLIC_API_BASE_URL se fija en el build (Next la incrusta en el JavaScript del navegador): en Railway se define
# como variable del servicio y llega aquí como argumento de build.
FROM node:24-bookworm-slim

WORKDIR /app

# Manifiestos primero, para reutilizar la capa de npm ci.
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/
COPY backend/package.json backend/
COPY uml-core/package.json uml-core/
COPY xmi-core/package.json xmi-core/
COPY relational-core/package.json relational-core/
COPY spring-generator/package.json spring-generator/
COPY frontend-generator/package.json frontend-generator/
COPY assistant-core/package.json assistant-core/

RUN npm ci --no-audit --no-fund --workspace frontend --workspace uml-core --workspace xmi-core \
  && npm cache clean --force

COPY uml-core uml-core
COPY xmi-core xmi-core
COPY frontend frontend

ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL} \
    NEXT_TELEMETRY_DISABLED=1

# uml-core aporta los tipos y xmi-core se consume compilado; después, el build de producción de Next.js.
RUN test -n "${NEXT_PUBLIC_API_BASE_URL}" || { echo "Falta NEXT_PUBLIC_API_BASE_URL (URL pública del backend, p. ej. https://backend.up.railway.app)." >&2; exit 1; } \
  && npm run build --workspace uml-core \
  && npm run build --workspace xmi-core \
  && npm run build --workspace frontend

ENV NODE_ENV=production
WORKDIR /app/frontend
EXPOSE 3000
CMD ["sh", "-c", "exec npx next start -H 0.0.0.0 -p ${PORT:-3000}"]

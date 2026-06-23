# Manager FDF — aplicación

Esta carpeta contiene la aplicación completa de **Manager FDF**:

- **`src/`** — frontend (React 19 + TypeScript + Vite + Tailwind 4), incluido el visor de partido 2D.
- **`server/`** — backend API (Fastify 4 + Prisma + PostgreSQL + Redis).
- **`engine/`** — motor de partido (Python 3.12 + FastAPI, FDF 1d40 determinista).

> 📖 **La documentación principal del proyecto, la arquitectura y la guía de puesta en marcha están en el [README de la raíz del repositorio](../README.md).**

## Comandos rápidos (frontend)

```bash
npm install        # instalar dependencias
npm run dev        # servidor de desarrollo (Vite, http://localhost:5173)
npm run build      # build de producción (tsc -b && vite build)
npm run lint       # ESLint
npm run test:e2e   # tests end-to-end (Playwright)
```

Para arrancar el stack completo (frontend + backend + motor + PostgreSQL + Redis) con Docker, consulta la sección **Puesta en marcha** del [README raíz](../README.md).

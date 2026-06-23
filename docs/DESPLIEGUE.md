# Despliegue serverless 0€ — Manager FDF (issue 7.2)

_Guía paso a paso para Jaime. Claude mantiene este documento; los ficheros de configuración ya están en el repo: `football-manager/vercel.json`, `football-manager/engine/fly.toml` y `football-manager/.env.production.example`._

**Prerequisito: 7.1 (repo git en GitHub privado).** Vercel y Koyeb despliegan desde GitHub; sin repo solo se puede desplegar el motor (Fly sube el contexto local).

---

## 1. Arquitectura de producción

```
Jugador ──HTTPS──▶ Vercel (frontend React estático, CDN)
   │
   └─HTTPS/WSS──▶ Koyeb (API Fastify, contenedor 24/7 sin hibernar → WS vivos)
                    ├──▶ Neon.tech (PostgreSQL serverless, 500 MB)
                    ├──▶ Upstash (Redis, cola/cache)
                    └──▶ Fly.io (motor Python /simulate /develop /lineup, auto-sleep)
Upstash QStash ──webhook 11:00/23:00──▶ Koyeb (turno blindado, cuando exista 7.3)
```

Mientras 7.3 no exista, el turno lo dispara el cron interno de la API (`TICK_ENABLED=true`): funciona porque Koyeb no hiberna.

---

## 2. Orden de creación de cuentas y servicios

### 2.1 Neon.tech (PostgreSQL) — 5 min
1. Cuenta en neon.tech → New Project → región `aws-eu-central-1` → BD `managerfdf`.
2. Copia DOS cadenas de conexión desde el dashboard:
   - **Pooled** (con `-pooler` en el host): es el `DATABASE_URL` de la API.
   - **Direct** (sin `-pooler`): solo para `prisma migrate deploy` y el seed (Antigravity, 7.x).
3. Ambas con `?sslmode=require`.

> Nota Antigravity (7.x): con el pooler de Neon, Prisma necesita `directUrl` en el datasource del schema para migraciones. Migración + seed se lanzan desde local contra la cadena directa: `DATABASE_URL=<direct> npx prisma migrate deploy && npx prisma db seed`.

### 2.2 Upstash (Redis + QStash) — 5 min
1. Cuenta en upstash.com → Create Redis Database → región próxima a Koyeb (Frankfurt).
2. Copia la URL **TLS** (`rediss://...`) → `REDIS_URL`.
3. QStash (misma cuenta) queda para 7.3: dos schedules cron `0 11 * * *` y `0 23 * * *` (TZ Madrid) hacia el webhook firmado que exponga la API.

### 2.3 Fly.io (motor Python) — 10 min
```bash
brew install flyctl && fly auth signup        # una vez
cd football-manager/engine
fly launch --copy-config --no-deploy          # usa engine/fly.toml; acepta o cambia el nombre
fly deploy
curl https://<app>.fly.dev/health             # → {"status":"ok"}
```
- `auto_stop` está activado: la VM duerme sin tráfico y despierta en el primer `/simulate` (~1 s). El backend tiene fallback al motor TS, así que un cold start nunca rompe el turno. Si molesta, `min_machines_running = 1` (sigue en el free tier).
- El motor es stateless: sin secretos, sin BD, redeploy sin miedo.

### 2.4 Koyeb (API Fastify) — 15 min
1. Cuenta en koyeb.com → Create Service → GitHub → repo del proyecto.
2. Builder: **Dockerfile** → `football-manager/server/Dockerfile.backend`, contexto `football-manager/`.
3. Instancia **Eco Free** (no hiberna → WS vivos), región Frankfurt, puerto expuesto **3001**, health check HTTP `/health`.
4. Variables de entorno: bloque "API Fastify (Koyeb)" de `.env.production.example` (JWT_SECRET nuevo, DATABASE_URL pooled de Neon, REDIS_URL de Upstash, ENGINE_URL de Fly, CORS_ORIGINS con el dominio de Vercel).
5. Despliega y verifica: `curl https://<app>.koyeb.app/health`.

### 2.5 Vercel (frontend) — 10 min
1. Cuenta en vercel.com → Add New Project → mismo repo.
2. **Root Directory: `football-manager`** (ahí están `vercel.json` y `package.json`). Framework: Vite (lo autodetecta; `vercel.json` ya trae build, SPA-rewrite y caché de assets).
3. Environment Variable (Production): `VITE_API_URL=https://<app>.koyeb.app/api`.
4. Deploy → apunta el dominio final y **vuelve a Koyeb** a poner ese dominio exacto en `CORS_ORIGINS` (sin barra final).

---

## 3. Verificación post-despliegue

1. `https://<app>.koyeb.app/health` → 200.
2. `https://<app>.fly.dev/health` → 200 (puede tardar ~1 s si dormía).
3. Abre el frontend → login con la cuenta master del seed → **`/diagnostics`**: los ~27 endpoints en verde.
4. WS: en una subasta abierta el indicador de sala debe decir "🟢 en vivo" (si dice "🟡 refresco", revisa que Koyeb permita WebSocket en el dominio y que `VITE_API_URL` sea https → el cliente deriva wss automáticamente).
5. Fuerza un turno desde `/admin` y comprueba que el partido trae timeline (motor Python) y no solo resultado (fallback TS).

## 4. Alarmas de coste (hazlo el día 1)

- Fly.io → Billing → spend limit / alerta a **5 €**.
- Upstash y Neon → alertas de cuota (10k comandos/día y 500 MB).
- Koyeb Eco Free y Vercel Hobby no facturan solos, pero revisa los límites al pasar de ~1.000 mánagers (estimación: 65–110 €/mes, ver ROADMAP §9).

## 5. Problemas conocidos

| Síntoma | Causa | Arreglo |
|---|---|---|
| Frontend carga pero la API da error CORS | `CORS_ORIGINS` sin el dominio de Vercel o con barra final | Corrige la variable en Koyeb y redeploy |
| `Route not found` al abrir la URL de Koyeb | La API solo sirve el frontend compilado con `NODE_ENV=production`; en esta arquitectura el frontend vive en Vercel | Es normal: usa el dominio de Vercel |
| Subastas siempre en "🟡 refresco" | WS bloqueado o `VITE_API_URL` en http | Confirma wss en DevTools→Network y https en la variable |
| Partidos sin timeline/notas | Motor Fly dormido + timeout corto | Sube `ENGINE_TIMEOUT_MS` (8000) o `min_machines_running=1` |
| `prisma migrate` falla contra Neon | Estás usando la cadena pooled | Migraciones siempre con la cadena directa |

## 6. Reparto restante de la Fase 7

- **7.1** repo git limpio (Jaime + Claude) — bloquea Vercel/Koyeb.
- **7.3** turno blindado — **CÓDIGO HECHO** (Claude, 10 jun 2026), desactivado tras flag hasta Z3; ver §7.3.
- **7.x** migraciones+seed contra Neon, `directUrl` en schema, limpieza para 500 MB (Antigravity).
- **7.5** beta cerrada (Jaime).

## 7.3 Turno blindado (implementado, tras flag `TICK_QUEUE`)

El pipeline QStash → cola Redis → worker vive en `server/src/modules/game/tick.queue.ts`
(dependencia nueva: `ioredis`). **Por defecto está APAGADO** (`TICK_QUEUE=off`): el
cron interno funciona exactamente igual que siempre. Z3 lo activa en producción.

**Flujo con `TICK_QUEUE=on`:**

```
QStash 11:00/23:00 ──POST /api/tick/enqueue (header x-tick-key)──▶ API
Cron interno ─────────enqueueTick(slot,'cron')───────────────────▶ cola tick:queue (Redis)
                                                                   │ dedupe slot/día (SET NX)
Worker (BLMOVE) ◀──────────────────────────────────────────────────┘
  ├─ lock tick:lock (NX+EX) → solo un worker procesa a la vez
  ├─ gameService.processTick()  ← idempotente (prevInGameDate + claims + uniques)
  ├─ fallo → reintento con backoff (TICK_QUEUE_RETRY_MS × intento), máx TICK_QUEUE_MAX_ATTEMPTS
  ├─ agotado → tick:dlq (job + historial de errores) — ALERTAR sobre esta lista
  └─ crash a mitad → al reiniciar, lo que quedó en tick:processing se re-encola (re-ejecutar es seguro)
```

**Contrato HTTP** (ambos exigen header `x-tick-key: $TICK_WEBHOOK_SECRET`; con el flag off responden 409):

| Endpoint | Body | Respuesta |
|---|---|---|
| `POST /api/tick/enqueue` | `{ "slot": "T1" }` opcional (se infiere por hora UTC) | `{ ok, enqueued, jobId }` — `enqueued:false` si el slot ya entró hoy |
| `GET /api/tick/status` | — | `{ queued, processing, dlq, last }` (profundidades + última ejecución) |

**Configuración QStash (al activar en Z3):** dos schedules `0 11 * * *` y `0 23 * * *`
(TZ Madrid) → URL `https://<app>.koyeb.app/api/tick/enqueue`, con header
`Upstash-Forward-x-tick-key: <TICK_WEBHOOK_SECRET>`. Los reintentos de QStash son
inocuos: el dedupe por slot/día absorbe duplicados. Dejar `TICK_ENABLED=true`
también es seguro (el cron interno encola en la misma cola, mismo dedupe) y sirve
de red de seguridad si QStash falla.

**Variables nuevas** (bloque "Turno blindado" de `.env.production.example`):
`TICK_QUEUE`, `TICK_WEBHOOK_SECRET`, `TICK_QUEUE_MAX_ATTEMPTS`, `TICK_QUEUE_RETRY_MS`,
`TICK_QUEUE_LOCK_TTL_S` (reutiliza `REDIS_URL`).

**Monitorización mínima:** alerta si `GET /api/tick/status` devuelve `dlq > 0` o si
`last.status = "error"` — eso es un turno que necesitó intervención.

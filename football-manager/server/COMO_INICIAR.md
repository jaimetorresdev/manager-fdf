# Cómo Inicializar y Arrancar (Manager FDF v2)

Este documento contiene las instrucciones precisas para levantar el backend local, el servidor Node.js y el Motor de Partido Python sin errores. 

## Prerrequisitos
- Node.js v18+ 
- Docker Desktop
- Python 3.11+ (para el motor)

## 1. Stack en Docker (Base de Datos + Redis + Engine)
Levanta la infraestructura base. Esto incluirá PostgreSQL, Redis y el motor Python (FastAPI).

```bash
cd football-manager
docker compose up -d
```

Espera unos segundos y asegúrate de que el contenedor de PostgreSQL esté saludable.
Asegúrate de que el contenedor `engine` esté corriendo en el puerto 8000.

## 2. Configurar Entorno en Server
Entra en la carpeta del servidor.

```bash
cd server
npm install
```

Copia `.env.example` a `.env` si no lo has hecho:
```bash
cp .env.example .env
```
Y añade o edita esta línea en el `.env` para apuntar al engine local:
```env
ENGINE_URL=http://localhost:8000
```

## 3. Poblado de la Base de Datos (Seed)
Aplica las migraciones de Prisma y rellena la base de datos con los datos iniciales reales.

```bash
npx prisma generate
npx prisma db push
```

¡Importante! Para el seed, debes ejecutar el script con la configuración del entorno para no tener problemas de conexión:
```bash
npx ts-node -r dotenv/config prisma/seed.ts
```

> **Nota sobre NODE_ENV:** Si estás usando docker compose pero no quieres usar la versión dockerizada del backend (solo quieres la BD), usa el comando `npm run start:dev` o `npm run dev` en el host, y asegúrate de no tener configurado NODE_ENV=production, ya que podría interferir en cómo carga las variables el servidor web.

## 4. Ejecutar el Servidor Backend Localmente
Para probar el stack y jugar:

```bash
npm run dev
```
El backend estará disponible en `http://localhost:3000`.

## 5. Simular y probar el Turno Local (QA)
Hemos habilitado un script manual para depurar problemas y simular un tick completo (simula los partidos y el paso de jornada). Asegúrate de tener el juego "Desbloqueado" en la base de datos (isLocked = false). 
Para ejecutar un tick manualmente y diagnosticar problemas del motor:

```bash
docker compose exec postgres psql -U fdf -d managerfdf -c 'UPDATE "GameState" SET "isLocked" = false;'
npx ts-node -r dotenv/config test-tick.ts
```

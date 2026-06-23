# ─── Manager FDF — Servicio del motor de partido (FastAPI) ────────────────────
# Expone el motor v3 por HTTP. El backend Node lo llama en cada simulación de
# partido (con fallback al motor TS si este servicio no responde).
#
# Arranque local:  uvicorn app.main:app --reload --port 8000
# Healthcheck:     GET  /health
# Simulación:      POST /simulate   (body = SimulateRequest)
# Desarrollo:      POST /develop    (body = DevelopRequest) — evolución de plantillas

import hmac
import os

from fastapi import FastAPI, HTTPException, Request

from .development import develop_squad
from .engine import simulate
from .manager_ai import pick_lineup
from .models import (BatchSimulateRequest, BatchSimulationResult, DevelopRequest,
                     DevelopResponse, LineupRequest, LineupResponse,
                     SimulateRequest, SimulationResult)

app = FastAPI(title="Manager FDF — Match Engine", version="3.0.0")

# AUDIT-2026 §8 P1: auth OPCIONAL por clave compartida. Si ENGINE_API_KEY está
# definida, todas las rutas (salvo /health) exigen el header X-Engine-Key.
# Sin la variable, el comportamiento es el de siempre (red interna de compose).
_API_KEY = os.environ.get("ENGINE_API_KEY", "")


@app.middleware("http")
async def _require_api_key(request: Request, call_next):
    if _API_KEY and request.url.path != "/health":
        provided = request.headers.get("x-engine-key", "")
        if not hmac.compare_digest(provided, _API_KEY):
            from fastapi.responses import JSONResponse
            return JSONResponse(status_code=401, content={"error": "Clave de motor inválida o ausente."})
    return await call_next(request)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "engine": "v3", "version": app.version}


@app.post("/simulate", response_model=SimulationResult)
def simulate_match(req: SimulateRequest) -> dict:
    return simulate(req.homeTeam, req.awayTeam, req.seed, knockout=req.knockout,
                    weatherCondition=req.weatherCondition, temperature=req.temperature,
                    attendancePct=req.attendancePct, homeStimulated=req.homeStimulated)


@app.post("/simulate-batch", response_model=BatchSimulationResult)
def simulate_batch(req: BatchSimulateRequest) -> dict:
    """(C8) Simula una JORNADA completa en una sola llamada HTTP: elimina el
    roundtrip por partido del tick. Cada item ecoa su matchId de correlación."""
    return {"results": [
        {"matchId": m.matchId,
         "result": simulate(m.homeTeam, m.awayTeam, m.seed, knockout=m.knockout,
                            weatherCondition=m.weatherCondition, temperature=m.temperature,
                            attendancePct=m.attendancePct, homeStimulated=m.homeStimulated)}
        for m in req.matches
    ]}


@app.post("/develop", response_model=DevelopResponse)
def develop(req: DevelopRequest) -> dict:
    ctx = req.context.model_dump()
    return {"results": develop_squad(req.players, ctx, req.seed)}


@app.post("/lineup", response_model=LineupResponse)
def lineup(req: LineupRequest) -> dict:
    return pick_lineup(req.players, req.objective, req.seed)

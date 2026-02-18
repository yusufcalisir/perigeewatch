from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from app.core.config import settings
from app.api.api import api_router
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from datetime import datetime
import asyncio
import logging


logger = logging.getLogger(__name__)

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Space Situational Awareness (SSA) platform API — real-time satellite tracking, conjunction assessment, reentry prediction, and orbital analytics.",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    contact={
        "name": "PerigeeWatch Team",
        "url": "https://github.com/perigee-watch",
    },
    license_info={
        "name": "MIT",
    },
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "https://perigee-watch.vercel.app"],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(GZipMiddleware, minimum_size=1000)

@app.get("/")
def root_health_check():
    """Safe health check independent of database."""
    return {"status": "ok", "service": "PerigeeWatch API"}

@app.get("/health")
def health_check():
    return {"status": "ok"}

app.include_router(api_router, prefix=settings.API_V1_STR)

@app.get("/{file_path:path}")
def catch_all_statics(file_path: str):
    """
    Fallback for static assets that might erroneously hit the backend.
    Returns 404 to avoid 401/500 errors.
    """
    if any(file_path.endswith(ext) for ext in [".js", ".css", ".png", ".svg", ".ico", ".jpg", ".jpeg", ".woff", ".woff2", ".ttf"]):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Static file not found on backend")
    
    # Optional: You might want to let other paths 404 naturally or handle generic catch-all
    from fastapi import HTTPException
    raise HTTPException(status_code=404, detail="Not Found")


# ── WebSocket: Real-Time Position Stream ──────────────────
class ConnectionManager:
    """Manages active WebSocket connections."""

    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, data: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(data)
            except Exception:
                pass


manager = ConnectionManager()


@app.websocket("/ws/positions")
async def websocket_positions(websocket: WebSocket):
    """
    WebSocket endpoint that streams satellite positions at regular intervals.
    Client can send JSON with:
      - interval: update interval in seconds (default 5, min 2, max 60)
      - limit: max satellites (default 200)
    """
    try:
        await manager.connect(websocket)
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected immediately")
        return

    interval = 5
    limit = 200

    try:
        # Check for client config message (non-blocking)
        try:
            config = await asyncio.wait_for(websocket.receive_json(), timeout=1.0)
            interval = max(2, min(60, config.get("interval", 5)))
            limit = max(1, min(2000, config.get("limit", 200)))
        except asyncio.TimeoutError:
            pass
        except WebSocketDisconnect:
            # Client disconnected during config wait
            manager.disconnect(websocket)
            return

        while True:
            # Import here to avoid circular deps and allow lazy DB access
            from app.db.session import SessionLocal
            from app.models.tle import TLE
            from app.models.satellite import Satellite
            from app.services.propagation import propagate_batch
            from sqlalchemy import func

            db = SessionLocal()
            try:
                now = datetime.utcnow()

                subquery = db.query(
                    TLE.satellite_id,
                    func.max(TLE.epoch).label("max_epoch")
                ).group_by(TLE.satellite_id).subquery()

                tles = db.query(TLE).join(
                    subquery,
                    (TLE.satellite_id == subquery.c.satellite_id) &
                    (TLE.epoch == subquery.c.max_epoch)
                ).order_by(TLE.satellite_id).limit(limit).all()

                if tles:
                    sat_ids = [t.satellite_id for t in tles]
                    sats = db.query(Satellite.id, Satellite.norad_id).filter(
                        Satellite.id.in_(sat_ids)
                    ).all()
                    id_map = {s.id: s.norad_id for s in sats}

                    results = propagate_batch(tles, now)
                    positions = []
                    for res in results:
                        positions.append({
                            "norad_id": id_map.get(res["sat_id"]),
                            "lat": res["lat"],
                            "lon": res["lon"],
                            "alt": res["alt"],
                            "velocity": res["velocity"],
                        })

                    await websocket.send_json({
                        "type": "positions",
                        "timestamp": now.isoformat() + "Z",
                        "count": len(positions),
                        "data": positions,
                    })
            except WebSocketDisconnect:
                # Re-raise to be caught by outer handler or break immediately
                raise 
            except RuntimeError as e:
                # Often "no close frame received or sent" or "Unexpected ASGI message"
                # Treat as disconnect
                logger.info(f"WebSocket runtime error (disconnecting): {e}")
                break
            except Exception as e:
                error_str = str(e)
                if "no close frame received or sent" in error_str or "Unexpected ASGI message" in error_str:
                    logger.info(f"WebSocket disconnected (runtime error): {e}")
                    break
                logger.error(f"WebSocket position update error: {e}")
                # Don't try to send error back, just log. 
                # If persistent, maybe break? For now, continue but maybe slow down?
                pass 
            finally:
                db.close()

            await asyncio.sleep(interval)

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected")
    except Exception as e:
        logger.error(f"WebSocket unhandled error: {e}")
    finally:
        try:
            manager.disconnect(websocket)
        except ValueError:
            pass

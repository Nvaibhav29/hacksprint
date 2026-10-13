"""
FastAPI application entry point.
"""
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.routes import upload_call, get_tickets, dashboard_stats

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

app = FastAPI(
    title="MedRoute AI — Healthcare Call Intelligence",
    description="Audio call → ASR → LLM → Structured action tickets routed to departments.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS — allow frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routes
app.include_router(upload_call.router, prefix="/api/calls", tags=["Calls"])
app.include_router(get_tickets.router, prefix="/api", tags=["Tickets"])
app.include_router(dashboard_stats.router, prefix="/api", tags=["Dashboard"])


@app.get("/health", tags=["System"])
async def health():
    return {"status": "ok", "service": "medroute-ai"}

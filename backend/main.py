"""Aver — AI Oral Assessment Platform"""

import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

load_dotenv()

from db.database import init_db
from api.auth import router as auth_router
from api.assessments import router as assessments_router
from api.sessions import router as sessions_router
from api.signaling import router as signaling_router
from api.dashboard import router as dashboard_router
from api.students import router as students_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Aver backend")
    await init_db()
    yield
    logger.info("Shutting down Aver backend")


app = FastAPI(
    title="Aver API",
    description="AI Oral Assessment Platform",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — comma-separated origins from env (e.g. "https://app.argo.edu,https://www.argo.edu")
_cors_origins = [
    o.strip() for o in os.getenv("FRONTEND_URLS", "http://localhost:3000,http://localhost:3001").split(",") if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routes
app.include_router(auth_router, prefix="/api")
app.include_router(assessments_router, prefix="/api")
app.include_router(sessions_router, prefix="/api")
app.include_router(signaling_router, prefix="/api")
app.include_router(dashboard_router, prefix="/api")
app.include_router(students_router, prefix="/api")

# Mount dev-only endpoints
if os.getenv("ENVIRONMENT", "development") == "development":
    from api.dev import router as dev_router
    app.include_router(dev_router, prefix="/api")
    logger.info("Dev API endpoints mounted at /api/dev/*")


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}

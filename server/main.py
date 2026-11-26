"""FastAPI entrypoint for the academic-calendar automation service.

Exposes the agent pipeline (plan -> validate -> persist) over HTTP so a
frontend can request a generated calendar instead of one being
hand-typed into a spreadsheet.

Run locally with:
    uvicorn main:app --reload --port 8000
(from this directory, so the `agent` package resolves).

Configuration is read from a local .env file -- copy .env.example to .env
and fill it in.

Routes live in routes/*.py, grouped by what they're about (auth,
taxonomy, calendars) rather than all in this one file. taxonomy is
included before calendars deliberately -- see routes/taxonomy.py's
docstring for why the registration order matters.
"""
from dotenv import load_dotenv

load_dotenv()

import logging
import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pymongo.errors import PyMongoError

logger = logging.getLogger("calendar.main")

from routes import auth, calendars, org_units, taxonomy

app = FastAPI(title="Academic Calendar Automation")

# Comma-separated list of allowed origins (e.g. the Vercel URL in
# production) -- defaults to the local Vite dev server only, never "*".
_allowed_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Two safety nets so a MongoDB blip or an unanticipated bug never reaches a
# client as a raw traceback/driver error -- FastAPI's own HTTPException
# handling (used everywhere in routes/*.py) is more specific and still
# takes precedence over both of these.
@app.exception_handler(PyMongoError)
async def mongo_error_handler(request: Request, exc: PyMongoError):
    logger.error("Database error on %s: %s", request.url.path, exc)
    return JSONResponse(status_code=503, content={"detail": "Database temporarily unavailable. Please try again shortly."})


@app.exception_handler(Exception)
async def unhandled_error_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s", request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Something went wrong. Please try again."})


@app.get("/health")
def health():
    """Basic liveness check."""
    return {"status": "ok"}


app.include_router(auth.router)
app.include_router(taxonomy.router)
app.include_router(calendars.router)
app.include_router(org_units.router)

"""
Chatbot backend API.

Exposes POST /api/chat, matching the frontend's contract:
  Request:  { "message": "<user text>" }
  Response: { "response": "<agent's reply>" }

Messages are forwarded to a local LLM served by Ollama (see agent.py).
Every turn is auto-saved to MongoDB (see db.py) regardless of the LLM's behavior.
"""

import logging
import os
import time
from collections import defaultdict, deque

from dotenv import load_dotenv
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.httpsredirect import HTTPSRedirectMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, ValidationError

load_dotenv()

import agent
import db

logger = logging.getLogger(__name__)

app = FastAPI(title="Ledgr Chatbot Backend")

MAX_MESSAGE_LENGTH = 4000  # keep in sync with ui/src/constants.ts

# Off by default so local HTTP dev keeps working; set FORCE_HTTPS=true behind a
# real TLS-terminating deployment (reverse proxy, load balancer, etc.).
if os.getenv("FORCE_HTTPS", "false").lower() == "true":
    app.add_middleware(HTTPSRedirectMiddleware)


# Fixed-window rate limit per client IP, to slow down basic chat spam/flooding.
RATE_LIMIT_MAX_REQUESTS = 20
RATE_LIMIT_WINDOW_SECONDS = 60
_request_log: dict[str, deque[float]] = defaultdict(deque)


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    if request.url.path == "/api/chat":
        client_ip = request.client.host if request.client else "unknown"
        now = time.monotonic()
        log = _request_log[client_ip]
        while log and now - log[0] > RATE_LIMIT_WINDOW_SECONDS:
            log.popleft()
        if len(log) >= RATE_LIMIT_MAX_REQUESTS:
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={"error": "Too many requests. Please slow down and try again shortly."},
            )
        log.append(now)
    return await call_next(request)


@app.on_event("startup")
async def on_startup() -> None:
    # Mirrors save_turn's resilience (main.py chat()): a Mongo outage at boot
    # must not take down the whole API, since chat itself doesn't depend on it.
    try:
        await db.ensure_indexes()
    except Exception:
        logger.exception("Failed to ensure MongoDB indexes at startup")


# Enable CORS for local dev so the Vite frontend (different port) can call this API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=MAX_MESSAGE_LENGTH)


class ChatResponse(BaseModel):
    response: str


class ChatError(BaseModel):
    error: str


@app.exception_handler(ValidationError)
async def validation_exception_handler(request: Request, exc: ValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content=ChatError(
            error=f"Invalid request: 'message' must be a non-empty string of at most {MAX_MESSAGE_LENGTH} characters."
        ).model_dump(),
    )


@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: Request) -> ChatResponse | JSONResponse:
    try:
        body = await request.json()
    except Exception:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ChatError(error="Invalid request: body must be valid JSON.").model_dump(),
        )

    try:
        chat_request = ChatRequest.model_validate(body)
    except ValidationError:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ChatError(
            error=f"Invalid request: 'message' must be a non-empty string of at most {MAX_MESSAGE_LENGTH} characters."
        ).model_dump(),
        )

    try:
        reply = await agent.run(chat_request.message)
    except agent.AgentError as exc:
        return JSONResponse(
            status_code=status.HTTP_502_BAD_GATEWAY,
            content=ChatError(error=str(exc)).model_dump(),
        )

    try:
        await db.save_turn(chat_request.message, reply)
    except Exception:
        logger.exception("Failed to auto-save conversation turn to MongoDB")

    return ChatResponse(response=reply)

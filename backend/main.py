"""
Chatbot backend API.

Exposes POST /api/chat, matching the frontend's contract:
  Request:  { "message": "<user text>" }
  Response: { "response": "<agent's reply>" }

Messages are forwarded to a local LLM served by Ollama (see agent.py).
Every turn is auto-saved to MongoDB (see db.py) regardless of the LLM's behavior.
"""

import logging

from dotenv import load_dotenv
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, ValidationError

load_dotenv()

import agent
import db

logger = logging.getLogger(__name__)

app = FastAPI(title="AG-AI Chatbot Backend")


@app.on_event("startup")
async def on_startup() -> None:
    await db.ensure_indexes()


# Enable CORS for local dev so the Vite frontend (different port) can call this API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1)


class ChatResponse(BaseModel):
    response: str


class ChatError(BaseModel):
    error: str


@app.exception_handler(ValidationError)
async def validation_exception_handler(request: Request, exc: ValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content=ChatError(error="Invalid request: 'message' must be a non-empty string.").model_dump(),
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
            content=ChatError(error="Invalid request: 'message' must be a non-empty string.").model_dump(),
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

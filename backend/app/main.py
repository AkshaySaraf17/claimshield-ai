from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.graph import agent_engine
from app.schemas import IngestionPayload, AppealResponse, DenialSummary

app = FastAPI(
    title="ClaimShield AI - Multi-Agent Core REST Service",
    description="Zero-cost bootstrapped backend appeal generator.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    return {"status": "ok", "llm_provider": settings.llm_provider}


@app.post("/api/appeal", response_model=AppealResponse)
async def generate_appeal_endpoint(payload: IngestionPayload):
    try:
        initial_state = {
            "raw_denial_text": payload.denial_text,
            "raw_clinical_notes": payload.clinical_notes,
        }
        final_state = await agent_engine.ainvoke(initial_state)

        return AppealResponse(
            status="success",
            denial_summary=DenialSummary(
                denial_code=final_state.get("denial_code", "UNKNOWN"),
                denial_reason=final_state.get("denial_reason", ""),
                payer_name=final_state.get("payer_name", ""),
                amount_denied=final_state.get("amount_denied", 0.0),
            ),
            generated_appeal=final_state.get("final_appeal_letter", ""),
            requires_human_review=True,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)

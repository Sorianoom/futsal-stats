from fastapi import FastAPI

app = FastAPI(title="Futsal Stats")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}

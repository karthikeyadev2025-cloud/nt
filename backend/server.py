from fastapi import FastAPI
app = FastAPI()

@app.get("/api/health")
def health():
    return {"ok": True, "note": "This project is a Vite/React/Supabase SPA — the real app is on the frontend."}

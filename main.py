"""Main entry point — run with: python main.py"""
import uvicorn
from config import get_settings

if __name__ == "__main__":
    s = get_settings()
    uvicorn.run(
        "backend.app:app",
        host=s.app_host,
        port=s.app_port,
        reload=True,
        log_level="info",
    )

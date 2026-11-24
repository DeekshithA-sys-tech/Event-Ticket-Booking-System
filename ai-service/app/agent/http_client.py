from typing import Any, Dict, Optional
import httpx

from app.core.config import settings
from app.core.logging import logger


class ExpressServiceClient:
    """
    HTTP Client for calling Express Backend Gateway endpoints.
    Propagates the user's JWT Bearer token so backend RBAC stays authoritative.
    """

    def __init__(self, base_url: str = settings.EXPRESS_BASE_URL):
        self.base_url = base_url.rstrip("/")

    def _headers(self, token: Optional[str] = None) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        return headers

    async def get(
        self, endpoint: str, token: Optional[str] = None, params: Optional[Dict] = None
    ) -> Dict[str, Any]:
        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        async with httpx.AsyncClient(timeout=8.0) as client:
            try:
                res = await client.get(url, headers=self._headers(token), params=params)
                if res.status_code < 400:
                    return res.json()
                logger.warn(f"[ExpressClient] GET {endpoint} returned {res.status_code}: {res.text}")
                return {"success": False, "statusCode": res.status_code, "message": res.text}
            except Exception as e:
                logger.error(f"[ExpressClient] GET {endpoint} failed: {e}")
                return {"success": False, "error": str(e)}

    async def post(
        self, endpoint: str, body: Dict[str, Any], token: Optional[str] = None
    ) -> Dict[str, Any]:
        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        async with httpx.AsyncClient(timeout=8.0) as client:
            try:
                res = await client.post(url, headers=self._headers(token), json=body)
                if res.status_code < 400:
                    return res.json()
                logger.warn(f"[ExpressClient] POST {endpoint} returned {res.status_code}: {res.text}")
                return {"success": False, "statusCode": res.status_code, "message": res.text}
            except Exception as e:
                logger.error(f"[ExpressClient] POST {endpoint} failed: {e}")
                return {"success": False, "error": str(e)}


express_client = ExpressServiceClient()

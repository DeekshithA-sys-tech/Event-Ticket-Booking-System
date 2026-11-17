"""
Async HTTP Client for invoking Express REST API Endpoints.
"""
from typing import Any, Dict, Optional
import httpx
from app.config import settings


class ExpressClient:
    def __init__(self, base_url: Optional[str] = None):
        self.base_url = base_url or settings.EXPRESS_API_URL

    def _get_headers(self, token: Optional[str] = None) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}" if not token.startswith("Bearer ") else token
        return headers

    async def get(
        self, endpoint: str, params: Optional[Dict[str, Any]] = None, token: Optional[str] = None
    ) -> Dict[str, Any]:
        url = f"{self.base_url.rstrip('/')}/{endpoint.lstrip('/')}"
        headers = self._get_headers(token)
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                response = await client.get(url, params=params, headers=headers)
                return response.json()
            except httpx.RequestError as e:
                return {"success": False, "message": f"Express connection error: {str(e)}", "data": None}

    async def post(
        self, endpoint: str, json_data: Optional[Dict[str, Any]] = None, token: Optional[str] = None
    ) -> Dict[str, Any]:
        url = f"{self.base_url.rstrip('/')}/{endpoint.lstrip('/')}"
        headers = self._get_headers(token)
        async with httpx.AsyncClient(timeout=15.0) as client:
            try:
                response = await client.post(url, json=json_data, headers=headers)
                return response.json()
            except httpx.RequestError as e:
                return {"success": False, "message": f"Express connection error: {str(e)}", "data": None}


express_client = ExpressClient()

"""
AI Tools package: exports tool registry with all tools auto-registered.
"""
from app.tools.registry import tool_registry
import app.tools.search_tools
import app.tools.seat_tools
import app.tools.booking_tools
import app.tools.analytics_tools

__all__ = ["tool_registry"]

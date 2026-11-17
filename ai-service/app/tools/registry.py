"""
Tool Registry for managing and dispatching AI Tools with Role-Based Access Control
and Two-Phase Human Confirmation handling.
"""
from typing import Any, Callable, Dict, List, Optional
from pydantic import BaseModel, Field


class ToolDefinition(BaseModel):
    name: str
    description: str
    parameters: Dict[str, Any]
    allowed_roles: List[str] = Field(default_factory=lambda: ["customer", "organizer", "admin"])
    requires_confirmation: bool = False
    # Handler is kept in registry dict rather than pydantic model for simplicity


class ToolRegistry:
    def __init__(self):
        self._tools: Dict[str, ToolDefinition] = {}
        self._handlers: Dict[str, Callable] = {}

    def register(
        self,
        name: str,
        description: str,
        parameters: Dict[str, Any],
        handler: Callable,
        allowed_roles: Optional[List[str]] = None,
        requires_confirmation: bool = False,
    ):
        tool_def = ToolDefinition(
            name=name,
            description=description,
            parameters=parameters,
            allowed_roles=allowed_roles or ["customer", "organizer", "admin"],
            requires_confirmation=requires_confirmation,
        )
        self._tools[name] = tool_def
        self._handlers[name] = handler

    def get_tools_for_role(self, role: str) -> List[Dict[str, Any]]:
        """Returns tool schema declarations for tools accessible to the given role."""
        role_norm = (role or "customer").lower()
        accessible = []
        for name, tool in self._tools.items():
            if role_norm in [r.lower() for r in tool.allowed_roles]:
                accessible.append({
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": tool.parameters,
                    "requires_confirmation": tool.requires_confirmation,
                })
        return accessible

    def get_tool(self, name: str) -> Optional[ToolDefinition]:
        return self._tools.get(name)

    async def execute_tool(
        self,
        name: str,
        args: Dict[str, Any],
        auth_token: Optional[str] = None,
        user_context: Optional[Dict[str, Any]] = None,
        confirmation_state: Optional[Any] = None,
    ) -> Dict[str, Any]:
        """
        Executes a registered tool.
        If the tool requires confirmation and confirmation is not yet granted,
        returns a pending_confirmation structure.
        """
        if name not in self._tools:
            return {
                "success": False,
                "error": f"Tool '{name}' is not recognized.",
                "data": None,
            }

        tool_def = self._tools[name]
        user_role = (user_context or {}).get("role", "customer").lower()

        # RBAC Check
        if user_role not in [r.lower() for r in tool_def.allowed_roles]:
            return {
                "success": False,
                "error": f"Permission denied: Action '{name}' is not permitted for role '{user_role}'.",
                "data": None,
            }

        handler = self._handlers[name]

        # Two-Phase Confirmation Check
        if tool_def.requires_confirmation:
            is_confirmed = False
            if confirmation_state:
                # Can be a ConfirmationState object or dict
                if hasattr(confirmation_state, "confirmed"):
                    is_confirmed = confirmation_state.confirmed and (confirmation_state.action == name)
                elif isinstance(confirmation_state, dict):
                    is_confirmed = confirmation_state.get("confirmed", False) and (confirmation_state.get("action") == name)

            if not is_confirmed:
                # Return confirmation requirement
                summary = await self._generate_confirmation_summary(name, args, auth_token)
                return {
                    "requires_confirmation": True,
                    "action": name,
                    "summary": summary,
                    "payload": args,
                }

        # Execute handler
        try:
            result = await handler(args=args, auth_token=auth_token, user_context=user_context)
            return result
        except Exception as e:
            return {
                "success": False,
                "error": f"Error executing tool '{name}': {str(e)}",
                "data": None,
            }

    async def _generate_confirmation_summary(
        self, tool_name: str, args: Dict[str, Any], auth_token: Optional[str]
    ) -> str:
        """Generates human-readable summary for actions requiring confirmation."""
        if tool_name == "create_booking":
            event_id = args.get("event_id", "N/A")
            seat_ids = args.get("seat_ids", [])
            seats_str = ", ".join(seat_ids) if isinstance(seat_ids, list) else str(seat_ids)
            return f"Please confirm reservation of {len(seat_ids)} seat(s) ({seats_str}) for Event `{event_id}`."
        elif tool_name == "cancel_booking":
            booking_id = args.get("booking_id", "N/A")
            return f"Please confirm cancellation of Booking `{booking_id}`. This action is irreversible and will trigger a refund."
        return f"Please confirm execution of '{tool_name}' with parameters {args}."


tool_registry = ToolRegistry()

"""Ephemeral domain window context manager.

Ensures the conversational agent only ever sees one question node's domain packet at a time.
When the session advances to a new node, the previous domain packet is stripped and the new 
one is injected. This is the core security mechanism.
"""

from loguru import logger


class ContextManager:
    """Manages the ephemeral domain window for the assessment session."""

    def __init__(self, session_plan: dict):
        self.plan = session_plan
        self.nodes = session_plan.get("nodes", {})
        self.current_node_id: str = session_plan.get("start_node_id", "")
        self._escalation_packets: dict[str, str] = {}

    def set_current_node(self, node_id: str):
        """Switch to a new node. Strips previous domain window, loads new one."""
        if node_id not in self.nodes:
            logger.warning(f"Node {node_id} not found in session plan")
            return

        self.current_node_id = node_id
        self._escalation_packets.clear()

        # Check for pre-planned cross-reference injection
        node = self.nodes[node_id]
        cross_refs = node.get("cross_reference_inject", [])
        for ref_node_id in cross_refs:
            if ref_node_id in self.nodes:
                self._escalation_packets[ref_node_id] = self.nodes[ref_node_id].get(
                    "domain_packet", ""
                )

        logger.debug(
            f"Domain window switched to node {node_id} "
            f"(escalation packets: {len(self._escalation_packets)})"
        )

    def get_current_domain_packet(self) -> str:
        """Returns the current node's domain packet plus any escalation packets."""
        if not self.current_node_id or self.current_node_id not in self.nodes:
            return ""

        current = self.nodes[self.current_node_id].get("domain_packet", "")

        if self._escalation_packets:
            escalation_context = "\n\n".join(
                f"[Cross-reference context:]\n{packet}"
                for packet in self._escalation_packets.values()
            )
            return f"{current}\n\n{escalation_context}"

        return current

    def get_current_rubric_descriptors(self) -> list[str]:
        """Returns the current node's rubric descriptors."""
        if not self.current_node_id or self.current_node_id not in self.nodes:
            return []
        return self.nodes[self.current_node_id].get("rubric_descriptors", [])

    def get_current_node(self) -> dict:
        """Returns the full current node configuration."""
        if not self.current_node_id or self.current_node_id not in self.nodes:
            return {}
        return self.nodes[self.current_node_id]

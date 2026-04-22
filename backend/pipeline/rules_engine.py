"""Rules engine — assessment state machine.

Sits in the Pipecat pipeline between STT and LLM. Manages:
- Ephemeral domain window injection (via ContextManager)
- Competency state and belief model updates (via evaluate_response function calls)
- Session plan navigation
- Transcript management
"""

import asyncio
import json
from datetime import datetime
from typing import Callable, Optional

from loguru import logger

from pipeline.context_manager import ContextManager
from pipeline.prompts import RUNTIME_SYSTEM_PROMPT, PHASE1_TEST_PROMPT, PHASE_DESCRIPTIONS


class SessionState:
    """In-memory state for an active assessment session."""

    def __init__(self):
        self.current_node_id: str = ""
        self.phase: int = 1
        self.turn_count: int = 0
        self.transcript: list[dict] = []
        self.evaluation_log: list[dict] = []
        self.belief_model: dict = {}
        self.competency_state: dict = {
            "foundation_scores": {},
            "scaffolding_needed": "unknown",
            "knowledge_ceiling": 0,
            "scaling_trajectory": "unknown",
            "transfer_quality": 0,
            "reasoning_structure": "unknown",
            "assumption_awareness": "unknown",
            "scenario_engagement": "unknown",
            "vocabulary_level": "unknown",
            "articulation_vs_understanding": False,
        }
        self.key_moments: list[dict] = []
        self.flags: list[dict] = []
        self.started_at: datetime = datetime.utcnow()
        self.audio_chunks: list[bytes] = []
        self._pacing_triggered: bool = False
        self._pacing_prompt_inject: str = ""

    @property
    def duration_seconds(self) -> int:
        return int((datetime.utcnow() - self.started_at).total_seconds())

    def to_dict(self) -> dict:
        return {
            "current_node_id": self.current_node_id,
            "phase": self.phase,
            "turn_count": self.turn_count,
            "transcript": self.transcript,
            "evaluation_log": self.evaluation_log,
            "belief_model": self.belief_model,
            "competency_state": self.competency_state,
            "key_moments": self.key_moments,
            "flags": self.flags,
            "duration_seconds": self.duration_seconds,
        }


class RulesEngine:
    """
    Assessment rules engine. Not a Pipecat FrameProcessor — it's called by
    the pipeline's orchestration code to manage state and build LLM context.
    
    The pipeline calls:
    - on_learner_turn(text) when the learner speaks → returns LLM messages
    - on_ai_turn(text) when the AI responds → updates transcript
    - on_evaluation(args) when the LLM calls evaluate_response() → updates state
    """

    def __init__(self, session_plan: Optional[dict] = None, on_criterion_advance: Optional[Callable] = None):
        self.state = SessionState()
        self.plan = session_plan
        self.ctx = ContextManager(session_plan) if session_plan else None
        self._use_session_plan = session_plan is not None
        self._pending_navigation: Optional[dict] = None
        self._on_criterion_advance = on_criterion_advance

        if self._use_session_plan:
            self.state.current_node_id = session_plan.get("start_node_id", "")

    def on_learner_turn(self, text: str) -> list[dict]:
        """
        Called when the learner finishes speaking.
        Applies any pending navigation, records the turn, builds LLM context.
        Returns the messages list to send to the LLM.
        """
        # Apply pending navigation from previous evaluation
        if self._pending_navigation:
            self._navigate(self._pending_navigation)
            self._pending_navigation = None

        # Record learner turn
        self.state.turn_count += 1
        self.state.transcript.append({
            "turn": self.state.turn_count,
            "role": "learner",
            "text": text,
            "timestamp": datetime.utcnow().isoformat(),
        })

        # Build LLM context
        return self._build_context(text)

    def on_ai_turn(self, text: str):
        """Called when the AI produces a text response. Records it in the transcript."""
        self.state.transcript.append({
            "turn": self.state.turn_count,
            "role": "ai",
            "text": text,
            "phase": self.state.phase,
            "node_id": self.state.current_node_id,
            "timestamp": datetime.utcnow().isoformat(),
        })

    def on_evaluation(self, eval_args: dict):
        """
        Called when the LLM's evaluate_response() function call is received.
        Updates belief model, competency state, and determines next navigation.
        """
        # Hard time limit enforcement (D-12) — check before any processing
        if self._check_hard_time_limit():
            self._pending_navigation = {"type": "end_session", "reason": "time_limit"}
            self.state.flags.append({
                "turn": self.state.turn_count,
                "flag": "hard_time_limit",
                "duration_seconds": self.state.duration_seconds,
            })
            logger.info(f"Session ending: hard time limit reached at {self.state.duration_seconds}s")
            return  # Skip all other evaluation processing

        # Log evaluation
        self.state.evaluation_log.append({
            "turn": self.state.turn_count,
            "node_id": self.state.current_node_id,
            "evaluation": eval_args,
        })

        # Resolve lo_id once for use in belief model and confidence adjustment
        lo_id = ""
        belief_update = eval_args.get("belief_update")
        if belief_update and self._use_session_plan:
            lo_id = belief_update.get("learning_outcome_id", "")
            if not lo_id and self.ctx:
                node = self.ctx.get_current_node()
                lo_id = node.get("learning_outcome_id", "unknown")

        # Update belief model
        if belief_update and self._use_session_plan and lo_id:
            if lo_id not in self.state.belief_model:
                self.state.belief_model[lo_id] = {
                    "understanding_level": "unknown",
                    "claims": [],
                    "gaps": [],
                    "scaffolding_needed": "unknown",
                    "confidence_signal": "",
                    "confidence": 1.0,
                    "last_assessed_turn": 0,
                }

            model = self.state.belief_model[lo_id]
            model["claims"].extend(belief_update.get("claims", []))
            model["gaps"].extend(belief_update.get("gaps", []))
            if "understanding_level" in belief_update:
                model["understanding_level"] = belief_update["understanding_level"]
            if "scaffolding_needed" in belief_update:
                model["scaffolding_needed"] = belief_update["scaffolding_needed"]
            if "confidence_signal" in belief_update:
                model["confidence_signal"] = belief_update["confidence_signal"]
            model["last_assessed_turn"] = self.state.turn_count

        # Qualitative signal: confidence adjustment (D-15)
        confidence_adj = eval_args.get("confidence_adjustment", 0)
        if confidence_adj and lo_id and lo_id in self.state.belief_model:
            current = self.state.belief_model[lo_id].get("confidence", 1.0)
            self.state.belief_model[lo_id]["confidence"] = max(0.0, current + confidence_adj)

        # Qualitative signal: observation passthrough (D-15) — engine does NOT read observation type
        if eval_args.get("observation"):
            self.state.evaluation_log[-1]["observation"] = eval_args["observation"]

        # Record key moment
        key_moment = eval_args.get("key_moment", "")
        if key_moment:
            self.state.key_moments.append({
                "turn": self.state.turn_count,
                "description": key_moment,
            })

        # Record flags (skip extraction_attempt — handled separately below)
        for flag in eval_args.get("flags", []):
            if flag == "extraction_attempt":
                continue
            self.state.flags.append({
                "turn": self.state.turn_count,
                "flag": flag,
            })

        # Extraction attempt: silent log + stay on current node (D-11)
        flags = eval_args.get("flags", [])
        if "extraction_attempt" in flags:
            logger.debug(f"Turn {self.state.turn_count}: extraction attempt detected, redirecting silently")
            self.state.flags.append({
                "turn": self.state.turn_count,
                "flag": "extraction_attempt",
                "node_id": self.state.current_node_id,
            })
            # Override navigation: stay on current node, do not advance
            self._pending_navigation = {"type": "stay"}
            return  # Skip normal navigation resolution

        # Check adaptive pacing on every evaluation (D-13)
        if self._check_adaptive_pacing():
            # Inject pacing message into next turn's context — the LLM will naturally
            # communicate the time adjustment to the student
            self.state.flags.append({
                "turn": self.state.turn_count,
                "flag": "pacing_triggered",
                "message": self.state._pacing_prompt_inject,
            })

        # Determine navigation for next turn
        next_action = eval_args.get("next_action", "follow_up")
        if self._use_session_plan:
            self._pending_navigation = self._resolve_navigation(next_action, eval_args)

            # Belief-model override: if understanding is established, advance past remaining
            # nodes for this LO even if the LLM said "stay" or "follow_up"
            if self._pending_navigation.get("type") == "stay" and self.ctx:
                override = self._check_belief_driven_advance()
                if override:
                    self._pending_navigation = override

        logger.debug(
            f"Turn {self.state.turn_count}: quality={eval_args.get('response_quality')}, "
            f"action={next_action}, flags={eval_args.get('flags', [])}"
        )

    def should_end_session(self) -> bool:
        """Check if the session should end."""
        elapsed = self.state.duration_seconds
        time_limit = (self.plan or {}).get("duration_target_minutes", 15) * 60

        # Hard stop at target + 2 min buffer
        if elapsed > time_limit + 120:
            return True

        # All LOs have been assessed with at least some understanding
        if self._use_session_plan and self.ctx and self._all_los_assessed():
            logger.info("All LOs assessed — session should end")
            return True

        # Session ended by navigation (belief-driven end)
        if self.state.phase == 99:
            return True

        # Check if last evaluation signaled end of final phase
        if self.state.evaluation_log:
            last_eval = self.state.evaluation_log[-1].get("evaluation", {})
            if last_eval.get("next_action") == "end_phase" and self.state.phase >= 5:
                return True

        return False

    def _build_context(self, learner_text: str) -> list[dict]:
        """Build the LLM messages context for this turn."""
        if self._use_session_plan and self.ctx:
            system_prompt = self._build_system_prompt()
        else:
            # Phase 1 testing: use hardcoded prompt
            system_prompt = PHASE1_TEST_PROMPT

        # Conversation history (last 10 turns to manage context size)
        history = []
        recent_turns = self.state.transcript[-20:]  # Last 20 entries (10 exchanges)
        for entry in recent_turns:
            if entry["role"] == "learner":
                history.append({"role": "user", "content": entry["text"]})
            elif entry["role"] == "ai":
                history.append({"role": "assistant", "content": entry["text"]})

        return [
            {"role": "system", "content": system_prompt},
            *history,
            {"role": "user", "content": learner_text},
        ]

    def _build_system_prompt(self) -> str:
        """Build the system prompt with ephemeral domain window."""
        node = self.ctx.get_current_node()
        return RUNTIME_SYSTEM_PROMPT.format(
            scaffold_type=self.plan.get("scaffold_type", "competency_map"),
            current_phase=self.state.phase,
            phase_description=PHASE_DESCRIPTIONS.get(self.state.phase, ""),
            question_instructions=node.get("question_instructions", "Ask the next question."),
            sample_questions="\n".join(f"- {q}" for q in node.get("sample_questions", [])),
            domain_packet=self.ctx.get_current_domain_packet(),
            rubric_descriptors="\n".join(f"- {d}" for d in self.ctx.get_current_rubric_descriptors()),
            follow_up_rules=json.dumps(node.get("follow_up_rules", []), indent=2),
            belief_model=json.dumps(self.state.belief_model, indent=2),
            competency_state_summary=json.dumps(self.state.competency_state, indent=2),
            structural_move=node.get("structural_move_before", "none"),
        )

    def _resolve_navigation(self, next_action: str, eval_args: dict) -> dict:
        """Resolve the LLM's next_action into a concrete navigation instruction."""
        # Fast-skip acceleration (D-10): one strong answer at a difficulty level skips remaining
        if self._use_session_plan and self.ctx:
            current_node = self.ctx.get_current_node()
            if self._should_fast_skip(current_node, eval_args):
                logger.debug(f"Turn {self.state.turn_count}: fast-skip triggered, advancing past difficulty level")
                next_id = self._get_next_node_id()
                if next_id:
                    return {"type": "advance", "target_node_id": next_id}

        # Adaptive pacing: skip if_time_permits nodes when pacing is triggered (D-13)
        if getattr(self.state, '_pacing_triggered', False) and self.ctx:
            target_node_id = eval_args.get("target_node_id") or self._get_next_node_id()
            if target_node_id:
                target_node = self.ctx.nodes.get(target_node_id, {})
                # Skip nodes marked as if_time_permits when under time pressure
                while target_node.get("priority") == "if_time_permits":
                    logger.debug(f"Pacing: skipping if_time_permits node {target_node_id}")
                    # Temporarily navigate to skip, then get next
                    old_current = self.state.current_node_id
                    self.state.current_node_id = target_node_id
                    target_node_id = self._get_next_node_id()
                    self.state.current_node_id = old_current
                    if not target_node_id:
                        break
                    target_node = self.ctx.nodes.get(target_node_id, {})

        if next_action == "advance":
            # Find next node from follow-up rules or sequential order
            node = self.ctx.get_current_node()
            for rule in node.get("follow_up_rules", []):
                if rule.get("condition") == eval_args.get("response_quality") and \
                   rule.get("action") == "advance":
                    return {"type": "advance", "target_node_id": rule.get("target_node_id")}
            # Fallback: next sequential node
            return {"type": "advance", "target_node_id": self._get_next_node_id()}

        elif next_action == "end_phase":
            return {"type": "phase_transition", "target_phase": self.state.phase + 1}

        elif next_action == "move_on":
            return {"type": "advance", "target_node_id": self._get_next_node_id()}

        return {"type": "stay"}

    def _navigate(self, navigation: dict):
        """Apply a navigation instruction."""
        if navigation["type"] == "stay":
            return

        if navigation["type"] == "advance":
            target_id = navigation.get("target_node_id")
            if target_id and target_id in self.ctx.nodes:
                target_node = self.ctx.nodes[target_id]
                if target_node.get("phase", self.state.phase) != self.state.phase:
                    self.state.phase = target_node["phase"]
                self.ctx.set_current_node(target_id)
                self.state.current_node_id = target_id
                # Fire criterion advancement callback when node changes to a different criterion
                if self._on_criterion_advance:
                    criteria_ids = list(dict.fromkeys(
                        n.get("criterion_id") or n.get("learning_outcome_id", "")
                        for n in self.ctx.nodes.values()
                        if (n.get("criterion_id") or n.get("learning_outcome_id"))
                    ))
                    current_criterion_id = target_node.get("criterion_id") or target_node.get("learning_outcome_id", "")
                    if current_criterion_id and current_criterion_id in criteria_ids:
                        current_idx = criteria_ids.index(current_criterion_id) + 1
                        asyncio.create_task(self._on_criterion_advance(current_idx, len(criteria_ids)))

        elif navigation["type"] == "end_session":
            # Signal session end — set phase past final so should_end_session returns True
            self.state.phase = 99
            logger.info(f"Session ending: {navigation.get('reason', 'unknown')}")

        elif navigation["type"] == "phase_transition":
            target_phase = navigation.get("target_phase", self.state.phase + 1)
            for node_id, node in self.ctx.nodes.items():
                if node.get("phase") == target_phase:
                    self.state.phase = target_phase
                    self.ctx.set_current_node(node_id)
                    self.state.current_node_id = node_id
                    break

    def _get_next_node_id(self) -> Optional[str]:
        """Get the next node ID in sequence."""
        node_ids = list(self.ctx.nodes.keys())
        try:
            current_idx = node_ids.index(self.state.current_node_id)
            if current_idx + 1 < len(node_ids):
                return node_ids[current_idx + 1]
        except ValueError:
            pass
        return None

    def _should_fast_skip(self, current_node: dict, eval_args: dict) -> bool:
        """One strong answer at a difficulty level skips remaining at that level for the criterion (D-10)."""
        if eval_args.get("response_quality") != "strong":
            return False
        lo_id = current_node.get("learning_outcome_id")
        difficulty = current_node.get("difficulty_level", 1)
        if not lo_id:
            return False
        # Check recent evaluations for a prior strong answer at same difficulty + LO
        for entry in self.state.evaluation_log[:-1]:  # Exclude current turn
            prev_node_id = entry.get("node_id", "")
            prev_node = self.ctx.nodes.get(prev_node_id, {}) if self.ctx else {}
            if (prev_node.get("learning_outcome_id") == lo_id and
                prev_node.get("difficulty_level") == difficulty and
                entry.get("evaluation", {}).get("response_quality") == "strong"):
                return True
        return False

    def _check_belief_driven_advance(self) -> Optional[dict]:
        """Check if the belief model indicates sufficient understanding of the current LO
        to warrant advancing to the next LO's nodes.

        Returns an advance navigation dict if conditions are met, None otherwise.
        """
        current_node = self.ctx.get_current_node()
        current_lo = current_node.get("learning_outcome_id", "")
        if not current_lo:
            return None

        belief = self.state.belief_model.get(current_lo, {})
        understanding = belief.get("understanding_level", "unknown")
        confidence = belief.get("confidence", 1.0)

        # Count how many evaluations have happened on this LO
        lo_eval_count = sum(
            1 for entry in self.state.evaluation_log
            if self.ctx.nodes.get(entry.get("node_id", ""), {}).get("learning_outcome_id") == current_lo
        )

        # Strong understanding + confidence + at least 2 evaluations → advance past this LO
        if understanding == "strong" and confidence >= 0.7 and lo_eval_count >= 2:
            next_lo_node = self._get_first_node_of_next_lo(current_lo)
            if next_lo_node:
                logger.info(
                    f"Turn {self.state.turn_count}: belief-driven advance — "
                    f"{current_lo} understanding={understanding}, confidence={confidence:.1f}, "
                    f"evals={lo_eval_count} → advancing to next LO"
                )
                return {"type": "advance", "target_node_id": next_lo_node}
            else:
                # No more LOs — all covered
                logger.info(f"Turn {self.state.turn_count}: all LOs assessed, ending session")
                return {"type": "end_session", "reason": "all_los_assessed"}

        return None

    def _get_first_node_of_next_lo(self, current_lo: str) -> Optional[str]:
        """Find the first node belonging to the next LO in sequence."""
        node_ids = list(self.ctx.nodes.keys())
        # Find all distinct LOs in node order
        lo_order = []
        for nid in node_ids:
            lo = self.ctx.nodes[nid].get("learning_outcome_id", "")
            if lo and lo not in lo_order:
                lo_order.append(lo)

        try:
            current_idx = lo_order.index(current_lo)
            if current_idx + 1 < len(lo_order):
                next_lo = lo_order[current_idx + 1]
                # Find first node with that LO
                for nid in node_ids:
                    if self.ctx.nodes[nid].get("learning_outcome_id") == next_lo:
                        return nid
        except ValueError:
            pass
        return None

    def _all_los_assessed(self) -> bool:
        """Check if every LO in the session plan has been assessed (appears in belief model)."""
        if not self.ctx:
            return False
        lo_ids = set(
            n.get("learning_outcome_id", "")
            for n in self.ctx.nodes.values()
            if n.get("learning_outcome_id")
        )
        for lo_id in lo_ids:
            belief = self.state.belief_model.get(lo_id, {})
            if belief.get("understanding_level", "unknown") == "unknown":
                return False
        return True

    def _check_adaptive_pacing(self) -> bool:
        """Check if session is running over time and should compress (D-13).
        Returns True if pacing adjustment was triggered (once per session max).

        When triggered:
        - Sets _pacing_triggered flag (consumed by _resolve_navigation to skip if_time_permits nodes)
        - Sets _pacing_prompt_inject with natural language for the LLM to share with the student
        """
        if not self._use_session_plan or not self.plan:
            return False
        if getattr(self.state, '_pacing_triggered', False):
            return False  # Only trigger once per session

        elapsed = self.state.duration_seconds
        duration_target = self.plan.get("duration_target_minutes", 15) * 60
        # Only after second criterion is complete and elapsed > 120% of expected pace
        completed_criteria = len(set(
            entry.get("node_id") for entry in self.state.evaluation_log
            if entry.get("evaluation", {}).get("response_quality") in ("strong", "partial")
        ))
        if completed_criteria < 4 or elapsed <= duration_target * 0.6:
            return False

        # Check if we're running over expected pace
        total_nodes = len(self.ctx.nodes) if self.ctx else 1
        expected_pace = duration_target / max(total_nodes, 1)
        actual_pace = elapsed / max(self.state.turn_count, 1)
        if actual_pace > expected_pace * 1.2:
            self.state._pacing_triggered = True
            remaining_minutes = max(1, int((duration_target - elapsed) / 60))
            self.state._pacing_prompt_inject = (
                f"We have about {remaining_minutes} minutes remaining. "
                "Let me ask you some broader questions to make the most of our time."
            )
            logger.info(f"Adaptive pacing triggered: elapsed={elapsed}s, expected_pace={expected_pace:.1f}s/node")
            return True
        return False

    def _check_hard_time_limit(self) -> bool:
        """Enforce hard time maximum (D-12). Returns True if session should end."""
        if not self._use_session_plan or not self.plan:
            return False
        max_duration = self.plan.get("max_duration_seconds", 20 * 60)  # Default 20 min
        if self.state.duration_seconds >= max_duration:
            logger.info(f"Hard time limit reached: {self.state.duration_seconds}s >= {max_duration}s")
            return True
        return False

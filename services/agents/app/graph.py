"""LangGraph pipeline: parser → rule_checker → researcher → writer.

Preserved StateGraph pattern from prototype, extended with rule checking
and proper null/confidence/needs_review handling."""

from langgraph.graph import StateGraph, END

from .schemas import AppealState
from .agents.parser import document_parser_agent
from .agents.rule_checker import rule_checker_agent
from .agents.researcher import compliance_researcher_agent
from .agents.writer import clinical_appeals_writer_agent


def build_graph():
    workflow = StateGraph(AppealState)

    workflow.add_node("parser", document_parser_agent)
    workflow.add_node("rule_checker", rule_checker_agent)
    workflow.add_node("researcher", compliance_researcher_agent)
    workflow.add_node("writer", clinical_appeals_writer_agent)

    workflow.set_entry_point("parser")
    workflow.add_edge("parser", "rule_checker")
    workflow.add_edge("rule_checker", "researcher")
    workflow.add_edge("researcher", "writer")
    workflow.add_edge("writer", END)

    return workflow.compile()


agent_engine = build_graph()

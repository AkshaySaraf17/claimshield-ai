"""
Builds the LangGraph state machine: parser -> researcher -> writer.

This replaces the doc's invented `StateMachine`/`State` classes, which don't
exist in the langgraph package, with the real `StateGraph` API.
"""
from langgraph.graph import StateGraph, END

from app.schemas import AppealState
from app.agents.parser_agent import document_parser_agent
from app.agents.researcher_agent import compliance_researcher_agent
from app.agents.writer_agent import clinical_appeals_writer_agent


def build_graph():
    workflow = StateGraph(AppealState)

    workflow.add_node("parser", document_parser_agent)
    workflow.add_node("researcher", compliance_researcher_agent)
    workflow.add_node("writer", clinical_appeals_writer_agent)

    workflow.set_entry_point("parser")
    workflow.add_edge("parser", "researcher")
    workflow.add_edge("researcher", "writer")
    workflow.add_edge("writer", END)

    return workflow.compile()


# Compiled once at import time and reused across requests.
agent_engine = build_graph()

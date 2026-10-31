"""LangGraph supervisor pipeline with specialist routing.

Flow: parser → rule_checker → router → [specialist] → researcher → writer → END

The router examines the denial code category and sends to the appropriate
specialist agent. All specialists return specialist_analysis which the
writer incorporates into the appeal letter."""

from langgraph.graph import StateGraph, END

from .schemas import AppealState
from .agents.parser import document_parser_agent
from .agents.rule_checker import rule_checker_agent
from .agents.researcher import compliance_researcher_agent
from .agents.writer import clinical_appeals_writer_agent
from .agents.coding import coding_specialist_agent
from .agents.medical_necessity import medical_necessity_specialist_agent
from .agents.authorization import authorization_specialist_agent
from .agents.timely_filing import timely_filing_specialist_agent
from .agents.patient_responsibility import patient_responsibility_specialist_agent
from .agents.coordinator import coordinator_specialist_agent

CATEGORY_MAP = {
    "CO-4": "coding",
    "CO-97": "coding",
    "CO-50": "medical_necessity",
    "CO-197": "authorization",
    "CO-29": "timely_filing",
    "PR-1": "patient_responsibility",
    "PR-2": "patient_responsibility",
    "PR-3": "patient_responsibility",
}


def _classify_denial(state: AppealState) -> dict:
    code = (state.get("denial_code") or "").upper().strip()
    category = CATEGORY_MAP.get(code, "general")
    return {"denial_category": category}


def _route_to_specialist(state: AppealState) -> str:
    category = state.get("denial_category", "general")
    route_map = {
        "coding": "coding_specialist",
        "medical_necessity": "medical_necessity_specialist",
        "authorization": "authorization_specialist",
        "timely_filing": "timely_filing_specialist",
        "patient_responsibility": "patient_responsibility_specialist",
    }
    return route_map.get(category, "coordinator_specialist")


def build_graph():
    workflow = StateGraph(AppealState)

    workflow.add_node("parser", document_parser_agent)
    workflow.add_node("rule_checker", rule_checker_agent)
    workflow.add_node("classifier", _classify_denial)

    workflow.add_node("coding_specialist", coding_specialist_agent)
    workflow.add_node("medical_necessity_specialist", medical_necessity_specialist_agent)
    workflow.add_node("authorization_specialist", authorization_specialist_agent)
    workflow.add_node("timely_filing_specialist", timely_filing_specialist_agent)
    workflow.add_node("patient_responsibility_specialist", patient_responsibility_specialist_agent)
    workflow.add_node("coordinator_specialist", coordinator_specialist_agent)

    workflow.add_node("researcher", compliance_researcher_agent)
    workflow.add_node("writer", clinical_appeals_writer_agent)

    workflow.set_entry_point("parser")
    workflow.add_edge("parser", "rule_checker")
    workflow.add_edge("rule_checker", "classifier")

    workflow.add_conditional_edges(
        "classifier",
        _route_to_specialist,
        {
            "coding_specialist": "coding_specialist",
            "medical_necessity_specialist": "medical_necessity_specialist",
            "authorization_specialist": "authorization_specialist",
            "timely_filing_specialist": "timely_filing_specialist",
            "patient_responsibility_specialist": "patient_responsibility_specialist",
            "coordinator_specialist": "coordinator_specialist",
        },
    )

    for specialist in [
        "coding_specialist",
        "medical_necessity_specialist",
        "authorization_specialist",
        "timely_filing_specialist",
        "patient_responsibility_specialist",
        "coordinator_specialist",
    ]:
        workflow.add_edge(specialist, "researcher")

    workflow.add_edge("researcher", "writer")
    workflow.add_edge("writer", END)

    return workflow.compile()


agent_engine = build_graph()

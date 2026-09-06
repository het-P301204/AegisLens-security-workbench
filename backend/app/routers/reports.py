"""Report generation endpoints: structured JSON, Markdown, and a print view."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from fastapi.responses import HTMLResponse, PlainTextResponse
from sqlalchemy.orm import Session

from .. import schemas
from ..database import get_db
from ..services import print_report, report_service
from .dashboard import resolve_assessment

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/summary", response_model=schemas.ReportSummaryOut)
def report_summary(
    db: Session = Depends(get_db),
    assessment_id: str | None = Query(None, description="Defaults to the active assessment"),
) -> dict:
    """Structured report data, used by the in-app report preview."""
    assessment = resolve_assessment(db, assessment_id)
    return report_service.build_report(db, assessment)


@router.get("/markdown", response_class=PlainTextResponse)
def report_markdown(
    db: Session = Depends(get_db),
    assessment_id: str | None = Query(None),
    download: bool = Query(False, description="Send as a file attachment"),
) -> PlainTextResponse:
    """The same report rendered as Markdown."""
    assessment = resolve_assessment(db, assessment_id)
    report = report_service.build_report(db, assessment)
    markdown = report_service.render_markdown(report)

    headers = {}
    if download:
        filename = f"aegislens-report-{assessment.id}.md"
        headers["Content-Disposition"] = f'attachment; filename="{filename}"'
    return PlainTextResponse(markdown, media_type="text/markdown; charset=utf-8", headers=headers)


@router.get("/print", response_class=HTMLResponse)
def report_print_view(
    db: Session = Depends(get_db),
    assessment_id: str | None = Query(None),
) -> HTMLResponse:
    """A self-contained, printable HTML rendering of the report.

    Kept deliberately plain so the browser's own print-to-PDF produces a clean
    document without needing a PDF library in the stack.
    """
    assessment = resolve_assessment(db, assessment_id)
    report = report_service.build_report(db, assessment)
    return HTMLResponse(print_report.render_print_html(report))

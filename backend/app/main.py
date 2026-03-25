import logging
import os
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import BOE_FETCH_ENABLED, PRESET_EVENTS
from app.db import (
    init_db,
    query_available_dates,
    query_curves_for_date,
    query_last_fetch,
    query_latest_date,
    query_nearest_date,
    query_time_series,
)
from app.fetcher import backfill, fetch_latest

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

scheduler = BackgroundScheduler()


def scheduled_fetch():
    try:
        fetch_latest()
    except Exception as e:
        logger.error(f"Scheduled fetch failed: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"Starting up, DATABASE_URL configured: {'yes' if 'DATABASE_URL' in os.environ else 'no'}")
    try:
        init_db()
        logger.info("Database initialised")
    except Exception as e:
        logger.error(f"Database init failed: {e}")
        logger.error("App will start but DB queries will fail until connection is available")

    if BOE_FETCH_ENABLED:
        # BoE publishes yield curves around 16:00-17:00 London time
        # Primary fetch at 17:30, fallback at 18:30 in case of late publication
        scheduler.add_job(
            scheduled_fetch,
            CronTrigger(day_of_week="mon-fri", hour=17, minute=30, timezone="Europe/London"),
            id="daily_fetch",
        )
        scheduler.add_job(
            scheduled_fetch,
            CronTrigger(day_of_week="mon-fri", hour=18, minute=30, timezone="Europe/London"),
            id="daily_fetch_fallback",
        )
        scheduler.start()
        logger.info("Scheduler started — daily fetch at 17:30 + 18:30 London time")

    yield

    if scheduler.running:
        scheduler.shutdown()


app = FastAPI(title="UK Gilt Curve Tracker", lifespan=lifespan)

# CORS — allow all origins for now, tighten in production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def format_curve_points(rows):
    """Convert DB rows to {type: [{maturity_months, maturity_years, spot_rate, forward_rate}]}."""
    curves = {}
    for curve_type, maturity_months, spot_rate, forward_rate in rows:
        if curve_type not in curves:
            curves[curve_type] = []
        curves[curve_type].append({
            "maturity_months": maturity_months,
            "maturity_years": round(maturity_months / 12, 1),
            "spot_rate": float(spot_rate) if spot_rate is not None else None,
            "forward_rate": float(forward_rate) if forward_rate is not None else None,
        })
    return curves


@app.get("/api/curves/latest")
def get_latest_curves(curve_type: str | None = None):
    latest_date = query_latest_date()
    if not latest_date:
        raise HTTPException(status_code=404, detail="No data available")

    rows = query_curves_for_date(latest_date, curve_type)
    return {"date": latest_date.isoformat(), "curves": format_curve_points(rows)}


@app.get("/api/curves/dates")
def get_available_dates():
    dates = query_available_dates()
    return {"dates": [d.isoformat() for d in dates]}


@app.get("/api/curves/compare")
def compare_curves(
    dates: str = Query(..., description="Comma-separated dates (YYYY-MM-DD), max 10"),
    curve_type: str = Query("nominal", description="Curve type"),
):
    date_list = [d.strip() for d in dates.split(",")]
    if len(date_list) > 10:
        raise HTTPException(status_code=400, detail="Max 10 dates allowed")

    result = {}
    for date_str in date_list:
        try:
            target = datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid date format: {date_str}")

        nearest = query_nearest_date(target)
        if nearest is None:
            continue

        rows = query_curves_for_date(nearest, curve_type)
        curves = format_curve_points(rows)
        result[nearest.isoformat()] = {
            "requested_date": date_str,
            "actual_date": nearest.isoformat(),
            "points": curves.get(curve_type, []),
        }

    return {"curve_type": curve_type, "curves": result}


@app.get("/api/curves/range")
def get_curve_range(
    start: str = Query(..., description="Start date YYYY-MM-DD"),
    end: str = Query(..., description="End date YYYY-MM-DD"),
    curve_type: str = Query("nominal"),
    maturity: int = Query(120, description="Maturity in months (e.g. 120 = 10Y)"),
):
    try:
        start_date = datetime.strptime(start, "%Y-%m-%d").date()
        end_date = datetime.strptime(end, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format")

    rows = query_time_series(curve_type, maturity, start_date, end_date)
    return {
        "curve_type": curve_type,
        "maturity_months": maturity,
        "maturity_years": round(maturity / 12, 1),
        "data": [
            {"date": d.isoformat(), "spot_rate": float(s) if s else None, "forward_rate": float(f) if f else None}
            for d, s, f in rows
        ],
    }


@app.get("/api/curves/{curve_date}")
def get_curves_for_date(curve_date: str, curve_type: str | None = None):
    try:
        target = datetime.strptime(curve_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format, use YYYY-MM-DD")

    nearest = query_nearest_date(target)
    if nearest is None:
        raise HTTPException(status_code=404, detail="No data available for this date")

    rows = query_curves_for_date(nearest, curve_type)
    return {
        "requested_date": curve_date,
        "actual_date": nearest.isoformat(),
        "curves": format_curve_points(rows),
    }


@app.get("/api/presets")
def get_presets():
    resolved = []
    for preset in PRESET_EVENTS:
        entry = {"label": preset["label"], "type": preset["type"]}
        if preset["type"] == "relative":
            target = date.today() + timedelta(days=preset["days"])
            nearest = query_nearest_date(target)
            entry["date"] = nearest.isoformat() if nearest else None
        else:
            entry["date"] = preset["date"]
        resolved.append(entry)
    return {"presets": resolved}


@app.get("/api/health")
def health_check():
    last = query_last_fetch()
    latest_date = query_latest_date()
    return {
        "status": "ok",
        "latest_curve_date": latest_date.isoformat() if latest_date else None,
        "last_fetch": {
            "date": last[0].isoformat() if last else None,
            "status": last[1] if last else None,
            "at": last[2].isoformat() if last else None,
        }
        if last
        else None,
    }


@app.post("/api/admin/fetch-latest")
def trigger_fetch_latest():
    try:
        count = fetch_latest()
        return {"status": "ok", "records_upserted": count}
    except Exception as e:
        logger.exception("fetch-latest failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/admin/backfill")
def trigger_backfill(days: int = Query(365, description="How many days back to backfill")):
    try:
        min_date = date.today() - timedelta(days=days)
        count = backfill(min_date=min_date)
        return {"status": "ok", "records_upserted": count, "from_date": min_date.isoformat()}
    except Exception as e:
        logger.exception("backfill failed")
        raise HTTPException(status_code=500, detail=str(e))


# Serve frontend static files (built React app) — must be last
static_dir = os.path.join(os.path.dirname(__file__), "..", "static")
if os.path.isdir(static_dir):
    from fastapi.responses import FileResponse

    app.mount("/assets", StaticFiles(directory=os.path.join(static_dir, "assets")), name="static-assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """Serve index.html for all non-API routes (SPA client-side routing)."""
        file_path = os.path.join(static_dir, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(static_dir, "index.html"))

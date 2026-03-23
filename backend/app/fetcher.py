"""
BoE yield curve data fetcher.

Downloads ZIP files from the Bank of England website containing xlsx spreadsheets
with yield curve data. Parses spot rates and forward rates at all available maturities.

Data structure per xlsx:
  - Sheet "4. spot curve": Row 4 = maturity years (0.5, 1, 1.5, ..., 40), Row 6+ = date + yields
  - Sheet "2. fwd curve": Same layout for instantaneous forward rates
  - Short-end sheets (1, 3) have monthly granularity but overlap with the curve sheets
"""
import io
import logging
import zipfile
from datetime import date, datetime, timedelta

import openpyxl
import requests

from app.config import (
    BOE_ARCHIVE_URLS,
    BOE_LATEST_ZIP,
    FILENAME_TO_CURVE_TYPE,
    FORWARD_SHEET,
    SPOT_SHEET,
)
from app.db import log_fetch, upsert_curve_data

logger = logging.getLogger(__name__)

REQUEST_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; GiltCurveTracker/1.0; academic research)",
    "Accept": "application/zip, application/octet-stream, */*",
}


def download_zip(url: str) -> zipfile.ZipFile:
    logger.info(f"Downloading {url}")
    resp = requests.get(url, headers=REQUEST_HEADERS, timeout=120)
    resp.raise_for_status()
    return zipfile.ZipFile(io.BytesIO(resp.content))


def identify_curve_type(filename: str) -> str | None:
    for prefix, curve_type in FILENAME_TO_CURVE_TYPE.items():
        if filename.startswith(prefix):
            return curve_type
    return None


def parse_sheet(wb: openpyxl.Workbook, sheet_name: str, rate_field: str) -> list[dict]:
    """Parse a yield curve sheet, returning list of {curve_date, maturity_months, <rate_field>: value}."""
    try:
        ws = wb[sheet_name]
    except KeyError:
        logger.warning(f"Sheet '{sheet_name}' not found")
        return []

    rows = list(ws.iter_rows(values_only=True))
    if len(rows) < 5:
        return []

    # Row 4 (index 3) has maturity years
    maturity_row = rows[3]
    maturities_years = []
    for val in maturity_row[1:]:  # skip col A ("years:")
        if isinstance(val, (int, float)) and val > 0:
            maturities_years.append(val)
        else:
            break

    results = []
    # Data starts at row 6 (index 5)
    for row in rows[5:]:
        date_val = row[0]
        if date_val is None:
            continue
        if isinstance(date_val, datetime):
            curve_date = date_val.date()
        elif isinstance(date_val, date):
            curve_date = date_val
        else:
            continue

        for i, mat_years in enumerate(maturities_years):
            col_idx = i + 1  # offset for date column
            if col_idx >= len(row):
                break
            rate = row[col_idx]
            if rate is None or rate == "" or not isinstance(rate, (int, float)):
                continue
            maturity_months = round(mat_years * 12)
            results.append({
                "curve_date": curve_date,
                "maturity_months": maturity_months,
                rate_field: round(float(rate), 4),
            })

    return results


def parse_xlsx(xlsx_bytes: bytes, curve_type: str) -> list[dict]:
    """Parse an xlsx file and return merged spot + forward rate rows."""
    wb = openpyxl.load_workbook(io.BytesIO(xlsx_bytes), read_only=True, data_only=True)

    spot_data = parse_sheet(wb, SPOT_SHEET, "spot_rate")
    fwd_data = parse_sheet(wb, FORWARD_SHEET, "forward_rate")
    wb.close()

    # Merge spot and forward data by (date, maturity)
    merged = {}
    for item in spot_data:
        key = (item["curve_date"], item["maturity_months"])
        merged[key] = {
            "curve_date": item["curve_date"],
            "curve_type": curve_type,
            "maturity_months": item["maturity_months"],
            "spot_rate": item["spot_rate"],
            "forward_rate": None,
        }

    for item in fwd_data:
        key = (item["curve_date"], item["maturity_months"])
        if key in merged:
            merged[key]["forward_rate"] = item["forward_rate"]
        else:
            merged[key] = {
                "curve_date": item["curve_date"],
                "curve_type": curve_type,
                "maturity_months": item["maturity_months"],
                "spot_rate": None,
                "forward_rate": item["forward_rate"],
            }

    return list(merged.values())


def fetch_latest():
    """Download and parse the latest month's yield curve data from BoE."""
    total_inserted = 0
    try:
        zf = download_zip(BOE_LATEST_ZIP)
        for name in zf.namelist():
            if not name.endswith(".xlsx"):
                continue
            curve_type = identify_curve_type(name)
            if curve_type is None:
                logger.warning(f"Unknown file in ZIP: {name}")
                continue

            logger.info(f"Parsing {name} as {curve_type}")
            xlsx_bytes = zf.read(name)
            rows = parse_xlsx(xlsx_bytes, curve_type)
            if rows:
                count = upsert_curve_data(rows)
                total_inserted += count
                logger.info(f"  Upserted {count} rows for {curve_type}")

        zf.close()
        log_fetch(date.today(), "boe_latest", "success", total_inserted)
        logger.info(f"Latest fetch complete: {total_inserted} total rows upserted")
        return total_inserted

    except Exception as e:
        logger.error(f"Failed to fetch latest data: {e}")
        log_fetch(date.today(), "boe_latest", "failed", error_message=str(e))
        raise


def fetch_archive(curve_type: str, min_date: date | None = None):
    """Download and parse the full historical archive for a curve type.

    Args:
        curve_type: One of 'nominal', 'real', 'inflation', 'ois'
        min_date: Only insert data from this date onwards (to limit backfill scope)
    """
    url = BOE_ARCHIVE_URLS[curve_type]
    total_inserted = 0
    try:
        zf = download_zip(url)
        for name in zf.namelist():
            if not name.endswith(".xlsx"):
                continue
            logger.info(f"Parsing archive file: {name}")
            xlsx_bytes = zf.read(name)
            rows = parse_xlsx(xlsx_bytes, curve_type)

            if min_date:
                rows = [r for r in rows if r["curve_date"] >= min_date]

            if rows:
                # Batch in chunks to avoid huge single transactions
                chunk_size = 5000
                for i in range(0, len(rows), chunk_size):
                    chunk = rows[i : i + chunk_size]
                    count = upsert_curve_data(chunk)
                    total_inserted += count
                logger.info(f"  Upserted {total_inserted} rows so far for {curve_type}")

        zf.close()
        log_fetch(date.today(), f"boe_archive_{curve_type}", "success", total_inserted)
        logger.info(f"Archive fetch for {curve_type} complete: {total_inserted} rows")
        return total_inserted

    except Exception as e:
        logger.error(f"Failed to fetch archive for {curve_type}: {e}")
        log_fetch(date.today(), f"boe_archive_{curve_type}", "failed", error_message=str(e))
        raise


def backfill(min_date: date | None = None):
    """Fetch all historical archives. Defaults to last 1 year if min_date not specified."""
    if min_date is None:
        min_date = date.today() - timedelta(days=365)

    total = 0
    for curve_type in BOE_ARCHIVE_URLS:
        logger.info(f"Backfilling {curve_type} from {min_date}")
        count = fetch_archive(curve_type, min_date=min_date)
        total += count
    return total

import psycopg2
from psycopg2.extras import execute_values
from contextlib import contextmanager
from app.config import DATABASE_URL

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS yield_curve_data (
    id SERIAL PRIMARY KEY,
    curve_date DATE NOT NULL,
    curve_type VARCHAR(20) NOT NULL,
    maturity_months INTEGER NOT NULL,
    spot_rate DECIMAL(8,4),
    forward_rate DECIMAL(8,4),
    fetched_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(curve_date, curve_type, maturity_months)
);

CREATE INDEX IF NOT EXISTS idx_curve_date_type
    ON yield_curve_data(curve_date, curve_type);
CREATE INDEX IF NOT EXISTS idx_curve_type_maturity
    ON yield_curve_data(curve_type, maturity_months);

CREATE TABLE IF NOT EXISTS fetch_log (
    id SERIAL PRIMARY KEY,
    fetch_date DATE NOT NULL,
    source VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL,
    records_inserted INTEGER,
    error_message TEXT,
    fetched_at TIMESTAMP DEFAULT NOW()
);
"""


def get_connection():
    return psycopg2.connect(DATABASE_URL)


@contextmanager
def get_cursor():
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            yield cur
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    with get_cursor() as cur:
        cur.execute(SCHEMA_SQL)


def upsert_curve_data(rows: list[dict]):
    """Upsert yield curve data. Each row: {curve_date, curve_type, maturity_months, spot_rate, forward_rate}"""
    if not rows:
        return 0

    sql = """
        INSERT INTO yield_curve_data (curve_date, curve_type, maturity_months, spot_rate, forward_rate)
        VALUES %s
        ON CONFLICT (curve_date, curve_type, maturity_months)
        DO UPDATE SET
            spot_rate = EXCLUDED.spot_rate,
            forward_rate = EXCLUDED.forward_rate,
            fetched_at = NOW()
    """
    values = [
        (r["curve_date"], r["curve_type"], r["maturity_months"], r.get("spot_rate"), r.get("forward_rate"))
        for r in rows
    ]
    with get_cursor() as cur:
        execute_values(cur, sql, values)
    return len(values)


def log_fetch(fetch_date, source, status, records_inserted=None, error_message=None):
    with get_cursor() as cur:
        cur.execute(
            "INSERT INTO fetch_log (fetch_date, source, status, records_inserted, error_message) VALUES (%s, %s, %s, %s, %s)",
            (fetch_date, source, status, records_inserted, error_message),
        )


def query_curves_for_date(curve_date, curve_type=None):
    """Get all curve points for a date, optionally filtered by type."""
    sql = "SELECT curve_type, maturity_months, spot_rate, forward_rate FROM yield_curve_data WHERE curve_date = %s"
    params = [curve_date]
    if curve_type:
        sql += " AND curve_type = %s"
        params.append(curve_type)
    sql += " ORDER BY curve_type, maturity_months"

    with get_cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall()


def query_latest_date():
    with get_cursor() as cur:
        cur.execute("SELECT MAX(curve_date) FROM yield_curve_data")
        result = cur.fetchone()
        return result[0] if result else None


def query_available_dates():
    with get_cursor() as cur:
        cur.execute("SELECT DISTINCT curve_date FROM yield_curve_data ORDER BY curve_date DESC")
        return [row[0] for row in cur.fetchall()]


def query_nearest_date(target_date):
    """Find the nearest available date on or before the target date."""
    with get_cursor() as cur:
        cur.execute(
            "SELECT DISTINCT curve_date FROM yield_curve_data WHERE curve_date <= %s ORDER BY curve_date DESC LIMIT 1",
            (target_date,),
        )
        result = cur.fetchone()
        return result[0] if result else None


def query_time_series(curve_type, maturity_months, start_date, end_date):
    with get_cursor() as cur:
        cur.execute(
            """SELECT curve_date, spot_rate, forward_rate
               FROM yield_curve_data
               WHERE curve_type = %s AND maturity_months = %s
                 AND curve_date BETWEEN %s AND %s
               ORDER BY curve_date""",
            (curve_type, maturity_months, start_date, end_date),
        )
        return cur.fetchall()


def query_last_fetch():
    with get_cursor() as cur:
        cur.execute("SELECT fetch_date, status, fetched_at FROM fetch_log ORDER BY fetched_at DESC LIMIT 1")
        return cur.fetchone()

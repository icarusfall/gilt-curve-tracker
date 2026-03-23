import os

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://localhost:5432/gilt_curves")
BOE_FETCH_ENABLED = os.environ.get("BOE_FETCH_ENABLED", "true").lower() == "true"

# BoE yield curve archive URLs (daily data)
BOE_BASE_URL = "https://www.bankofengland.co.uk"
BOE_LATEST_ZIP = f"{BOE_BASE_URL}/-/media/boe/files/statistics/yield-curves/latest-yield-curve-data.zip"
BOE_ARCHIVE_URLS = {
    "nominal": f"{BOE_BASE_URL}/-/media/boe/files/statistics/yield-curves/glcnominalddata.zip",
    "real": f"{BOE_BASE_URL}/-/media/boe/files/statistics/yield-curves/glcrealddata.zip",
    "inflation": f"{BOE_BASE_URL}/-/media/boe/files/statistics/yield-curves/glcinflationddata.zip",
    "ois": f"{BOE_BASE_URL}/-/media/boe/files/statistics/yield-curves/oisddata.zip",
}

# Mapping from ZIP file name prefix to curve type
FILENAME_TO_CURVE_TYPE = {
    "GLC Nominal": "nominal",
    "GLC Real": "real",
    "GLC Inflation": "inflation",
    "OIS": "ois",
}

# Sheets to parse from each xlsx file
# We use the "spot curve" (full maturity range) and "fwd curve" sheets
SPOT_SHEET = "4. spot curve"
FORWARD_SHEET = "2. fwd curve"

# Preset events for historical overlay
PRESET_EVENTS = [
    {"label": "1 week ago", "type": "relative", "days": -7},
    {"label": "1 month ago", "type": "relative", "days": -30},
    {"label": "3 months ago", "type": "relative", "days": -90},
    {"label": "1 year ago", "type": "relative", "days": -365},
    {"label": "Pre-COVID", "type": "fixed", "date": "2020-02-19"},
    {"label": "COVID trough", "type": "fixed", "date": "2020-03-19"},
    {"label": "Pre-Ukraine invasion", "type": "fixed", "date": "2022-02-23"},
    {"label": "Pre-mini-budget", "type": "fixed", "date": "2022-09-22"},
    {"label": "Mini-budget peak", "type": "fixed", "date": "2022-09-27"},
    {"label": "Post-Brexit vote", "type": "fixed", "date": "2016-06-24"},
    {"label": "Pre-Trump tariffs", "type": "fixed", "date": "2025-04-01"},
    {"label": "Pre-Iran invasion", "type": "fixed", "date": "2026-02-27"},
]

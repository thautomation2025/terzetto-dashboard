import json
import math
import re
from pathlib import Path

import pandas as pd


SOURCE_DIR = Path("/Users/pichi/Downloads")
OUTPUT = Path(__file__).resolve().parents[1] / "data" / "marketing-data.json"

CSV_FILES = {
    "quarterly": "Quarterly Performance-Grid view (1).csv",
    "channel_quarterly": "Channel Quarterly Performance-Grid view (1).csv",
    "channel_weekly": "Channel Weekly Performance-Grid view.csv",
    "leads": "Leads-Grid view (3).csv",
    "weeks": "Weeks-Grid view (1).csv",
}
WORKBOOK = "Marketing CSV Dashboard.xlsx"


def money(value):
    if pd.isna(value) or value == "":
        return 0.0
    cleaned = re.sub(r"[^0-9.-]", "", str(value))
    return round(float(cleaned or 0), 2)


def number(value):
    if pd.isna(value) or value == "":
        return 0
    try:
        return int(float(str(value).replace(",", "").replace("%", "")))
    except ValueError:
        return 0


def decimal_number(value):
    if pd.isna(value) or value == "":
        return 0.0
    try:
        cleaned = str(value).replace(",", "").replace("%", "")
        result = float(cleaned or 0)
    except ValueError:
        return 0.0
    return round(result, 4) if math.isfinite(result) else 0.0


def percent(value):
    result = decimal_number(value)
    return round(result, 2)


def ctr_percent(value):
    result = decimal_number(value)
    if 0 < result <= 1:
        result *= 100
    return round(result, 4)


def finite_number(value, fallback=0.0):
    result = decimal_number(value)
    return round(result, 2) if math.isfinite(result) else fallback


def read_csv(name):
    df = pd.read_csv(SOURCE_DIR / name, encoding="utf-8-sig")
    df.columns = [column.strip() for column in df.columns]
    return df


def date_series(series):
    return pd.to_datetime(series, errors="coerce")


def iso_date(value):
    parsed = pd.to_datetime(value, errors="coerce")
    return "" if pd.isna(parsed) else parsed.strftime("%Y-%m-%d")


def short_date(value):
    parsed = pd.to_datetime(value, errors="coerce")
    return "" if pd.isna(parsed) else parsed.strftime("%b %-d")


def month_label(value):
    parsed = pd.to_datetime(value, errors="coerce")
    return "" if pd.isna(parsed) else parsed.strftime("%b %Y")


def quarter_from_date(value):
    parsed = pd.to_datetime(value, errors="coerce")
    if pd.isna(parsed):
        return ""
    month = parsed.month
    year = parsed.year
    if month in (12, 1, 2):
        return f"Q1 {year + 1 if month == 12 else year}"
    if month in (3, 4, 5):
        return f"Q2 {year}"
    if month in (6, 7, 8):
        return f"Q3 {year}"
    return f"Q4 {year}"


def safe_ratio(top, bottom):
    return top / bottom if bottom else 0


def platform_color(platform):
    return {
        "Facebook": "#3c8ed9",
        "Instagram": "#c12400",
        "TikTok": "#151312",
        "YouTube": "#544845",
    }.get(platform, "#544845")


def quarter_sort_key(quarter):
    match = re.search(r"Q([1-4])\s+(\d{4})", str(quarter))
    return (int(match.group(2)), int(match.group(1))) if match else (0, 0)


def parse_quarterly(df):
    rows = []
    for _, row in df.iterrows():
        rows.append(
            {
                "quarter": row["Quarter"],
                "spend": money(row["Spend"]),
                "leads": number(row["Leads"]),
                "qualified": number(row["Qualified Leads"]),
                "cpql": money(row["CPQL"]),
                "won": number(row["Won Leads"]),
                "cpa": money(row["CPA"]),
                "winRate": percent(row["Win Rate"]),
                "revenue": money(row["Revenue Won"]),
            }
        )
    return rows


def parse_channel_quarterly(df):
    rows = []
    for _, row in df.iterrows():
        rows.append(
            {
                "quarter": row["Quarter"],
                "channel": row["Channel"],
                "spend": money(row["Spend"]),
                "leads": number(row["Leads"]),
                "qualified": number(row["Qualified Lead Count"]),
                "cpql": money(row["CPQL"]),
                "won": number(row["Won Leads"]),
                "revenue": money(row["Revenue Won"]),
                "roas": finite_number(row["ROAS"]),
            }
        )
    return rows


def parse_channel_weekly(df):
    week_column = "Week Start" if "Week Start" in df.columns else "Week"
    rows = []
    for _, row in df.iterrows():
        week = iso_date(row[week_column])
        rows.append(
            {
                "week": week,
                "label": row["Name"],
                "quarter": row["Quarter"],
                "channel": row["Channel"],
                "spend": money(row["Spend"]),
                "clicks": number(row["Clicks"]),
                "ctr": percent(row["CTR"]),
                "leads": number(row["Conversions/Leads"]),
                "qualified": number(row["Qualified Lead Count"]),
                "won": number(row["Won Leads"]),
                "revenue": money(row["Revenue Won"]),
                "month": month_label(week),
            }
        )
    return sorted(rows, key=lambda row: (row["week"], row["channel"]))


def parse_weeks(df):
    rows = []
    for _, row in df.iterrows():
        week = iso_date(row["Week Start"])
        rows.append(
            {
                "week": week,
                "range": row["Week Range"],
                "quarter": row["Quarter"],
                "leads": number(row["Total Leads"]),
                "qualified": number(row["Qualified Leads"]),
                "won": number(row["Won Deals"]),
                "revenue": money(row["Revenue Won"]),
                "month": month_label(week),
            }
        )
    return sorted(rows, key=lambda row: row["week"])


def parse_leads(df):
    df = df.copy()
    df["Date ISO"] = date_series(df["Date Added"])
    df["Month"] = df["Date ISO"].dt.strftime("%b %Y").fillna("")
    df["Qualified Flag"] = df["Qualified?"].fillna(0).map(number)
    df["Won Flag"] = df["Won?"].fillna("").astype(str).str.lower().eq("checked").astype(int)
    df["Revenue Won Number"] = df["Revenue Won"].map(money)
    df["Estimated Revenue Number"] = df["Est. Revenue"].map(money)
    df["Status Clean"] = df["Status"].fillna("Uncategorized").astype(str).str.strip()
    status_lower = df["Status Clean"].str.lower()
    df["Lost Flag"] = status_lower.eq("lost").astype(int)
    df["In Progress Flag"] = ((df["Qualified Flag"] > 0) & (df["Won Flag"] == 0) & (df["Lost Flag"] == 0)).astype(int)
    df["Pipeline Value Number"] = df["Estimated Revenue Number"].where(df["In Progress Flag"] > 0, 0)
    df["Channel Clean"] = df["Channel Group"].fillna("Uncategorized").astype(str).str.strip()
    df["Source Clean"] = df["Source"].fillna("Uncategorized").astype(str).str.strip()

    monthly = []
    grouped_months = df.groupby(["Quarter", "Month"], sort=False).agg(
        leads=("Name", "count"),
        qualified=("Qualified Flag", "sum"),
        lost=("Lost Flag", "sum"),
        inProgress=("In Progress Flag", "sum"),
        won=("Won Flag", "sum"),
        revenue=("Revenue Won Number", "sum"),
        pipelineValue=("Pipeline Value Number", "sum"),
    )
    for (quarter, month), row in grouped_months.reset_index().set_index(["Quarter", "Month"]).iterrows():
        if month:
            monthly.append(
                {
                    "quarter": quarter,
                    "month": month,
                    "leads": number(row["leads"]),
                    "qualified": number(row["qualified"]),
                    "lost": number(row["lost"]),
                    "inProgress": number(row["inProgress"]),
                    "won": number(row["won"]),
                    "revenue": money(row["revenue"]),
                    "pipelineValue": money(row["pipelineValue"]),
                }
            )

    lead_channels = []
    for _, row in (
        df.groupby("Channel Clean")
        .agg(
            leads=("Name", "count"),
            qualified=("Qualified Flag", "sum"),
            lost=("Lost Flag", "sum"),
            inProgress=("In Progress Flag", "sum"),
            won=("Won Flag", "sum"),
            revenue=("Revenue Won Number", "sum"),
            pipelineValue=("Pipeline Value Number", "sum"),
        )
        .reset_index()
        .iterrows()
    ):
        lead_channels.append(
            {
                "channel": row["Channel Clean"],
                "leads": number(row["leads"]),
                "qualified": number(row["qualified"]),
                "lost": number(row["lost"]),
                "inProgress": number(row["inProgress"]),
                "won": number(row["won"]),
                "revenue": money(row["revenue"]),
                "pipelineValue": money(row["pipelineValue"]),
            }
        )

    lead_channel_periods = []
    for _, row in (
        df.groupby(["Quarter", "Month", "Channel Clean"], sort=False)
        .agg(
            leads=("Name", "count"),
            qualified=("Qualified Flag", "sum"),
            lost=("Lost Flag", "sum"),
            inProgress=("In Progress Flag", "sum"),
            won=("Won Flag", "sum"),
            revenue=("Revenue Won Number", "sum"),
            pipelineValue=("Pipeline Value Number", "sum"),
        )
        .reset_index()
        .iterrows()
    ):
        if row["Month"]:
            lead_channel_periods.append(
                {
                    "quarter": row["Quarter"],
                    "month": row["Month"],
                    "channel": row["Channel Clean"],
                    "leads": number(row["leads"]),
                    "qualified": number(row["qualified"]),
                    "lost": number(row["lost"]),
                    "inProgress": number(row["inProgress"]),
                    "won": number(row["won"]),
                    "revenue": money(row["revenue"]),
                    "pipelineValue": money(row["pipelineValue"]),
                }
            )

    lead_status_periods = []
    for _, row in (
        df.groupby(["Quarter", "Month", "Status Clean"], sort=False)
        .agg(count=("Name", "count"))
        .reset_index()
        .iterrows()
    ):
        if row["Month"]:
            lead_status_periods.append(
                {
                    "quarter": row["Quarter"],
                    "month": row["Month"],
                    "status": row["Status Clean"],
                    "count": number(row["count"]),
                }
            )

    won_deals = []
    won_rows = df[df["Won Flag"] > 0].sort_values("Date ISO")
    for _, row in won_rows.iterrows():
        won_deals.append(
            {
                "client": str(row["Name"]).strip(),
                "source": str(row["Channel Clean"] or row["Source Clean"] or "Uncategorized").strip(),
                "revenue": money(row["Revenue Won Number"]),
                "date": iso_date(row["Date Added"]),
                "label": short_date(row["Date Added"]),
                "quarter": row["Quarter"] or quarter_from_date(row["Date Added"]),
                "month": row["Month"],
            }
        )

    return {
        "statuses": df["Status Clean"].value_counts().head(12).to_dict(),
        "sources": df["Source Clean"].value_counts().head(12).to_dict(),
        "channels": lead_channels,
        "channelPeriods": lead_channel_periods,
        "statusPeriods": lead_status_periods,
        "wonDeals": won_deals,
        "monthly": monthly,
        "totals": {
            "leads": number(df.shape[0]),
            "qualified": number(df["Qualified Flag"].sum()),
            "lost": number(df["Lost Flag"].sum()),
            "inProgress": number(df["In Progress Flag"].sum()),
            "won": number(df["Won Flag"].sum()),
            "revenue": money(df["Revenue Won Number"].sum()),
            "pipelineValue": money(df["Pipeline Value Number"].sum()),
        },
    }


def social_row(platform, quarter, date, values):
    views = number(values.get("views"))
    reach = number(values.get("reach"))
    engagements = number(values.get("engagements"))
    return {
        "date": iso_date(date),
        "label": short_date(date),
        "month": month_label(date),
        "contentViews": views,
        "reach": reach,
        "views": views,
        "engagements": engagements,
        "linkClicks": number(values.get("linkClicks")),
        "pageViews": 0,
    }


def parse_social_workbook(xlsx_path):
    social = pd.read_excel(xlsx_path, sheet_name="IG-TikTok-FB")
    social = social.iloc[1:].copy()
    social["quarter"] = social["Unnamed: 0"].ffill()
    social = social[pd.to_datetime(social["Unnamed: 1"], errors="coerce").notna()]
    platform_series = {}

    column_map = {
        "Facebook": {"views": "Facebook", "reach": "Unnamed: 3", "engagements": "Unnamed: 4", "linkClicks": "Unnamed: 5"},
        "Instagram": {"views": "Instagram", "reach": "Unnamed: 7", "engagements": "Unnamed: 8", "linkClicks": "Unnamed: 9"},
        "TikTok": {"views": "Tiktok", "reach": "Unnamed: 11", "engagements": "Unnamed: 12", "linkClicks": None},
    }

    for _, row in social.iterrows():
        date = row["Unnamed: 1"]
        quarter = row["quarter"] or quarter_from_date(date)
        for platform, columns in column_map.items():
            values = {key: row[column] if column else 0 for key, column in columns.items()}
            platform_series.setdefault((quarter, platform), []).append(social_row(platform, quarter, date, values))

    youtube = pd.read_excel(xlsx_path, sheet_name="YouTube")
    youtube = youtube.copy()
    youtube["quarter"] = youtube["Unnamed: 0"].ffill()
    youtube = youtube[pd.to_datetime(youtube["Date"], errors="coerce").notna()]
    youtube_followers = {}
    for (quarter,), group in youtube.groupby(["quarter"], dropna=True):
        cumulative = 0
        for _, row in group.iterrows():
            date = row["Date"]
            cumulative += number(row["Subscribers gained"]) - number(row["Subscribers lost"])
            youtube_followers[quarter] = max(youtube_followers.get(quarter, 0), cumulative)
            platform_series.setdefault((quarter, "YouTube"), []).append(
                social_row(
                    "YouTube",
                    quarter,
                    date,
                    {
                        "views": row["Views"],
                        "reach": row["Reach"],
                        "engagements": row["Engagement"],
                        "linkClicks": 0,
                    },
                )
            )

    rows = []
    for (quarter, platform), series in sorted(platform_series.items(), key=lambda item: (quarter_sort_key(item[0][0]), item[0][1])):
        rows.append(
            {
                "quarter": quarter,
                "platform": platform,
                "color": platform_color(platform),
                "contentViews": sum(item["contentViews"] for item in series),
                "reach": sum(item["reach"] for item in series),
                "views": sum(item["views"] for item in series),
                "engagements": sum(item["engagements"] for item in series),
                "linkClicks": sum(item["linkClicks"] for item in series),
                "pageViews": 0,
                "engagementRate": safe_ratio(sum(item["engagements"] for item in series), sum(item["reach"] for item in series)) * 100,
                "series": sorted(series, key=lambda item: item["date"]),
            }
        )
    return rows


def parse_meta_workbook(xlsx_path, channel_quarterly_rows):
    df = pd.read_excel(xlsx_path, sheet_name="Meta Ads Reporting")
    df = df[pd.to_datetime(df["Day"], errors="coerce").notna()].copy()
    df["quarter"] = df["Day"].map(quarter_from_date)
    rows = []
    meta_by_quarter = {row["quarter"]: row for row in channel_quarterly_rows if row["channel"] == "Meta Ads"}
    for quarter, group in df.groupby("quarter", sort=False):
        series = []
        for _, row in group.sort_values("Day").iterrows():
            link_clicks = number(row["Link clicks"])
            impressions = number(row["Impressions"])
            spent = decimal_number(row["Amount spent (CAD)"])
            series.append(
                {
                    "date": iso_date(row["Day"]),
                    "label": short_date(row["Day"]),
                    "month": month_label(row["Day"]),
                    "impressions": impressions,
                    "reach": number(row["Reach"]),
                    "linkClicks": link_clicks,
                    "uniqueLinkClicks": 0,
                    "amountSpent": spent,
                    "cpm": decimal_number(row["CPM (cost per 1,000 impressions)"]),
                    "cpc": decimal_number(row["CPC (cost per link click)"]),
                    "ctr": decimal_number(row["CTR (all)"]),
                }
            )
        meta_summary = meta_by_quarter.get(quarter, {})
        rows.append(
            {
                "quarter": quarter,
                "impressions": sum(item["impressions"] for item in series),
                "reach": sum(item["reach"] for item in series),
                "avgDailyReach": round(safe_ratio(sum(item["reach"] for item in series), len(series))),
                "linkClicks": sum(item["linkClicks"] for item in series),
                "uniqueLinkClicks": 0,
                "amountSpent": round(sum(item["amountSpent"] for item in series), 2),
                "leads": number(group["Leads"].sum()),
                "qualified": number(group["Qualified Lead"].sum()),
                "unqualified": max(0, number(group["Leads"].sum()) - number(group["Qualified Lead"].sum())),
                "cpql": meta_summary.get("cpql", 0),
                "campaigns": [],
                "series": series,
            }
        )
    return rows


def parse_seo_workbook(xlsx_path):
    search = pd.read_excel(xlsx_path, sheet_name="Google Search ConsoleSEO")
    search = search.copy()
    search["quarter"] = search["Unnamed: 0"].ffill()
    search = search[pd.to_datetime(search["Date"], errors="coerce").notna()]

    keywords_raw = pd.read_excel(xlsx_path, sheet_name="Keywords")
    keyword_headers = keywords_raw.iloc[0]
    keyword_rows = keywords_raw.iloc[1:].copy()

    quarter_keyword_map = {
        "Q4 2025": ("Q4 2025", "Unnamed: 2", "Unnamed: 3", "Unnamed: 4"),
        "Q1 2026": ("Q1 2026", "Unnamed: 6", "Unnamed: 7", "Unnamed: 8"),
        "Q2 2026": ("Q2 2026", "Unnamed: 10", "Unnamed: 11", "Unnamed: 12"),
    }
    keyword_by_quarter = {quarter: [] for quarter in quarter_keyword_map}
    for _, row in keyword_rows.iterrows():
        keyword = row["Keywords"]
        if pd.isna(keyword):
            continue
        for quarter, columns in quarter_keyword_map.items():
            clicks_col, impressions_col, ctr_col, position_col = columns
            keyword_by_quarter[quarter].append(
                {
                    "keyword": str(keyword),
                    "brandGeneric": "Brand" if "terzetto" in str(keyword).lower() else "Generic",
                    "clicks": number(row[clicks_col]),
                    "impressions": number(row[impressions_col]),
                    "ctr": ctr_percent(row[ctr_col]),
                    "position": decimal_number(row[position_col]),
                }
            )

    rows = []
    for quarter, group in search.groupby("quarter", sort=False):
        series = []
        for _, row in group.sort_values("Date").iterrows():
            series.append(
                {
                    "date": iso_date(row["Date"]),
                    "label": short_date(row["Date"]),
                    "month": month_label(row["Date"]),
                    "clicks": number(row["Clicks"]),
                    "impressions": number(row["Impressions"]),
                    "ctr": ctr_percent(row["CTR"]),
                    "position": decimal_number(row["Position"]),
                }
            )
        rows.append(
            {
                "quarter": quarter,
                "clicks": sum(item["clicks"] for item in series),
                "impressions": sum(item["impressions"] for item in series),
                "ctr": safe_ratio(sum(item["clicks"] for item in series), sum(item["impressions"] for item in series)) * 100,
                "avgPosition": safe_ratio(sum(item["position"] for item in series), len(series)),
                "uniqueKeywords": len(keyword_by_quarter.get(quarter, [])),
                "posts": 0,
                "postRows": [],
                "changesMade": "No website post/change log was included in the uploaded workbook. Add rows in Admin to track posts and SEO changes made.",
                "keywordRows": keyword_by_quarter.get(quarter, []),
                "series": series,
            }
        )
    return rows


def empty_gbp_rows(quarters):
    monthly_rows = [
        ("2025-12-01", "Q1 2026", 76, 7, 0, 37, 32),
        ("2026-01-01", "Q1 2026", 101, 5, 0, 48, 48),
        ("2026-02-01", "Q1 2026", 107, 7, 0, 58, 42),
        ("2026-03-01", "Q2 2026", 125, 9, 0, 50, 66),
        ("2026-04-01", "Q2 2026", 165, 4, 0, 104, 57),
        ("2026-05-01", "Q2 2026", 256, 8, 0, 181, 67),
    ]
    rows = []
    for quarter in quarters:
        series = [
            {
                "date": date,
                "label": short_date(date),
                "month": month_label(date),
                "profileViews": overview,
                "calls": calls,
                "bookings": bookings,
                "directionRequests": directions,
                "websiteClicks": website_clicks,
            }
            for date, row_quarter, overview, calls, bookings, directions, website_clicks in monthly_rows
            if row_quarter == quarter
        ]
        rows.append(
            {
                "quarter": quarter,
                "profileViews": sum(item["profileViews"] for item in series),
                "calls": sum(item["calls"] for item in series),
                "bookings": sum(item["bookings"] for item in series),
                "directionRequests": sum(item["directionRequests"] for item in series),
                "websiteClicks": sum(item["websiteClicks"] for item in series),
                "mapViews": sum(item["profileViews"] for item in series),
                "topCountries": [],
                "series": series,
            }
        )
    return rows


def clean_json(value):
    if isinstance(value, dict):
        return {str(key): clean_json(item) for key, item in value.items()}
    if isinstance(value, list):
        return [clean_json(item) for item in value]
    if isinstance(value, tuple):
        return [clean_json(item) for item in value]
    if isinstance(value, float) and not math.isfinite(value):
        return 0
    if pd.isna(value):
        return ""
    return value


quarterly = read_csv(CSV_FILES["quarterly"])
channel_quarterly = read_csv(CSV_FILES["channel_quarterly"])
channel_weekly = read_csv(CSV_FILES["channel_weekly"])
leads = read_csv(CSV_FILES["leads"])
weeks = read_csv(CSV_FILES["weeks"])
xlsx_path = SOURCE_DIR / WORKBOOK

quarterly_rows = parse_quarterly(quarterly)
channel_quarterly_rows = parse_channel_quarterly(channel_quarterly)
channel_weekly_rows = parse_channel_weekly(channel_weekly)
week_rows = parse_weeks(weeks)
lead_summary = parse_leads(leads)
social_rows = parse_social_workbook(xlsx_path)
meta_rows = parse_meta_workbook(xlsx_path, channel_quarterly_rows)
seo_rows = parse_seo_workbook(xlsx_path)
quarters = sorted({row["quarter"] for row in quarterly_rows}, key=quarter_sort_key)

data = {
    "updatedAt": pd.Timestamp.now().strftime("%Y-%m-%d"),
    "sourceFiles": [*CSV_FILES.values(), WORKBOOK],
    "reportSource": {
        "title": "Digital Marketing Quarterly Reporting",
        "client": "Terzetto Homes",
        "period": "Quarterly marketing dashboard",
        "preparedBy": "Hanna Patricia Lictawa",
        "extractedTextPreview": "",
    },
    "quarters": quarterly_rows,
    "channelQuarterly": channel_quarterly_rows,
    "channelWeekly": channel_weekly_rows,
    "weeks": week_rows,
    "leadSummary": lead_summary,
    "socialPlatforms": social_rows,
    "metaAds": meta_rows,
    "seoReport": seo_rows,
    "googleBusiness": empty_gbp_rows(quarters),
    "manual": {
        "targets": {"metaQualifiedLeads": 8, "monthlyLeads": 20, "weeklyLeads": 5},
        "notes": {
            "dataNote": "This dashboard was rebuilt from the May 28 CSV exports and Marketing CSV Dashboard workbook.",
            "missingFields": "Follower counts, social post counts, and GBP actions were not present in the uploaded files and can be entered from Admin.",
        },
        "airtable": {
            "enabled": False,
            "baseId": "",
            "quarterlyTable": "",
            "weeklyTable": "",
            "leadTable": "",
            "lastSync": "",
        },
        "connections": {},
    },
}

OUTPUT.write_text(json.dumps(clean_json(data), indent=2, allow_nan=False), encoding="utf-8")
print(f"Wrote {OUTPUT}")

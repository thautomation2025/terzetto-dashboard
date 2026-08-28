"""Update the dashboard dataset from the current marketing CSV exports.

The two quarterly reports intentionally use different cohort dates:

* Overall Quarterly Performance: qualification-date cohort.
* Marketing/Channel Performance: lead-entry-date cohort.

Run with the bundled or local Python runtime:
    python tools/update_dashboard_data.py --source-dir /path/to/reports
"""

from __future__ import annotations

import argparse
import json
import math
import re
from collections import defaultdict
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "marketing-data.json"

FILES = {
    "leads": "Leads-Grid view-2.csv",
    "overall": "Overall Quarterly Performance-Grid view-2.csv",
    "channel_monthly": "Channel Monthly Performance-Channel View-2.csv",
    "channel_quarterly": "Channel Quarterly Performance-Grid view-2.csv",
    "marketing_quarterly": "Marketing Quarterly Performance-Grid view-2.csv",
    "youtube": "Marketing CSV Dashboard - YouTube.csv",
    "social": "Marketing CSV Dashboard - IG-TikTok-FB.csv",
    "seo": "Marketing CSV Dashboard - Google Search Console_SEO.csv",
    "meta": "Marketing CSV Dashboard - Meta Ads Reporting.csv",
}


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", type=Path, default=Path.home() / "Downloads")
    return parser.parse_args()


def read_csv(path: Path, **kwargs):
    frame = pd.read_csv(path, encoding="utf-8-sig", **kwargs)
    frame.columns = [str(column).strip() for column in frame.columns]
    return frame


def number(value):
    if pd.isna(value) or value == "":
        return 0
    cleaned = re.sub(r"[^0-9.-]", "", str(value))
    try:
        result = float(cleaned or 0)
    except ValueError:
        return 0
    return int(result) if math.isfinite(result) else 0


def decimal(value, digits=2):
    if pd.isna(value) or value == "":
        return 0.0
    cleaned = re.sub(r"[^0-9.-]", "", str(value))
    try:
        result = float(cleaned or 0)
    except ValueError:
        return 0.0
    return round(result, digits) if math.isfinite(result) else 0.0


def percent(value):
    return decimal(value, 4)


def truthy(value):
    if pd.isna(value):
        return False
    text = str(value).strip().lower()
    return text in {"checked", "true", "yes", "y", "1", "won", "qualified"} or number(value) > 0


def text_value(value):
    return "" if pd.isna(value) else str(value).strip()


def parsed_date(value):
    return pd.to_datetime(value, errors="coerce")


def iso_date(value):
    date = parsed_date(value)
    return "" if pd.isna(date) else date.strftime("%Y-%m-%d")


def month_label(value):
    date = parsed_date(value)
    return "" if pd.isna(date) else date.strftime("%b %Y")


def short_date(value):
    date = parsed_date(value)
    if pd.isna(date):
        return ""
    return f"{date.strftime('%b')} {date.day}"


def quarter_from_date(value):
    date = parsed_date(value)
    if pd.isna(date):
        return ""
    if date.month in (12, 1, 2):
        year = date.year + 1 if date.month == 12 else date.year
        return f"Q1 {year}"
    if date.month in (3, 4, 5):
        return f"Q2 {date.year}"
    if date.month in (6, 7, 8):
        return f"Q3 {date.year}"
    return f"Q4 {date.year}"


def quarter_sort_key(value):
    match = re.search(r"Q([1-4])\s+(\d{4})", str(value))
    return (int(match.group(2)), int(match.group(1))) if match else (0, 0)


def safe_ratio(top, bottom):
    return top / bottom if bottom else 0


def parse_quarter_rows(frame, quarter_field):
    rows = []
    for _, row in frame.iterrows():
        quarter = text_value(row.get(quarter_field))
        if not re.fullmatch(r"Q[1-4]\s+\d{4}", quarter):
            continue
        qualified = number(row.get("Qualified Leads"))
        won = number(row.get("Won Leads"))
        spend = decimal(row.get("Spend"))
        revenue = decimal(row.get("Revenue Won"))
        rows.append(
            {
                "quarter": quarter,
                "spend": spend,
                "leads": number(row.get("Leads")),
                "qualified": qualified,
                "cpql": decimal(row.get("CPQL")) or round(safe_ratio(spend, qualified), 2),
                "won": won,
                "cpa": decimal(row.get("CPA")) or round(safe_ratio(spend, won), 2),
                "winRate": percent(row.get("Win Rate")),
                "closingRatio": percent(row.get("Win Rate")),
                "revenue": revenue,
            }
        )
    return sorted(rows, key=lambda item: quarter_sort_key(item["quarter"]))


def parse_channel_quarterly(frame):
    rows = []
    for _, row in frame.iterrows():
        quarter = text_value(row.get("Quarter"))
        channel = text_value(row.get("Channel"))
        if not quarter or not channel:
            continue
        rows.append(
            {
                "quarter": quarter,
                "channel": channel,
                "spend": decimal(row.get("Spend")),
                "leads": number(row.get("Leads")),
                "qualified": number(row.get("Qualified Lead Count", row.get("Qualified Leads"))),
                "cpql": decimal(row.get("CPQL")),
                "won": number(row.get("Won Leads")),
                "revenue": decimal(row.get("Revenue Won")),
                "roas": decimal(row.get("ROAS")),
            }
        )
    return sorted(rows, key=lambda item: (quarter_sort_key(item["quarter"]), item["channel"]))


def parse_channel_monthly(frame):
    rows = []
    for _, row in frame.iterrows():
        date = row.get("Months")
        quarter = text_value(row.get("Quarter")) or quarter_from_date(date)
        channel = text_value(row.get("Channel"))
        if not iso_date(date) or not channel:
            continue
        rows.append(
            {
                "week": iso_date(date),
                "label": str(row.get("Name", "") or month_label(date)).strip(),
                "quarter": quarter,
                "channel": channel,
                "spend": decimal(row.get("Spend")),
                "clicks": 0,
                "ctr": 0,
                "leads": number(row.get("Total Leads", row.get("Leads"))),
                "qualified": number(row.get("Total Qualified Leads", row.get("Qualified Leads"))),
                "won": number(row.get("Won Leads")),
                "revenue": decimal(row.get("Revenue Won")),
                "month": month_label(date),
            }
        )
    return sorted(rows, key=lambda item: (item["week"], item["channel"]))


def aggregate_months(channel_monthly):
    grouped = defaultdict(lambda: {"leads": 0, "qualified": 0, "won": 0, "revenue": 0.0, "spend": 0.0})
    for row in channel_monthly:
        key = (row["quarter"], row["week"], row["month"])
        for field in ("leads", "qualified", "won", "revenue", "spend"):
            grouped[key][field] += row[field]
    rows = []
    for (quarter, date, month), values in grouped.items():
        rows.append(
            {
                "week": date,
                "range": month,
                "quarter": quarter,
                "month": month,
                **{key: round(value, 2) if key in {"revenue", "spend"} else value for key, value in values.items()},
            }
        )
    return sorted(rows, key=lambda item: item["week"])


def parse_leads(frame):
    statuses = defaultdict(int)
    sources = defaultdict(int)
    channels = {}
    monthly = {}
    channel_periods = {}
    status_periods = {}
    lead_records = []
    won_deals = []
    totals = {"leads": len(frame), "qualified": 0, "lost": 0, "inProgress": 0, "won": 0, "revenue": 0.0, "pipelineValue": 0.0}

    def metric_row(store, key, base):
        if key not in store:
            store[key] = {**base, "leads": 0, "qualified": 0, "lost": 0, "inProgress": 0, "won": 0, "revenue": 0.0, "pipelineValue": 0.0}
        return store[key]

    for _, raw in frame.iterrows():
        name = text_value(raw.get("Name")) or "Unnamed lead"
        status = text_value(raw.get("Status")) or "Uncategorized"
        source = text_value(raw.get("Source")) or "Uncategorized"
        channel = text_value(raw.get("Channel Group")) or "Uncategorized"
        date_added = raw.get("Date Added")
        qualified_date = raw.get("Qualified Date")
        won_date = raw.get("Won Date")
        entry_quarter = text_value(raw.get("Lead Quarter")) or quarter_from_date(date_added)
        entry_month = month_label(date_added)
        qualified = 1 if iso_date(qualified_date) or truthy(raw.get("Qualified?")) else 0
        qualified_period_date = qualified_date if iso_date(qualified_date) else date_added if qualified else ""
        qualified_quarter = quarter_from_date(qualified_period_date) if qualified else ""
        qualified_month = month_label(qualified_period_date) if qualified else ""
        lifecycle_quarter = qualified_quarter or entry_quarter
        lifecycle_month = qualified_month or entry_month
        won = 1 if iso_date(won_date) or truthy(raw.get("Won Count")) or status.lower() == "won" else 0
        lost = 1 if status.lower() == "lost" else 0
        in_progress = 1 if qualified and not won and not lost else 0
        revenue = decimal(raw.get("Revenue Won"))
        pipeline_value = decimal(raw.get("Est. Revenue")) if in_progress else 0.0
        won_quarter = quarter_from_date(won_date) if won else ""
        won_month = month_label(won_date) if won else ""

        statuses[status] += 1
        sources[source] += 1
        channel_row = metric_row(channels, channel, {"channel": channel})
        entry_month_row = metric_row(monthly, (entry_quarter, entry_month), {"quarter": entry_quarter, "month": entry_month})
        entry_channel_row = metric_row(channel_periods, (entry_quarter, entry_month, channel), {"quarter": entry_quarter, "month": entry_month, "channel": channel})
        lifecycle_month_row = metric_row(monthly, (lifecycle_quarter, lifecycle_month), {"quarter": lifecycle_quarter, "month": lifecycle_month})
        lifecycle_channel_row = metric_row(channel_periods, (lifecycle_quarter, lifecycle_month, channel), {"quarter": lifecycle_quarter, "month": lifecycle_month, "channel": channel})

        channel_row["leads"] += 1
        entry_month_row["leads"] += 1
        entry_channel_row["leads"] += 1
        for target in (channel_row, lifecycle_month_row, lifecycle_channel_row):
            target["qualified"] += qualified
            target["lost"] += lost
            target["inProgress"] += in_progress
            target["won"] += won
            target["revenue"] += revenue
            target["pipelineValue"] += pipeline_value

        status_key = (lifecycle_quarter, lifecycle_month, status)
        status_periods.setdefault(status_key, {"quarter": lifecycle_quarter, "month": lifecycle_month, "status": status, "count": 0})["count"] += 1

        record = {
            "name": name,
            "status": status,
            "source": source,
            "channel": channel,
            "quarter": lifecycle_quarter,
            "month": lifecycle_month,
            "leadQuarter": entry_quarter,
            "leadMonth": entry_month,
            "qualifiedQuarter": qualified_quarter,
            "qualifiedMonth": qualified_month,
            "wonQuarter": won_quarter,
            "wonMonth": won_month,
            "revenue": revenue,
            "pipelineValue": pipeline_value,
            "date": iso_date(date_added),
            "qualifiedDate": iso_date(qualified_period_date),
            "wonDate": iso_date(won_date),
        }
        lead_records.append(record)
        if won:
            won_deals.append(
                {
                    "client": name,
                    "source": channel or source,
                    "revenue": revenue,
                    "date": iso_date(won_date) or iso_date(qualified_period_date) or iso_date(date_added),
                    "label": short_date(won_date or qualified_period_date or date_added),
                    "quarter": lifecycle_quarter,
                    "month": lifecycle_month,
                    "wonQuarter": won_quarter,
                    "wonMonth": won_month,
                }
            )

        totals["qualified"] += qualified
        totals["lost"] += lost
        totals["inProgress"] += in_progress
        totals["won"] += won
        totals["revenue"] += revenue
        totals["pipelineValue"] += pipeline_value

    def clean_metric_rows(values):
        rows = []
        for row in values:
            row = dict(row)
            row["revenue"] = round(row["revenue"], 2)
            row["pipelineValue"] = round(row["pipelineValue"], 2)
            rows.append(row)
        return rows

    totals["revenue"] = round(totals["revenue"], 2)
    totals["pipelineValue"] = round(totals["pipelineValue"], 2)
    return {
        "statuses": dict(sorted(statuses.items(), key=lambda item: (-item[1], item[0]))[:12]),
        "sources": dict(sorted(sources.items(), key=lambda item: (-item[1], item[0]))[:12]),
        "channels": clean_metric_rows(channels.values()),
        "channelPeriods": clean_metric_rows(channel_periods.values()),
        "statusPeriods": list(status_periods.values()),
        "leadRecords": sorted(lead_records, key=lambda row: (row["date"], row["name"])),
        "wonDeals": sorted(won_deals, key=lambda row: row["date"]),
        "monthly": clean_metric_rows(monthly.values()),
        "totals": totals,
    }


def platform_color(platform):
    return {"Facebook": "#3c8ed9", "Instagram": "#c12400", "TikTok": "#151312", "YouTube": "#544845"}.get(platform, "#544845")


def social_item(date, views, reach, engagements, link_clicks=0):
    return {
        "date": iso_date(date),
        "label": short_date(date),
        "month": month_label(date),
        "contentViews": number(views),
        "reach": number(reach),
        "views": number(views),
        "engagements": number(engagements),
        "linkClicks": number(link_clicks),
        "pageViews": 0,
    }


def parse_social(social_path, youtube_path):
    names = ["Date", "Facebook Views", "Facebook Reach", "Facebook Engagements", "Facebook Link Clicks", "Instagram Views", "Instagram Reach", "Instagram Engagements", "Instagram Link Clicks", "TikTok Views", "TikTok Reach", "TikTok Engagements"]
    social = pd.read_csv(social_path, encoding="utf-8-sig", skiprows=2, names=names)
    series = defaultdict(list)
    for _, row in social.iterrows():
        date = row["Date"]
        quarter = quarter_from_date(date)
        if not quarter:
            continue
        series[(quarter, "Facebook")].append(social_item(date, row["Facebook Views"], row["Facebook Reach"], row["Facebook Engagements"], row["Facebook Link Clicks"]))
        series[(quarter, "Instagram")].append(social_item(date, row["Instagram Views"], row["Instagram Reach"], row["Instagram Engagements"], row["Instagram Link Clicks"]))
        series[(quarter, "TikTok")].append(social_item(date, row["TikTok Views"], row["TikTok Reach"], row["TikTok Engagements"]))

    youtube = read_csv(youtube_path)
    quarter_column = youtube.columns[0]
    youtube[quarter_column] = youtube[quarter_column].ffill()
    for _, row in youtube.iterrows():
        date = row.get("Date")
        quarter = quarter_from_date(date) or text_value(row.get(quarter_column))
        if not iso_date(date):
            continue
        series[(quarter, "YouTube")].append(social_item(date, row.get("Views"), row.get("Reach"), row.get("Engagement")))

    rows = []
    for (quarter, platform), items in sorted(series.items(), key=lambda item: (quarter_sort_key(item[0][0]), item[0][1])):
        reach = sum(item["reach"] for item in items)
        engagements = sum(item["engagements"] for item in items)
        views = sum(item["views"] for item in items)
        rows.append(
            {
                "quarter": quarter,
                "platform": platform,
                "color": platform_color(platform),
                "contentViews": views,
                "reach": reach,
                "views": views,
                "engagements": engagements,
                "linkClicks": sum(item["linkClicks"] for item in items),
                "pageViews": 0,
                "engagementRate": round(safe_ratio(engagements, reach) * 100, 4),
                "series": sorted(items, key=lambda item: item["date"]),
            }
        )
    return rows


def parse_meta(frame, channel_rows):
    summaries = {(row["quarter"], row["channel"]): row for row in channel_rows}
    frame = frame.copy()
    frame["Parsed Date"] = frame["Day"].map(parsed_date)
    frame = frame[frame["Parsed Date"].notna()]
    frame["Resolved Quarter"] = frame.apply(lambda row: text_value(row.get("Quarter")) or quarter_from_date(row["Day"]), axis=1)
    rows = []
    for quarter, group in frame.groupby("Resolved Quarter", sort=False):
        items = []
        for _, row in group.sort_values("Parsed Date").iterrows():
            items.append(
                {
                    "date": iso_date(row["Day"]),
                    "label": short_date(row["Day"]),
                    "month": month_label(row["Day"]),
                    "impressions": number(row.get("Impressions")),
                    "reach": number(row.get("Reach")),
                    "linkClicks": number(row.get("Link clicks")),
                    "uniqueLinkClicks": 0,
                    "amountSpent": decimal(row.get("Amount spent (CAD)")),
                    "cpm": decimal(row.get("CPM (cost per 1,000 impressions)")),
                    "cpc": decimal(row.get("CPC (cost per link click)")),
                    "ctr": decimal(row.get("CTR (all)"), 4),
                }
            )
        summary = summaries.get((quarter, "Meta Ads"), {})
        impressions = sum(item["impressions"] for item in items)
        reach = sum(item["reach"] for item in items)
        link_clicks = sum(item["linkClicks"] for item in items)
        spend = round(sum(item["amountSpent"] for item in items), 2)
        leads = number(group["Leads"].fillna(0).sum())
        qualified = number(group["Qualified Lead"].fillna(0).sum())
        rows.append(
            {
                "quarter": quarter,
                "impressions": impressions,
                "reach": reach,
                "avgDailyReach": round(safe_ratio(reach, len(items))),
                "frequency": safe_ratio(impressions, reach),
                "linkClicks": link_clicks,
                "uniqueLinkClicks": 0,
                "amountSpent": spend,
                "leads": leads,
                "qualified": qualified,
                "unqualified": max(0, leads - qualified),
                "cpql": summary.get("cpql", round(safe_ratio(spend, qualified), 2)),
                "campaigns": [],
                "series": items,
                "cpm": safe_ratio(spend, impressions) * 1000,
                "cpc": safe_ratio(spend, link_clicks),
                "ctr": safe_ratio(link_clicks, impressions) * 100,
            }
        )
    return rows


def parse_seo(path, existing_rows):
    frame = read_csv(path, skiprows=1)
    frame["Parsed Date"] = frame["Date"].map(parsed_date)
    frame = frame[frame["Parsed Date"].notna()]
    frame["Resolved Quarter"] = frame.apply(lambda row: text_value(row.get("Quarter")) or quarter_from_date(row["Date"]), axis=1)
    existing = {row.get("quarter"): row for row in existing_rows}
    rows = []
    for quarter, group in frame.groupby("Resolved Quarter", sort=False):
        items = []
        for _, row in group.sort_values("Parsed Date").iterrows():
            items.append(
                {
                    "date": iso_date(row["Date"]),
                    "label": short_date(row["Date"]),
                    "month": month_label(row["Date"]),
                    "clicks": number(row.get("Clicks")),
                    "impressions": number(row.get("Impressions")),
                    "ctr": decimal(row.get("CTR"), 4),
                    "position": decimal(row.get("Position"), 4),
                }
            )
        clicks = sum(item["clicks"] for item in items)
        impressions = sum(item["impressions"] for item in items)
        prior = existing.get(quarter, {})
        rows.append(
            {
                **{key: value for key, value in prior.items() if key not in {"clicks", "impressions", "ctr", "avgPosition", "series", "source", "sourceRange"}},
                "quarter": quarter,
                "source": FILES["seo"],
                "sourceRange": f"{items[0]['date']} to {items[-1]['date']}" if items else "",
                "clicks": clicks,
                "impressions": impressions,
                "ctr": safe_ratio(clicks, impressions) * 100,
                "avgPosition": safe_ratio(sum(item["position"] for item in items), len(items)),
                "series": items,
            }
        )
    return rows


def clean_json(value):
    if isinstance(value, dict):
        return {str(key): clean_json(item) for key, item in value.items()}
    if isinstance(value, list):
        return [clean_json(item) for item in value]
    if isinstance(value, float) and not math.isfinite(value):
        return 0
    if pd.isna(value):
        return ""
    return value


def main():
    args = parse_args()
    paths = {key: args.source_dir / name for key, name in FILES.items()}
    missing = [str(path) for path in paths.values() if not path.exists()]
    if missing:
        raise FileNotFoundError("Missing report files:\n" + "\n".join(missing))

    existing = json.loads(OUTPUT.read_text(encoding="utf-8")) if OUTPUT.exists() else {}
    overall = parse_quarter_rows(read_csv(paths["overall"]), "Name")
    marketing = parse_quarter_rows(read_csv(paths["marketing_quarterly"]), "Quarter")
    channel_quarterly = parse_channel_quarterly(read_csv(paths["channel_quarterly"]))
    channel_monthly = parse_channel_monthly(read_csv(paths["channel_monthly"]))

    data = existing
    data.update(
        {
            "updatedAt": pd.Timestamp.now(tz="Asia/Manila").strftime("%Y-%m-%d"),
            "sourceFiles": list(FILES.values()),
            "quarters": overall,
            "marketingQuarters": marketing,
            "channelQuarterly": channel_quarterly,
            "channelWeekly": channel_monthly,
            "weeks": aggregate_months(channel_monthly),
            "leadSummary": parse_leads(read_csv(paths["leads"])),
            "socialPlatforms": parse_social(paths["social"], paths["youtube"]),
            "metaAds": parse_meta(read_csv(paths["meta"]), channel_quarterly),
            "seoReport": parse_seo(paths["seo"], existing.get("seoReport", [])),
            "reportDefinitions": {
                "overview": "Overall Quarterly Performance is the primary view, using the qualification-date reporting basis. Marketing and channel intake figures remain available as supporting Date Added detail.",
                "social": "Organic and boosted social performance across Instagram, Facebook, TikTok, and YouTube.",
                "meta": "Paid Meta campaign delivery, cost, click, conversion, and lead-quality diagnostics.",
                "seo": "Google Search Console, Google Business Profile, and keyword ranking performance.",
                "leads": "Lead intake uses Date Added; qualification reporting uses Qualified Date; close-cycle timing uses Won Date. Records with missing or reversed timestamps are excluded from timing averages.",
            },
        }
    )
    data.setdefault("manual", {}).setdefault("notes", {})["dataNote"] = (
        "Updated from the August 29, 2026 CSV exports. Overall Quarterly Performance uses the qualification-date cohort; Marketing and Channel Performance use the lead-entry-date cohort."
    )
    data["manual"]["notes"]["missingFields"] = (
        "No new Google Business Profile or keyword-detail export was included; those existing dashboard sections were retained."
    )
    OUTPUT.write_text(json.dumps(clean_json(data), indent=2, ensure_ascii=False, allow_nan=False), encoding="utf-8")
    print(f"Wrote {OUTPUT}")


if __name__ == "__main__":
    main()

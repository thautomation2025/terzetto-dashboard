# Digital Marketing Dashboard

This is a local dashboard prototype for quarter, monthly, weekly, and channel-level marketing reporting.

## Open the dashboard

Use the standalone dashboard file:

```text
dashboard-standalone.html
```

## Views

- CEO view: password-protected, read-only dashboard for overview, comparisons, social, Meta Ads, SEO, leads, and weekly performance.
- Admin backend: password-protected editing area for CSV uploads, direct updates by report area, targets, report notes, and connection/link fields.

The prototype CEO password is:

```text
terzettoceo2026
```

The prototype Admin password is:

```text
admin2026
```

For a production deployment, replace this client-side password with a real backend login.

## Uploads

The backend can read these CSV export shapes:

- Quarterly Performance
- Channel Quarterly Performance
- Channel Weekly Performance
- Leads export
- Weeks summary
- Social Media CSV with `Quarter, Platform, Date, Views, Reach, Engagements, Link Clicks`
- Social post-count CSV with `Quarter, Platform, Month, Posts`
- Meta Ads CSV with `Quarter, Date, Impressions, Link Clicks, Amount Spent, CPM, CPC, CTR`
- SEO/Search Console CSV with `Quarter, Date, Clicks, Impressions, Average CTR, Average Position`
- SEO post-link CSV with `Quarter, Post Date, Post Link, Title`
- Keyword CSV with `Quarter, Keyword, Clicks, Impressions, CTR, Average Position`
- GBP CSV with `Quarter, Date, Calls, Bookings, Directions, Website Clicks`

Lead uploads are aggregated before saving. Emails, phone numbers, and notes are not retained in the dashboard data.

## Source data

Update the dashboard data from the latest CSV exports using:

```text
python tools/update_dashboard_data.py --source-dir /path/to/reports
```

The generated app dataset lives at:

```text
data/marketing-data.json
```

The importer preserves two reporting bases:

- Overall Quarterly Performance is grouped by the date a lead becomes qualified.
- Marketing and Channel Performance are grouped by the date the lead first enters the pipeline.

Rebuild the local standalone file after a data or UI change:

```text
python tools/build_standalone.py
```

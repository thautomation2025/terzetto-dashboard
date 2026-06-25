const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || "apptyU2BYHf4YsIol";
const AIRTABLE_LEADS_TABLE = process.env.AIRTABLE_LEADS_TABLE || "Leads";
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;

const LEAD_FIELDS = [
  "Name",
  "Email",
  "Phone Number",
  "Location",
  "Services",
  "Start Date",
  "Budget",
  "Photos (if available)",
  "Site Visit",
  "Notes",
  "Source",
  "Status",
  "Week",
  "Channel Group",
  "Channel Weekly Record",
  "Est. Revenue",
  "Revenue Won",
  "Quarter",
  "Date Added",
  "Date Added to CoConstruct",
  "Feedback",
  "Won?",
  "Qualified?",
];

const QUALIFIED_DATE_FIELDS = [
  "Date Added to CoConstruct",
  "Date Added to Coconstruct",
  "Date Added to Co-Construct",
  "Added to CoConstruct",
  "Added to Coconstruct",
  "Added to Co-Construct",
  "Added to CoConstruct Date",
  "Added to Coconstruct Date",
  "Added to Co-Construct Date",
  "CoConstruct Date",
  "Coconstruct Date",
  "Co-Construct Date",
  "Qualified Date",
  "Date Qualified",
  "Month Qualified",
];

function jsonResponse(res, status, body) {
  res.statusCode = status;
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

async function readAllAirtableRecords() {
  const rows = [];
  let offset = "";
  do {
    const url = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_LEADS_TABLE)}`);
    url.searchParams.set("pageSize", "100");
    // Fetch all fields so Airtable schema additions, such as qualification date, do not break sync.
    if (offset) url.searchParams.set("offset", offset);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_TOKEN}`,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Airtable returned ${response.status}: ${text}`);
    }

    const payload = await response.json();
    rows.push(...payload.records.map((record) => record.fields || {}));
    offset = payload.offset || "";
  } while (offset);

  return rows;
}

function parseNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  const result = Number(String(value).replace(/[^0-9.-]/g, "") || 0);
  return Number.isFinite(result) ? result : 0;
}

function cellText(value, fallback = "") {
  if (value === null || value === undefined || value === "") return fallback;
  if (Array.isArray(value)) return value.map((item) => cellText(item)).filter(Boolean).join(", ") || fallback;
  if (typeof value === "object") return value.name || value.email || value.text || value.value || fallback;
  return String(value).trim() || fallback;
}

function cellTruthy(value) {
  if (Array.isArray(value)) return value.some(cellTruthy);
  if (typeof value === "boolean") return value;
  const text = cellText(value).toLowerCase();
  return ["checked", "true", "yes", "y", "1", "won", "qualified"].includes(text) || parseNumber(value) > 0;
}

function normalizeColumnName(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function fieldValue(row, names) {
  const entries = Object.entries(row || {});
  for (const name of names) {
    const normalizedName = normalizeColumnName(name);
    const found = entries.find(([key]) => normalizeColumnName(key) === normalizedName);
    if (found) return found[1];
  }
  return "";
}

function quarterFromDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  if ([12, 1, 2].includes(month)) return `Q1 ${month === 12 ? year + 1 : year}`;
  if ([3, 4, 5].includes(month)) return `Q2 ${year}`;
  if ([6, 7, 8].includes(month)) return `Q3 ${year}`;
  return `Q4 ${year}`;
}

function monthLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("en-CA", { month: "short", year: "numeric" });
}

function toIsoDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function shortDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || "");
  return date.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

function sortObject(object) {
  return Object.fromEntries(Object.entries(object).sort((a, b) => b[1] - a[1]).slice(0, 12));
}

function aggregateLeadRows(rows) {
  const statuses = {};
  const sources = {};
  const channels = {};
  const channelPeriods = {};
  const statusPeriods = {};
  const monthly = {};
  const wonDeals = [];
  const leadRecords = [];
  const totals = { leads: rows.length, qualified: 0, lost: 0, inProgress: 0, won: 0, revenue: 0, pipelineValue: 0 };
  const ensureMonthly = (quarter, month) => {
    monthly[`${quarter}|${month}`] ||= { quarter, month, leads: 0, qualified: 0, lost: 0, inProgress: 0, won: 0, revenue: 0, pipelineValue: 0 };
    return monthly[`${quarter}|${month}`];
  };
  const ensureChannelPeriod = (quarter, month, channel) => {
    channelPeriods[`${quarter}|${month}|${channel}`] ||= { quarter, month, channel, leads: 0, qualified: 0, lost: 0, inProgress: 0, won: 0, revenue: 0, pipelineValue: 0 };
    return channelPeriods[`${quarter}|${month}|${channel}`];
  };
  const ensureStatusPeriod = (quarter, month, status) => {
    statusPeriods[`${quarter}|${month}|${status}`] ||= { quarter, month, status, count: 0 };
    return statusPeriods[`${quarter}|${month}|${status}`];
  };
  rows.forEach((row) => {
    const dateAdded = cellText(fieldValue(row, ["Date Added", "Month Added", "Created Date"])) || new Date().toISOString().slice(0, 10);
    const status = cellText(row.Status, "Uncategorized");
    const statusLower = status.toLowerCase();
    const source = cellText(row.Source, "Uncategorized");
    const channel = cellText(row["Channel Group"], "Uncategorized");
    const month = monthLabel(dateAdded);
    const qualifiedDate = fieldValue(row, QUALIFIED_DATE_FIELDS);
    const fallbackQualified = cellTruthy(row["Qualified?"]) ? 1 : 0;
    const qualified = qualifiedDate ? 1 : fallbackQualified;
    const qualifiedPeriodDate = qualifiedDate || (fallbackQualified ? dateAdded : "");
    const qualifiedMonth = qualifiedPeriodDate ? monthLabel(qualifiedPeriodDate) : month;
    const qualifiedQuarter = qualifiedPeriodDate ? quarterFromDate(qualifiedPeriodDate) || quarterFromDate(dateAdded) : "";
    const won = cellTruthy(fieldValue(row, ["Won?", "Won Count", "Won Leads", "Won"])) || statusLower === "won" ? 1 : 0;
    const lost = statusLower === "lost" ? 1 : 0;
    const inProgress = qualified && !won && !lost ? 1 : 0;
    const revenue = parseNumber(row["Revenue Won"]);
    const pipelineValue = inProgress ? parseNumber(row["Est. Revenue"]) : 0;
    const quarter = cellText(row.Quarter) || quarterFromDate(dateAdded);
    const lifecycleQuarter = qualifiedPeriodDate ? qualifiedQuarter : quarter;
    const lifecycleMonth = qualifiedPeriodDate ? qualifiedMonth : month;
    leadRecords.push({
      name: cellText(row.Name, "Unnamed lead"),
      status,
      source,
      channel,
      quarter: lifecycleQuarter,
      month: lifecycleMonth,
      leadQuarter: quarter,
      leadMonth: month,
      qualifiedQuarter,
      qualifiedMonth,
      revenue,
      pipelineValue,
      date: toIsoDate(dateAdded),
      qualifiedDate: toIsoDate(qualifiedPeriodDate),
    });
    statuses[status] = (statuses[status] || 0) + 1;
    sources[source] = (sources[source] || 0) + 1;
    channels[channel] ||= { channel, leads: 0, qualified: 0, lost: 0, inProgress: 0, won: 0, revenue: 0, pipelineValue: 0 };
    const leadMonthRow = ensureMonthly(quarter, month);
    const leadChannelRow = ensureChannelPeriod(quarter, month, channel);
    const lifecycleMonthRow = ensureMonthly(lifecycleQuarter, lifecycleMonth);
    const lifecycleChannelRow = ensureChannelPeriod(lifecycleQuarter, lifecycleMonth, channel);
    channels[channel].leads += 1;
    channels[channel].qualified += qualified;
    channels[channel].lost += lost;
    channels[channel].inProgress += inProgress;
    channels[channel].won += won;
    channels[channel].revenue += revenue;
    channels[channel].pipelineValue += pipelineValue;
    leadMonthRow.leads += 1;
    leadChannelRow.leads += 1;
    lifecycleMonthRow.qualified += qualified;
    lifecycleMonthRow.lost += lost;
    lifecycleMonthRow.inProgress += inProgress;
    lifecycleMonthRow.won += won;
    lifecycleMonthRow.revenue += revenue;
    lifecycleMonthRow.pipelineValue += pipelineValue;
    lifecycleChannelRow.qualified += qualified;
    lifecycleChannelRow.lost += lost;
    lifecycleChannelRow.inProgress += inProgress;
    lifecycleChannelRow.won += won;
    lifecycleChannelRow.revenue += revenue;
    lifecycleChannelRow.pipelineValue += pipelineValue;
    ensureStatusPeriod(lifecycleQuarter, lifecycleMonth, status).count += 1;
    if (won) {
      wonDeals.push({
        client: cellText(row.Name, "Closed deal"),
        source: channel || source,
        revenue,
        date: toIsoDate(qualifiedPeriodDate || dateAdded),
        label: shortDate(qualifiedPeriodDate || dateAdded),
        quarter: lifecycleQuarter,
        month: lifecycleMonth,
      });
    }
    totals.qualified += qualified;
    totals.lost += lost;
    totals.inProgress += inProgress;
    totals.won += won;
    totals.revenue += revenue;
    totals.pipelineValue += pipelineValue;
  });
  return {
    statuses: sortObject(statuses),
    sources: sortObject(sources),
    channels: Object.values(channels),
    channelPeriods: Object.values(channelPeriods),
    statusPeriods: Object.values(statusPeriods),
    leadRecords,
    wonDeals: wonDeals.sort((a, b) => String(a.date || "").localeCompare(String(b.date || ""))),
    monthly: Object.values(monthly),
    totals,
  };
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    jsonResponse(res, 200, {});
    return;
  }

  if (!AIRTABLE_TOKEN) {
    jsonResponse(res, 500, { error: "Missing AIRTABLE_TOKEN environment variable." });
    return;
  }

  try {
    const leads = await readAllAirtableRecords();
    jsonResponse(res, 200, {
      data: {
        leadSummary: aggregateLeadRows(leads),
        updatedAt: new Date().toISOString().slice(0, 10),
      },
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    jsonResponse(res, 500, { error: error.message });
  }
};

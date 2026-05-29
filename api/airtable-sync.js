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
  "Feedback",
  "Won?",
  "Qualified?",
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
    LEAD_FIELDS.forEach((field) => url.searchParams.append("fields[]", field));
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
  rows.forEach((row) => {
    const dateAdded = cellText(row["Date Added"]) || new Date().toISOString().slice(0, 10);
    const status = cellText(row.Status, "Uncategorized");
    const statusLower = status.toLowerCase();
    const source = cellText(row.Source, "Uncategorized");
    const channel = cellText(row["Channel Group"], "Uncategorized");
    const month = monthLabel(dateAdded);
    const qualified = cellTruthy(row["Qualified?"]) ? 1 : 0;
    const won = cellTruthy(row["Won?"]) ? 1 : 0;
    const lost = statusLower === "lost" ? 1 : 0;
    const inProgress = qualified && !won && !lost ? 1 : 0;
    const revenue = parseNumber(row["Revenue Won"]);
    const pipelineValue = inProgress ? parseNumber(row["Est. Revenue"]) : 0;
    const quarter = cellText(row.Quarter) || quarterFromDate(dateAdded);
    leadRecords.push({
      name: cellText(row.Name, "Unnamed lead"),
      status,
      source,
      channel,
      quarter,
      month,
      revenue,
      pipelineValue,
      date: toIsoDate(dateAdded),
    });
    statuses[status] = (statuses[status] || 0) + 1;
    sources[source] = (sources[source] || 0) + 1;
    channels[channel] ||= { channel, leads: 0, qualified: 0, lost: 0, inProgress: 0, won: 0, revenue: 0, pipelineValue: 0 };
    monthly[`${quarter}|${month}`] ||= { quarter, month, leads: 0, qualified: 0, lost: 0, inProgress: 0, won: 0, revenue: 0, pipelineValue: 0 };
    channelPeriods[`${quarter}|${month}|${channel}`] ||= { quarter, month, channel, leads: 0, qualified: 0, lost: 0, inProgress: 0, won: 0, revenue: 0, pipelineValue: 0 };
    statusPeriods[`${quarter}|${month}|${status}`] ||= { quarter, month, status, count: 0 };
    channels[channel].leads += 1;
    channels[channel].qualified += qualified;
    channels[channel].lost += lost;
    channels[channel].inProgress += inProgress;
    channels[channel].won += won;
    channels[channel].revenue += revenue;
    channels[channel].pipelineValue += pipelineValue;
    monthly[`${quarter}|${month}`].leads += 1;
    monthly[`${quarter}|${month}`].qualified += qualified;
    monthly[`${quarter}|${month}`].lost += lost;
    monthly[`${quarter}|${month}`].inProgress += inProgress;
    monthly[`${quarter}|${month}`].won += won;
    monthly[`${quarter}|${month}`].revenue += revenue;
    monthly[`${quarter}|${month}`].pipelineValue += pipelineValue;
    channelPeriods[`${quarter}|${month}|${channel}`].leads += 1;
    channelPeriods[`${quarter}|${month}|${channel}`].qualified += qualified;
    channelPeriods[`${quarter}|${month}|${channel}`].lost += lost;
    channelPeriods[`${quarter}|${month}|${channel}`].inProgress += inProgress;
    channelPeriods[`${quarter}|${month}|${channel}`].won += won;
    channelPeriods[`${quarter}|${month}|${channel}`].revenue += revenue;
    channelPeriods[`${quarter}|${month}|${channel}`].pipelineValue += pipelineValue;
    statusPeriods[`${quarter}|${month}|${status}`].count += 1;
    if (won) {
      wonDeals.push({
        client: cellText(row.Name, "Closed deal"),
        source: channel || source,
        revenue,
        date: toIsoDate(dateAdded),
        label: shortDate(dateAdded),
        quarter,
        month,
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

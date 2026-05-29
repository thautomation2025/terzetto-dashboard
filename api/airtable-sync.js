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
      leads,
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    jsonResponse(res, 500, { error: error.message });
  }
};

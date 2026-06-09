const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || "apptyU2BYHf4YsIol";
const AIRTABLE_ACTIVITY_TABLE = process.env.AIRTABLE_ACTIVITY_TABLE || "Dashboard Activity";
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;

function jsonResponse(res, status, body) {
  res.statusCode = status;
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function clean(value, fallback = "") {
  return String(value || fallback).slice(0, 500);
}

async function airtableFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${AIRTABLE_TOKEN}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Airtable returned ${response.status}: ${text}`);
  }
  return response.json();
}

async function createActivity(payload) {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_ACTIVITY_TABLE)}`;
  await airtableFetch(url, {
    method: "POST",
    body: JSON.stringify({
      records: [
        {
          fields: {
            Timestamp: new Date().toISOString(),
            Role: clean(payload.role, "CEO"),
            View: clean(payload.view, "Dashboard"),
            Period: clean(payload.period),
            Quarter: clean(payload.quarter),
            Month: clean(payload.month),
            Granularity: clean(payload.granularity),
            Platform: clean(payload.platform),
            Channel: clean(payload.channel),
            "Page URL": clean(payload.path),
            "User Agent": clean(payload.userAgent),
          },
        },
      ],
    }),
  });
}

async function readActivity() {
  const url = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_ACTIVITY_TABLE)}`);
  url.searchParams.set("pageSize", "50");
  url.searchParams.append("sort[0][field]", "Timestamp");
  url.searchParams.append("sort[0][direction]", "desc");
  const payload = await airtableFetch(url);
  return (payload.records || []).map((record) => {
    const fields = record.fields || {};
    return {
      timestamp: fields.Timestamp || "",
      role: fields.Role || "",
      view: fields.View || "",
      period: fields.Period || "",
      quarter: fields.Quarter || "",
      month: fields.Month || "",
      granularity: fields.Granularity || "",
      platform: fields.Platform || "",
      channel: fields.Channel || "",
      path: fields["Page URL"] || "",
    };
  });
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
    if (req.method === "POST") {
      const payload = await readBody(req);
      if (String(payload.role || "").toLowerCase() !== "ceo") {
        jsonResponse(res, 200, { ok: true, skipped: true });
        return;
      }
      await createActivity(payload);
      jsonResponse(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET") {
      const history = await readActivity();
      jsonResponse(res, 200, { history });
      return;
    }

    jsonResponse(res, 405, { error: "Method not allowed." });
  } catch (error) {
    jsonResponse(res, 500, { error: error.message });
  }
};

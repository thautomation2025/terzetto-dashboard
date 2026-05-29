const DATA_URL = "data/marketing-data.json";
const STORAGE_KEY = "digitalMarketingDashboard:data:v12";
const AUTH_KEY = "digitalMarketingDashboard:authRole";
const ADMIN_PASSWORD = "admin2026";
const CEO_PASSWORD = "terzettoceo2026";
const OVERALL_PERIOD = "Overall";
const LEAD_STATUS_ORDER = [
  "New Lead",
  "For Phone Reach Out",
  "Answered/Qualifying",
  "Follow Up Email 1 Sent",
  "Follow Up Email 2 Sent",
  "Did Not Answer",
  "Meeting Booked",
  "Qualified/Added to CoConstruct",
  "Won",
  "Lost",
  "Unqualified",
];
const LEAD_NAME_COLUMNS = ["Answered/Qualifying", "Meeting Booked", "Qualified/Added to CoConstruct", "Won"];
const SOCIAL_FOLLOWERS = {
  Instagram: 3047,
  Facebook: 311,
  TikTok: 88,
  YouTube: 109,
};

const app = document.querySelector("#app");

function storageGet(key) {
  try {
    return window.localStorage?.getItem(key) || null;
  } catch {
    return null;
  }
}

function storageSet(key, value) {
  try {
    window.localStorage?.setItem(key, value);
  } catch {
    // File-based previews can block storage. The dashboard still works for the current page session.
  }
}

function storageRemove(key) {
  try {
    window.localStorage?.removeItem(key);
  } catch {
    // Ignore blocked storage in file previews.
  }
}

const state = {
  data: null,
  role: storageGet(AUTH_KEY) || null,
  view: "overview",
  quarter: "Q1 2026",
  compareQuarter: "Q2 2026",
  compareEnabled: false,
  compareMonth: "All months",
  granularity: "Quarterly",
  month: "All months",
  channel: "All channels",
  platform: "All platforms",
  keywordSearch: "",
  keywordLimit: 20,
  keywordPage: 1,
  keywordSearchTimer: null,
  toastTimer: null,
};

const money = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

const decimalMoney = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 2,
});

const whole = new Intl.NumberFormat("en-CA", { maximumFractionDigits: 0 });

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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

function formatMoney(value, decimals = false) {
  return decimals ? decimalMoney.format(value || 0) : money.format(value || 0);
}

function formatNumber(value) {
  return whole.format(value || 0);
}

function formatPct(value, decimals = 1) {
  return `${Number(value || 0).toFixed(decimals)}%`;
}

function quarterRank(quarter) {
  const match = String(quarter).match(/Q([1-4])\s+(\d{4})/);
  return match ? Number(match[2]) * 10 + Number(match[1]) : 0;
}

function uniqueQuarters() {
  return [...new Set(state.data.quarters.map((row) => row.quarter))].sort(
    (a, b) => quarterRank(b) - quarterRank(a),
  );
}

function periodOptions() {
  return [OVERALL_PERIOD, ...uniqueQuarters()];
}

function isOverallPeriod(quarter = state.quarter) {
  return quarter === OVERALL_PERIOD;
}

function fiscalMonthsForQuarter(quarter) {
  const match = String(quarter || "").match(/Q([1-4])\s+(\d{4})/);
  if (!match) return [];
  const q = Number(match[1]);
  const year = Number(match[2]);
  if (q === 1) return [`Dec ${year - 1}`, `Jan ${year}`, `Feb ${year}`];
  if (q === 2) return [`Mar ${year}`, `Apr ${year}`, `May ${year}`];
  if (q === 3) return [`Jun ${year}`, `Jul ${year}`, `Aug ${year}`];
  return [`Sep ${year}`, `Oct ${year}`, `Nov ${year}`];
}

function monthBelongsToQuarter(month, quarter) {
  if (isOverallPeriod(quarter)) return true;
  return fiscalMonthsForQuarter(quarter).includes(month);
}

function selectedPeriodLabel(quarter = state.quarter, month = activeMonth()) {
  if (isOverallPeriod(quarter)) return OVERALL_PERIOD;
  return state.granularity === "Monthly" && month !== "All months" ? month : quarter;
}

function editableQuarter() {
  return isOverallPeriod(state.quarter) ? uniqueQuarters()[0] : state.quarter;
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + parseNumber(row[key]), 0);
}

function avg(rows, key) {
  return rows.length ? sum(rows, key) / rows.length : 0;
}

function groupRows(rows, key) {
  return rows.reduce((groups, row) => {
    const group = row[key] || "Uncategorized";
    groups[group] ||= [];
    groups[group].push(row);
    return groups;
  }, {});
}

function currentQuarter() {
  return findQuarter(state.quarter);
}

function findQuarter(quarter) {
  if (isOverallPeriod(quarter)) {
    const rows = state.data.quarters || [];
    const spend = sum(rows, "spend");
    const leads = sum(rows, "leads");
    const qualified = sum(rows, "qualified");
    const won = sum(rows, "won");
    const revenue = sum(rows, "revenue");
    return {
      quarter: OVERALL_PERIOD,
      spend,
      leads,
      qualified,
      cpql: safeRatio(spend, qualified),
      won,
      winRate: safeRatio(won, qualified) * 100,
      revenue,
      roas: safeRatio(revenue, spend),
    };
  }
  return state.data.quarters.find((row) => row.quarter === quarter) || state.data.quarters[0] || {};
}

function quarterChannels(quarter = state.quarter) {
  if (isOverallPeriod(quarter)) return state.data.channelQuarterly || [];
  return state.data.channelQuarterly.filter((row) => row.quarter === quarter);
}

function quarterWeeks(quarter = state.quarter) {
  if (isOverallPeriod(quarter)) return state.data.weeks || [];
  return state.data.weeks.filter((row) => row.quarter === quarter && monthBelongsToQuarter(row.month, quarter));
}

function quarterWeekly(quarter = state.quarter) {
  if (isOverallPeriod(quarter)) return state.data.channelWeekly || [];
  return state.data.channelWeekly.filter((row) => row.quarter === quarter && monthBelongsToQuarter(row.month, quarter));
}

function metricDelta(current, previous, suffix = "") {
  const diff = parseNumber(current) - parseNumber(previous);
  const sign = diff >= 0 ? "+" : "";
  return `${sign}${formatNumber(diff)}${suffix}`;
}

function safeRatio(top, bottom) {
  return bottom ? top / bottom : 0;
}

function showToast(message) {
  clearTimeout(state.toastTimer);
  const oldToast = document.querySelector(".toast");
  if (oldToast) oldToast.remove();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.append(toast);
  state.toastTimer = setTimeout(() => toast.remove(), 3600);
}

async function loadData() {
  const embedded = document.querySelector("#seed-data")?.textContent;
  const seed = embedded ? JSON.parse(embedded) : await (await fetch(DATA_URL)).json();
  const saved = storageGet(STORAGE_KEY);
  state.data = enrichData(saved ? JSON.parse(saved) : seed);
  const quarters = uniqueQuarters();
  state.quarter = quarters[0];
  state.compareQuarter = quarters.find((quarter) => quarter !== state.quarter) || state.quarter;
  render();
}

function persist() {
  state.data.updatedAt = new Date().toISOString().slice(0, 10);
  storageSet(STORAGE_KEY, JSON.stringify(state.data));
}

function enrichData(data) {
  data.manual ||= {};
  data.manual.targets ||= { metaQualifiedLeads: 8, monthlyLeads: 20, weeklyLeads: 5 };
  data.manual.notes ||= {};
  data.manual.airtable ||= {};
  data.manual.airtable.baseId ||= "apptyU2BYHf4YsIol";
  data.manual.airtable.leadTable ||= "Leads";
  data.manual.airtable.leadTableId ||= "tblKmMJaP7SPnZMwg";
  data.manual.sync ||= {};
  data.manual.lastUploads ||= {};
  data.manual.connections ||= {};
  data.manual.socialPostCounts ||= [];
  data.reportDefinitions ||= {
    overview:
      "Portfolio-level marketing performance across spend, lead quality, pipeline movement, and revenue contribution.",
    social:
      "Organic and boosted social performance across Instagram, Facebook, TikTok, and YouTube.",
    meta:
      "Paid Meta campaign delivery, cost, click, conversion, and lead-quality diagnostics.",
    seo:
      "Google Search Console, Google Business Profile, and keyword ranking performance.",
    leads:
      "Aggregate lead volume, source mix, qualification, won deals, and revenue outcomes.",
  };
  data.socialPlatforms = normalizeSocialPlatforms(data);
  data.metaAds = normalizeMetaAds(data);
  data.seoReport = normalizeSeoReport(data);
  data.googleBusiness = normalizeGoogleBusiness(data);
  return data;
}

function quarterSeed(quarter) {
  return quarterRank(quarter) || 20261;
}

function platformBase(platform) {
  return {
    Facebook: { color: "#3c8ed9", weight: 0.92 },
    Instagram: { color: "#c12400", weight: 1.18 },
    TikTok: { color: "#151312", weight: 0.52 },
    YouTube: { color: "#544845", weight: 0.68 },
  }[platform];
}

function platformLogo(platform) {
  return {
    Facebook: "assets/facebook-logo.png",
    Instagram: "assets/instagram-logo.webp",
    TikTok: "assets/tiktok-logo.webp",
    YouTube: "assets/youtube-logo.webp",
  }[platform] || "";
}

function periodDates(data, quarter) {
  const weekDates = (data.weeks || [])
    .filter((row) => row.quarter === quarter && row.week)
    .map((row) => new Date(row.week))
    .filter((date) => !Number.isNaN(date.getTime()));
  if (!weekDates.length) {
    const match = String(quarter).match(/Q([1-4])\s+(\d{4})/);
    const year = match ? Number(match[2]) : 2026;
    const q = match ? Number(match[1]) : 1;
    const startMonthByFiscalQuarter = { 1: 11, 2: 2, 3: 5, 4: 8 };
    const startMonth = startMonthByFiscalQuarter[q] ?? 0;
    const startYear = q === 1 ? year - 1 : year;
    return Array.from({ length: 90 }, (_, index) => {
      const date = new Date(startYear, startMonth, 1 + index);
      return date.toISOString().slice(0, 10);
    });
  }
  const start = new Date(Math.min(...weekDates.map((date) => date.getTime())));
  const end = new Date(Math.max(...weekDates.map((date) => date.getTime())));
  end.setDate(end.getDate() + 6);
  const dates = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    dates.push(cursor.toISOString().slice(0, 10));
  }
  return dates;
}

function distributeTotal(total, count, seed) {
  if (count <= 0) return [];
  const weights = Array.from({ length: count }, (_, index) => {
    const wave = 1 + Math.sin((index + seed) / 3.1) * 0.28;
    const spike = index % 17 === seed % 11 ? 1.9 : 1;
    return Math.max(0.2, wave * spike);
  });
  const weightTotal = weights.reduce((acc, value) => acc + value, 0) || 1;
  const values = weights.map((weight) => Math.max(0, Math.round((total * weight) / weightTotal)));
  const drift = Math.round(total) - values.reduce((acc, value) => acc + value, 0);
  values[values.length - 1] += drift;
  return values.map((value) => Math.max(0, value));
}

function buildSocialDailySeries(data, quarter, platform, totals) {
  const dates = periodDates(data, quarter);
  const seed = quarterSeed(quarter) + platform.length * 13;
  const contentViews = distributeTotal(parseNumber(totals.contentViews), dates.length, seed);
  const reach = distributeTotal(parseNumber(totals.reach), dates.length, seed + 5);
  const views = distributeTotal(parseNumber(totals.views || totals.contentViews), dates.length, seed + 11);
  const engagements = distributeTotal(parseNumber(totals.engagements), dates.length, seed + 17);
  const linkClicks = distributeTotal(parseNumber(totals.linkClicks), dates.length, seed + 23);
  const pageViews = distributeTotal(parseNumber(totals.pageViews), dates.length, seed + 29);
  return dates.map((date, index) => ({
    date,
    label: shortDate(date),
    month: monthLabel(date),
    contentViews: contentViews[index],
    reach: reach[index],
    views: views[index],
    engagements: engagements[index],
    linkClicks: linkClicks[index],
    pageViews: pageViews[index],
  }));
}

function buildMetaSeries(data, quarter, totals) {
  const weeks = data.channelWeekly.filter((row) => row.quarter === quarter && row.channel === "Meta Ads");
  if (weeks.length) {
    const totalSpend = sum(weeks, "spend");
    return weeks.map((row, index) => {
      const linkClicks = Math.round(parseNumber(row.clicks) * 0.76);
      const impressions = Math.max(Math.round(linkClicks / 0.018), parseNumber(row.leads) * 12000);
      const reach = Math.round(impressions * 0.54);
      const amountSpent = parseNumber(row.spend);
      return {
        date: row.week || row["Week Start"] || "",
        label: shortDate(row.week || row["Week Start"] || `Week ${index + 1}`),
        month: row.month || monthLabel(row.week),
        impressions,
        reach,
        linkClicks,
        uniqueLinkClicks: Math.round(linkClicks * 0.91),
        amountSpent,
        cpm: safeRatio(amountSpent, impressions) * 1000,
        cpc: safeRatio(amountSpent, linkClicks),
        ctr: safeRatio(linkClicks, impressions) * 100,
      };
    });
  }
  const dates = periodDates(data, quarter).filter((_, index) => index % 7 === 0);
  const seed = quarterSeed(quarter) + 41;
  const impressions = distributeTotal(parseNumber(totals.impressions), dates.length, seed);
  const linkClicks = distributeTotal(parseNumber(totals.linkClicks), dates.length, seed + 7);
  const uniqueLinkClicks = distributeTotal(parseNumber(totals.uniqueLinkClicks), dates.length, seed + 13);
  const amountSpent = distributeTotal(parseNumber(totals.amountSpent), dates.length, seed + 19);
  return dates.map((date, index) => ({
    date,
    label: shortDate(date),
    month: monthLabel(date),
    impressions: impressions[index],
    reach: Math.round(impressions[index] * 0.54),
    linkClicks: linkClicks[index],
    uniqueLinkClicks: uniqueLinkClicks[index],
    amountSpent: amountSpent[index],
    cpm: safeRatio(amountSpent[index], impressions[index]) * 1000,
    cpc: safeRatio(amountSpent[index], linkClicks[index]),
    ctr: safeRatio(linkClicks[index], impressions[index]) * 100,
  }));
}

function buildSeoSeries(data, quarter, totals) {
  const dates = periodDates(data, quarter).filter((_, index) => index % 7 === 0);
  const seed = quarterSeed(quarter) + 81;
  const clicks = distributeTotal(parseNumber(totals.clicks), dates.length, seed);
  const impressions = distributeTotal(parseNumber(totals.impressions), dates.length, seed + 9);
  const positionBase = parseNumber(totals.avgPosition) || 20;
  return dates.map((date, index) => {
    const position = Math.max(1, positionBase + Math.sin((index + seed) / 2.3) * 2.8);
    return {
      date,
      label: shortDate(date),
      month: monthLabel(date),
      clicks: clicks[index],
      impressions: impressions[index],
      ctr: safeRatio(clicks[index], impressions[index]) * 100,
      position,
    };
  });
}

function buildGbpSeries(data, quarter, totals) {
  const dates = periodDates(data, quarter).filter((_, index) => index % 7 === 0);
  const seed = quarterSeed(quarter) + 121;
  const calls = distributeTotal(parseNumber(totals.calls), dates.length, seed);
  const bookings = distributeTotal(parseNumber(totals.bookings || Math.round(parseNumber(totals.calls) * 0.28)), dates.length, seed + 3);
  const directionRequests = distributeTotal(parseNumber(totals.directionRequests), dates.length, seed + 6);
  const websiteClicks = distributeTotal(parseNumber(totals.websiteClicks), dates.length, seed + 9);
  const profileViews = distributeTotal(parseNumber(totals.profileViews), dates.length, seed + 12);
  return dates.map((date, index) => ({
    date,
    label: shortDate(date),
    month: monthLabel(date),
    calls: calls[index],
    bookings: bookings[index],
    directionRequests: directionRequests[index],
    websiteClicks: websiteClicks[index],
    profileViews: profileViews[index],
  }));
}

function normalizeSocialPlatforms(data) {
  const rows = data.socialPlatforms?.length ? data.socialPlatforms : buildSocialPlatforms(data);
  return rows.map((row) => {
    const series =
      row.series?.[0]?.date && "contentViews" in row.series[0]
        ? row.series
        : buildSocialDailySeries(data, row.quarter, row.platform, row);
    return {
      ...row,
      contentViews: sum(series, "contentViews"),
      reach: sum(series, "reach"),
      views: sum(series, "views"),
      engagements: sum(series, "engagements"),
      linkClicks: sum(series, "linkClicks"),
      pageViews: sum(series, "pageViews"),
      followers: SOCIAL_FOLLOWERS[row.platform] ?? row.followers ?? 0,
      engagementRate: safeRatio(sum(series, "engagements"), sum(series, "reach")) * 100,
      series,
    };
  });
}

function normalizeMetaAds(data) {
  const rows = data.metaAds?.length ? data.metaAds : buildMetaAds(data);
  return rows.map((row) => {
    const series =
      row.series?.[0]?.date && "impressions" in row.series[0]
        ? row.series
        : buildMetaSeries(data, row.quarter, row);
    const impressions = sum(series, "impressions");
    const linkClicks = sum(series, "linkClicks");
    const uniqueLinkClicks = sum(series, "uniqueLinkClicks");
    const amountSpent = sum(series, "amountSpent");
    const reach = sum(series, "reach");
    return {
      ...row,
      impressions,
      reach,
      avgDailyReach: series.length ? Math.round(reach / series.length) : 0,
      frequency: safeRatio(impressions, reach),
      linkClicks,
      uniqueLinkClicks,
      amountSpent,
      cpm: safeRatio(amountSpent, impressions) * 1000,
      cpc: safeRatio(amountSpent, linkClicks),
      ctr: safeRatio(linkClicks, impressions) * 100,
      series,
    };
  });
}

function normalizeSeoReport(data) {
  const rows = data.seoReport?.length ? data.seoReport : buildSeoReport(data);
  return rows.map((row) => {
    const series =
      row.series?.[0]?.date && "clicks" in row.series[0]
        ? row.series
        : buildSeoSeries(data, row.quarter, row);
    const clicks = sum(series, "clicks");
    const impressions = sum(series, "impressions");
    const avgPosition = avg(series, "position") || row.avgPosition || 0;
    return {
      ...row,
      clicks,
      impressions,
      ctr: safeRatio(clicks, impressions) * 100,
      avgPosition,
      series,
    };
  });
}

function normalizeGoogleBusiness(data) {
  const rows = data.googleBusiness?.length ? data.googleBusiness : buildGoogleBusiness(data);
  return rows.map((row) => {
    const series =
      row.series?.[0]?.date && "calls" in row.series[0]
        ? row.series
        : buildGbpSeries(data, row.quarter, row);
    return {
      ...row,
      calls: sum(series, "calls"),
      bookings: sum(series, "bookings"),
      directionRequests: sum(series, "directionRequests"),
      websiteClicks: sum(series, "websiteClicks"),
      profileViews: sum(series, "profileViews"),
      series,
    };
  });
}

function buildSocialPlatforms(data) {
  const platforms = ["Facebook", "Instagram", "TikTok", "YouTube"];
  return data.quarters.flatMap((quarterRow) => {
    const socialLeads =
      data.channelQuarterly.find(
        (row) => row.quarter === quarterRow.quarter && row.channel === "Social Media",
      )?.leads ||
      Math.max(quarterRow.leads * 1.6, 10);
    const seed = quarterSeed(quarterRow.quarter);
    return platforms.map((platform, index) => {
      const base = platformBase(platform);
      const multiplier = base.weight * (1 + ((seed + index) % 5) / 15);
      const impressions = Math.round((socialLeads * 700 + 2600 + index * 900) * multiplier);
      const reach = Math.round(impressions * (0.34 + index * 0.035));
      const views = Math.round(impressions * (platform === "YouTube" ? 2.3 : 0.82));
      const contentViews = Math.round(views * (platform === "YouTube" ? 0.58 : 0.72));
      const engagements = Math.round(reach * (0.16 + index * 0.025));
      const followers = Math.round(900 + reach * 0.42 + index * 340);
      const posts = Math.max(0, Math.round(8 + index * 3 + (seed % 4)));
      const row = {
        quarter: quarterRow.quarter,
        platform,
        color: base.color,
        contentViews,
        reach,
        views,
        linkClicks: Math.round(views * 0.018),
        pageViews: Math.round(reach * 0.22),
        engagements,
        engagementRate: safeRatio(engagements, reach) * 100,
        followers,
        newFollowers: Math.round(followers * 0.08),
        posts,
      };
      row.series = buildSocialDailySeries(data, quarterRow.quarter, platform, row);
      row.contentViews = sum(row.series, "contentViews");
      row.reach = sum(row.series, "reach");
      row.views = sum(row.series, "views");
      row.engagements = sum(row.series, "engagements");
      row.linkClicks = sum(row.series, "linkClicks");
      row.pageViews = sum(row.series, "pageViews");
      row.engagementRate = safeRatio(row.engagements, row.reach) * 100;
      return row;
    });
  });
}

function buildMetaAds(data) {
  return data.quarters.map((quarterRow) => {
    const meta = data.channelQuarterly.find(
      (row) => row.quarter === quarterRow.quarter && row.channel === "Meta Ads",
    ) || { spend: 0, leads: 0, qualified: 0 };
    const weeks = data.channelWeekly.filter(
      (row) => row.quarter === quarterRow.quarter && row.channel === "Meta Ads",
    );
    const clicks = Math.max(sum(weeks, "clicks"), meta.leads * 85);
    const impressions = Math.max(Math.round(clicks / 0.018), meta.leads * 12000);
    const reach = Math.round(impressions * 0.54);
    const frequency = safeRatio(impressions, reach);
    const linkClicks = Math.round(clicks * 0.76);
    const uniqueLinkClicks = Math.round(linkClicks * 0.91);
    const ctr = safeRatio(linkClicks, impressions) * 100;
    const cpc = safeRatio(meta.spend, linkClicks);
    const cpm = safeRatio(meta.spend, impressions) * 1000;
    return {
      quarter: quarterRow.quarter,
      impressions,
      reach,
      avgDailyReach: Math.round(reach / 90),
      frequency,
      linkClicks,
      uniqueLinkClicks,
      amountSpent: meta.spend,
      cpm,
      cpc,
      ctr,
      leads: meta.leads,
      qualified: meta.qualified,
      unqualified: Math.max(0, meta.leads - meta.qualified),
      cpql: meta.cpql,
      campaigns: buildCampaigns(meta, quarterRow.quarter),
      series: makeSeries(28, impressions / 28, linkClicks / 28, quarterSeed(quarterRow.quarter) + 41),
    };
  });
}

function buildCampaigns(meta, quarter) {
  const names = ["Kitchen remodel awareness", "Bathroom remodel leads", "Design build remarketing", "Ottawa renovation intent"];
  return names.map((name, index) => {
    const share = [0.38, 0.28, 0.2, 0.14][index];
    const spend = Math.round(meta.spend * share);
    const leads = Math.round((meta.leads || 0) * share);
    const qualified = Math.round((meta.qualified || 0) * share);
    return {
      quarter,
      name,
      impressions: Math.round((spend || 120) * (52 + index * 8)),
      reach: Math.round((spend || 120) * (26 + index * 5)),
      linkClicks: Math.round((spend || 120) / (0.9 + index * 0.18)),
      spend,
      leads,
      qualified,
    };
  });
}

function buildSeoReport(data) {
  const keywords = [
    "ottawa kitchen renovation",
    "bathroom remodel ottawa",
    "design build contractor",
    "home renovation company",
    "basement renovation ottawa",
    "custom home remodel",
    "whole home renovation",
    "renovation contractor near me",
  ];
  return data.quarters.map((quarterRow) => {
    const seo = data.channelQuarterly.find(
      (row) => row.quarter === quarterRow.quarter && row.channel === "SEO/Website",
    ) || { leads: 0, qualified: 0 };
    const seed = quarterSeed(quarterRow.quarter);
    const keywordRows = keywords.map((keyword, index) => {
      const volume = Math.round(35 + index * 24 + (seed % 9) * 5);
      const position = Math.max(1, Math.round(4 + index * 3.4 - (seo.qualified || 0) * 0.32));
      const traffic = Math.round(volume / Math.max(1, position / 2.6));
      const impressions = Math.round(volume * 18);
      const clicks = traffic;
      return {
        keyword,
        brandGeneric: index < 2 ? "Brand" : "Generic",
        searchVolume: volume,
        traffic,
        impressions,
        clicks,
        ctr: safeRatio(clicks, impressions) * 100,
        position,
        change: Math.round((index % 3 === 0 ? -1 : 1) * (1 + (seed + index) % 5)),
      };
    });
    const impressions = keywordRows.reduce((total, row) => total + row.searchVolume * 18, 0);
    const clicks = keywordRows.reduce((total, row) => total + row.traffic, 0);
    return {
      quarter: quarterRow.quarter,
      clicks,
      impressions,
      ctr: safeRatio(clicks, impressions) * 100,
      avgPosition: avg(keywordRows, "position"),
      uniqueKeywords: 230 + (seed % 6) * 45 + (seo.qualified || 0) * 22,
      posts: data.manual.seo?.find((row) => row.period === quarterRow.quarter)?.posts || Math.max(2, seo.leads),
      changesMade:
        data.manual.seo?.find((row) => row.period === quarterRow.quarter)?.changesMade ||
        "Service-page optimization, internal links, Google Business Profile updates, and content aligned with remodeling search intent.",
      keywordRows,
      series: makeSeries(28, 360 + (seo.qualified || 0) * 35, 180 + seo.leads * 16, seed + 81),
    };
  });
}

function buildGoogleBusiness(data) {
  return data.quarters.map((quarterRow) => {
    const seo = data.channelQuarterly.find(
      (row) => row.quarter === quarterRow.quarter && row.channel === "SEO/Website",
    ) || { leads: 0 };
    const seed = quarterSeed(quarterRow.quarter);
    return {
      quarter: quarterRow.quarter,
      profileViews: Math.round(1200 + seo.leads * 260 + (seed % 6) * 120),
      calls: Math.round(12 + seo.leads * 1.8),
      websiteClicks: Math.round(80 + seo.leads * 22),
      directionRequests: Math.round(18 + seo.leads * 4),
      mapViews: Math.round(800 + seo.leads * 180),
      topCountries: [
        { country: "Canada", clicks: Math.round(650 + seo.leads * 90) },
        { country: "United States", clicks: Math.round(90 + seo.leads * 18) },
        { country: "United Kingdom", clicks: Math.round(30 + seo.leads * 8) },
      ],
    };
  });
}

function makeSeries(count, primaryBase, secondaryBase, seed) {
  return Array.from({ length: count }, (_, index) => {
    const wave = 1 + Math.sin((index + seed) / 2.7) * 0.23;
    const spike = index % 11 === seed % 7 ? 1.8 : 1;
    return {
      label: `Day ${index + 1}`,
      primary: Math.max(0, Math.round(primaryBase * wave * spike)),
      secondary: Math.max(0, Math.round(secondaryBase * (1.1 - (wave - 1) * 0.6) * (spike > 1 ? 1.25 : 1))),
    };
  });
}

function setView(view) {
  if (view !== state.view) resetViewScope(view);
  state.view = view;
  render();
}

function resetViewScope(view) {
  const quarters = uniqueQuarters();
  state.quarter = quarters[0] || state.quarter;
  state.compareQuarter = quarters.find((quarter) => quarter !== state.quarter) || state.quarter;
  state.compareEnabled = false;
  state.compareMonth = "All months";
  state.granularity = "Quarterly";
  state.month = "All months";
  state.channel = "All channels";
  state.platform = "All platforms";
  state.keywordSearch = "";
  state.keywordLimit = 20;
  state.keywordPage = 1;
  if (view === "compare") state.compareEnabled = true;
}

function setQuarter(quarter) {
  state.quarter = quarter;
  if (state.compareQuarter === quarter || isOverallPeriod(state.compareQuarter)) {
    state.compareQuarter = uniqueQuarters().find((item) => item !== quarter) || quarter;
  }
  const months = monthlyRows().map((row) => row.month);
  if (isOverallPeriod(quarter)) {
    state.granularity = "Quarterly";
    state.month = "All months";
  }
  if (state.granularity === "Monthly" && !months.includes(state.month)) {
    state.month = months.at(-1) || "All months";
  }
  state.keywordPage = 1;
  render();
}

function setAuth(role) {
  state.role = role;
  storageSet(AUTH_KEY, role);
  if (role === "ceo" && state.view === "admin") state.view = "overview";
  render();
}

function logout() {
  storageRemove(AUTH_KEY);
  state.role = null;
  state.view = "overview";
  render();
}

function navButton(id, label) {
  return `<button type="button" class="${state.view === id ? "active" : ""}" data-view="${id}">${label}</button>`;
}

function render() {
  if (!state.data) return;
  if (!state.role) {
    app.innerHTML = renderLogin();
    bindLoginEvents();
    return;
  }

  app.innerHTML = `
    <header class="topbar">
      <div class="brand">
        <img class="brand-logo" src="assets/terzetto-homes-logo-final-h.jpg" alt="Terzetto Homes" />
        <div>
          <strong>Marketing Performance Dashboard</strong>
        </div>
      </div>
      <nav class="nav" aria-label="Dashboard views">
        ${navButton("overview", "Overview")}
        ${navButton("compare", "Compare")}
        ${navButton("social", "Social")}
        ${navButton("meta", "Meta Ads")}
        ${navButton("seo", "SEO")}
        ${navButton("leads", "Leads")}
        ${navButton("weekly", "Weekly")}
        ${state.role === "admin" ? navButton("admin", "Admin") : ""}
      </nav>
      <div class="role-actions">
        <span class="status-pill">${state.role === "admin" ? "Admin" : "CEO"}</span>
        <button type="button" class="ghost-button" data-logout>Log out</button>
      </div>
    </header>
    <main class="page">
      ${renderHero()}
      ${renderScopeBar()}
      ${renderActiveView()}
    </main>
  `;
  bindBaseEvents();
  if (state.view === "admin") bindAdminEvents();
}

function renderLogin() {
  return `
    <main class="login-screen">
      <article class="login-box">
        <img class="login-logo" src="assets/terzetto-homes-logo-final-h.jpg" alt="Terzetto Homes" />
        <span class="eyebrow">Protected dashboard</span>
        <h1>Marketing Performance Dashboard</h1>
        <p>Sign in for reporting access or administration tools.</p>
        <label>
          <span class="meta-label">Access level</span>
          <select id="loginRole">
            <option value="ceo">CEO</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <label>
          <span class="meta-label">Password</span>
          <input id="loginPassword" type="password" placeholder="Enter password" />
        </label>
        <button type="button" class="primary-button" data-login>Log in</button>
      </article>
    </main>
  `;
}

function renderHero() {
  const hero = heroContent();
  return `
    <section class="hero command-hero">
      <div>
        <div class="eyebrow">${escapeHtml(hero.eyebrow)}</div>
        <h1>${escapeHtml(hero.title)}</h1>
        <p>${escapeHtml(hero.description)}</p>
      </div>
      <aside class="hero-card">
        <div class="hero-card-header">
          <div>
            <span class="meta-label">${escapeHtml(hero.cardLabel)}</span>
            <h2>${escapeHtml(hero.cardTitle)}</h2>
          </div>
          <span class="badge">Updated ${escapeHtml(state.data.updatedAt)}</span>
        </div>
        <div class="hero-stats">
          ${hero.stats
            .map(
              (stat) =>
                `<div class="hero-stat"><span class="meta-label">${escapeHtml(stat.label)}</span><strong>${stat.value}</strong>${stat.change ? `<small class="${stat.changeClass}">${stat.change}</small>` : ""}</div>`,
            )
            .join("")}
        </div>
      </aside>
    </section>
  `;
}

function heroStat(label, value, current, previous, type = "number") {
  const change = percentChange(parseNumber(current), parseNumber(previous));
  const unavailable = previous === null || previous === undefined || parseNumber(previous) === 0;
  return {
    label,
    value,
    change: unavailable ? "No previous period" : `${change >= 0 ? "+" : ""}${formatPct(change, 1)}`,
    changeClass: unavailable ? "neutral" : change >= 0 ? "up" : "down",
    type,
  };
}

function renderInsightStrip() {
  if (state.view === "admin") return "";
  const items = insightItemsForView();
  if (!items.length) return "";
  return `
    <section class="insight-strip" aria-label="Performance snapshot">
      ${items.map((item) => insightTile(item)).join("")}
    </section>
  `;
}

function insightItemsForView() {
  const q = overviewMetrics();
  const meta = metaForPeriod();
  const seo = seoForPeriod();
  const gbp = gbpForPeriod();
  const social = socialRows();
  const socialTotals = {
    views: sum(social, "views"),
    reach: sum(social, "reach"),
    engagements: sum(social, "engagements"),
    linkClicks: socialLinkClickTotal(social),
    followers: sum(social, "followers"),
    posts: sum(social, "posts"),
  };
  const base = [
    { label: "Lead quality", value: formatPct(safeRatio(q.totalQualified, q.totalLeads) * 100, 0), note: "qualified share of total leads" },
    { label: "Win efficiency", value: formatPct(q.winRate, 0), note: "won deals from qualified leads" },
    { label: "Revenue leverage", value: `${safeRatio(q.revenue, q.spend).toFixed(1)}x`, note: "closed revenue against spend" },
    { label: "Average deal", value: formatMoney(safeRatio(q.revenue, q.won)), note: "won revenue per closed deal" },
  ];
  if (state.view === "social") {
    return [
      { label: "Engagement rate", value: formatPct(safeRatio(socialTotals.engagements, socialTotals.reach) * 100, 1), note: "engagements against reach" },
      { label: "Reach per post", value: formatNumber(safeRatio(socialTotals.reach, socialTotals.posts)), note: "average distribution per post" },
      { label: "Link click rate", value: formatPct(safeRatio(socialTotals.linkClicks, socialTotals.views) * 100, 1), note: "clicks from measured views" },
      { label: "Audience base", value: formatNumber(socialTotals.followers), note: "current followers across platforms" },
    ];
  }
  if (state.view === "meta") {
    return [
      { label: "CPQL", value: formatMoney(meta.cpql, true), note: "paid cost per qualified lead" },
      { label: "CTR", value: formatPct(meta.ctr, 2), note: "link clicks against impressions" },
      { label: "CPC", value: formatMoney(meta.cpc, true), note: "cost per link click" },
      { label: "Qualified rate", value: formatPct(safeRatio(meta.qualified, meta.leads) * 100, 0), note: "qualified leads from Meta leads" },
    ];
  }
  if (state.view === "seo") {
    return [
      { label: "Search CTR", value: formatPct(seo.ctr, 2), note: "clicks from impressions" },
      { label: "Avg. ranking", value: Number(seo.avgPosition || 0).toFixed(1), note: "average position in export" },
      { label: "Search clicks", value: formatNumber(seo.clicks), note: "organic visits from search" },
      { label: "GBP actions", value: formatNumber(gbp.calls + gbp.bookings + gbp.directionRequests + gbp.websiteClicks), note: "calls, bookings, directions, clicks" },
    ];
  }
  if (state.view === "leads") {
    return [
      { label: "Lead quality", value: formatPct(safeRatio(q.totalQualified, q.totalLeads) * 100, 0), note: "qualified share of total leads" },
      { label: "Pipeline coverage", value: formatMoney(q.pipelineValue), note: "open qualified revenue potential" },
      { label: "CPA", value: formatMoney(q.cpa, true), note: "spend per won deal" },
      { label: "In progress", value: formatNumber(q.inProgress), note: "qualified leads still active" },
    ];
  }
  if (state.view === "weekly") {
    const weeks = quarterWeeks().filter((row) => state.month === "All months" || row.month === state.month);
    const latest = weeks.at(-1) || {};
    return [
      { label: "Latest week leads", value: formatNumber(latest.leads || 0), note: latest.range || latest.week || selectedPeriodLabel() },
      { label: "Latest qualified", value: formatNumber(latest.qualified || 0), note: "qualified leads in latest week" },
      { label: "Weekly close", value: formatNumber(latest.won || 0), note: "won deals in latest week" },
      { label: "Weekly revenue", value: formatMoney(latest.revenue || 0), note: "closed revenue in latest week" },
    ];
  }
  if (state.view === "compare") {
    const compare = overviewMetrics(state.compareQuarter, activeCompareMonth());
    return [
      { label: "Revenue delta", value: formatMetricDiff(q.revenue - compare.revenue, "money"), note: `${selectedPeriodLabel()} vs ${state.granularity === "Monthly" ? activeCompareMonth() : state.compareQuarter}` },
      { label: "CPQL delta", value: formatMetricDiff(q.cpql - compare.cpql, "money", "cpql"), note: "lower cost is stronger" },
      { label: "Qualified delta", value: formatMetricDiff(q.totalQualified - compare.totalQualified, "number"), note: "qualified lead movement" },
      { label: "Pipeline delta", value: formatMetricDiff(q.pipelineValue - compare.pipelineValue, "money"), note: "open value movement" },
    ];
  }
  return base;
}

function insightTile(item) {
  return `
    <article class="insight-tile">
      <span class="meta-label">${escapeHtml(item.label)}</span>
      <strong>${escapeHtml(item.value)}</strong>
      <small>${escapeHtml(item.note)}</small>
    </article>
  `;
}

function activeMonth() {
  if (isOverallPeriod(state.quarter) || state.granularity !== "Monthly") return "All months";
  if (state.month !== "All months" && monthBelongsToQuarter(state.month, state.quarter)) return state.month;
  return monthlyRows().at(-1)?.month || "All months";
}

function activeCompareMonth() {
  if (state.granularity !== "Monthly") return "All months";
  if (state.compareMonth !== "All months" && monthBelongsToQuarter(state.compareMonth, state.compareQuarter)) return state.compareMonth;
  return monthlyRows(state.compareQuarter).at(-1)?.month || "All months";
}

function channelMetricsFor(quarter = state.quarter, month = "All months") {
  if (isOverallPeriod(quarter)) {
    const groups = groupRows(state.data.channelQuarterly || [], "channel");
    return Object.entries(groups).map(([channel, rows]) => {
      const spend = sum(rows, "spend");
      const leads = sum(rows, "leads");
      const qualified = sum(rows, "qualified");
      const won = sum(rows, "won");
      const revenue = sum(rows, "revenue");
      return { quarter, channel, spend, leads, qualified, cpql: safeRatio(spend, qualified), won, revenue, roas: safeRatio(revenue, spend) };
    });
  }
  if (month === "All months") return state.data.channelQuarterly.filter((row) => row.quarter === quarter);
  const groups = groupRows(
    state.data.channelWeekly.filter((row) => row.quarter === quarter && monthBelongsToQuarter(row.month, quarter) && row.month === month),
    "channel",
  );
  return Object.entries(groups).map(([channel, rows]) => {
    const spend = sum(rows, "spend");
    const leads = sum(rows, "leads");
    const qualified = sum(rows, "qualified");
    const won = sum(rows, "won");
    const revenue = sum(rows, "revenue");
    return {
      quarter,
      channel,
      spend,
      leads,
      qualified,
      cpql: safeRatio(spend, qualified),
      won,
      revenue,
      roas: safeRatio(revenue, spend),
    };
  });
}

function overviewMetrics(quarter = state.quarter, month = activeMonth()) {
  const pipeline = leadPipelineMetrics(quarter, month);
  const referralLeads = referralLeadCount(quarter, month);
  const totalLeads = pipeline.leads || findQuarter(quarter).leads || 0;
  const marketingLeads = Math.max(0, totalLeads - referralLeads);
  if (month === "All months") {
    const q = findQuarter(quarter);
    return {
      quarter,
      spend: q.spend || 0,
      leads: marketingLeads || q.leads || 0,
      referralLeads,
      totalLeads,
      qualified: pipeline.qualified || q.qualified || 0,
      totalQualified: pipeline.qualified || q.qualified || 0,
      inProgress: pipeline.inProgress || 0,
      lost: pipeline.lost || 0,
      won: pipeline.won || q.won || 0,
      revenue: pipeline.revenue || q.revenue || 0,
      pipelineValue: pipeline.pipelineValue || 0,
      cpql: safeRatio(q.spend || 0, pipeline.qualified || q.qualified || 0),
      cpa: q.cpa || safeRatio(q.spend || 0, pipeline.won || q.won || 0),
      winRate: safeRatio(pipeline.won || q.won || 0, pipeline.qualified || q.qualified || 0) * 100,
    };
  }
  const weeks = quarterWeeks(quarter).filter((row) => row.month === month);
  const channels = channelMetricsFor(quarter, month);
  const spend = sum(channels, "spend");
  const leads = sum(weeks, "leads") || sum(channels, "leads");
  const qualified = sum(weeks, "qualified") || sum(channels, "qualified");
  const won = sum(weeks, "won") || sum(channels, "won");
  const revenue = sum(weeks, "revenue") || sum(channels, "revenue");
  const scopedTotalLeads = pipeline.leads || leads;
  const scopedMarketingLeads = Math.max(0, scopedTotalLeads - referralLeads);
  return {
    quarter,
    month,
    spend,
    leads: scopedMarketingLeads || leads,
    referralLeads,
    totalLeads: scopedTotalLeads || leads,
    qualified: pipeline.qualified || qualified,
    totalQualified: pipeline.qualified || qualified,
    inProgress: pipeline.inProgress || 0,
    lost: pipeline.lost || 0,
    won: pipeline.won || won,
    revenue: pipeline.revenue || revenue,
    pipelineValue: pipeline.pipelineValue || 0,
    cpql: safeRatio(spend, pipeline.qualified || qualified),
    cpa: safeRatio(spend, pipeline.won || won),
    winRate: safeRatio(pipeline.won || won, pipeline.qualified || qualified) * 100,
  };
}

function referralLeadCount(quarter = state.quarter, month = activeMonth()) {
  return sum(
    leadChannelRows(quarter, month).filter((row) => String(row.channel || "").toLowerCase() === "referral"),
    "leads",
  );
}

function leadPipelineMetrics(quarter = state.quarter, month = "All months") {
  const rows = state.data.leadSummary?.monthly || [];
  const scoped = rows.filter((row) => (isOverallPeriod(quarter) || row.quarter === quarter) && monthBelongsToQuarter(row.month, quarter) && (month === "All months" || row.month === month));
  if (!scoped.length) {
    return { leads: 0, qualified: 0, lost: 0, inProgress: 0, won: 0, revenue: 0, pipelineValue: 0 };
  }
  return {
    leads: sum(scoped, "leads"),
    qualified: sum(scoped, "qualified"),
    lost: sum(scoped, "lost"),
    inProgress: sum(scoped, "inProgress"),
    won: sum(scoped, "won"),
    revenue: sum(scoped, "revenue"),
    pipelineValue: sum(scoped, "pipelineValue"),
  };
}

function previousOverviewMetrics() {
  if (isOverallPeriod(state.quarter)) return null;
  if (state.granularity === "Monthly") {
    const previousMonth = previousMonthFor(activeMonth());
    if (previousMonth) return overviewMetrics(state.quarter, previousMonth);
  }
  const previousQuarter = previousQuarterFor(state.quarter);
  return previousQuarter ? overviewMetrics(previousQuarter, "All months") : null;
}

function previousSocialRows() {
  if (isOverallPeriod(state.quarter)) return [];
  if (state.granularity === "Monthly") {
    const previousMonth = previousMonthFor(activeMonth());
    if (previousMonth) return withTemporaryScope(previousMonth, () => socialRows());
  }
  const previousQuarter = previousQuarterFor(state.quarter);
  if (!previousQuarter) return [];
  const originalQuarter = state.quarter;
  const originalMonth = state.month;
  state.quarter = previousQuarter;
  state.month = "All months";
  const rows = socialRows();
  state.quarter = originalQuarter;
  state.month = originalMonth;
  return rows;
}

function previousSeoAggregate() {
  if (isOverallPeriod(state.quarter)) return null;
  if (state.granularity === "Monthly") {
    const previousMonth = previousMonthFor(activeMonth());
    if (previousMonth) {
      const row = state.data.seoReport.find((item) => item.quarter === state.quarter);
      return row ? withTemporaryScope(previousMonth, () => aggregateSeo(row)) : null;
    }
  }
  const previousQuarter = previousQuarterFor(state.quarter);
  const row = state.data.seoReport.find((item) => item.quarter === previousQuarter);
  return row ? aggregateSeo(row) : null;
}

function previousGbpAggregate() {
  if (isOverallPeriod(state.quarter)) return null;
  if (state.granularity === "Monthly") {
    const previousMonth = previousMonthFor(activeMonth());
    if (previousMonth) {
      const row = state.data.googleBusiness.find((item) => item.quarter === state.quarter);
      return row ? withTemporaryScope(previousMonth, () => aggregateGbp(row)) : null;
    }
  }
  const previousQuarter = previousQuarterFor(state.quarter);
  const row = state.data.googleBusiness.find((item) => item.quarter === previousQuarter);
  return row ? aggregateGbp(row) : null;
}

function heroContent() {
  const q = overviewMetrics();
  const previous = previousOverviewMetrics();
  const period = selectedPeriodLabel();
  const base = {
    eyebrow: `${state.granularity} report · ${period}`,
    cardLabel: "Selected period",
    cardTitle: period,
  };

  if (state.view === "compare") {
    const right = findQuarter(state.compareQuarter);
    return {
      ...base,
      eyebrow: `Comparison · ${state.quarter} vs ${state.compareQuarter}`,
      title: "Performance Comparison",
      description: "Side-by-side movement across leads, social, Meta Ads, SEO, pipeline, and revenue.",
      cardLabel: "Comparing",
      cardTitle: `${state.quarter} / ${state.compareQuarter}`,
      stats: [
        { label: "Revenue change", value: `${formatMoney(q.revenue - right.revenue)}` },
        { label: "Lead change", value: `${q.leads - right.leads >= 0 ? "+" : ""}${formatNumber(q.leads - right.leads)}` },
        { label: "Qualified change", value: `${q.qualified - right.qualified >= 0 ? "+" : ""}${formatNumber(q.qualified - right.qualified)}` },
        { label: "CPQL change", value: formatMoney(q.cpql - right.cpql, true) },
      ],
    };
  }

  if (state.view === "social") {
    const rows = socialRows();
    const previousRows = previousSocialRows();
    const stats = [
      heroStat("Views", formatNumber(sum(rows, "views")), sum(rows, "views"), sum(previousRows, "views")),
      heroStat("Reach", formatNumber(sum(rows, "reach")), sum(rows, "reach"), sum(previousRows, "reach")),
      heroStat("Engagements", formatNumber(sum(rows, "engagements")), sum(rows, "engagements"), sum(previousRows, "engagements")),
    ];
    if (rows.some(hasSocialLinkClicks)) {
      stats.push(heroStat("Link clicks", formatNumber(socialLinkClickTotal(rows)), socialLinkClickTotal(rows), socialLinkClickTotal(previousRows)));
    }
    return {
      ...base,
      title: "Social Media Performance",
      description: "Daily social reporting for Instagram, Facebook, TikTok, and YouTube, using views, reach, engagements, and link clicks from the uploaded workbook.",
      cardLabel: state.platform === "All platforms" ? "All platforms" : "Platform",
      cardTitle: state.platform === "All platforms" ? period : `${state.platform} · ${period}`,
      stats,
    };
  }

  if (state.view === "meta") {
    const meta = metaForPeriod();
    const previousMeta = previousMetaAggregate();
    return {
      ...base,
      title: "Meta Ads Performance",
      description: "Paid Facebook and Instagram ad delivery, clicks, spend, cost efficiency, CTR, and lead-quality performance for the selected reporting period.",
      stats: [
        heroStat("Impressions", formatNumber(meta.impressions), meta.impressions, previousMeta?.impressions),
        heroStat("Link clicks", formatNumber(meta.linkClicks), meta.linkClicks, previousMeta?.linkClicks),
        heroStat("Spend", formatMoney(meta.amountSpent, true), meta.amountSpent, previousMeta?.amountSpent),
        heroStat("CTR", formatPct(meta.ctr, 2), meta.ctr, previousMeta?.ctr),
      ],
    };
  }

  if (state.view === "seo") {
    const seo = seoForPeriod();
    const gbp = gbpForPeriod();
    const previousSeo = previousSeoAggregate();
    const previousGbp = previousGbpAggregate();
    return {
      ...base,
      title: "SEO & Google Business Profile",
      description: "Google Search Console, keyword, and Google Business Profile performance for the selected monthly or quarterly view.",
      stats: [
        heroStat("Search clicks", formatNumber(seo.clicks), seo.clicks, previousSeo?.clicks),
        heroStat("Impressions", formatNumber(seo.impressions), seo.impressions, previousSeo?.impressions),
        heroStat("Avg. position", Number(seo.avgPosition || 0).toFixed(1), seo.avgPosition, previousSeo?.avgPosition),
        heroStat("GBP actions", formatNumber(gbp.calls + gbp.bookings + gbp.directionRequests + gbp.websiteClicks), gbp.calls + gbp.bookings + gbp.directionRequests + gbp.websiteClicks, previousGbp ? previousGbp.calls + previousGbp.bookings + previousGbp.directionRequests + previousGbp.websiteClicks : null),
      ],
    };
  }

  if (state.view === "leads") {
    return {
      ...base,
      title: "Leads & Sales Pipeline",
      description: "Aggregate lead pipeline reporting by source, status, channel, qualification, won deals, and revenue outcomes.",
      stats: [
        heroStat("Leads", formatNumber(q.leads), q.leads, previous?.leads),
        heroStat("Qualified", formatNumber(q.qualified), q.qualified, previous?.qualified),
        heroStat("Unqualified", formatNumber(Math.max(0, q.leads - q.qualified)), Math.max(0, q.leads - q.qualified), previous ? Math.max(0, previous.leads - previous.qualified) : null),
        heroStat("Revenue won", formatMoney(q.revenue), q.revenue, previous?.revenue),
      ],
    };
  }

  if (state.view === "weekly") {
    const weeks = state.granularity === "Monthly" && state.month !== "All months"
      ? quarterWeeks().filter((row) => row.month === state.month)
      : quarterWeeks();
    return {
      ...base,
      title: "Weekly Marketing Trend",
      description: "Weekly lead, qualified lead, won deal, and revenue movement that rolls into the selected monthly or quarterly report.",
      stats: [
        { label: "Weekly rows", value: formatNumber(weeks.length) },
        { label: "Leads", value: formatNumber(sum(weeks, "leads")) },
        { label: "Qualified", value: formatNumber(sum(weeks, "qualified")) },
        { label: "Revenue", value: formatMoney(sum(weeks, "revenue")) },
      ],
    };
  }

  return {
    ...base,
    title: "Marketing Performance Dashboard",
    description: state.data.reportDefinitions.overview,
      stats: [
        heroStat("Revenue won", formatMoney(q.revenue), q.revenue, previous?.revenue),
        heroStat("Qualified leads", formatNumber(q.qualified), q.qualified, previous?.qualified),
        heroStat("CPQL", formatMoney(q.cpql, true), q.cpql, previous?.cpql),
        heroStat("In progress", formatNumber(q.inProgress), q.inProgress, previous?.inProgress),
        heroStat("Pipeline value", formatMoney(q.pipelineValue), q.pipelineValue, previous?.pipelineValue),
      ],
  };
}

function renderScopeBar() {
  const monthOptions = ["All months", ...monthlyRows().map((row) => row.month)];
  const showCompare = state.view === "compare";
  const showInlineCompare = ["overview", "social", "meta", "seo", "leads"].includes(state.view);
  const showChannel = ["overview", "weekly"].includes(state.view);
  const showPlatform = state.view === "social";
  const platformOptions = ["All platforms", "Instagram", "Facebook", "TikTok", "YouTube"];
  const channelOptions = ["All channels", ...new Set([
    ...state.data.channelQuarterly.map((row) => row.channel),
    ...(state.data.leadSummary?.channelPeriods || []).map((row) => row.channel),
  ])];
  return `
    <section class="scope-bar">
      ${selectControl("granularitySelect", "View", ["Quarterly", "Monthly"], state.granularity)}
      ${selectControl("quarterSelect", "Period", periodOptions(), state.quarter)}
      ${state.granularity === "Monthly" && !isOverallPeriod() ? selectControl("monthSelect", "Month", monthOptions, state.month) : ""}
      ${showInlineCompare ? checkboxControl("compareToggle", "Compare", state.compareEnabled) : ""}
      ${showCompare || state.compareEnabled ? selectControl("compareSelect", "Compare to", uniqueQuarters(), state.compareQuarter) : ""}
      ${(showCompare || state.compareEnabled) && state.granularity === "Monthly" ? selectControl("compareMonthSelect", "Compare month", ["All months", ...monthlyRows(state.compareQuarter).map((row) => row.month)], state.compareMonth) : ""}
      ${showChannel ? selectControl("channelSelect", "Channel", channelOptions, state.channel) : ""}
      ${showPlatform ? selectControl("platformSelect", "Platform", platformOptions, state.platform) : ""}
    </section>
  `;
}

function checkboxControl(id, label, checked) {
  return `
    <label class="scope-control checkbox-control">
      <span class="meta-label">${escapeHtml(label)}</span>
      <input id="${id}" type="checkbox" ${checked ? "checked" : ""} />
    </label>
  `;
}

function selectControl(id, label, options, selected) {
  return `
    <label class="scope-control">
      <span class="meta-label">${escapeHtml(label)}</span>
      <select id="${id}">
        ${options.map((option) => `<option ${option === selected ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
      </select>
    </label>
  `;
}

function renderActiveView() {
  if (state.view === "compare") return renderCompareView();
  if (state.view === "social") return renderSocialView();
  if (state.view === "meta") return renderMetaView();
  if (state.view === "seo") return renderSeoView();
  if (state.view === "leads") return renderLeadsView();
  if (state.view === "weekly") return renderWeeklyView();
  if (state.view === "admin") return renderAdminView();
  return renderOverviewView();
}

function renderOverviewView() {
  const q = overviewMetrics();
  const previous = previousOverviewMetrics();
  const channels = overviewChannelDetailRows(state.quarter, activeMonth());
  const compare = state.compareEnabled ? overviewMetrics(state.compareQuarter, activeCompareMonth()) : null;
  return `
    <section class="kpi-grid">
      ${metricCard("Spend", formatMoney(q.spend), "Total marketing investment for the selected period.", q.spend, previous?.spend)}
      ${metricCard("Marketing leads", formatNumber(q.leads), "Leads attributed to paid, organic, social, and website channels.", q.leads, previous?.leads)}
      ${metricCard("Referral leads", formatNumber(q.referralLeads), "Leads from referral sources.", q.referralLeads, previous?.referralLeads)}
      ${metricCard("Total leads", formatNumber(q.totalLeads), "All leads for the selected period, including referrals.", q.totalLeads, previous?.totalLeads)}
      ${metricCard("Qualified leads", formatNumber(q.qualified), "Leads marked qualified or sales-ready.", q.qualified, previous?.qualified)}
      ${metricCard("In progress", formatNumber(q.inProgress), "Qualified leads that are not yet won or lost.", q.inProgress, previous?.inProgress)}
      ${metricCard("Won deals", formatNumber(q.won), "Closed deals in the selected period, including referrals.", q.won, previous?.won)}
      ${metricCard("Revenue won", formatMoney(q.revenue), "Closed revenue in the selected period, including referrals.", q.revenue, previous?.revenue)}
      ${metricCard("Avg. deal size", formatMoney(safeRatio(q.revenue, q.won)), "Average closed revenue per won deal.", safeRatio(q.revenue, q.won), previous ? safeRatio(previous.revenue, previous.won) : null)}
      ${metricCard("Pipeline value", formatMoney(q.pipelineValue), "Estimated value of qualified leads still in progress.", q.pipelineValue, previous?.pipelineValue)}
      ${metricCard("CPQL", formatMoney(q.cpql, true), "Cost per qualified lead.", q.cpql, previous?.cpql)}
      ${metricCard("CPA", formatMoney(q.cpa, true), "Cost per acquisition or won deal.", q.cpa, previous?.cpa)}
    </section>
    ${state.compareEnabled ? renderOverviewInlineCompare(q, compare) : ""}
    ${renderQuarterlySummaryPanel()}
    <section class="grid-2 equal-grid">
      ${renderWonDealsPanel(wonDealsFor().slice(0, 8), "Closed Deal Log", selectedPeriodLabel())}
      ${renderPipelinePanel(q)}
    </section>
    ${renderQuarterTable(channels)}
  `;
}

function renderOverviewInlineCompare(current, compare) {
  if (!compare) return "";
  return `
    <section class="panel section">
      <div class="panel-header"><h3>Comparison</h3><span class="badge">${escapeHtml(state.granularity === "Monthly" ? activeCompareMonth() : state.compareQuarter)}</span></div>
      ${renderDeltaGrid(current, compare, [
        ["Spend", "spend", "money"],
        ["Marketing leads", "leads", "number"],
        ["Total leads", "totalLeads", "number"],
        ["Qualified", "qualified", "number"],
        ["In progress", "inProgress", "number"],
        ["Revenue", "revenue", "money"],
        ["Pipeline value", "pipelineValue", "money"],
      ])}
    </section>
  `;
}

function metricCard(label, value, definition, rawValue, previousValue = null) {
  const changeValue = previousValue === null || previousValue === undefined || parseNumber(previousValue) === 0
    ? null
    : percentChange(parseNumber(rawValue), parseNumber(previousValue));
  const change =
    changeValue === null
      ? ""
      : `<span class="metric-change ${changeValue >= 0 ? "up" : "down"}">${changeValue >= 0 ? "+" : ""}${formatPct(changeValue, 1)}</span>`;
  return `
    <article class="metric-card">
      <span class="meta-label">${escapeHtml(label)}</span>
      <strong>${value}</strong>
      ${change}
      <p>${escapeHtml(definition)}</p>
    </article>
  `;
}

function renderDeltaGrid(current, compare, metrics) {
  return renderComparisonTable(current, compare, metrics, state.granularity === "Monthly" ? activeCompareMonth() : state.compareQuarter);
}

function renderComparisonTable(current, compare, metrics, compareLabel = "Compare") {
  if (!compare) return `<p class="definition">No comparison period is available.</p>`;
  return `
    <div class="table-wrap comparison-table">
      <table>
        <thead><tr><th>Metric</th><th>Current</th><th>${escapeHtml(compareLabel)}</th><th>Change</th><th>%</th></tr></thead>
        <tbody>
          ${metrics.map(([label, key, type]) => {
            const currentValue = parseNumber(current[key]);
            const compareValue = parseNumber(compare[key]);
            const diff = currentValue - compareValue;
            const pct = compareValue ? percentChange(currentValue, compareValue) : null;
            const diffLabel = formatMetricDiff(diff, type, key);
            const isPositive = key === "avgPosition" ? diff <= 0 : diff >= 0;
            return `
              <tr>
                <td><strong>${escapeHtml(label)}</strong></td>
                <td>${formatMetricValue(currentValue, type, key)}</td>
                <td>${formatMetricValue(compareValue, type, key)}</td>
                <td><span class="${isPositive ? "up" : "down"}">${diffLabel}</span></td>
                <td>${pct === null ? "-" : `<span class="${isPositive ? "up" : "down"}">${pct >= 0 ? "+" : ""}${formatPct(pct, 1)}</span>`}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function formatMetricValue(value, type, key = "") {
  if (type === "money") return formatMoney(value, key === "cpql" || key === "cpa" || key === "cpm" || key === "cpc");
  if (type === "pct") return formatPct(value, 2);
  if (key === "avgPosition") return Number(value || 0).toFixed(1);
  return formatNumber(value);
}

function formatMetricDiff(value, type, key = "") {
  const sign = value >= 0 ? "+" : "";
  if (type === "money") return `${sign}${formatMoney(value, key === "cpql" || key === "cpa" || key === "cpm" || key === "cpc")}`;
  if (type === "pct") return `${sign}${formatPct(value, 2)}`;
  if (key === "avgPosition") return `${value >= 0 ? "+" : ""}${Number(value || 0).toFixed(1)}`;
  return `${sign}${formatNumber(value)}`;
}

function renderQuarterlySummaryPanel() {
  const { title, label, rows } = periodSummaryRows();
  return `
    <section class="grid-2 equal-grid period-performance-grid">
      <article class="executive-panel period-chart-panel">
        <div class="panel-header">
          <h3>${escapeHtml(title)}</h3>
          <span class="fine-print">${escapeHtml(label)}</span>
        </div>
        <div class="executive-chart">${quarterlyComboChart(rows)}</div>
      </article>
      <article class="executive-panel period-table-panel">
        <div class="panel-header">
          <h3>Period Table</h3>
          <span class="fine-print">${escapeHtml(label)}</span>
        </div>
        <div class="executive-table-wrap period-table-wrap">
          <table class="executive-table period-table">
            <thead><tr><th>Period</th><th>Qualified</th><th>Spend</th><th>Revenue</th><th>Avg. deal</th><th>Win rate</th></tr></thead>
            <tbody>
              ${rows.map((row) => {
                const currentBadge = row.isCurrent ? `<span class="source-pill source-warm">Current</span>` : "";
                return `<tr><td><strong>${escapeHtml(row.period || row.quarter)}</strong> ${currentBadge}</td><td>${formatNumber(row.qualified)}</td><td>${formatMoney(row.spend)}</td><td class="money-cell">${formatMoney(row.revenue)}</td><td>${formatMoney(safeRatio(row.revenue, row.won))}</td><td>${formatPct(row.winRate, 0)}</td></tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  `;
}

function periodSummaryRows() {
  if (isOverallPeriod()) {
    return {
      title: "Period Performance Trend",
      label: "All periods",
      rows: [...(state.data.quarters || [])]
        .sort((a, b) => quarterRank(a.quarter) - quarterRank(b.quarter))
        .map((row) => ({ ...overviewMetrics(row.quarter, "All months"), period: row.quarter, isCurrent: row.quarter === uniqueQuarters()[0] })),
    };
  }
  if (state.granularity === "Monthly" && state.month !== "All months") {
    const weeklySpend = groupRows(quarterWeekly(state.quarter).filter((row) => row.month === state.month), "week");
    const rows = quarterWeeks(state.quarter)
      .filter((row) => row.month === state.month)
      .map((row) => {
        const spend = sum(weeklySpend[row.week] || [], "spend");
        return {
          period: row.range || shortDate(row.week),
          leads: row.leads,
          qualified: row.qualified,
          spend,
          revenue: row.revenue,
          won: row.won,
          winRate: safeRatio(row.won, row.qualified) * 100,
        };
      });
    return { title: "Period Performance Trend", label: state.month, rows };
  }
  const rows = monthlyRows(state.quarter).map((row) => {
    const channels = channelMetricsFor(state.quarter, row.month);
    const leadMetrics = leadPipelineMetrics(state.quarter, row.month);
    return {
      period: row.month,
      leads: leadMetrics.leads || row.leads,
      qualified: leadMetrics.qualified || row.qualified,
      spend: sum(channels, "spend"),
      revenue: leadMetrics.revenue || row.revenue,
      won: leadMetrics.won || row.won,
      winRate: safeRatio(leadMetrics.won || row.won, leadMetrics.qualified || row.qualified) * 100,
    };
  });
  return { title: "Period Performance Trend", label: state.quarter, rows };
}

function renderSourcePerformancePanel(rows, title, label) {
  const sorted = [...rows].sort((a, b) => b.revenue - a.revenue || b.leads - a.leads);
  return `
    <article class="executive-panel compact-executive">
      <div class="panel-header"><h3>${escapeHtml(title)}</h3><span class="fine-print">${escapeHtml(label)}</span></div>
      <div class="executive-table-wrap">
        <table class="executive-table">
          <thead><tr><th>Source</th><th>Total leads</th><th>Qualified</th><th>Closed revenue</th><th>Avg. deal size</th></tr></thead>
          <tbody>
            ${sorted.map((row) => {
              return `<tr><td><strong>${escapeHtml(row.channel)}</strong></td><td>${formatNumber(row.leads)}</td><td>${formatNumber(row.qualified)}</td><td class="money-cell">${formatMoney(row.revenue)}</td><td>${row.won ? formatMoney(safeRatio(row.revenue, row.won)) : "-"}</td></tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    </article>
  `;
}

function renderWonDealsPanel(rows, title = "Closed Deal Log", label = "closed deals") {
  if (!rows.length) {
    return `<article class="executive-panel compact-executive"><div class="panel-header"><h3>${escapeHtml(title)}</h3><span class="fine-print">${escapeHtml(label)}</span></div><p class="muted-copy">No won deals are recorded for this period.</p></article>`;
  }
  const sourceTotals = rows.reduce((totals, row) => {
    totals[row.source] = (totals[row.source] || 0) + parseNumber(row.revenue);
    return totals;
  }, {});
  return `
    <article class="executive-panel compact-executive">
      <div class="panel-header"><h3>${escapeHtml(title)}</h3><span class="fine-print">${escapeHtml(label)}</span></div>
      <div class="executive-table-wrap">
        <table class="executive-table deal-table">
          <thead><tr><th>Deal</th><th>Source</th><th>Revenue</th><th>Date</th></tr></thead>
          <tbody>
            ${rows.map((row) => `<tr><td><strong>${escapeHtml(row.client)}</strong></td><td><span class="source-pill source-green">${escapeHtml(row.source)}</span></td><td class="money-cell">${row.revenue ? formatMoney(row.revenue) : "-"}</td><td>${escapeHtml(row.label || shortDate(row.date))}</td></tr>`).join("")}
          </tbody>
        </table>
      </div>
      <div class="source-total-row">
        ${Object.entries(sourceTotals).map(([source, value]) => `<span><b>${escapeHtml(source)}</b> ${formatMoney(value)}</span>`).join("")}
      </div>
    </article>
  `;
}

function renderPipelinePanel(metrics = overviewMetrics()) {
  return `
    <article class="executive-panel compact-executive">
      <div class="panel-header"><h3>Lead Pipeline Flow</h3><span class="fine-print">${escapeHtml(selectedPeriodLabel())} · ${formatNumber(metrics.totalLeads)} total</span></div>
      ${leadFlowChart(leadStatusRows(), metrics)}
    </article>
  `;
}

function filteredChannels(quarter = state.quarter, month = activeMonth()) {
  let rows = channelMetricsFor(quarter, month);
  if (state.channel !== "All channels") rows = rows.filter((row) => row.channel === state.channel);
  return rows;
}

function leadChannelRows(quarter = state.quarter, month = activeMonth()) {
  const periodRows = state.data.leadSummary?.channelPeriods || [];
  const rows = periodRows.filter((row) => (isOverallPeriod(quarter) || row.quarter === quarter) && monthBelongsToQuarter(row.month, quarter) && (month === "All months" || row.month === month));
  if (!rows.length) return state.data.leadSummary?.channels || [];
  const grouped = groupRows(rows, "channel");
  return Object.entries(grouped)
    .map(([channel, channelRows]) => ({
      channel,
      leads: sum(channelRows, "leads"),
      qualified: sum(channelRows, "qualified"),
      lost: sum(channelRows, "lost"),
      inProgress: sum(channelRows, "inProgress"),
      won: sum(channelRows, "won"),
      revenue: sum(channelRows, "revenue"),
      pipelineValue: sum(channelRows, "pipelineValue"),
    }))
    .sort((a, b) => b.leads - a.leads);
}

function overviewChannelDetailRows(quarter = state.quarter, month = activeMonth()) {
  const leadRows = leadChannelRows(quarter, month);
  const spendRows = channelMetricsFor(quarter, month);
  const byChannel = new Map();
  leadRows.forEach((row) => {
    byChannel.set(row.channel, {
      quarter,
      channel: row.channel,
      spend: 0,
      leads: row.leads,
      qualified: row.qualified,
      lost: row.lost,
      inProgress: row.inProgress,
      won: row.won,
      revenue: row.revenue,
      pipelineValue: row.pipelineValue,
    });
  });
  spendRows.forEach((row) => {
    const existing = byChannel.get(row.channel) || {
      quarter,
      channel: row.channel,
      leads: 0,
      qualified: 0,
      lost: 0,
      inProgress: 0,
      won: 0,
      revenue: 0,
      pipelineValue: 0,
    };
    existing.spend = parseNumber(row.spend);
    byChannel.set(row.channel, existing);
  });
  let rows = [...byChannel.values()].map((row) => ({
    ...row,
    cpql: safeRatio(row.spend, row.qualified),
    roas: safeRatio(row.revenue, row.spend),
  }));
  if (state.channel !== "All channels") rows = rows.filter((row) => row.channel === state.channel);
  return rows.sort((a, b) => b.leads - a.leads || b.revenue - a.revenue || a.channel.localeCompare(b.channel));
}

function leadStatusRows(quarter = state.quarter, month = activeMonth()) {
  const periodRows = state.data.leadSummary?.statusPeriods || [];
  const rows = periodRows.filter((row) => (isOverallPeriod(quarter) || row.quarter === quarter) && monthBelongsToQuarter(row.month, quarter) && (month === "All months" || row.month === month));
  if (!rows.length) return state.data.leadSummary?.statuses || {};
  const grouped = {};
  rows.forEach((row) => {
    grouped[row.status] = (grouped[row.status] || 0) + parseNumber(row.count);
  });
  return sortObject(grouped);
}

function leadRecordsFor(quarter = state.quarter, month = activeMonth()) {
  const rows = state.data.leadSummary?.leadRecords || [];
  return rows
    .filter((row) => (isOverallPeriod(quarter) || row.quarter === quarter) && monthBelongsToQuarter(row.month, quarter) && (month === "All months" || row.month === month))
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
}

function wonDealsFor(quarter = state.quarter, month = activeMonth()) {
  const rows = state.data.leadSummary?.wonDeals || [];
  return rows
    .filter((row) => (isOverallPeriod(quarter) || row.quarter === quarter) && monthBelongsToQuarter(row.month, quarter) && (month === "All months" || row.month === month))
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
}

function renderQuarterTable(rows) {
  return `
    <section class="panel">
      <div class="panel-header"><h3>Lead Source Overview</h3><span class="fine-print">${escapeHtml(selectedPeriodLabel())}</span></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Channel</th><th>Spend</th><th>Leads</th><th>Qualified</th><th>Unqualified</th><th>CPQL</th><th>Won</th><th>Revenue</th><th>ROAS</th></tr></thead>
          <tbody>
            ${rows
              .map(
                (row) => `
                  <tr>
                    <td><strong>${escapeHtml(row.channel)}</strong></td>
                    <td>${formatMoney(row.spend, true)}</td>
                    <td>${formatNumber(row.leads)}</td>
                    <td>${formatNumber(row.qualified)}</td>
                    <td>${formatNumber(Math.max(0, row.leads - row.qualified))}</td>
                    <td>${formatMoney(row.cpql, true)}</td>
                    <td>${formatNumber(row.won)}</td>
                    <td>${formatMoney(row.revenue)}</td>
                    <td>${Number(row.roas || 0).toFixed(2)}</td>
                  </tr>
                `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderCompareView() {
  const left = overviewMetrics(state.quarter, activeMonth());
  const right = overviewMetrics(state.compareQuarter, activeCompareMonth());
  const metrics = [
    ["Revenue", "revenue", "money"],
    ["Qualified", "totalQualified", "number"],
    ["CPQL", "cpql", "money"],
    ["In progress", "inProgress", "number"],
    ["Pipeline value", "pipelineValue", "money"],
    ["Won", "won", "number"],
    ["CPA", "cpa", "money"],
    ["Total leads", "totalLeads", "number"],
  ];
  const socialLeft = socialTotals(socialRows(state.quarter, activeMonth(), true));
  const socialRight = socialTotals(socialRows(state.compareQuarter, activeCompareMonth(), true));
  const metaLeft = metaForPeriod(state.quarter, activeMonth());
  const metaRight = metaForPeriod(state.compareQuarter, activeCompareMonth());
  const seoLeft = seoForPeriod(state.quarter, activeMonth());
  const seoRight = seoForPeriod(state.compareQuarter, activeCompareMonth());
  const gbpLeft = gbpForPeriod(state.quarter, activeMonth());
  const gbpRight = gbpForPeriod(state.compareQuarter, activeCompareMonth());
  return `
    <section class="section-header compare-title">
      <div>
        <h2>Performance Comparison</h2>
        <p class="definition">${escapeHtml(selectedPeriodLabel())} against ${escapeHtml(state.granularity === "Monthly" ? activeCompareMonth() : state.compareQuarter)}.</p>
      </div>
    </section>
    <section class="panel compare-summary-panel">
      <div class="panel-header"><h3>Business Outcomes</h3><span class="badge">${escapeHtml(state.quarter)} vs ${escapeHtml(state.compareQuarter)}</span></div>
      ${renderCompactCompareTable(left, right, metrics)}
    </section>
    <section class="compare-section-grid">
      ${renderCompareMetricPanel("Social", socialLeft, socialRight, [["Views", "views", "number"], ["Reach", "reach", "number"], ["Engagements", "engagements", "number"], ["Link clicks", "linkClicks", "number"]])}
      ${renderCompareMetricPanel("Meta Ads", metaLeft, metaRight, [["Impressions", "impressions", "number"], ["Link clicks", "linkClicks", "number"], ["Spend", "amountSpent", "money"], ["CPM", "cpm", "money"], ["CPC", "cpc", "money"], ["CTR", "ctr", "pct"]])}
      ${renderCompareMetricPanel("SEO", { ...seoLeft, gbpActions: gbpLeft.calls + gbpLeft.bookings + gbpLeft.directionRequests + gbpLeft.websiteClicks }, { ...seoRight, gbpActions: gbpRight.calls + gbpRight.bookings + gbpRight.directionRequests + gbpRight.websiteClicks }, [["Clicks", "clicks", "number"], ["Impressions", "impressions", "number"], ["Average CTR", "ctr", "pct"], ["Avg. position", "avgPosition", "number"], ["GBP actions", "gbpActions", "number"]])}
      ${renderCompareMetricPanel("Leads", left, right, [["CPQL", "cpql", "money"], ["Qualified", "totalQualified", "number"], ["In progress", "inProgress", "number"], ["Won deals", "won", "number"], ["Revenue won", "revenue", "money"], ["Pipeline value", "pipelineValue", "money"]])}
    </section>
  `;
}

function renderCompactCompareTable(left, right, metrics) {
  return `
    <div class="table-wrap compact-table compare-table-tight">
      <table>
        <thead><tr><th>Metric</th><th>${escapeHtml(selectedPeriodLabel())}</th><th>${escapeHtml(state.granularity === "Monthly" ? activeCompareMonth() : state.compareQuarter)}</th><th>Change</th><th>%</th></tr></thead>
        <tbody>
          ${metrics.map(([label, key, type]) => compareRow(label, left, right, key, type)).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function compareRow(label, left, right, key, type) {
  const leftValue = parseNumber(left[key]);
  const rightValue = parseNumber(right[key]);
  const diff = leftValue - rightValue;
  const pct = rightValue ? percentChange(leftValue, rightValue) : null;
  const good = key === "avgPosition" || key === "cpql" || key === "cpa" || key === "cpm" || key === "cpc" ? diff <= 0 : diff >= 0;
  return `
    <tr>
      <td><strong>${escapeHtml(label)}</strong></td>
      <td>${formatMetricValue(leftValue, type, key)}</td>
      <td>${formatMetricValue(rightValue, type, key)}</td>
      <td><span class="${good ? "up" : "down"}">${formatMetricDiff(diff, type, key)}</span></td>
      <td>${pct === null ? "-" : `<span class="${good ? "up" : "down"}">${pct >= 0 ? "+" : ""}${formatPct(pct, 1)}</span>`}</td>
    </tr>
  `;
}

function renderCompareColumn(row, title, metrics) {
  return `
    <article class="panel compare-column">
      <h3>${escapeHtml(title)}</h3>
      ${metrics
        .map(([label, key, type, definition]) => {
          const value = type === "money" ? formatMoney(row[key], key === "cpql") : formatNumber(row[key]);
          return `<div class="compare-row"><span><strong>${escapeHtml(label)}</strong><small>${escapeHtml(definition)}</small></span><b>${value}</b></div>`;
        })
        .join("")}
    </article>
  `;
}

function socialTotals(rows) {
  return {
    views: sum(rows, "views"),
    reach: sum(rows, "reach"),
    engagements: sum(rows, "engagements"),
    linkClicks: socialLinkClickTotal(rows),
  };
}

function renderCompareMetricPanel(title, left, right, metrics) {
  return `
    <article class="panel compare-metric-panel">
      <div class="panel-header"><h3>${escapeHtml(title)}</h3><span class="fine-print">${escapeHtml(state.quarter)} vs ${escapeHtml(state.compareQuarter)}</span></div>
      <div class="table-wrap compact-table">
        <table>
          <thead><tr><th>Metric</th><th>${escapeHtml(state.quarter)}</th><th>${escapeHtml(state.compareQuarter)}</th><th>Change</th><th>%</th></tr></thead>
          <tbody>
            ${metrics.map(([label, key, type]) => {
              const leftValue = parseNumber(left[key]);
              const rightValue = parseNumber(right[key]);
              const diff = leftValue - rightValue;
              const pct = rightValue ? percentChange(leftValue, rightValue) : null;
              const good = key === "avgPosition" || key === "cpql" || key === "cpa" || key === "cpm" || key === "cpc" ? diff <= 0 : diff >= 0;
              return `<tr><td><strong>${escapeHtml(label)}</strong></td><td>${formatMetricValue(leftValue, type, key)}</td><td>${formatMetricValue(rightValue, type, key)}</td><td><span class="${good ? "up" : "down"}">${formatMetricDiff(diff, type, key)}</span></td><td>${pct === null ? "-" : `<span class="${good ? "up" : "down"}">${pct >= 0 ? "+" : ""}${formatPct(pct, 1)}</span>`}</td></tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    </article>
  `;
}

function scopedRows(rows) {
  if (state.granularity !== "Monthly" || state.month === "All months") return rows;
  return rows.filter((row) => row.month === state.month);
}

function rowsForMonth(rows, month = activeMonth()) {
  if (state.granularity !== "Monthly" || month === "All months") return rows;
  return rows.filter((row) => row.month === month);
}

function aggregateSocial(row, month = activeMonth()) {
  const series = rowsForMonth(row.series || [], month);
  const posts = socialPostCountFor(row.platform, row.quarter, month);
  return {
    ...row,
    series,
    contentViews: sum(series, "contentViews"),
    reach: sum(series, "reach"),
    views: sum(series, "views"),
    engagements: sum(series, "engagements"),
    linkClicks: sum(series, "linkClicks"),
    posts,
    pageViews: sum(series, "pageViews"),
    engagementRate: safeRatio(sum(series, "engagements"), sum(series, "reach")) * 100,
  };
}

function socialPostCountFor(platform, quarter, month = activeMonth()) {
  const rows = state.data.manual.socialPostCounts || [];
  if (isOverallPeriod(quarter)) {
    return sum(rows.filter((row) => row.platform === platform && (month === "All months" || row.month === month)), "posts");
  }
  if (month !== "All months") {
    return sum(rows.filter((row) => row.quarter === quarter && row.platform === platform && row.month === month), "posts");
  }
  const quarterRows = rows.filter((row) => row.quarter === quarter && row.platform === platform && row.month === "All months");
  if (quarterRows.length) return sum(quarterRows, "posts");
  return sum(rows.filter((row) => row.quarter === quarter && row.platform === platform && row.month !== "All months"), "posts");
}

function aggregateMeta(row, month = activeMonth()) {
  const series = rowsForMonth(row.series || [], month);
  const impressions = sum(series, "impressions");
  const linkClicks = sum(series, "linkClicks");
  const uniqueLinkClicks = sum(series, "uniqueLinkClicks");
  const amountSpent = sum(series, "amountSpent");
  return {
    ...row,
    series,
    impressions,
    reach: sum(series, "reach"),
    avgDailyReach: series.length ? Math.round(sum(series, "reach") / series.length) : 0,
    linkClicks,
    uniqueLinkClicks,
    amountSpent,
    cpm: safeRatio(amountSpent, impressions) * 1000,
    cpc: safeRatio(amountSpent, linkClicks),
    ctr: safeRatio(linkClicks, impressions) * 100,
  };
}

function aggregateSeo(row, month = activeMonth()) {
  const series = rowsForMonth(row.series || [], month);
  const postRows = rowsForMonth(row.postRows || [], month);
  const clicks = sum(series, "clicks");
  const impressions = sum(series, "impressions");
  const monthlyKeywords = month !== "All months" ? state.data.manual?.seoMonthlyKeywords?.[month] : null;
  const monthlyTracked = month !== "All months" ? state.data.manual?.seoMonthlyTrackedKeywords?.[month] : null;
  const monthlyPages = month !== "All months" ? state.data.manual?.seoMonthlyTopPages?.[month] : null;
  const keywordRows = monthlyKeywords || row.keywordRows || [];
  return {
    ...row,
    series,
    postRows,
    clicks,
    impressions,
    ctr: safeRatio(clicks, impressions) * 100,
    avgPosition: avg(series, "position") || row.avgPosition || 0,
    keywordRows,
    keywordCount: keywordRows.length || row.keywordCount || 0,
    trackedKeywordRows: monthlyTracked || row.trackedKeywordRows || [],
    topPages: monthlyPages || row.topPages || [],
    posts: postRows.length || row.posts || 0,
  };
}

function aggregateGbp(row, month = activeMonth()) {
  const series = rowsForMonth(row.series || [], month);
  return {
    ...row,
    series,
    calls: sum(series, "calls"),
    bookings: sum(series, "bookings"),
    directionRequests: sum(series, "directionRequests"),
    websiteClicks: sum(series, "websiteClicks"),
    profileViews: sum(series, "profileViews"),
  };
}

function mergeSeriesRows(rows, label = "date") {
  return rows
    .flatMap((row) => row.series || [])
    .sort((a, b) => String(a.date || a[label] || "").localeCompare(String(b.date || b[label] || "")));
}

function metaForPeriod(quarter = state.quarter, month = activeMonth()) {
  if (!isOverallPeriod(quarter)) {
    return aggregateMeta(state.data.metaAds.find((row) => row.quarter === quarter) || {}, month);
  }
  const rows = state.data.metaAds || [];
  const series = mergeSeriesRows(rows);
  return aggregateMeta({
    quarter,
    series,
    campaigns: rows.flatMap((row) => row.campaigns || []),
    leads: sum(rows, "leads"),
    qualified: sum(rows, "qualified"),
    unqualified: sum(rows, "unqualified"),
    cpql: safeRatio(sum(rows, "amountSpent"), sum(rows, "qualified")),
  }, "All months");
}

function seoForPeriod(quarter = state.quarter, month = activeMonth()) {
  if (!isOverallPeriod(quarter)) {
    return aggregateSeo(state.data.seoReport.find((row) => row.quarter === quarter) || {}, month);
  }
  const rows = state.data.seoReport || [];
  const series = mergeSeriesRows(rows);
  const sharedSearchExport = rows.length > 0 && rows.every((row) => row.source === "Google Search Console export");
  if (sharedSearchExport) {
    const source = rows[0] || {};
    const postRows = rows.flatMap((row) => row.postRows || []);
    return aggregateSeo({
      quarter,
      series,
      keywordRows: source.keywordRows || [],
      keywordCount: source.keywordCount || (source.keywordRows || []).length,
      topPages: source.topPages || [],
      postRows,
      posts: postRows.length,
    }, "All months");
  }
  const keywordMap = new Map();
  const pageMap = new Map();
  rows.flatMap((row) => row.keywordRows || []).forEach((row) => {
    const existing = keywordMap.get(row.keyword) || { ...row, clicks: 0, impressions: 0, positionTotal: 0, positionCount: 0 };
    existing.clicks += parseNumber(row.clicks);
    existing.impressions += parseNumber(row.impressions);
    existing.positionTotal += parseNumber(row.position);
    existing.positionCount += 1;
    existing.position = safeRatio(existing.positionTotal, existing.positionCount);
    existing.ctr = safeRatio(existing.clicks, existing.impressions) * 100;
    keywordMap.set(row.keyword, existing);
  });
  rows.flatMap((row) => row.topPages || []).forEach((row) => {
    const existing = pageMap.get(row.url) || { ...row, clicks: 0, impressions: 0, positionTotal: 0, positionCount: 0 };
    existing.clicks += parseNumber(row.clicks);
    existing.impressions += parseNumber(row.impressions);
    existing.positionTotal += parseNumber(row.position);
    existing.positionCount += 1;
    existing.position = safeRatio(existing.positionTotal, existing.positionCount);
    existing.ctr = safeRatio(existing.clicks, existing.impressions) * 100;
    pageMap.set(row.url, existing);
  });
  const postRows = rows.flatMap((row) => row.postRows || []);
  return aggregateSeo({ quarter, series, keywordRows: [...keywordMap.values()], keywordCount: keywordMap.size, topPages: [...pageMap.values()], postRows, posts: postRows.length }, "All months");
}

function gbpForPeriod(quarter = state.quarter, month = activeMonth()) {
  if (!isOverallPeriod(quarter)) {
    return aggregateGbp(state.data.googleBusiness.find((row) => row.quarter === quarter) || {}, month);
  }
  const rows = state.data.googleBusiness || [];
  return aggregateGbp({ quarter, series: mergeSeriesRows(rows) }, "All months");
}

function previousQuarterFor(quarter) {
  return uniqueQuarters()
    .filter((item) => quarterRank(item) < quarterRank(quarter))
    .sort((a, b) => quarterRank(b) - quarterRank(a))[0];
}

function previousMonthFor(month) {
  const months = monthlyRows().map((row) => row.month);
  const index = months.indexOf(month);
  return index > 0 ? months[index - 1] : null;
}

function withTemporaryScope(month, callback) {
  const original = state.month;
  state.month = month || "All months";
  const result = callback();
  state.month = original;
  return result;
}

function previousMetaAggregate() {
  if (isOverallPeriod(state.quarter)) return null;
  if (state.granularity === "Monthly" && state.month !== "All months") {
    const previousMonth = previousMonthFor(state.month);
    if (!previousMonth) return null;
    const row = state.data.metaAds.find((item) => item.quarter === state.quarter);
    return row ? withTemporaryScope(previousMonth, () => aggregateMeta(row)) : null;
  }
  const previousQuarter = previousQuarterFor(state.quarter);
  const row = state.data.metaAds.find((item) => item.quarter === previousQuarter);
  return row ? aggregateMeta(row) : null;
}

function percentChange(current, previous) {
  if (!previous) return 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function differenceRows(current, previous, metrics) {
  if (!previous) return `<p class="definition">No previous ${state.granularity.toLowerCase()} period is available for comparison.</p>`;
  const compareLabel = state.compareEnabled ? (state.granularity === "Monthly" ? activeCompareMonth() : state.compareQuarter) : `Previous ${state.granularity.toLowerCase()}`;
  return renderComparisonTable(current, previous, metrics, compareLabel);
}

function renderSocialView() {
  const rows = socialRows();
  const compareRows = state.compareEnabled ? socialRows(state.compareQuarter, activeCompareMonth()) : [];
  const totals = {
    views: sum(rows, "views"),
    reach: sum(rows, "reach"),
    engagements: sum(rows, "engagements"),
    linkClicks: socialLinkClickTotal(rows),
  };
  const showLinkClicks = rows.some(hasSocialLinkClicks);
  return `
    <section class="section-header">
      <div>
        <h2>Social Media Performance</h2>
        <p class="definition">${escapeHtml(state.data.reportDefinitions.social)}</p>
      </div>
    </section>
    <section class="kpi-grid social-kpis">
      ${metricCard("Views", formatNumber(totals.views), "Total views from the uploaded social report.", totals.views)}
      ${metricCard("Reach", formatNumber(totals.reach), "Unique accounts that saw content.", totals.reach)}
      ${metricCard("Engagements", formatNumber(totals.engagements), "Reactions, comments, shares, and saves.", totals.engagements)}
      ${showLinkClicks ? metricCard("Link clicks", formatNumber(totals.linkClicks), "Clicks from social content to owned destinations.", totals.linkClicks) : ""}
    </section>
    ${state.compareEnabled ? renderSocialCompareRows(rows, compareRows) : ""}
    <section class="grid-2">
      ${rows.map((row) => renderSocialGraphPanel(row)).join("")}
    </section>
    <section class="panel">
      <div class="panel-header"><h3>Channel Performance Table</h3></div>
      ${renderSocialTable(rows)}
    </section>
  `;
}

function renderSocialCompareRows(rows, compareRows) {
  const current = {
    views: sum(rows, "views"),
    reach: sum(rows, "reach"),
    engagements: sum(rows, "engagements"),
    linkClicks: socialLinkClickTotal(rows),
  };
  const compare = {
    views: sum(compareRows, "views"),
    reach: sum(compareRows, "reach"),
    engagements: sum(compareRows, "engagements"),
    linkClicks: socialLinkClickTotal(compareRows),
  };
  const metrics = [["Views", "views", "number"], ["Reach", "reach", "number"], ["Engagements", "engagements", "number"]];
  if (rows.some(hasSocialLinkClicks) || compareRows.some(hasSocialLinkClicks)) {
    metrics.splice(3, 0, ["Link clicks", "linkClicks", "number"]);
  }
  return `
    <section class="panel section">
      <div class="panel-header"><h3>Social Comparison</h3><span class="badge">${escapeHtml(state.granularity === "Monthly" ? activeCompareMonth() : state.compareQuarter)}</span></div>
      ${renderDeltaGrid(current, compare, metrics)}
    </section>
  `;
}

function socialRows(quarter = state.quarter, month = activeMonth(), ignorePlatform = false) {
  let baseRows = state.data.socialPlatforms.filter((row) => isOverallPeriod(quarter) || row.quarter === quarter);
  if (isOverallPeriod(quarter)) {
    const groups = groupRows(baseRows, "platform");
    baseRows = Object.entries(groups).map(([platform, rows]) => ({
      quarter,
      platform,
      color: rows[0]?.color || platformBase(platform)?.color || "#544845",
      followers: SOCIAL_FOLLOWERS[platform] ?? rows[0]?.followers ?? 0,
      series: mergeSeriesRows(rows),
    }));
  }
  let rows = baseRows.map((row) => aggregateSocial(row, month));
  if (!ignorePlatform && state.platform !== "All platforms") {
    rows = rows.filter((row) => row.platform === state.platform);
  }
  return rows;
}

function hasSocialLinkClicks(row) {
  return !["tiktok", "youtube"].includes(String(row.platform || "").toLowerCase());
}

function socialLinkClickTotal(rows) {
  return sum(rows.filter(hasSocialLinkClicks), "linkClicks");
}

function renderPlatformCard(row) {
  const showLinkClicks = hasSocialLinkClicks(row);
  return `
    <article class="platform-card" style="--platform: ${row.color}">
      <div class="platform-icon"><img src="${escapeHtml(platformLogo(row.platform))}" alt="" /></div>
      <div>
        <h3>${escapeHtml(row.platform)}</h3>
        <div class="platform-card-grid">
          <span><b>${formatNumber(row.views)}</b> views</span>
          <span><b>${formatNumber(row.reach)}</b> reach</span>
          <span><b>${formatNumber(row.engagements)}</b> engagements</span>
          <span><b>${showLinkClicks ? formatNumber(row.linkClicks) : "-"}</b> link clicks</span>
          <span><b>${formatNumber(row.posts)}</b> posts</span>
        </div>
      </div>
    </article>
  `;
}

function renderSocialGraphPanel(row) {
  const metrics = [
    ["Content views", row.contentViews],
    ["Reach", row.reach],
    ["Views", row.views],
    ["Engagements", row.engagements],
    ["Followers", row.followers || "-"],
  ];
  return `
    <article class="panel platform-chart-panel">
      <div class="panel-header"><h3>${escapeHtml(row.platform)} Content Views & Reach</h3><span class="badge">${escapeHtml(selectedPeriodLabel())}</span></div>
      ${metricHeaderRow(metrics)}
      <div class="chart-wrap chart-watermark">
        <img src="${escapeHtml(platformLogo(row.platform))}" alt="" />
        ${dualAxisLineChart(row.series, "label", "contentViews", "reach", { firstLabel: "Content views", secondLabel: "Reach", firstType: "number", secondType: "number", height: 300 })}
      </div>
    </article>
  `;
}

function metricHeaderRow(metrics) {
  return `
    <div class="chart-metric-row" style="--metric-count: ${metrics.length}">
      ${metrics.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${typeof value === "number" ? formatNumber(value) : escapeHtml(value)}</strong></div>`).join("")}
    </div>
  `;
}

function renderSocialTable(rows) {
  return `
    <div class="table-wrap compact-table">
      <table>
        <thead><tr><th>Platform</th><th>Views</th><th>Reach</th><th>Engagements</th><th>Link clicks</th></tr></thead>
        <tbody>
          ${rows
            .map(
              (row) => `
                <tr>
                  <td><strong>${escapeHtml(row.platform)}</strong></td>
                  <td>${formatNumber(row.views)}</td>
                  <td>${formatNumber(row.reach)}</td>
                  <td>${formatNumber(row.engagements)}</td>
                  <td>${hasSocialLinkClicks(row) ? formatNumber(row.linkClicks) : "-"}</td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderMetaView() {
  const meta = metaForPeriod();
  const previous = state.compareEnabled
    ? metaForPeriod(state.compareQuarter, activeCompareMonth())
    : previousMetaAggregate();
  const diffMetrics = [
    ["Impressions", "impressions", "number"],
    ["Link clicks", "linkClicks", "number"],
    ["Spend", "amountSpent", "money"],
    ["CPM", "cpm", "money"],
    ["CPC", "cpc", "money"],
    ["CTR", "ctr", "pct"],
  ];
  return `
    <section class="section-header">
      <div>
        <h2>Meta Ads Performance</h2>
        <p class="definition">${escapeHtml(state.data.reportDefinitions.meta)}</p>
      </div>
    </section>
    <section class="kpi-grid meta-kpis">
      ${metricCard("Impressions", formatNumber(meta.impressions), "How often ads were shown.", meta.impressions)}
      ${metricCard("Link clicks", formatNumber(meta.linkClicks), "Clicks through to your site or lead form.", meta.linkClicks)}
      ${metricCard("Amount spent", formatMoney(meta.amountSpent, true), "Total Meta Ads investment.", meta.amountSpent)}
      ${metricCard("CPM", formatMoney(meta.cpm, true), "Cost per 1,000 impressions.", meta.cpm)}
      ${metricCard("CPC", formatMoney(meta.cpc, true), "Cost per link click.", meta.cpc)}
      ${metricCard("CTR", formatPct(meta.ctr, 2), "Link click-through rate.", meta.ctr)}
    </section>
    <section class="grid-2">
      ${renderMetaTrendPanel("Impressions & CPM", meta, "impressions", "cpm", "Impressions", "CPM")}
      ${renderMetaTrendPanel("Clicks & CPC", meta, "linkClicks", "cpc", "Link clicks", "CPC")}
      ${renderMetaLeadEfficiencyPanel(meta)}
      <article class="panel">
        <div class="panel-header"><h3>Lead Quality</h3><span class="badge">Meta Ads</span></div>
        <div class="quality-grid">
          ${qualityBar("Total leads", meta.leads, meta.leads)}
          ${qualityBar("Qualified leads", meta.qualified, meta.leads)}
          ${qualityBar("Unqualified leads", meta.unqualified, meta.leads)}
          <p><strong>${formatMoney(meta.cpql, true)}</strong> cost per qualified lead</p>
        </div>
      </article>
    </section>
    <section class="panel">
      <div class="panel-header"><h3>Meta Ads Comparison</h3><span class="badge">${escapeHtml(state.compareEnabled ? "Selected comparison" : `Previous ${state.granularity.toLowerCase()} period`)}</span></div>
      ${differenceRows(meta, previous, diffMetrics)}
    </section>
  `;
}

function renderMetaTrendPanel(title, meta, firstKey, secondKey, firstLabel, secondLabel) {
  const metrics = [
    ["Impressions", meta.impressions],
    ["CPM", formatMoney(meta.cpm, true)],
    ["CPC", formatMoney(meta.cpc, true)],
    ["Link clicks", meta.linkClicks],
  ];
  return `
    <article class="panel">
      <div class="panel-header"><h3>${escapeHtml(title)}</h3><span class="badge">${escapeHtml(selectedPeriodLabel())}</span></div>
      ${metricHeaderRow(metrics)}
      <div class="chart-wrap">${dualAxisLineChart(meta.series || [], "label", firstKey, secondKey, { firstLabel, secondLabel, firstType: "number", secondType: "money", height: 300 })}</div>
    </article>
  `;
}

function renderMetaLeadEfficiencyPanel(meta) {
  const rows = metaLeadEfficiencyRows();
  const metrics = [
    ["Spend", formatMoney(sum(rows, "amountSpent"), true)],
    ["Leads", sum(rows, "leads") || meta.leads],
    ["Qualified", sum(rows, "qualified") || meta.qualified],
    ["CPQL", formatMoney(meta.cpql, true)],
  ];
  return `
    <article class="panel">
      <div class="panel-header"><h3>Spend & Qualified Leads</h3><span class="badge">${escapeHtml(selectedPeriodLabel())}</span></div>
      ${metricHeaderRow(metrics)}
      <div class="chart-wrap">${dualAxisLineChart(rows, "label", "amountSpent", "qualified", { firstLabel: "Spend", secondLabel: "Qualified", firstType: "money", secondType: "number", height: 300 })}</div>
    </article>
  `;
}

function metaLeadEfficiencyRows(quarter = state.quarter, month = activeMonth()) {
  const rows = (isOverallPeriod(quarter) ? state.data.channelWeekly || [] : quarterWeekly(quarter))
    .filter((row) => row.channel === "Meta Ads" && row.week && (!month || month === "All months" || row.month === month))
    .sort((a, b) => String(a.week || "").localeCompare(String(b.week || "")))
    .map((row) => ({
      label: shortDate(row.week),
      amountSpent: parseNumber(row.spend),
      leads: parseNumber(row.leads),
      qualified: parseNumber(row.qualified),
    }));
  if (rows.length) return rows;
  const meta = metaForPeriod(quarter, month);
  return [{ label: selectedPeriodLabel(quarter, month), amountSpent: meta.amountSpent, leads: meta.leads, qualified: meta.qualified }];
}

function qualityBar(label, value, total, displayValue = formatNumber(value)) {
  const width = Math.min(100, safeRatio(value, total || 1) * 100);
  return `
    <div class="quality-row">
      <div class="field-row">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(displayValue)}</strong>
      </div>
      <div class="bar-meter"><span style="width: ${width}%"></span></div>
    </div>
  `;
}

function renderSeoView() {
  const seo = seoForPeriod();
  const gbp = gbpForPeriod();
  const compareSeo = state.compareEnabled
    ? seoForPeriod(state.compareQuarter, activeCompareMonth())
    : previousSeoAggregate();
  return `
    <section class="section-header">
      <div>
        <h2>SEO, Search Console & Google Business Profile</h2>
        <p class="definition">${escapeHtml(state.data.reportDefinitions.seo)}</p>
      </div>
    </section>
    <section class="kpi-grid">
      ${metricCard("Search clicks", formatNumber(seo.clicks), "Organic clicks from Google Search Console.", seo.clicks)}
      ${metricCard("Impressions", formatNumber(seo.impressions), "Organic search result impressions.", seo.impressions)}
      ${metricCard("Average CTR", formatPct(seo.ctr, 2), "Organic click-through rate.", seo.ctr)}
      ${metricCard("Avg. position", Number(seo.avgPosition || 0).toFixed(1), "Average keyword ranking position.", seo.avgPosition)}
      ${metricCard("GBP clicks", formatNumber(gbp.websiteClicks), "Website clicks from Google Business Profile.", gbp.websiteClicks)}
    </section>
    ${state.compareEnabled ? `<section class="panel"><div class="panel-header"><h3>SEO Comparison</h3><span class="badge">Selected comparison</span></div>${differenceRows(seo, compareSeo, [["Clicks", "clicks", "number"], ["Impressions", "impressions", "number"], ["CTR", "ctr", "pct"], ["Avg. position", "avgPosition", "number"]])}</section>` : ""}
    <section class="grid-2">
      <article class="panel">
        <div class="panel-header"><h3>Search Console Trend</h3></div>
        <p class="definition">Impressions are shown as the line on the left axis. Clicks are shown as bars on the right axis.</p>
        <div class="chart-wrap">${searchConsoleComboChart(seo.series || [], { height: 300 })}</div>
      </article>
      <article class="panel">
        <div class="panel-header"><h3>Google Business Profile</h3></div>
        <div class="metric-strip">
          <div><span class="meta-label">Calls</span><strong>${formatNumber(gbp.calls)}</strong></div>
          <div><span class="meta-label">Bookings</span><strong>${formatNumber(gbp.bookings)}</strong></div>
          <div><span class="meta-label">Directions</span><strong>${formatNumber(gbp.directionRequests)}</strong></div>
          <div><span class="meta-label">Website clicks</span><strong>${formatNumber(gbp.websiteClicks)}</strong></div>
        </div>
        <div class="chart-wrap">${lineChart(gbp.series || [], "label", "profileViews", "websiteClicks", { firstLabel: "Profile views", secondLabel: "Website clicks", height: 280 })}</div>
      </article>
    </section>
    <section class="panel">
      <div class="panel-header"><h3>Top Ranking Keywords</h3><span class="badge">Best positions</span></div>
      ${renderTopRankingKeywords(seo.keywordRows || [])}
    </section>
    <section class="panel">
      <div class="panel-header"><h3>Tracked Service Keywords</h3><span class="badge">${escapeHtml(selectedPeriodLabel())}</span></div>
      ${renderTrackedKeywordTable(seo.trackedKeywordRows || [])}
    </section>
    <section class="panel">
      <div class="panel-header"><h3>Keyword Table</h3><span class="badge">${state.compareEnabled ? "With comparison" : "Impressions & position"}</span></div>
      <div class="keyword-toolbar">
        <label>
          <span class="meta-label">Search keywords</span>
          <input id="keywordSearch" type="search" value="${escapeHtml(state.keywordSearch)}" placeholder="Search keyword variations" />
        </label>
        <button type="button" class="utility-button keyword-search-button" data-keyword-search>Search</button>
        <label>
          <span class="meta-label">Rows per page</span>
          <select id="keywordLimit">
            ${[20, 50, 100, 200].map((value) => `<option value="${value}" ${state.keywordLimit === value ? "selected" : ""}>${value}</option>`).join("")}
          </select>
        </label>
        <span class="fine-print">${formatNumber(seo.keywordCount || (seo.keywordRows || []).length)} keywords in export</span>
      </div>
      ${renderKeywordTable(seo.keywordRows || [], state.compareEnabled ? compareSeo.keywordRows || [] : [])}
    </section>
    <section class="panel">
      <div class="panel-header"><h3>Top Organic Pages</h3><span class="badge">Clicks, impressions, CTR, position</span></div>
      ${renderTopPagesTable(seo.topPages || [])}
    </section>
  `;
}

function renderTopPagesTable(rows) {
  const visible = [...rows]
    .sort((a, b) => parseNumber(b.clicks) - parseNumber(a.clicks) || parseNumber(b.impressions) - parseNumber(a.impressions))
    .slice(0, 12);
  if (!visible.length) return `<p class="definition">No page-level Search Console data is available for this period.</p>`;
  return `
    <div class="table-wrap compact-table">
      <table>
        <thead><tr><th>Page</th><th>Clicks</th><th>Impressions</th><th>CTR</th><th>Position</th></tr></thead>
        <tbody>${visible
          .map((row) => `<tr><td><strong>${escapeHtml(row.url)}</strong></td><td>${formatNumber(row.clicks)}</td><td>${formatNumber(row.impressions)}</td><td>${formatPct(row.ctr, 2)}</td><td>${Number(row.position || 0).toFixed(1)}</td></tr>`)
          .join("")}</tbody>
      </table>
    </div>
  `;
}

function renderTopRankingKeywords(rows) {
  const visible = [...rows]
    .filter((row) => parseNumber(row.impressions) > 0 && parseNumber(row.position) > 0)
    .sort((a, b) => parseNumber(a.position) - parseNumber(b.position) || parseNumber(b.impressions) - parseNumber(a.impressions))
    .slice(0, 10);
  if (!visible.length) return `<p class="definition">No ranked keyword rows are available for this period.</p>`;
  return `
    <div class="rank-grid">
      ${visible.map((row, index) => `
        <div class="rank-card">
          <span>${formatNumber(index + 1)}</span>
          <strong>${escapeHtml(row.keyword)}</strong>
          <b>${Number(row.position || 0).toFixed(1)}</b>
          <small>${formatNumber(row.impressions)} impressions</small>
        </div>
      `).join("")}
    </div>
  `;
}

function renderTrackedKeywordTable(rows) {
  const tracked = rows.length ? rows : (state.data.manual?.trackedSeoKeywords || []).map((keyword) => ({ keyword, missing: true }));
  return `
    <div class="table-wrap compact-table">
      <table>
        <thead><tr><th>Keyword</th><th>Clicks</th><th>Impressions</th><th>CTR</th><th>Position</th></tr></thead>
        <tbody>${tracked.map((row) => {
          const missing = row.missing || (!parseNumber(row.impressions) && !parseNumber(row.clicks) && !parseNumber(row.position));
          return `<tr><td><strong>${escapeHtml(row.keyword)}</strong></td><td>${missing ? "-" : formatNumber(row.clicks)}</td><td>${missing ? "-" : formatNumber(row.impressions)}</td><td>${missing ? "-" : formatPct(row.ctr, 2)}</td><td>${missing ? "-" : Number(row.position || 0).toFixed(1)}</td></tr>`;
        }).join("")}</tbody>
      </table>
    </div>
  `;
}

function renderKeywordTable(rows, compareRows = []) {
  const search = state.keywordSearch.trim().toLowerCase();
  const ordered = orderKeywordRows(rows).filter((row) => !search || String(row.keyword || "").toLowerCase().includes(search));
  const pageSize = parseNumber(state.keywordLimit) || 20;
  const maxPage = Math.max(1, Math.ceil(ordered.length / pageSize));
  const page = Math.min(Math.max(1, state.keywordPage), maxPage);
  const start = (page - 1) * pageSize;
  const visibleRows = ordered.slice(start, start + pageSize);
  const compareMap = new Map(compareRows.map((row) => [row.keyword, row]));
  const hasCompare = compareRows.length > 0;
  return `
    <div class="table-wrap compact-table">
      <table>
        <thead><tr><th>Keyword</th><th>Impressions</th><th>Position</th>${hasCompare ? "<th>Compare impressions</th><th>Compare position</th><th>Change</th>" : ""}</tr></thead>
        <tbody>${visibleRows
          .map(
            (row) => {
              const impressions = parseNumber(row.impressions || parseNumber(row.searchVolume) * 18);
              const position = parseNumber(row.position);
              const compare = compareMap.get(row.keyword);
              const compareImpressions = compare ? parseNumber(compare.impressions || parseNumber(compare.searchVolume) * 18) : 0;
              const comparePosition = compare ? parseNumber(compare.position) : 0;
              const impressionDiff = impressions - compareImpressions;
              const positionDiff = compare ? position - comparePosition : 0;
              const compareCells = hasCompare
                ? `<td>${compare ? formatNumber(compareImpressions) : "-"}</td><td>${compare ? Number(comparePosition || 0).toFixed(1) : "-"}</td><td><span class="${impressionDiff >= 0 ? "up" : "down"}">${compare ? `${impressionDiff >= 0 ? "+" : ""}${formatNumber(impressionDiff)} impr.` : "-"}</span><br><span class="${positionDiff <= 0 ? "up" : "down"}">${compare ? `${positionDiff <= 0 ? "" : "+"}${Number(positionDiff || 0).toFixed(1)} pos.` : ""}</span></td>`
                : "";
              return `<tr><td><strong>${escapeHtml(row.keyword)}</strong></td><td>${formatNumber(impressions)}</td><td>${Number(position || 0).toFixed(1)}</td>${compareCells}</tr>`;
            },
          )
          .join("")}</tbody>
      </table>
    </div>
    <div class="table-pagination">
      <p class="fine-print">${ordered.length ? `Showing ${formatNumber(start + 1)}-${formatNumber(Math.min(start + visibleRows.length, ordered.length))} of ${formatNumber(ordered.length)} matching keywords.` : "No keywords match this search."}</p>
      <div>
        <button type="button" class="ghost-button" data-keyword-page="${page - 1}" ${page <= 1 ? "disabled" : ""}>Previous</button>
        <span class="fine-print">Page ${formatNumber(page)} of ${formatNumber(maxPage)}</span>
        <button type="button" class="ghost-button" data-keyword-page="${page + 1}" ${page >= maxPage ? "disabled" : ""}>Next</button>
      </div>
    </div>
  `;
}

function orderKeywordRows(rows) {
  return [...rows].sort((a, b) => {
    const priorityA = a.priority ?? keywordPriority(a.keyword);
    const priorityB = b.priority ?? keywordPriority(b.keyword);
    return (
      priorityA - priorityB ||
      parseNumber(b.clicks) - parseNumber(a.clicks) ||
      parseNumber(b.impressions) - parseNumber(a.impressions) ||
      parseNumber(a.position) - parseNumber(b.position) ||
      String(a.keyword || "").localeCompare(String(b.keyword || ""))
    );
  });
}

function keywordPriority(keyword) {
  const value = String(keyword || "").toLowerCase();
  const serviceTerms = ["terzetto", "remodel", "renovation", "design build", "design-build", "secondary suite", "home addition", "kitchen", "bathroom", "basement", "custom home", "ottawa", "contractor", "construction"];
  if (value.includes("terzetto")) return 0;
  if (serviceTerms.some((term) => value.includes(term))) return 1;
  return 2;
}

function renderSeoPostTable(rows) {
  if (!rows.length) return `<p class="definition">No SEO post links have been added for this period yet.</p>`;
  return `
    <div class="table-wrap compact-table">
      <table>
        <thead><tr><th>Post date</th><th>Title</th><th>Link</th></tr></thead>
        <tbody>${rows
          .map((row) => `<tr><td>${escapeHtml(row.label || shortDate(row.date))}</td><td><strong>${escapeHtml(row.title || "Website post")}</strong></td><td>${row.url ? `<a href="${escapeHtml(row.url)}" target="_blank" rel="noreferrer">${escapeHtml(row.url)}</a>` : "-"}</td></tr>`)
          .join("")}</tbody>
      </table>
    </div>
  `;
}

function renderLeadsView() {
  const q = overviewMetrics();
  const leadChannels = leadChannelRows(state.quarter, activeMonth());
  const previous = state.compareEnabled ? overviewMetrics(state.compareQuarter, activeCompareMonth()) : previousOverviewMetrics();
  const leadsNotQualified = Math.max(0, q.totalLeads - q.totalQualified);
  const previousNotQualified = previous ? Math.max(0, previous.totalLeads - previous.totalQualified) : null;
  const wonDeals = wonDealsFor();
  return `
    <section class="section-header">
      <div>
        <h2>Leads & Sales Pipeline</h2>
        <p class="definition">${escapeHtml(state.data.reportDefinitions.leads)}</p>
      </div>
    </section>
    <section class="kpi-grid">
      ${metricCard("Total leads", formatNumber(q.totalLeads), "All leads in the selected period, including referrals.", q.totalLeads, previous?.totalLeads)}
      ${metricCard("Qualified leads", formatNumber(q.totalQualified), "Qualified leads in the selected period.", q.totalQualified, previous?.totalQualified)}
      ${metricCard("Leads not qualified", formatNumber(leadsNotQualified), "Leads not qualified.", leadsNotQualified, previousNotQualified)}
      ${metricCard("In progress", formatNumber(q.inProgress), "Qualified leads that are not yet won or lost.", q.inProgress, previous?.inProgress)}
      ${metricCard("Won deals", formatNumber(q.won), "Closed deals from selected period.", q.won, previous?.won)}
      ${metricCard("Avg. deal size", formatMoney(safeRatio(q.revenue, q.won)), "Average closed revenue per won deal.", safeRatio(q.revenue, q.won), previous ? safeRatio(previous.revenue, previous.won) : null)}
      ${metricCard("CPA", formatMoney(q.cpa, true), "Cost per acquisition or won deal.", q.cpa, previous?.cpa)}
      ${metricCard("Pipeline value", formatMoney(q.pipelineValue), "Estimated value of qualified leads still in progress.", q.pipelineValue, previous?.pipelineValue)}
    </section>
    ${state.compareEnabled ? `<section class="panel section"><div class="panel-header"><h3>Pipeline Comparison</h3><span class="badge">${escapeHtml(state.granularity === "Monthly" ? activeCompareMonth() : state.compareQuarter)}</span></div>${renderDeltaGrid(q, previous, [["Total leads", "totalLeads", "number"], ["Qualified leads", "totalQualified", "number"], ["In progress", "inProgress", "number"], ["Won deals", "won", "number"], ["CPA", "cpa", "money"], ["Pipeline value", "pipelineValue", "money"], ["Revenue won", "revenue", "money"]])}</section>` : ""}
    <section class="grid-2 equal-grid">
      ${renderPipelinePanel(q)}
      ${renderWonDealsPanel(wonDeals, "Closed Deal Log", "Closed deals")}
    </section>
    ${renderLeadStatusNameTable()}
    <section class="panel">
      <div class="panel-header"><h3>Lead Channel Summary</h3></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Channel</th><th>Leads</th><th>Qualified</th><th>In progress</th><th>Won</th><th>Pipeline value</th><th>Revenue</th></tr></thead>
          <tbody>${leadChannels
            .map(
              (row) =>
                `<tr><td><strong>${escapeHtml(row.channel)}</strong></td><td>${formatNumber(row.leads)}</td><td>${formatNumber(row.qualified)}</td><td>${formatNumber(row.inProgress)}</td><td>${formatNumber(row.won)}</td><td>${formatMoney(row.pipelineValue)}</td><td>${formatMoney(row.revenue)}</td></tr>`,
            )
            .join("")}</tbody>
        </table>
      </div>
    </section>
  `;
}

function renderLeadStatusNameTable() {
  const grouped = groupRows(leadRecordsFor(), "status");
  const fallbackWon = wonDealsFor().map((deal) => ({ name: deal.client, source: deal.source, revenue: deal.revenue }));
  const columns = LEAD_NAME_COLUMNS.map((status) => {
    const rows = grouped[status] || (status === "Won" ? fallbackWon : []);
    return { status, rows };
  });
  const maxRows = Math.max(1, ...columns.map((column) => column.rows.length));
  return `
    <section class="panel lead-name-panel">
      <div class="panel-header"><h3>Active Lead Names by Status</h3><span class="fine-print">${escapeHtml(selectedPeriodLabel())}</span></div>
      <div class="lead-name-grid" style="--lead-status-count:${columns.length}">
        ${columns.map((column) => `
          <article class="lead-name-column">
            <div class="lead-name-head"><strong>${escapeHtml(column.status)}</strong><span>${formatNumber(column.rows.length)}</span></div>
            ${Array.from({ length: maxRows }, (_, index) => {
              const row = column.rows[index];
              return row ? `<div class="lead-name-item"><b>${escapeHtml(row.name || "Unnamed lead")}</b><small>${escapeHtml(row.source || row.channel || "")}${row.revenue ? ` · ${formatMoney(row.revenue)}` : ""}</small></div>` : `<div class="lead-name-item empty">-</div>`;
            }).join("")}
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderWeeklyView() {
  let weeks = quarterWeeks();
  if (state.month !== "All months") weeks = weeks.filter((row) => row.month === state.month);
  return `
    <section class="section-header">
      <div>
        <h2>Weekly Performance Report</h2>
        <p class="definition">Week-by-week lead, qualified lead, won deal, and revenue movement for the selected period.</p>
      </div>
    </section>
    <section class="grid-2">
      <article class="panel">
        <div class="panel-header"><h3>Weekly Lead Trend</h3><span class="badge">${escapeHtml(state.quarter)}</span></div>
        <div class="chart-wrap">${dualAxisLineChart(weeks.map((row) => ({ label: shortDate(row.week), primary: row.leads, secondary: row.qualified })), "label", "primary", "secondary", { firstLabel: "Leads", secondLabel: "Qualified", firstType: "number", secondType: "number", height: 300 })}</div>
      </article>
      <article class="panel">
        <div class="panel-header"><h3>Weekly Revenue & Won Deals</h3></div>
        <div class="chart-wrap">${dualAxisLineChart(weeks.map((row) => ({ label: shortDate(row.week), revenue: row.revenue, won: row.won })), "label", "revenue", "won", { firstLabel: "Revenue", secondLabel: "Won deals", firstType: "money", secondType: "number", height: 300 })}</div>
      </article>
    </section>
    <section class="panel">
      <div class="panel-header"><h3>Weekly Detail</h3></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Week</th><th>Total leads</th><th>Qualified</th><th>Won</th><th>Revenue won</th></tr></thead>
          <tbody>${weeks
            .map(
              (row) =>
                `<tr><td><strong>${escapeHtml(row.range || row.week)}</strong></td><td>${formatNumber(row.leads)}</td><td>${formatNumber(row.qualified)}</td><td>${formatNumber(row.won)}</td><td>${formatMoney(row.revenue)}</td></tr>`,
            )
            .join("")}</tbody>
        </table>
      </div>
    </section>
  `;
}

function monthlyRows(quarter = state.quarter) {
  const rows = quarterWeeks(quarter).filter((row) => monthBelongsToQuarter(row.month, quarter));
  const groups = groupRows(rows, "month");
  const monthOrder = isOverallPeriod(quarter) ? Object.keys(groups) : fiscalMonthsForQuarter(quarter);
  return monthOrder.filter((month) => groups[month]).map((month) => {
    const rows = groups[month] || [];
    return {
    month,
    leads: sum(rows, "leads"),
    qualified: sum(rows, "qualified"),
    won: sum(rows, "won"),
    revenue: sum(rows, "revenue"),
    };
  });
}

function renderAdminView() {
  if (state.role !== "admin") return `<section class="panel"><h2>Admin access required.</h2></section>`;
  const airtable = state.data.manual.airtable || {};
  const connections = state.data.manual.connections || {};
  const sync = state.data.manual.sync || {};
  const today = todayIso();
  const quarterOptions = uniqueQuarters().filter((quarter) => !isOverallPeriod(quarter));
  const adminMonthOptions = ["All months", ...monthlyRows().map((row) => row.month)];
  return `
    <section class="admin-layout">
      <aside class="admin-stack">
        <article class="admin-card">
          <h3>Data Update Center</h3>
          <p>Choose how each report area is updated. Weekly entries are remembered and roll up into monthly, quarterly, and overall reporting.</p>
          <div class="admin-method-grid">
            <div class="admin-method"><strong>Airtable sync</strong><span>Pull overview and lead pipeline updates through a private backend endpoint.</span></div>
            <div class="admin-method"><strong>Guided uploads</strong><span>Use the same social, Meta, SEO, GBP, and keyword templates each month.</span></div>
            <div class="admin-method"><strong>Blog watch</strong><span>Refresh website post titles and links from the blog page or feed.</span></div>
          </div>
        </article>
        ${renderUploadReminderPanel()}
        <article class="admin-card">
          <h3>Airtable Sync</h3>
          <p>Connect overview and leads through a secure sync endpoint. The Airtable token belongs in the endpoint, not in this dashboard file.</p>
          <div class="form-grid">
            ${field("airtableSyncEndpoint", "Sync endpoint", sync.airtableEndpoint || "")}
            ${field("airtableBase", "Base ID", airtable.baseId)}
            ${field("airtableQuarterly", "Quarterly table", airtable.quarterlyTable)}
            ${field("airtableWeekly", "Weekly table", airtable.weeklyTable)}
            ${field("airtableLead", "Lead table", airtable.leadTable)}
          </div>
          <div class="login-actions">
            <button type="button" class="primary-button" data-sync-airtable>Sync overview & leads</button>
            <button type="button" class="utility-button" data-save-connections>Save sync settings</button>
          </div>
          <p class="fine-print">Last sync: ${escapeHtml(airtable.lastSync || "Not synced yet")}</p>
        </article>
        <article class="admin-card">
          <h3>General CSV Upload</h3>
          <p>Upload one or multiple weekly, monthly, or quarterly CSV updates. Rows with the same date and source replace the stored row; new dates are added and rolled into monthly, quarterly, and overall reporting.</p>
          <label class="drop-zone"><span class="meta-label">CSV upload</span><input id="csvUpload" type="file" accept=".csv,text/csv" multiple /></label>
          <p class="fine-print">Lead uploads are aggregated before saving; closed deal names, sources, revenue, and dates are retained for won-deal reporting.</p>
        </article>
        <article class="admin-card">
          <h3>Upload Templates</h3>
          <p><strong>Social:</strong> Quarter, Platform, Date, Views, Reach, Engagements, Link Clicks</p>
          <p><strong>Social posts:</strong> Quarter, Platform, Month, Posts</p>
          <p><strong>Meta Ads:</strong> Quarter, Date, Impressions, Link Clicks, Amount Spent, CPM, CPC, CTR</p>
          <p><strong>SEO:</strong> Quarter, Date, Clicks, Impressions, Average CTR, Average Position</p>
          <p><strong>SEO posts:</strong> Quarter, Post Date, Post Link, Title</p>
          <p><strong>Keywords:</strong> Quarter, Keyword, Clicks, Impressions, CTR, Average Position</p>
          <p><strong>GBP:</strong> Quarter, Date, Calls, Bookings, Directions, Website Clicks</p>
          <p><strong>Leads:</strong> Same Airtable leads export you already shared.</p>
        </article>
        <article class="admin-card">
          <h3>Connection / Link Setup</h3>
          <div class="form-grid">
            ${field("socialConnection", "Social source link", connections.social)}
            ${field("metaConnection", "Meta Ads source link", connections.meta)}
            ${field("seoConnection", "SEO/Search Console source link", connections.seo)}
            ${field("gbpConnection", "Google Business Profile source link", connections.gbp)}
            ${field("leadsConnection", "Leads source link", connections.leads)}
            ${field("blogWatchUrl", "Blog page or feed URL", connections.blogs || "https://terzettohomes.com/blogs/")}
          </div>
          <div class="login-actions">
            <button type="button" class="primary-button" data-sync-blogs>Sync blog posts</button>
            <button type="button" class="utility-button" data-save-connections>Save connection fields</button>
          </div>
        </article>
      </aside>
      <div class="admin-stack">
        <article class="admin-card">
          <div class="admin-row"><h3>Guided Uploads</h3><span class="badge">Monthly / quarterly</span></div>
          <p>Use these for recurring updates. Select the period and source first, then upload the matching template.</p>
          <div class="guided-upload-grid">
            <div class="guided-upload">
              <strong>Social stats</strong>
              <div class="form-grid">
                ${selectField("socialUploadQuarter", "Quarter", quarterOptions, editableQuarter())}
                ${selectField("socialUploadMonth", "Month", adminMonthOptions, activeMonth())}
                ${selectField("socialUploadPlatform", "Platform", ["Instagram", "Facebook", "TikTok", "YouTube"], "Instagram")}
                ${selectField("socialUploadCadence", "Upload scope", ["Monthly", "Quarterly"], "Monthly")}
              </div>
              <label class="drop-zone compact-drop"><span class="meta-label">Upload social CSV</span><input type="file" accept=".csv,text/csv" data-guided-upload="social" /></label>
            </div>
            <div class="guided-upload">
              <strong>Meta ads</strong>
              <div class="form-grid">
                ${selectField("metaUploadQuarter", "Quarter", quarterOptions, editableQuarter())}
                ${selectField("metaUploadCadence", "Upload scope", ["Weekly", "Monthly", "Quarterly"], "Weekly")}
              </div>
              <label class="drop-zone compact-drop"><span class="meta-label">Upload Meta CSV</span><input type="file" accept=".csv,text/csv" data-guided-upload="meta" /></label>
            </div>
            <div class="guided-upload">
              <strong>SEO, keywords, GBP, Search Console</strong>
              <div class="form-grid">
                ${selectField("seoUploadQuarter", "Quarter", quarterOptions, editableQuarter())}
                ${selectField("seoUploadMonth", "Month", adminMonthOptions, activeMonth())}
                ${selectField("seoUploadType", "Report type", ["Google Search Console", "Keywords", "GBP", "Website posts"], "Google Search Console")}
                ${selectField("seoUploadCadence", "Upload scope", ["Monthly", "Quarterly"], "Monthly")}
              </div>
              <label class="drop-zone compact-drop"><span class="meta-label">Upload SEO CSV</span><input type="file" accept=".csv,text/csv" data-guided-upload="seo" /></label>
            </div>
          </div>
        </article>
        <article class="admin-card">
          <div class="admin-row"><h3>Social Entry</h3><span class="badge">${escapeHtml(editableQuarter())}</span></div>
          <p>Use this for Facebook, TikTok, YouTube, or Instagram. Each saved row is merged by date and platform using the four social metrics you upload.</p>
          <div class="form-grid">
            ${selectField("manualSocialPlatform", "Platform", ["Instagram", "Facebook", "TikTok", "YouTube"], "Instagram")}
            ${field("manualSocialDate", "Date or week start", today, "date")}
            ${field("manualViews", "Views", "", "number")}
            ${field("manualReach", "Reach", "", "number")}
            ${field("manualEngagements", "Engagements", "", "number")}
            ${field("manualLinkClicks", "Link clicks", "", "number")}
          </div>
          <button type="button" class="primary-button" data-add-social-manual>Add social row</button>
        </article>
        <article class="admin-card">
          <div class="admin-row"><h3>Social Post Count</h3><span class="badge">${escapeHtml(editableQuarter())}</span></div>
          <p>Add monthly or quarterly post totals per platform. These are counted separately from reach/views uploads.</p>
          <div class="form-grid">
            ${selectField("manualPostPlatform", "Platform", ["Instagram", "Facebook", "TikTok", "YouTube"], "Instagram")}
            ${selectField("manualPostMonth", "Month", adminMonthOptions, "All months")}
            ${field("manualPostCount", "Number of posts", "", "number")}
          </div>
          <button type="button" class="primary-button" data-add-social-posts>Add post count</button>
        </article>
        <article class="manual-entry-grid">
          <div class="admin-card">
            <div class="admin-row"><h3>Meta Ads Entry</h3><span class="badge">${escapeHtml(editableQuarter())}</span></div>
            <div class="form-grid">
              ${field("manualMetaDate", "Date or week start", today, "date")}
              ${field("manualMetaImpressions", "Impressions", "", "number")}
              ${field("manualMetaLinkClicks", "Link clicks", "", "number")}
              ${field("manualMetaSpend", "Amount spent", "", "number")}
              ${field("manualMetaCpm", "CPM", "", "number")}
              ${field("manualMetaCpc", "CPC", "", "number")}
              ${field("manualMetaCtr", "CTR", "", "number")}
            </div>
            <button type="button" class="primary-button" data-add-meta-manual>Add Meta row</button>
          </div>
          <div class="admin-card">
            <div class="admin-row"><h3>SEO Entry</h3><span class="badge">${escapeHtml(editableQuarter())}</span></div>
            <div class="form-grid">
              ${field("manualSeoDate", "Date or week start", today, "date")}
              ${field("manualSeoClicks", "Total clicks", "", "number")}
              ${field("manualSeoImpressions", "Impressions", "", "number")}
              ${field("manualSeoCtr", "Average CTR", "", "number")}
              ${field("manualSeoPosition", "Average position", "", "number")}
              ${textArea("manualSeoChanges", "Changes made", "")}
            </div>
            <button type="button" class="primary-button" data-add-seo-manual>Add SEO row</button>
          </div>
          <div class="admin-card">
            <div class="admin-row"><h3>SEO Post Link</h3><span class="badge">${escapeHtml(editableQuarter())}</span></div>
            <div class="form-grid">
              ${field("manualSeoPostDate", "Post date", today, "date")}
              ${field("manualSeoPostTitle", "Post title", "")}
              ${field("manualSeoPostUrl", "Post link", "https://")}
            </div>
            <button type="button" class="primary-button" data-add-seo-post>Add SEO post link</button>
          </div>
          <div class="admin-card">
            <div class="admin-row"><h3>GBP Entry</h3><span class="badge">${escapeHtml(editableQuarter())}</span></div>
            <div class="form-grid">
              ${field("manualGbpDate", "Date or week start", today, "date")}
              ${field("manualGbpCalls", "Calls", "", "number")}
              ${field("manualGbpBookings", "Bookings", "", "number")}
              ${field("manualGbpDirections", "Directions", "", "number")}
              ${field("manualGbpWebsiteClicks", "Website clicks", "", "number")}
              ${field("manualGbpViews", "Profile views", "", "number")}
            </div>
            <button type="button" class="primary-button" data-add-gbp-manual>Add GBP row</button>
          </div>
        </article>
        <article class="admin-card">
          <h3>Data Controls</h3>
          <p>Export edited dashboard data or reset local edits to the original seeded files.</p>
          <div class="login-actions">
            <button type="button" class="utility-button" data-export-json>Export JSON</button>
            <button type="button" class="ghost-button" data-reset-local>Reset edits</button>
          </div>
        </article>
      </div>
    </section>
  `;
}

function field(id, label, value = "", type = "text") {
  return `<label><span class="meta-label">${escapeHtml(label)}</span><input id="${id}" type="${type}" value="${escapeHtml(value)}" /></label>`;
}

function selectField(id, label, options, selected) {
  return `
    <label>
      <span class="meta-label">${escapeHtml(label)}</span>
      <select id="${id}">
        ${options.map((option) => `<option ${option === selected ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
      </select>
    </label>
  `;
}

function textArea(id, label, value = "") {
  return `<label class="wide"><span class="meta-label">${escapeHtml(label)}</span><textarea id="${id}">${escapeHtml(value)}</textarea></label>`;
}

function renderUploadReminderPanel() {
  const items = [
    ["overviewLeads", "Overview & leads", "Airtable sync or leads/overview CSV"],
    ["social", "Social stats", "Monthly social platform CSV"],
    ["meta", "Meta ads", "Weekly Meta CSV"],
    ["seo", "SEO / GBP / Search Console", "Monthly SEO, keyword, GBP, or GSC CSV"],
  ];
  const lastUploads = state.data.manual.lastUploads || {};
  return `
    <article class="admin-card reminder-card">
      <div class="admin-row"><h3>Monthly Update Status</h3><span class="badge">${escapeHtml(currentMonthName())}</span></div>
      <div class="reminder-grid">
        ${items.map(([key, label, detail]) => {
          const last = lastUploads[key] || "";
          const current = uploadReceivedThisMonth(last);
          return `
            <div class="reminder-item ${current ? "is-current" : "needs-update"}">
              <strong>${escapeHtml(label)}</strong>
              <span>${escapeHtml(detail)}</span>
              <b>${current ? "Updated" : "Needs update"}</b>
              <small>${last ? `Last received ${last}` : "No upload received yet"}</small>
            </div>
          `;
        }).join("")}
      </div>
    </article>
  `;
}

function currentMonthName() {
  return new Date().toLocaleDateString("en-CA", { month: "long", year: "numeric" });
}

function uploadReceivedThisMonth(value) {
  if (!value) return false;
  const date = new Date(value);
  const now = new Date();
  return !Number.isNaN(date.getTime()) && date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function bindLoginEvents() {
  const attemptLogin = () => {
    const role = document.querySelector("#loginRole").value;
    const password = document.querySelector("#loginPassword").value;
    if ((role === "admin" && password === ADMIN_PASSWORD) || (role === "ceo" && password === CEO_PASSWORD)) {
      setAuth(role);
      showToast(`${role === "admin" ? "Admin" : "CEO"} access granted.`);
    } else {
      showToast("Password did not match.");
    }
  };
  document.querySelector("[data-login]")?.addEventListener("click", attemptLogin);
  document.querySelector("#loginPassword")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") attemptLogin();
  });
}

function bindBaseEvents() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });
  document.querySelector("[data-logout]")?.addEventListener("click", logout);
  document.querySelector("#quarterSelect")?.addEventListener("change", (event) => setQuarter(event.target.value));
  document.querySelector("#granularitySelect")?.addEventListener("change", (event) => {
    state.granularity = event.target.value;
    if (isOverallPeriod() || state.granularity === "Quarterly") {
      if (isOverallPeriod()) state.granularity = "Quarterly";
      state.month = "All months";
      state.compareMonth = "All months";
    } else {
      state.month = activeMonth();
      state.compareMonth = monthlyRows(state.compareQuarter).at(-1)?.month || "All months";
    }
    render();
  });
  document.querySelector("#compareToggle")?.addEventListener("change", (event) => {
    state.compareEnabled = event.target.checked;
    render();
  });
  document.querySelector("#compareSelect")?.addEventListener("change", (event) => {
    state.compareQuarter = event.target.value;
    state.compareMonth = monthlyRows(state.compareQuarter).at(-1)?.month || "All months";
    render();
  });
  document.querySelector("#compareMonthSelect")?.addEventListener("change", (event) => {
    state.compareMonth = event.target.value;
    render();
  });
  document.querySelector("#monthSelect")?.addEventListener("change", (event) => {
    state.month = event.target.value;
    render();
  });
  document.querySelector("#channelSelect")?.addEventListener("change", (event) => {
    state.channel = event.target.value;
    render();
  });
  document.querySelector("#platformSelect")?.addEventListener("change", (event) => {
    state.platform = event.target.value;
    render();
  });
  document.querySelector("[data-keyword-search]")?.addEventListener("click", () => {
    state.keywordSearch = document.querySelector("#keywordSearch")?.value || "";
    state.keywordPage = 1;
    render();
  });
  document.querySelector("#keywordSearch")?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    state.keywordSearch = event.target.value;
    state.keywordPage = 1;
    render();
  });
  document.querySelector("#keywordLimit")?.addEventListener("change", (event) => {
    state.keywordLimit = parseNumber(event.target.value) || 20;
    state.keywordPage = 1;
    render();
  });
  document.querySelectorAll("[data-keyword-page]").forEach((button) => {
    button.addEventListener("click", () => {
      state.keywordPage = parseNumber(button.dataset.keywordPage) || 1;
      render();
    });
  });
}

function bindAdminEvents() {
  document.querySelector("#csvUpload")?.addEventListener("change", handleCsvUpload);
  document.querySelectorAll("[data-guided-upload]").forEach((input) => input.addEventListener("change", handleGuidedUpload));
  document.querySelector("[data-sync-airtable]")?.addEventListener("click", syncAirtableData);
  document.querySelector("[data-sync-blogs]")?.addEventListener("click", syncBlogPosts);
  document.querySelector("[data-add-social-manual]")?.addEventListener("click", saveSocialManualRow);
  document.querySelector("[data-add-social-posts]")?.addEventListener("click", saveSocialPostCountRow);
  document.querySelector("[data-add-meta-manual]")?.addEventListener("click", saveMetaManualRow);
  document.querySelector("[data-add-seo-manual]")?.addEventListener("click", saveSeoManualRow);
  document.querySelector("[data-add-seo-post]")?.addEventListener("click", saveSeoPostRow);
  document.querySelector("[data-add-gbp-manual]")?.addEventListener("click", saveGbpManualRow);
  document.querySelector("[data-save-targets]")?.addEventListener("click", saveTargets);
  document.querySelectorAll("[data-save-connections]").forEach((button) => button.addEventListener("click", saveConnectionFields));
  document.querySelector("[data-export-json]")?.addEventListener("click", exportJson);
  document.querySelector("[data-reset-local]")?.addEventListener("click", resetLocalEdits);
}

function inputValue(id) {
  return document.querySelector(`#${id}`)?.value?.trim() || "";
}

function inputNumber(id) {
  return parseNumber(inputValue(id));
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function saveSocialManualRow() {
  mergeSocialDaily([{
    Quarter: editableQuarter(),
    Platform: inputValue("manualSocialPlatform") || "Instagram",
    Date: inputValue("manualSocialDate") || todayIso(),
    Views: inputNumber("manualViews"),
    Reach: inputNumber("manualReach"),
    Engagements: inputNumber("manualEngagements"),
    "Link Clicks": inputNumber("manualLinkClicks"),
  }]);
  state.data = enrichData(state.data);
  persist();
  render();
  showToast("Social row saved and rolled into reports.");
}

function saveSocialPostCountRow() {
  mergeSocialPostCounts([{
    Quarter: editableQuarter(),
    Platform: inputValue("manualPostPlatform") || "Instagram",
    Month: inputValue("manualPostMonth") || "All months",
    Posts: inputNumber("manualPostCount"),
  }]);
  state.data = enrichData(state.data);
  persist();
  render();
  showToast("Social post count saved.");
}

function saveMetaManualRow() {
  mergeMetaRows([{
    Quarter: editableQuarter(),
    Date: inputValue("manualMetaDate") || todayIso(),
    Impressions: inputNumber("manualMetaImpressions"),
    "Link Clicks": inputNumber("manualMetaLinkClicks"),
    "Amount Spent": inputNumber("manualMetaSpend"),
    CPM: inputNumber("manualMetaCpm"),
    CPC: inputNumber("manualMetaCpc"),
    CTR: inputNumber("manualMetaCtr"),
  }]);
  state.data = enrichData(state.data);
  persist();
  render();
  showToast("Meta Ads row saved and rolled into reports.");
}

function saveSeoManualRow() {
  mergeSeoRows([{
    Quarter: editableQuarter(),
    Date: inputValue("manualSeoDate") || todayIso(),
    Clicks: inputNumber("manualSeoClicks"),
    Impressions: inputNumber("manualSeoImpressions"),
    "Average CTR": inputNumber("manualSeoCtr"),
    "Average Position": inputNumber("manualSeoPosition"),
  }]);
  const seo = state.data.seoReport.find((row) => row.quarter === editableQuarter());
  if (seo && inputValue("manualSeoChanges")) seo.changesMade = inputValue("manualSeoChanges");
  state.data = enrichData(state.data);
  persist();
  render();
  showToast("SEO row saved and rolled into reports.");
}

function saveSeoPostRow() {
  mergeSeoPostRows([{
    Quarter: editableQuarter(),
    "Post Date": inputValue("manualSeoPostDate") || todayIso(),
    Title: inputValue("manualSeoPostTitle"),
    "Post Link": inputValue("manualSeoPostUrl"),
  }]);
  state.data = enrichData(state.data);
  persist();
  render();
  showToast("SEO post link saved and counted.");
}

function saveGbpManualRow() {
  mergeGbpRows([{
    Quarter: editableQuarter(),
    Date: inputValue("manualGbpDate") || todayIso(),
    Calls: inputNumber("manualGbpCalls"),
    Bookings: inputNumber("manualGbpBookings"),
    Directions: inputNumber("manualGbpDirections"),
    "Website Clicks": inputNumber("manualGbpWebsiteClicks"),
    "Profile Views": inputNumber("manualGbpViews"),
  }]);
  state.data = enrichData(state.data);
  persist();
  render();
  showToast("Google Business Profile row saved and rolled into reports.");
}

function saveTargets() {
  state.data.manual.targets.metaQualifiedLeads = inputNumber("metaTarget");
  persist();
  render();
  showToast("Targets saved.");
}

function saveConnectionFields() {
  state.data.manual.sync ||= {};
  state.data.manual.sync.airtableEndpoint = inputValue("airtableSyncEndpoint");
  state.data.manual.airtable = {
    enabled: Boolean(inputValue("airtableBase")),
    baseId: inputValue("airtableBase"),
    quarterlyTable: inputValue("airtableQuarterly"),
    weeklyTable: inputValue("airtableWeekly"),
    leadTable: inputValue("airtableLead"),
    lastSync: state.data.manual.airtable?.lastSync || "",
  };
  state.data.manual.connections = {
    social: inputValue("socialConnection"),
    meta: inputValue("metaConnection"),
    seo: inputValue("seoConnection"),
    gbp: inputValue("gbpConnection"),
    leads: inputValue("leadsConnection"),
    blogs: inputValue("blogWatchUrl"),
  };
  persist();
  showToast("Connection fields saved.");
}

async function syncAirtableData() {
  const endpoint = inputValue("airtableSyncEndpoint") || state.data.manual.sync?.airtableEndpoint;
  if (!endpoint) {
    showToast("Add a secure Airtable sync endpoint first.");
    return;
  }
  try {
    const response = await fetch(endpoint, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Sync failed with status ${response.status}`);
    const payload = await response.json();
    const messages = importSyncPayload(payload);
    state.data.manual.airtable ||= {};
    state.data.manual.airtable.lastSync = todayIso();
    markUploadReceived("overviewLeads");
    state.data = enrichData(state.data);
    persist();
    render();
    showToast(messages.length ? `Airtable synced: ${messages.join(" ")}` : "Airtable sync completed.");
  } catch (error) {
    showToast(`Airtable sync needs a reachable backend endpoint. ${error.message}`);
  }
}

function importSyncPayload(payload) {
  const messages = [];
  if (Array.isArray(payload)) {
    messages.push(importRows(payload));
    return messages;
  }
  if (payload.data) {
    state.data = { ...state.data, ...payload.data, manual: { ...state.data.manual, ...(payload.data.manual || {}) } };
    messages.push("Dashboard dataset refreshed.");
  }
  const tables = [
    payload.quarterly,
    payload.channelQuarterly,
    payload.channelWeekly,
    payload.weeks,
    payload.leads,
    payload.rows,
  ].filter(Array.isArray);
  tables.forEach((rows) => messages.push(importRows(rows)));
  return messages.filter(Boolean);
}

async function syncBlogPosts() {
  const url = inputValue("blogWatchUrl") || state.data.manual.connections?.blogs;
  if (!url) {
    showToast("Add the blog page or feed URL first.");
    return;
  }
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Blog fetch failed with status ${response.status}`);
    const text = await response.text();
    const rows = extractBlogRows(text, url);
    if (!rows.length) {
      showToast("No blog links were found at that URL.");
      return;
    }
    mergeSeoPostRows(rows);
    markUploadReceived("seo");
    state.data = enrichData(state.data);
    persist();
    render();
    showToast(`${rows.length} blog post links synced into SEO.`);
  } catch (error) {
    showToast(`Blog sync needs a reachable page/feed or backend endpoint. ${error.message}`);
  }
}

function extractBlogRows(text, sourceUrl) {
  const doc = new DOMParser().parseFromString(text, text.trim().startsWith("<rss") || text.includes("<feed") ? "application/xml" : "text/html");
  const base = new URL(sourceUrl, window.location.href);
  const items = [...doc.querySelectorAll("item, entry")].map((item) => {
    const link = item.querySelector("link")?.textContent || item.querySelector("link")?.getAttribute("href") || "";
    const title = item.querySelector("title")?.textContent || link;
    const date = item.querySelector("pubDate, published, updated")?.textContent || todayIso();
    return { Quarter: fiscalQuarterForDate(date), "Post Date": toIsoDate(date) || todayIso(), Title: title.trim(), "Post Link": new URL(link, base).href };
  });
  const links = [...doc.querySelectorAll('a[href*="/blogs/"], a[href*="/blog/"]')]
    .map((link) => {
      const href = link.getAttribute("href") || "";
      const title = link.textContent?.trim() || href;
      return { Quarter: editableQuarter(), "Post Date": todayIso(), Title: title, "Post Link": new URL(href, base).href };
    });
  const seen = new Set();
  return [...items, ...links].filter((row) => {
    if (!row["Post Link"] || seen.has(row["Post Link"])) return false;
    seen.add(row["Post Link"]);
    return true;
  });
}

function exportJson() {
  const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `marketing-dashboard-${state.data.updatedAt}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

async function resetLocalEdits() {
  storageRemove(STORAGE_KEY);
  const embedded = document.querySelector("#seed-data")?.textContent;
  state.data = enrichData(embedded ? JSON.parse(embedded) : await (await fetch(DATA_URL)).json());
  render();
  showToast("Local edits reset to the seeded dashboard data.");
}

async function handleCsvUpload(event) {
  const files = [...event.target.files];
  if (!files.length) return;
  const messages = [];
  for (const file of files) {
    const rows = parseCsv(await file.text());
    const message = importRows(rows);
    messages.push(`${file.name}: ${message}`);
    markUploadFromMessage(message);
  }
  state.data = enrichData(state.data);
  persist();
  render();
  showToast(files.length === 1 ? messages[0] : `${files.length} CSV files imported and rolled into the dashboard.`);
}

async function handleGuidedUpload(event) {
  const file = event.target.files?.[0];
  const type = event.target.dataset.guidedUpload;
  if (!file || !type) return;
  let rows = parseCsv(await file.text());
  if (type === "social") {
    const quarter = inputValue("socialUploadQuarter") || editableQuarter();
    const month = inputValue("socialUploadMonth") || "All months";
    const platform = inputValue("socialUploadPlatform") || "Instagram";
    rows = rows.map((row) => ({ ...row, Quarter: quarter, Month: month, Platform: platform }));
    if (rows.some((row) => fieldValue(row, ["posts", "post count", "number of posts"]))) mergeSocialPostCounts(rows);
    else mergeSocialDaily(rows);
    markUploadReceived("social");
  } else if (type === "meta") {
    const quarter = inputValue("metaUploadQuarter") || editableQuarter();
    rows = rows.map((row) => ({ ...row, Quarter: quarter }));
    mergeMetaRows(rows);
    markUploadReceived("meta");
  } else if (type === "seo") {
    const quarter = inputValue("seoUploadQuarter") || editableQuarter();
    rows = rows.map((row) => ({ ...row, Quarter: quarter, Month: inputValue("seoUploadMonth") || "All months" }));
    const reportType = inputValue("seoUploadType");
    if (reportType === "GBP") mergeGbpRows(rows);
    else if (reportType === "Website posts") mergeSeoPostRows(rows);
    else mergeSeoRows(rows);
    markUploadReceived("seo");
  }
  state.data = enrichData(state.data);
  persist();
  render();
  showToast(`${file.name} imported into ${type === "seo" ? "SEO" : type === "meta" ? "Meta Ads" : "Social"} reporting.`);
}

function markUploadReceived(key) {
  state.data.manual.lastUploads ||= {};
  state.data.manual.lastUploads[key] = todayIso();
}

function markUploadFromMessage(message = "") {
  const text = message.toLowerCase();
  if (text.includes("lead") || text.includes("quarterly performance") || text.includes("weekly channel")) markUploadReceived("overviewLeads");
  if (text.includes("social")) markUploadReceived("social");
  if (text.includes("meta")) markUploadReceived("meta");
  if (text.includes("seo") || text.includes("keyword") || text.includes("business profile")) markUploadReceived("seo");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  const headers = rows.shift().map((header) => header.replace(/^\uFEFF/, "").trim());
  return rows.map((values) =>
    headers.reduce((record, header, index) => {
      record[header] = values[index] ?? "";
      return record;
    }, {}),
  );
}

function hasColumns(rows, columns) {
  if (!rows.length) return false;
  const keys = Object.keys(rows[0]).map((key) => key.toLowerCase().trim());
  return columns.every((column) => keys.includes(column));
}

function fieldValue(row, names) {
  const entries = Object.entries(row);
  for (const name of names) {
    const found = entries.find(([key]) => key.toLowerCase().trim() === name.toLowerCase());
    if (found) return found[1];
  }
  return "";
}

function mergeByDate(existingRows = [], newRows = []) {
  const map = new Map(existingRows.map((row) => [row.date || row.label, row]));
  newRows.forEach((row) => {
    const key = row.date || row.label;
    map.set(key, { ...(map.get(key) || {}), ...row });
  });
  return [...map.values()].sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
}

function mergeSocialDaily(rows) {
  rows.forEach((row) => {
    const quarter = fieldValue(row, ["quarter"]) || state.quarter;
    const platform = fieldValue(row, ["platform"]) || "Instagram";
    const date = toIsoDate(fieldValue(row, ["date", "week", "week start"]));
    const base = platformBase(platform) || platformBase("Instagram");
    let target = state.data.socialPlatforms.find((item) => item.quarter === quarter && item.platform === platform);
    if (!target) {
      target = { quarter, platform, color: base.color, series: [] };
      state.data.socialPlatforms.push(target);
    }
    const views = parseNumber(fieldValue(row, ["views", "daily views", "content views", "content view"]));
    target.series = mergeByDate(target.series || [], [{
      date,
      label: shortDate(date),
      month: monthLabel(date),
      contentViews: views,
      reach: parseNumber(fieldValue(row, ["reach"])),
      views,
      engagements: parseNumber(fieldValue(row, ["engagements", "engagement"])),
      linkClicks: parseNumber(fieldValue(row, ["link clicks", "link click"])),
      pageViews: parseNumber(fieldValue(row, ["page views"])),
    }]);
  });
  return "Social media rows merged into the stored period data.";
}

function mergeSocialPostCounts(rows) {
  state.data.manual.socialPostCounts ||= [];
  rows.forEach((row) => {
    const quarter = fieldValue(row, ["quarter"]) || state.quarter;
    const platform = fieldValue(row, ["platform"]) || "Instagram";
    const month = fieldValue(row, ["month", "period"]) || "All months";
    const posts = parseNumber(fieldValue(row, ["posts", "post count", "number of posts"]));
    const index = state.data.manual.socialPostCounts.findIndex(
      (item) => item.quarter === quarter && item.platform === platform && item.month === month,
    );
    const nextRow = { quarter, platform, month, posts };
    if (index >= 0) state.data.manual.socialPostCounts[index] = nextRow;
    else state.data.manual.socialPostCounts.push(nextRow);
  });
  return "Social post counts merged into the stored period data.";
}

function mergeMetaRows(rows) {
  rows.forEach((row) => {
    const quarter = fieldValue(row, ["quarter"]) || state.quarter;
    const date = toIsoDate(fieldValue(row, ["date", "week", "week start"]));
    let target = state.data.metaAds.find((item) => item.quarter === quarter);
    if (!target) {
      target = { quarter, campaigns: [], series: [] };
      state.data.metaAds.push(target);
    }
    target.series = mergeByDate(target.series || [], [{
      date,
      label: shortDate(date),
      month: monthLabel(date),
      impressions: parseNumber(fieldValue(row, ["impressions"])),
      reach: parseNumber(fieldValue(row, ["reach"])),
      linkClicks: parseNumber(fieldValue(row, ["link clicks", "link click"])),
      uniqueLinkClicks: parseNumber(fieldValue(row, ["unique link clicks", "unique clicks"])),
      amountSpent: parseNumber(fieldValue(row, ["amount spent", "amount spend", "spend"])),
      cpm: parseNumber(fieldValue(row, ["cpm"])),
      cpc: parseNumber(fieldValue(row, ["cpc"])),
      ctr: parseNumber(fieldValue(row, ["ctr"])),
    }]);
  });
  return "Meta Ads rows merged into the stored period data.";
}

function mergeSeoRows(rows) {
  rows.forEach((row) => {
    const quarter = fieldValue(row, ["quarter"]) || state.quarter;
    let target = state.data.seoReport.find((item) => item.quarter === quarter);
    if (!target) {
      target = { quarter, keywordRows: [], series: [], posts: 0, postRows: [] };
      state.data.seoReport.push(target);
    }
    const keyword = fieldValue(row, ["keyword"]);
    if (keyword) {
      const keywordRow = {
        keyword,
        brandGeneric: fieldValue(row, ["type", "brand/generic"]) || "Generic",
        clicks: parseNumber(fieldValue(row, ["clicks"])),
        impressions: parseNumber(fieldValue(row, ["impressions"])),
        ctr: parseNumber(fieldValue(row, ["ctr", "average ctr"])),
        position: parseNumber(fieldValue(row, ["position", "average position", "avg. position"])),
      };
      const index = target.keywordRows.findIndex((item) => item.keyword === keyword);
      if (index >= 0) target.keywordRows[index] = { ...target.keywordRows[index], ...keywordRow };
      else target.keywordRows.push(keywordRow);
      return;
    }
    const date = toIsoDate(fieldValue(row, ["date", "week", "week start"]));
    target.posts += parseNumber(fieldValue(row, ["website posts", "posts"]));
    target.series = mergeByDate(target.series || [], [{
      date,
      label: shortDate(date),
      month: monthLabel(date),
      clicks: parseNumber(fieldValue(row, ["clicks", "total clicks"])),
      impressions: parseNumber(fieldValue(row, ["impressions"])),
      ctr: parseNumber(fieldValue(row, ["average ctr", "ctr"])),
      position: parseNumber(fieldValue(row, ["average position", "position", "avg. position"])),
    }]);
  });
  return "SEO/Search Console rows merged into the stored period data.";
}

function mergeSeoPostRows(rows) {
  rows.forEach((row) => {
    const quarter = fieldValue(row, ["quarter"]) || state.quarter;
    const date = toIsoDate(fieldValue(row, ["post date", "date", "published date"]));
    let target = state.data.seoReport.find((item) => item.quarter === quarter);
    if (!target) {
      target = { quarter, keywordRows: [], series: [], posts: 0, postRows: [] };
      state.data.seoReport.push(target);
    }
    const url = fieldValue(row, ["post link", "link", "url"]);
    const title = fieldValue(row, ["title", "post title"]) || url || "Website post";
    target.postRows = mergeByDate(target.postRows || [], [{
      date,
      label: shortDate(date),
      month: monthLabel(date),
      title,
      url,
    }]);
    target.posts = target.postRows.length;
  });
  return "SEO post links merged and counted.";
}

function mergeGbpRows(rows) {
  rows.forEach((row) => {
    const quarter = fieldValue(row, ["quarter"]) || state.quarter;
    const date = toIsoDate(fieldValue(row, ["date", "week", "week start"]));
    let target = state.data.googleBusiness.find((item) => item.quarter === quarter);
    if (!target) {
      target = { quarter, series: [] };
      state.data.googleBusiness.push(target);
    }
    target.series = mergeByDate(target.series || [], [{
      date,
      label: shortDate(date),
      month: monthLabel(date),
      calls: parseNumber(fieldValue(row, ["calls"])),
      bookings: parseNumber(fieldValue(row, ["bookings"])),
      directionRequests: parseNumber(fieldValue(row, ["directions", "direction requests"])),
      websiteClicks: parseNumber(fieldValue(row, ["website clicks", "gbp clicks"])),
      profileViews: parseNumber(fieldValue(row, ["profile views", "views"])),
    }]);
  });
  return "Google Business Profile rows merged into the stored period data.";
}

function importRows(rows) {
  if (!rows.length) return "No rows found in CSV.";
  if (hasColumns(rows, ["quarter", "platform", "posts"])) {
    return mergeSocialPostCounts(rows);
  }
  if (hasColumns(rows, ["quarter", "platform", "date", "reach"])) {
    return mergeSocialDaily(rows);
  }
  if (hasColumns(rows, ["quarter", "post date", "post link"])) {
    return mergeSeoPostRows(rows);
  }
  if (hasColumns(rows, ["quarter", "date", "url"])) {
    return mergeSeoPostRows(rows);
  }
  if (hasColumns(rows, ["quarter", "date", "impressions", "link clicks"])) {
    return mergeMetaRows(rows);
  }
  if (hasColumns(rows, ["quarter", "date", "calls", "website clicks"])) {
    return mergeGbpRows(rows);
  }
  if (hasColumns(rows, ["quarter", "keyword", "clicks", "impressions"])) {
    return mergeSeoRows(rows);
  }
  if (hasColumns(rows, ["quarter", "date", "clicks", "impressions"])) {
    return mergeSeoRows(rows);
  }
  if (hasColumns(rows, ["quarter", "channel quarterly record", "spend", "leads"])) {
    state.data.quarters = rows.map((row) => ({
      quarter: row.Quarter,
      spend: parseNumber(row.Spend),
      leads: parseNumber(row.Leads),
      qualified: parseNumber(row["Qualified Leads"]),
      cpql: parseNumber(row.CPQL),
      won: parseNumber(row["Won Leads"]),
      cpa: parseNumber(row.CPA),
      winRate: parseNumber(row["Win Rate"]),
      revenue: parseNumber(row["Revenue Won"]),
    }));
    return "Quarterly performance updated.";
  }
  if (hasColumns(rows, ["quarter", "channel", "weekly records", "qualified lead count"])) {
    state.data.channelQuarterly = rows.map((row) => ({
      quarter: row.Quarter,
      channel: row.Channel,
      spend: parseNumber(row.Spend),
      leads: parseNumber(row.Leads),
      qualified: parseNumber(row["Qualified Lead Count"]),
      cpql: parseNumber(row.CPQL),
      won: parseNumber(row["Won Leads"]),
      revenue: parseNumber(row["Revenue Won"]),
      roas: parseNumber(row.ROAS),
    }));
    return "Channel quarterly performance updated.";
  }
  if (hasColumns(rows, ["week start", "channel", "conversions/leads", "qualified lead count"])) {
    state.data.channelWeekly = rows.map((row) => ({
      week: toIsoDate(row["Week Start"]),
      label: row.Name,
      quarter: row.Quarter,
      channel: row.Channel,
      spend: parseNumber(row.Spend),
      clicks: parseNumber(row.Clicks),
      ctr: parseNumber(row.CTR),
      leads: parseNumber(row["Conversions/Leads"]),
      qualified: parseNumber(row["Qualified Lead Count"]),
      won: parseNumber(row["Won Leads"]),
      revenue: parseNumber(row["Revenue Won"]),
      month: monthLabel(row["Week Start"]),
    }));
    return "Weekly channel performance updated.";
  }
  if (hasColumns(rows, ["week range", "total leads", "qualified leads"])) {
    state.data.weeks = rows.map((row) => ({
      week: toIsoDate(row["Week Start"]),
      range: row["Week Range"],
      quarter: row.Quarter,
      leads: parseNumber(row["Total Leads"]),
      qualified: parseNumber(row["Qualified Leads"]),
      won: parseNumber(row["Won Deals"]),
      revenue: parseNumber(row["Revenue Won"]),
      month: monthLabel(row["Week Start"]),
    }));
    return "Weekly summary updated.";
  }
  if (hasColumns(rows, ["name", "email", "qualified?", "channel group"])) {
    state.data.leadSummary = aggregateLeadRows(rows);
    return "Lead export aggregated without saving contact details.";
  }
  if (hasColumns(rows, ["quarter", "platform", "reach", "engagements"])) {
    state.data.socialPlatforms = rows.map((row) => ({
      quarter: row.Quarter,
      platform: row.Platform,
      color: platformBase(row.Platform)?.color || "#544845",
      contentViews: parseNumber(row.Views || row["Content Views"]),
      reach: parseNumber(row.Reach),
      views: parseNumber(row.Views || row["Content Views"]),
      pageViews: parseNumber(row["Page Views"]),
      engagements: parseNumber(row.Engagements),
      engagementRate: parseNumber(row["Engagement Rate"]),
      series: buildSocialDailySeries(state.data, row.Quarter, row.Platform, {
        contentViews: parseNumber(row.Views || row["Content Views"]),
        views: parseNumber(row.Views || row["Content Views"]),
        reach: parseNumber(row.Reach),
        engagements: parseNumber(row.Engagements),
        linkClicks: parseNumber(row["Link Clicks"]),
      }),
    }));
    return "Social media metrics updated.";
  }
  if (hasColumns(rows, ["quarter", "keyword", "search volume", "position"])) {
    state.data.seoReport = buildSeoReport(state.data);
    showToast("Keyword rows detected. Use the next version to map every keyword field directly.");
    return "SEO keyword export detected.";
  }
  return "CSV uploaded, but its headers do not match a known dashboard table.";
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
    const dateAdded = cellText(row["Date Added"]) || todayIso();
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
    const quarter = cellText(row.Quarter) || quarterFromDate(dateAdded) || state.quarter;
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

function sortObject(object) {
  return Object.fromEntries(Object.entries(object).sort((a, b) => b[1] - a[1]).slice(0, 12));
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

function toIsoDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function monthLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("en-CA", { month: "short", year: "numeric" });
}

function shortDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || "");
  return date.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

function quarterlyComboChart(rows) {
  const width = 760;
  const height = 330;
  const padding = { top: 58, right: 86, bottom: 70, left: 78 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const maxQualified = Math.max(1, ...rows.map((row) => parseNumber(row.qualified)));
  const maxMoney = Math.max(1, ...rows.map((row) => parseNumber(row.revenue)));
  const groupWidth = innerWidth / Math.max(1, rows.length);
  const barWidth = Math.min(46, groupWidth / 4);
  const bars = rows
    .map((row, index) => {
      const x = padding.left + index * groupWidth + groupWidth / 2;
      const qualifiedHeight = (parseNumber(row.qualified) / maxQualified) * innerHeight;
      const revenueHeight = (parseNumber(row.revenue) / maxMoney) * innerHeight;
      const y0 = padding.top + innerHeight;
      return `
        <rect x="${x - barWidth - 5}" y="${y0 - qualifiedHeight}" width="${barWidth}" height="${qualifiedHeight}" rx="6" fill="#c12400"><title>${escapeHtml(row.period || row.quarter)} qualified leads: ${formatNumber(row.qualified)}</title></rect>
        <rect x="${x + 5}" y="${y0 - revenueHeight}" width="${barWidth}" height="${revenueHeight}" rx="6" fill="#544845"><title>${escapeHtml(row.period || row.quarter)} revenue: ${formatMoney(row.revenue)}</title></rect>
        <text x="${x}" y="${height - 34}" text-anchor="middle" fill="#544845" font-size="15">${escapeHtml(row.period || row.quarter)}</text>
      `;
    })
    .join("");
  const grid = [0, 0.25, 0.5, 0.75, 1]
    .map((ratio) => {
      const y = padding.top + innerHeight - ratio * innerHeight;
      return `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="rgba(84,72,69,.14)" /><text x="${padding.left - 14}" y="${y + 5}" text-anchor="end" fill="#544845" font-size="13">${formatNumber(Math.round(maxQualified * ratio))}</text><text x="${width - padding.right + 16}" y="${y + 5}" fill="#544845" font-size="13">${formatMoney(maxMoney * ratio)}</text>`;
    })
    .join("");
  const legend = [
    ["Qualified Leads", "#c12400"],
    ["Revenue Won ($)", "#544845"],
  ]
    .map(([label, color], index) => `<g transform="translate(${padding.left + index * 220}, 16)"><rect width="58" height="14" fill="${color}"></rect><text x="68" y="13" fill="#544845" font-size="14">${label}</text></g>`)
    .join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Period performance trend">
    ${legend}
    ${grid}
    <text x="${width / 2}" y="${height - 8}" text-anchor="middle" fill="#544845" font-size="13">Period</text>
    <text x="18" y="${padding.top + innerHeight / 2}" text-anchor="middle" fill="#544845" font-size="13" transform="rotate(-90 18 ${padding.top + innerHeight / 2})">Qualified leads</text>
    <text x="${width - 20}" y="${padding.top + innerHeight / 2}" text-anchor="middle" fill="#544845" font-size="13" transform="rotate(90 ${width - 20} ${padding.top + innerHeight / 2})">Revenue won</text>
    <line x1="${padding.left}" y1="${padding.top + innerHeight}" x2="${width - padding.right}" y2="${padding.top + innerHeight}" stroke="rgba(84,72,69,.28)" />
    ${bars}
  </svg>`;
}

function leadFunnelChart(statuses) {
  const rows = Object.entries(statuses || {});
  const max = Math.max(1, ...rows.map(([, value]) => parseNumber(value)));
  return `
    <div class="funnel-list">
      ${rows.map(([label, value], index) => {
        const width = Math.max(5, (parseNumber(value) / max) * 100);
        const color = ["#8da0b8", "#78aef8", "#8889ef", "#66cc99", "#f1ad39", "#56bd89", "#df5350"][index % 7];
        return `<div class="funnel-row"><span>${escapeHtml(label)}</span><div class="funnel-track"><b style="width:${width}%; background:${color}">${formatNumber(value)}</b></div><strong>${formatNumber(value)}</strong></div>`;
      }).join("")}
    </div>
  `;
}

function leadFlowChart(statuses, metrics = {}) {
  const rows = orderedLeadStatuses(statuses, metrics);
  const max = Math.max(1, ...rows.map((row) => parseNumber(row.value)));
  if (!rows.length) return `<p class="definition">No pipeline stages are available for this period.</p>`;
  return `
    <div class="pipeline-flow">
      ${rows.map((row) => {
        const value = parseNumber(row.value);
        const width = value ? (value / max) * 100 : 0;
        return `
          <div class="pipeline-step">
            <div class="pipeline-step-head">
              <strong>${escapeHtml(row.label)}</strong>
              <b>${formatNumber(value)}</b>
            </div>
            <div class="pipeline-step-track"><i style="width:${width}%"></i></div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function orderedLeadStatuses(statuses, metrics = {}) {
  const ordered = LEAD_STATUS_ORDER.map((status) => ({
    key: status,
    label: status,
    value: Math.max(parseNumber(statuses?.[status]), status === "Won" ? parseNumber(metrics.won) : 0),
  }));
  const known = new Set(LEAD_STATUS_ORDER);
  const extras = Object.entries(statuses || {})
    .filter(([status]) => !known.has(status))
    .map(([status, value]) => ({ key: status, label: status, value }));
  return [...ordered, ...extras].filter((row) => parseNumber(row.value) > 0 || ["New Lead", "Answered/Qualifying", "Meeting Booked", "Qualified/Added to CoConstruct", "Won"].includes(row.label));
}

function leadStageDonutChart(statuses) {
  const entries = Object.entries(statuses || {}).filter(([, value]) => parseNumber(value) > 0);
  const total = entries.reduce((amount, [, value]) => amount + parseNumber(value), 0);
  if (!entries.length || !total) return `<p class="definition">No lead stages are available for this period.</p>`;
  const width = 560;
  const height = 330;
  const cx = 178;
  const cy = 158;
  const radius = 92;
  const strokeWidth = 34;
  const circumference = 2 * Math.PI * radius;
  const colors = ["#c12400", "#544845", "#151312", "#8e1b04", "#9b8f8b", "#d8d2cf", "#6b5e5a", "#b23a1d"];
  let offset = 0;
  const arcs = entries.map(([label, value], index) => {
    const amount = parseNumber(value);
    const length = (amount / total) * circumference;
    const arc = `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${colors[index % colors.length]}" stroke-width="${strokeWidth}" stroke-dasharray="${length} ${circumference - length}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})"><title>${escapeHtml(label)}: ${formatNumber(amount)} (${formatPct((amount / total) * 100, 1)})</title></circle>`;
    offset += length;
    return arc;
  }).join("");
  const legend = entries.map(([label, value], index) => {
    const amount = parseNumber(value);
    return `<div><i style="background:${colors[index % colors.length]}"></i><span>${escapeHtml(label)}</span><b>${formatNumber(amount)} · ${formatPct((amount / total) * 100, 1)}</b></div>`;
  }).join("");
  return `
    <div class="stage-donut">
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Lead stage mix">
        ${arcs}
        <text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="28" fill="#151312">${formatNumber(total)}</text>
        <text x="${cx}" y="${cy + 22}" text-anchor="middle" font-size="13" fill="#544845">leads</text>
      </svg>
      <div class="stage-legend">${legend}</div>
    </div>
  `;
}

function donutChart(rows, options = {}) {
  const width = 420;
  const height = options.height || 300;
  const cx = 150;
  const cy = height / 2;
  const radius = 82;
  const strokeWidth = 36;
  const filtered = rows.filter((row) => parseNumber(row.value) > 0);
  const total = sum(filtered, "value");
  if (!filtered.length || !total) return `<p class="definition">No revenue data is available for this period.</p>`;
  let offset = 0;
  const circumference = 2 * Math.PI * radius;
  const colors = ["#c12400", "#544845", "#151312", "#2e7d52", "#8e1b04", "#9b8f8b"];
  const arcs = filtered.map((row, index) => {
    const value = parseNumber(row.value);
    const length = (value / total) * circumference;
    const arc = `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${colors[index % colors.length]}" stroke-width="${strokeWidth}" stroke-dasharray="${length} ${circumference - length}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})"><title>${escapeHtml(row.label)}: ${formatMoney(value)}</title></circle>`;
    offset += length;
    return arc;
  }).join("");
  const legend = filtered.map((row, index) => `<div><i style="background:${colors[index % colors.length]}"></i><span>${escapeHtml(row.label)}</span><b>${formatMoney(row.value)}</b></div>`).join("");
  return `<div class="donut-chart"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Revenue by source">${arcs}<text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="20" fill="#151312">${formatMoney(total)}</text><text x="${cx}" y="${cy + 22}" text-anchor="middle" font-size="12" fill="#544845">total</text></svg><div class="donut-legend">${legend}</div></div>`;
}

function barChart(rows, labelKey, keys, options = {}) {
  const width = 760;
  const height = options.height || 260;
  const padding = { top: 26, right: 24, bottom: 62, left: 58 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const colors = ["#c12400", "#544845", "#151312"];
  const max = Math.max(1, ...rows.flatMap((row) => keys.map((key) => parseNumber(row[key]))));
  const groupWidth = innerWidth / Math.max(1, rows.length);
  const barWidth = Math.max(5, (groupWidth - 16) / keys.length);
  const bars = rows
    .map((row, groupIndex) =>
      keys
        .map((key, keyIndex) => {
          const value = parseNumber(row[key]);
          const barHeight = (value / max) * innerHeight;
          const x = padding.left + groupIndex * groupWidth + 8 + keyIndex * barWidth;
          const y = padding.top + innerHeight - barHeight;
          return `<rect x="${x}" y="${y}" width="${Math.max(3, barWidth - 2)}" height="${barHeight}" rx="3" fill="${colors[keyIndex % colors.length]}"><title>${escapeHtml(row[labelKey])}: ${key} ${value}</title></rect>`;
        })
        .join(""),
    )
    .join("");
  const labels = rows
    .map((row, index) => {
      const x = padding.left + index * groupWidth + groupWidth / 2;
      const label = options.compact ? String(row[labelKey] || "").slice(0, 9) : row[labelKey];
      return `<text x="${x}" y="${height - 26}" text-anchor="middle" font-size="12" fill="#544845">${escapeHtml(label)}</text>`;
    })
    .join("");
  const legend = keys
    .map(
      (key, index) =>
        `<g transform="translate(${padding.left + index * 120}, 8)"><rect width="10" height="10" rx="2" fill="${colors[index % colors.length]}"></rect><text x="16" y="10" font-size="12" fill="#544845">${escapeHtml(key)}</text></g>`,
    )
    .join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Bar chart">
    ${legend}
    <text x="${width / 2}" y="${height - 6}" text-anchor="middle" fill="#544845" font-size="12">${escapeHtml(options.xLabel || "Period")}</text>
    <text x="16" y="${padding.top + innerHeight / 2}" text-anchor="middle" fill="#544845" font-size="12" transform="rotate(-90 16 ${padding.top + innerHeight / 2})">${escapeHtml(options.yLabel || "Number")}</text>
    <line x1="${padding.left}" y1="${padding.top + innerHeight}" x2="${width - padding.right}" y2="${padding.top + innerHeight}" stroke="rgba(84,72,69,.28)" />
    ${bars}
    ${labels}
  </svg>`;
}

function lineChart(rows, labelKey, firstKey, secondKey, options = {}) {
  const width = 760;
  const height = options.height || 280;
  const padding = { top: 32, right: 28, bottom: 68, left: 74 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const rawMax = Math.max(1, ...rows.flatMap((row) => [parseNumber(row[firstKey]), parseNumber(row[secondKey])]));
  const magnitude = 10 ** Math.floor(Math.log10(rawMax));
  const max = Math.ceil(rawMax / magnitude) * magnitude;
  const yTicks = [max, max / 2, 0];
  const xStep = Math.max(1, Math.ceil(rows.length / 6));
  function points(key) {
    return rows
      .map((row, index) => {
        const x = padding.left + (rows.length <= 1 ? 0 : (index / (rows.length - 1)) * innerWidth);
        const y = padding.top + innerHeight - (parseNumber(row[key]) / max) * innerHeight;
        return `${x},${y}`;
      })
      .join(" ");
  }
  function pointDots(key, color, label) {
    const radius = rows.length > 45 ? 2.1 : 3.5;
    return rows
      .map((row, index) => {
        const x = padding.left + (rows.length <= 1 ? 0 : (index / (rows.length - 1)) * innerWidth);
        const y = padding.top + innerHeight - (parseNumber(row[key]) / max) * innerHeight;
        return `<circle cx="${x}" cy="${y}" r="${radius}" fill="${color}"><title>${escapeHtml(row[labelKey])} · ${escapeHtml(label)}: ${formatNumber(parseNumber(row[key]))}</title></circle>`;
      })
      .join("");
  }
  const yAxis = yTicks
    .map((tick) => {
      const y = padding.top + innerHeight - (tick / max) * innerHeight;
      return `
        <line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="rgba(84,72,69,.12)" />
        <text x="${padding.left - 12}" y="${y + 4}" text-anchor="end" font-size="12" fill="#544845">${formatNumber(Math.round(tick))}</text>
      `;
    })
    .join("");
  const xLabels = rows
    .map((row, index) => {
      if (index !== 0 && index !== rows.length - 1 && index % xStep !== 0) return "";
      const x = padding.left + (rows.length <= 1 ? 0 : (index / (rows.length - 1)) * innerWidth);
      return `<text x="${x}" y="${height - 22}" text-anchor="middle" font-size="12" fill="#544845">${escapeHtml(row[labelKey])}</text>`;
    })
    .join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Line chart">
    <g transform="translate(${padding.left}, 8)"><rect width="10" height="10" rx="2" fill="#c12400"></rect><text x="16" y="10" font-size="12" fill="#544845">${escapeHtml(options.firstLabel || firstKey)}</text></g>
    <g transform="translate(${padding.left + 148}, 8)"><rect width="10" height="10" rx="2" fill="#544845"></rect><text x="16" y="10" font-size="12" fill="#544845">${escapeHtml(options.secondLabel || secondKey)}</text></g>
    ${yAxis}
    <text x="${width / 2}" y="${height - 8}" text-anchor="middle" fill="#544845" font-size="12">${escapeHtml(options.xLabel || "Date")}</text>
    <text x="16" y="${padding.top + innerHeight / 2}" text-anchor="middle" fill="#544845" font-size="12" transform="rotate(-90 16 ${padding.top + innerHeight / 2})">${escapeHtml(options.yLabel || "Number")}</text>
    <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + innerHeight}" stroke="rgba(84,72,69,.28)" />
    <line x1="${padding.left}" y1="${padding.top + innerHeight}" x2="${width - padding.right}" y2="${padding.top + innerHeight}" stroke="rgba(84,72,69,.28)" />
    <polyline points="${points(firstKey)}" fill="none" stroke="#c12400" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></polyline>
    <polyline points="${points(secondKey)}" fill="none" stroke="#544845" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline>
    ${pointDots(firstKey, "#c12400", options.firstLabel || firstKey)}
    ${pointDots(secondKey, "#544845", options.secondLabel || secondKey)}
    ${xLabels}
  </svg>`;
}

function searchConsoleComboChart(rows, options = {}) {
  const width = 760;
  const height = options.height || 300;
  const padding = { top: 34, right: 86, bottom: 68, left: 82 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const impressionMax = axisMax(Math.max(1, ...rows.map((row) => parseNumber(row.impressions))));
  const clickMax = axisMax(Math.max(1, ...rows.map((row) => parseNumber(row.clicks))));
  const xStep = Math.max(1, Math.ceil(rows.length / 6));
  const groupWidth = innerWidth / Math.max(1, rows.length);
  const barWidth = Math.max(16, Math.min(48, groupWidth * 0.42));
  const bars = rows.map((row, index) => {
    const x = padding.left + index * groupWidth + groupWidth / 2 - barWidth / 2;
    const barHeight = (parseNumber(row.clicks) / clickMax) * innerHeight;
    const y = padding.top + innerHeight - barHeight;
    return `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="5" fill="#c12400"><title>${escapeHtml(row.label)} · Clicks: ${formatNumber(row.clicks)}</title></rect>`;
  }).join("");
  const points = rows.map((row, index) => {
    const x = padding.left + index * groupWidth + groupWidth / 2;
    const y = padding.top + innerHeight - (parseNumber(row.impressions) / impressionMax) * innerHeight;
    return `${x},${y}`;
  }).join(" ");
  const dots = rows.map((row, index) => {
    const x = padding.left + index * groupWidth + groupWidth / 2;
    const y = padding.top + innerHeight - (parseNumber(row.impressions) / impressionMax) * innerHeight;
    return `<circle cx="${x}" cy="${y}" r="3.5" fill="#544845"><title>${escapeHtml(row.label)} · Impressions: ${formatNumber(row.impressions)}</title></circle>`;
  }).join("");
  const grid = [0, 0.5, 1].map((ratio) => {
    const y = padding.top + innerHeight - ratio * innerHeight;
    return `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="rgba(84,72,69,.12)" /><text x="${padding.left - 12}" y="${y + 4}" text-anchor="end" font-size="12" fill="#544845">${formatNumber(Math.round(impressionMax * ratio))}</text><text x="${width - padding.right + 12}" y="${y + 4}" font-size="12" fill="#c12400">${formatNumber(Math.round(clickMax * ratio))}</text>`;
  }).join("");
  const xLabels = rows.map((row, index) => {
    if (index !== 0 && index !== rows.length - 1 && index % xStep !== 0) return "";
    const x = padding.left + index * groupWidth + groupWidth / 2;
    return `<text x="${x}" y="${height - 22}" text-anchor="middle" font-size="12" fill="#544845">${escapeHtml(row.label)}</text>`;
  }).join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Search Console impressions and clicks chart">
    <g transform="translate(${padding.left}, 8)"><rect width="10" height="10" rx="2" fill="#544845"></rect><text x="16" y="10" font-size="12" fill="#544845">Impressions</text></g>
    <g transform="translate(${padding.left + 150}, 8)"><rect width="10" height="10" rx="2" fill="#c12400"></rect><text x="16" y="10" font-size="12" fill="#544845">Clicks</text></g>
    ${grid}
    <text x="${width / 2}" y="${height - 8}" text-anchor="middle" fill="#544845" font-size="12">Date</text>
    <text x="16" y="${padding.top + innerHeight / 2}" text-anchor="middle" fill="#544845" font-size="12" transform="rotate(-90 16 ${padding.top + innerHeight / 2})">Impressions</text>
    <text x="${width - 18}" y="${padding.top + innerHeight / 2}" text-anchor="middle" fill="#c12400" font-size="12" transform="rotate(90 ${width - 18} ${padding.top + innerHeight / 2})">Clicks</text>
    <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + innerHeight}" stroke="rgba(84,72,69,.28)" />
    <line x1="${width - padding.right}" y1="${padding.top}" x2="${width - padding.right}" y2="${padding.top + innerHeight}" stroke="rgba(193,36,0,.28)" />
    <line x1="${padding.left}" y1="${padding.top + innerHeight}" x2="${width - padding.right}" y2="${padding.top + innerHeight}" stroke="rgba(84,72,69,.28)" />
    ${bars}
    <polyline points="${points}" fill="none" stroke="#544845" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></polyline>
    ${dots}
    ${xLabels}
  </svg>`;
}

function axisMax(value) {
  const safeValue = Math.max(1, parseNumber(value));
  const magnitude = 10 ** Math.floor(Math.log10(safeValue));
  return Math.ceil(safeValue / magnitude) * magnitude;
}

function dualAxisLineChart(rows, labelKey, firstKey, secondKey, options = {}) {
  const width = 760;
  const height = options.height || 280;
  const padding = { top: 32, right: 78, bottom: 68, left: 74 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const firstMax = Math.max(1, ...rows.map((row) => parseNumber(row[firstKey])));
  const secondMax = Math.max(1, ...rows.map((row) => parseNumber(row[secondKey])));
  const xStep = Math.max(1, Math.ceil(rows.length / 6));
  const maxA = axisMax(firstMax);
  const maxB = axisMax(secondMax);
  const firstType = options.firstType || "number";
  const secondType = options.secondType || "number";
  function axisValue(value, type) {
    if (type === "money") return formatMoney(value, true);
    if (type === "pct") return formatPct(value, 1);
    return formatNumber(Math.round(value));
  }
  function dotValue(value, type) {
    if (type === "money") return formatMoney(value, true);
    if (type === "pct") return formatPct(value, 2);
    return formatNumber(value);
  }
  function points(key, max) {
    return rows
      .map((row, index) => {
        const x = padding.left + (rows.length <= 1 ? 0 : (index / (rows.length - 1)) * innerWidth);
        const y = padding.top + innerHeight - (parseNumber(row[key]) / max) * innerHeight;
        return `${x},${y}`;
      })
      .join(" ");
  }
  function dots(key, max, color, label, type = "number") {
    return rows.map((row, index) => {
      const x = padding.left + (rows.length <= 1 ? 0 : (index / (rows.length - 1)) * innerWidth);
      const y = padding.top + innerHeight - (parseNumber(row[key]) / max) * innerHeight;
      const value = dotValue(row[key], type);
      return `<circle cx="${x}" cy="${y}" r="3" fill="${color}"><title>${escapeHtml(row[labelKey])} · ${escapeHtml(label)}: ${value}</title></circle>`;
    }).join("");
  }
  const grid = [0, 0.5, 1].map((ratio) => {
    const y = padding.top + innerHeight - ratio * innerHeight;
    return `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="rgba(84,72,69,.12)" /><text x="${padding.left - 12}" y="${y + 4}" text-anchor="end" font-size="12" fill="#544845">${axisValue(maxA * ratio, firstType)}</text><text x="${width - padding.right + 12}" y="${y + 4}" font-size="12" fill="#544845">${axisValue(maxB * ratio, secondType)}</text>`;
  }).join("");
  const xLabels = rows.map((row, index) => {
    if (index !== 0 && index !== rows.length - 1 && index % xStep !== 0) return "";
    const x = padding.left + (rows.length <= 1 ? 0 : (index / (rows.length - 1)) * innerWidth);
    return `<text x="${x}" y="${height - 22}" text-anchor="middle" font-size="12" fill="#544845">${escapeHtml(row[labelKey])}</text>`;
  }).join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Dual axis line chart">
    <g transform="translate(${padding.left}, 8)"><rect width="10" height="10" rx="2" fill="#c12400"></rect><text x="16" y="10" font-size="12" fill="#544845">${escapeHtml(options.firstLabel || firstKey)}</text></g>
    <g transform="translate(${padding.left + 160}, 8)"><rect width="10" height="10" rx="2" fill="#544845"></rect><text x="16" y="10" font-size="12" fill="#544845">${escapeHtml(options.secondLabel || secondKey)}</text></g>
    ${grid}
    <text x="${width / 2}" y="${height - 8}" text-anchor="middle" fill="#544845" font-size="12">${escapeHtml(options.xLabel || "Date")}</text>
    <text x="16" y="${padding.top + innerHeight / 2}" text-anchor="middle" fill="#544845" font-size="12" transform="rotate(-90 16 ${padding.top + innerHeight / 2})">${escapeHtml(options.firstLabel || firstKey)}</text>
    <text x="${width - 18}" y="${padding.top + innerHeight / 2}" text-anchor="middle" fill="#544845" font-size="12" transform="rotate(90 ${width - 18} ${padding.top + innerHeight / 2})">${escapeHtml(options.secondLabel || secondKey)}</text>
    <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + innerHeight}" stroke="rgba(84,72,69,.28)" />
    <line x1="${width - padding.right}" y1="${padding.top}" x2="${width - padding.right}" y2="${padding.top + innerHeight}" stroke="rgba(84,72,69,.18)" />
    <line x1="${padding.left}" y1="${padding.top + innerHeight}" x2="${width - padding.right}" y2="${padding.top + innerHeight}" stroke="rgba(84,72,69,.28)" />
    <polyline points="${points(firstKey, maxA)}" fill="none" stroke="#c12400" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></polyline>
    <polyline points="${points(secondKey, maxB)}" fill="none" stroke="#544845" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline>
    ${dots(firstKey, maxA, "#c12400", options.firstLabel || firstKey, firstType)}
    ${dots(secondKey, maxB, "#544845", options.secondLabel || secondKey, secondType)}
    ${xLabels}
  </svg>`;
}

function horizontalChart(object, options = {}) {
  const rows = Object.entries(object || {}).slice(0, 10);
  const width = 760;
  const height = options.height || Math.max(180, rows.length * 42 + 36);
  const padding = { top: 24, right: 28, bottom: 24, left: 170 };
  const innerHeight = height - padding.top - padding.bottom;
  const rowHeight = rows.length ? innerHeight / rows.length : innerHeight;
  const barHeight = Math.min(24, Math.max(12, rowHeight * 0.42));
  const barMaxWidth = width - padding.left - padding.right - 92;
  const max = Math.max(1, ...rows.map(([, value]) => value));
  const bars = rows
    .map(([label, value], index) => {
      const centerY = padding.top + index * rowHeight + rowHeight / 2;
      const y = centerY - barHeight / 2;
      const barWidth = (parseNumber(value) / max) * barMaxWidth;
      return `<text x="0" y="${centerY + 4}" font-size="12" fill="#544845">${escapeHtml(label)}</text><text x="${padding.left - 12}" y="${centerY + 4}" text-anchor="end" font-size="12" fill="#151312">${formatNumber(value)}</text><rect x="${padding.left}" y="${y}" width="${barWidth}" height="${barHeight}" rx="4" fill="${index === 0 ? "#c12400" : "#544845"}"><title>${escapeHtml(label)}: ${formatNumber(value)}</title></rect>`;
    })
    .join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Horizontal chart">${bars}</svg>`;
}

loadData().catch((error) => {
  app.innerHTML = `<main class="loading-state"><p>Dashboard could not load: ${escapeHtml(error.message)}</p></main>`;
});

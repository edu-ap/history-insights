"use strict";

const api = globalThis.browser ?? globalThis.chrome;

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_HISTORY_ITEMS = 5000; // cap the sample so the request stays bounded
const TOP_DOMAINS = 100;

const els = {
  gear: document.getElementById("gear"),
  main: document.getElementById("main"),
  settings: document.getElementById("settings"),
  range: document.getElementById("range"),
  includeTitles: document.getElementById("includeTitles"),
  analyse: document.getElementById("analyse"),
  status: document.getElementById("status"),
  result: document.getElementById("result"),
  apiKey: document.getElementById("apiKey"),
  model: document.getElementById("model"),
  save: document.getElementById("save"),
  clearKey: document.getElementById("clearKey"),
  settingsStatus: document.getElementById("settingsStatus"),
};

async function getConfig() {
  return api.storage.local.get({ apiKey: "", model: "claude-opus-4-7" });
}

function showView(name) {
  els.main.hidden = name !== "main";
  els.settings.hidden = name !== "settings";
}

function setStatus(el, msg, isError) {
  el.textContent = msg;
  el.classList.toggle("error", !!isError);
  el.hidden = !msg;
}

// ---- History aggregation -------------------------------------------------

function hostOf(url) {
  try {
    const h = new URL(url);
    if (!/^https?:$/.test(h.protocol)) return null;
    return h.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

async function buildSummary(days, includeTitles) {
  const now = Date.now();
  const startTime = now - days * 24 * 60 * 60 * 1000;
  const items = await api.history.search({
    text: "",
    startTime,
    endTime: now,
    maxResults: MAX_HISTORY_ITEMS,
  });

  const domains = new Map(); // host -> { pages, titles: [] }
  const hours = new Array(24).fill(0);
  let totalPages = 0;

  for (const item of items) {
    const host = hostOf(item.url);
    if (!host) continue;
    totalPages++;
    if (!domains.has(host)) domains.set(host, { pages: 0, titles: [] });
    const d = domains.get(host);
    d.pages++;
    if (includeTitles && item.title && d.titles.length < 3) d.titles.push(item.title);
    if (item.lastVisitTime) hours[new Date(item.lastVisitTime).getHours()]++;
  }

  if (totalPages === 0) return null;

  const ranked = [...domains.entries()].sort((a, b) => b[1].pages - a[1].pages);
  const truncated = items.length >= MAX_HISTORY_ITEMS;

  const lines = [];
  lines.push(`Browser history summary for the last ${days} day(s), through ${new Date(now).toISOString().slice(0, 10)}.`);
  lines.push(`Distinct pages in sample: ${totalPages} across ${domains.size} domains.${truncated ? ` (sample capped at the ${MAX_HISTORY_ITEMS} most recent pages)` : ""}`);
  lines.push("");
  lines.push(`Top ${Math.min(TOP_DOMAINS, ranked.length)} domains by pages:`);
  for (const [host, d] of ranked.slice(0, TOP_DOMAINS)) {
    lines.push(`- ${host}: ${d.pages}`);
  }
  lines.push("");
  lines.push("Page count by hour of day (00..23):");
  lines.push(hours.map((c, h) => `${String(h).padStart(2, "0")}:${c}`).join("  "));

  if (includeTitles) {
    lines.push("");
    lines.push("Sample page titles (top domains):");
    for (const [host, d] of ranked.slice(0, 25)) {
      for (const t of d.titles) lines.push(`- [${host}] ${t}`);
    }
  }

  return lines.join("\n");
}

// ---- Anthropic call ------------------------------------------------------

const SYSTEM_PROMPT =
  "You are a thoughtful, non-judgemental analyst. You receive an aggregated summary " +
  "of a person's own browser history and produce concise, useful insights about it. " +
  "Use British English. Structure the answer with short headings and bullet points. " +
  "Cover: main themes and interests, time-of-day patterns, balance of work vs leisure, " +
  "anything notable or surprising, and 2-3 concrete, kind suggestions. " +
  "Only reason from the data provided; do not invent specific sites or facts not present.";

function statusMessageFor(res, body) {
  const apiMsg = body?.error?.message;
  switch (res.status) {
    case 400: return `Bad request: ${apiMsg || "check the model and try again."}`;
    case 401: return "Invalid API key. Open Settings (⚙) and check it.";
    case 403: return "This API key lacks permission for the selected model.";
    case 404: return "Model not found for this key. Try a different model in Settings.";
    case 413: return "Too much history to send. Pick a shorter period.";
    case 429: return "Rate limited by Anthropic. Wait a moment, then retry.";
    case 529: return "Anthropic is overloaded. Retry shortly.";
    default:
      if (res.status >= 500) return "Anthropic had a server error. Retry shortly.";
      return `Request failed (${res.status}): ${apiMsg || "unknown error."}`;
  }
}

async function analyse(apiKey, model, summary) {
  let res;
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        // Required for direct browser/extension calls (opts past Anthropic's CORS block).
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content:
              "Here is an aggregated summary of my own browser history. " +
              "Please give me insights as instructed.\n\n" +
              summary,
          },
        ],
      }),
    });
  } catch {
    throw new Error("Network error reaching api.anthropic.com. Check your connection.");
  }

  let body = null;
  try { body = await res.json(); } catch { /* non-JSON error body */ }

  if (!res.ok) throw new Error(statusMessageFor(res, body));

  const text = (body.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  return text || "(No text returned.)";
}

// ---- Wiring --------------------------------------------------------------

els.gear.addEventListener("click", async () => {
  const cfg = await getConfig();
  els.apiKey.value = cfg.apiKey;
  els.model.value = cfg.model;
  setStatus(els.settingsStatus, "", false);
  showView("settings");
});

els.save.addEventListener("click", async () => {
  const apiKey = els.apiKey.value.trim();
  const model = els.model.value;
  await api.storage.local.set({ apiKey, model });
  setStatus(els.settingsStatus, "Saved.", false);
  if (apiKey) setTimeout(() => showView("main"), 600);
});

els.clearKey.addEventListener("click", async () => {
  await api.storage.local.set({ apiKey: "" });
  els.apiKey.value = "";
  setStatus(els.settingsStatus, "Key cleared.", false);
});

els.analyse.addEventListener("click", async () => {
  const cfg = await getConfig();
  if (!cfg.apiKey) {
    setStatus(els.status, "Add your Anthropic API key in Settings (⚙) first.", true);
    return;
  }
  els.analyse.disabled = true;
  els.result.hidden = true;
  setStatus(els.status, "Reading history…", false);
  try {
    const summary = await buildSummary(Number(els.range.value), els.includeTitles.checked);
    if (!summary) {
      setStatus(els.status, "No browsing history found for that period.", true);
      return;
    }
    setStatus(els.status, `Asking ${cfg.model}…`, false);
    const insight = await analyse(cfg.apiKey, cfg.model, summary);
    setStatus(els.status, "", false);
    els.result.textContent = insight; // textContent — never inject model output as HTML
    els.result.hidden = false;
  } catch (err) {
    setStatus(els.status, err.message, true);
  } finally {
    els.analyse.disabled = false;
  }
});

// Initial view: settings if no key yet, otherwise main.
(async () => {
  const cfg = await getConfig();
  showView(cfg.apiKey ? "main" : "settings");
})();

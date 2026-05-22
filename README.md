# History Insights

A Chrome (Manifest V3) extension that analyses **your own** browser history with
Claude and gives you concise insights: your main interests, time-of-day patterns,
work/leisure balance, and a few gentle suggestions. It uses **your own** Anthropic
API key, stored locally in your browser.

## ⚠️ Read this first — privacy

This extension sends a summary of your browsing history to Anthropic's API to
generate insights. That is the whole point, but it means data leaves your browser.
To keep that exposure deliberate and minimal:

- **You trigger it.** Nothing is sent until you click **Analyse my history**.
- **Aggregated by default.** It sends per-domain page counts and an hour-of-day
  histogram, **not** full URLs. Page titles are sent **only** if you tick the
  "Include page titles" box.
- **Your key, your account.** Calls go to `api.anthropic.com` with your key and are
  billed to your Anthropic account. The key is stored only in `chrome.storage.local`
  on this device and is never sent anywhere except Anthropic.
- **No other servers.** There is no backend; the only network request is to Anthropic.

If you would rather not send history to a third party at all, don't use this.

## Setup

1. Get an Anthropic API key from <https://console.anthropic.com/>.
2. Install the extension (below), open it, and paste the key into **Settings (⚙)**.
3. Optionally pick a cheaper model (see below). Save.

## Install (unpacked)

1. Download **[`history-insights-v1.0.0.zip`](https://github.com/edu-ap/history-insights/releases/latest/download/history-insights-v1.0.0.zip)** ([all releases](https://github.com/edu-ap/history-insights/releases/latest)) and unzip it (folder with `manifest.json`), or clone this repo.
2. Open `chrome://extensions` (Chrome, Edge, Brave, Arc).
3. Enable **Developer mode** (top-right).
4. Click **Load unpacked** and select the folder.
5. Pin the icon, open it, add your key in Settings.

## Use

1. Click the icon.
2. Choose a period (24 hours / 7 / 30 / 90 days).
3. Optionally tick "Include page titles" for richer (but less private) insight.
4. Click **Analyse my history**.

## Model and cost

Defaults to **Claude Opus 4.7** (most capable). For lower cost, switch to
**Sonnet 4.6** or **Haiku 4.5** in Settings. Each analysis is a single API call;
the history summary is aggregated and capped (most recent 5,000 pages), so input
size — and cost — stays bounded. You pay Anthropic directly per your usage.

## Permissions

| Permission | Why |
|------------|-----|
| `history` | Read your browser history to summarise it |
| `storage` | Store your API key and model choice locally |
| `host_permissions: https://api.anthropic.com/*` | Call the Anthropic API directly |

No analytics, no other hosts, no background worker.

## How it talks to Claude

Direct client-side `fetch` to `POST https://api.anthropic.com/v1/messages` with
headers `x-api-key`, `anthropic-version: 2023-06-01`, and
`anthropic-dangerous-direct-browser-access: true` (the last one is what lets a
browser extension call the API past Anthropic's default CORS block). The model's
response is rendered as plain text (`textContent`), never injected as HTML.

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | Extension manifest (MV3) |
| `popup.html` / `popup.css` | Popup + settings UI |
| `popup.js` | History aggregation, Anthropic call, error handling |
| `icons/` | Toolbar icons |

## Licence

[MIT](LICENSE) © 2026 Eduardo Aguilar Pelaez

# Outbound Engine ✉️

> **Implementation status:** importable n8n workflow definition. Running it requires an n8n instance plus the credentials listed under Setup (Claude, Gmail OAuth, Airtable) and a webhook endpoint reachable from the public internet. `YOUR_*` placeholders must be replaced.

## 🚧 The problem

Identical copy sent at machine speed is what gets domains flagged. Most automation tools send the same subject and body to every lead in a batch, at uniform intervals, which is exactly the pattern spam filters are trained to catch. Most teams also have no visibility into what happened after the send: they know emails went out, but not whether any of them actually landed in an inbox that got opened. This system fixes both.

## ⚙️ What this system does

One workflow, two branches: the send branch and the tracking branch.

**📤 Send branch:**
- Schedule trigger fires every 15 minutes, weekdays only, 9am-5pm
- Fetches leads from the "Email Sent" view in Airtable, filtered to Safe To Send = yes
- Caps each run at 6 leads
- Generates a random float between 0 and 3, used as a minute delay before each send ⏱️
- Passes the base subject and body template to Claude, which rewrites both on every call: different opening line, different sentence structure, different framing, same core message and CTA
- A JSON output parser enforces a strict subject + body schema so downstream nodes always get clean output
- Sends via Gmail with a 1x1 transparent PNG pixel embedded in the body, URL-encoded with the Airtable record ID
- Marks Email Sent = true on the record immediately after send
- Waits the random delay, then loops to the next lead

**📬 Tracking branch:**
- A separate webhook endpoint receives GET requests when the pixel loads in a recipient's email client
- Extracts the record ID from the URL query parameter
- Fetches the Airtable record and checks whether Opened On is already set
- If not set, writes the current timestamp to Opened On and returns the pixel image to the client
- If already set, skips the write and returns the image anyway so the client does not get an error

## 💡 Why it is built this way

Random delays matter because sending six emails in a burst at a fixed interval is a pattern. Randomising the gap breaks that pattern at the SMTP level and reduces the chance of triggering rate-based filters. Claude rewrites on every send rather than using spintax because spintax is detectable: the sentence structure stays the same even if individual words swap. A full rewrite with a varied opening and different paragraph order looks like separate emails written by a person. The pixel tracker is self-built because third-party tools add a tracking domain to every link in the email, which is itself a signal that filters look for. A pixel served directly from your own n8n webhook has no third-party domain in the header. Writing open events directly to Airtable means the CRM is the single source of truth: no separate analytics tool, no export step, just a timestamp in the same record the rep is already looking at.

## 🛠️ Stack

n8n, Claude Sonnet (Anthropic), Gmail, Airtable

## 🚀 Setup

- Import `email-sending-open-tracking.json` into n8n
- Credentials needed: Anthropic API key, Gmail OAuth2, Airtable Personal Access Token
- Replace all `YOUR_*` placeholders: Airtable base ID, table ID, view ID for the send queue, webhook UUID for the pixel endpoint
- In the Gmail node, update the `sendTo` field to your sending address and update the pixel `src` URL to `https://YOUR_N8N_INSTANCE/webhook/YOUR_WEBHOOK_UUID`
- Update the subject line, body template, and signature block in the Prepare Contact Data node to match your own messaging
- Activate the workflow to bring the webhook endpoint live, then activate the schedule trigger

# Signal-to-Pipeline 🔍

> **Implementation status:** importable n8n workflow definitions. Running them requires an n8n instance plus the credentials listed under Setup (Apify, Gemini, Clearout, Airtable). `YOUR_*` placeholders must be replaced.

## 🚧 The problem

Most outbound is sent to static lists built from Apollo exports or CSV uploads. By the time a rep touches those leads, the data is weeks old and there is no context for why those accounts matter right now. Job postings are a live signal. A company hiring 15 engineers in Bengaluru this week is telling you what they are building, at what scale, and where the pressure is. That is a better opening than a guess based on headcount and industry tag.

## ⚙️ What this system does

Two workflows, one pipeline. The output of both feeds the same Airtable table, which is the queue that the outbound engine pulls from.

**🕵️ The job signal workflow:**
- Apify pulls LinkedIn job postings by industry and target role set
- n8n flattens the raw dataset, normalises field names, and groups all open roles by company
- Gemini generates a hiring analysis per company: what they are building (inferred from titles and JDs), where they are hiring and what that signals, seniority spread, stack focus, urgency indicators
- Gemini also generates a one-line outreach hook per company, written as an opener that references the actual location, domain, and scale of hiring

**🎯 The lead sourcing workflow:**
- Apify Leads Finder runs against the same target list and pulls raw contact records
- Leads upsert into Airtable immediately, matched by email
- Gemini scores each contact for ICP fit across five verticals: D2C/E-commerce, Defense/Aviation, Fintech, Pharma, Semiconductor/Data Center. Returns true/false with a written explanation of what triggered the verdict
- Gemini also assigns an email quality score (0–100) with written reasoning in the same structured call — the score is stored per lead, so its basis is traceable
- Clearout API runs SMTP-level verification only on leads that pass the ICP check
- Final upsert writes AI summary, vertical match, email score, Clearout status, and Safe To Send flag back to the same Airtable record

## 💡 Why it is built this way

Job signals move faster than list hygiene cycles. By the time an Apollo export is cleaned and loaded, the hiring push that created those signals is already weeks in. Pulling from live postings means the signal and the outreach are in the same week. ICP scoring runs before Clearout because Clearout costs money per check. Running it on every lead in the raw dataset would burn credits on contacts that would be filtered out anyway. Every score keeps its attribution — the email score and its written reasoning are recorded per lead, so a pass or fail can always be explained instead of waved off as "the AI said so". Clearout fires last, on the smallest possible set, as a final filter before the record moves into the send queue.

## 🛠️ Stack

n8n, Apify, Gemini (Google AI), Clearout, Airtable

## 📁 Files

- `job-signal-scraper.json` - signal ingestion, company grouping, Gemini analysis and hook generation
- `lead-sourcing-icp-validation.json` - lead ingest, ICP scoring, email scoring, Clearout verification, Airtable upsert

## 🚀 Setup

- Import both JSONs into your n8n instance separately
- Credentials needed: Apify OAuth2, Google Gemini (PaLM) API, Airtable Personal Access Token, Clearout API key
- Replace all `YOUR_*` placeholders: Apify dataset ID, Airtable base ID, table ID, view IDs (one for unvalidated queue, one for company-wise jobs), Google Sheets doc and tab IDs if using the sheet logging branch
- In the Clearout HTTP Request node, set the Authorization header to `Bearer YOUR_CLEAROUT_API_KEY`
- Activate the validation queue trigger before the ingest trigger, so records have somewhere to land before the second workflow starts processing them

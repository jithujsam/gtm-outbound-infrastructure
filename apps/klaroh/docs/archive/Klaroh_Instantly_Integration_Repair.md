# Klaroh Instantly Integration Repair

## Objective

Repair the Instantly integration in Klaroh without rewriting unrelated functionality.

The intended architecture is:

- The Instantly API key belongs to the agency/account integration.
- A Klaroh client is mapped to a specific Instantly campaign.
- Campaign metrics are refreshed from Instantly when the client data is loaded or manually refreshed, and through background sync where configured.

## Required investigation

Before changing code, inspect the existing implementation, database schema, migrations, RLS policies, encryption helpers, agency resolution, client ownership checks, campaign loading, settings/connector flows, and Vercel cron configuration.

Identify the exact root causes of:

1. Instantly API keys not reliably saving or persisting.
2. Existing API keys not being reusable cleanly.
3. Replacing an existing API key not being handled cleanly.
4. Campaign selection not reliably creating/persisting the client mapping.
5. Refresh/reload not reliably retrieving the latest Instantly data.
6. Background sync not reliably updating the correct agency/client campaigns.
7. Any RLS or cross-agency data-isolation risks.
8. Any mismatch between intended and configured cron frequency.

Do not start with a full rewrite. Reuse the current architecture where it is sound.

## Desired data model

The relationship should remain conceptually:

Agency -> Instantly Integration -> encrypted API key
Agency -> Client -> Klaroh Campaign -> integration_id + Instantly external campaign ID

The API credential should be agency-level unless the existing product requirements prove otherwise. The selected campaign mapping must remain client-specific.

For an Instantly campaign record in Klaroh, retain at minimum:

- agency_id
- client_id
- integration_id
- external_id / Instantly campaign ID
- source/tool = instantly
- display name
- cached metrics
- last_synced

Do not expose or store decrypted API keys in client-side state, logs, API responses, or browser storage.

## API key connection flow

When adding an Instantly integration:

1. Check whether the agency already has an enabled Instantly integration.
2. If there is no existing connection, show an API key input.
3. Validate the input locally.
4. Validate the key against Instantly with a safe authenticated API request before treating it as connected.
5. Persist the encrypted key server-side only after successful validation.
6. Return only safe connection state, such as connected status and masked key.

If an Instantly connection already exists:

- Show that the connection exists.
- Give the user a clear option to reuse the existing connection.
- Also give the user a clear option to replace the key.
- Replacing the key must validate the new key first, then update the encrypted credential.
- Existing client campaign mappings should not be deleted merely because the API key is replaced.

The API key save operation must be server-side and authenticated.

## Campaign discovery

Use the Instantly API v2 campaign listing endpoint for campaign discovery rather than relying on an analytics endpoint as the primary picker source.

The picker should:

1. Fetch the campaigns available to the connected Instantly account.
2. Show campaign name and stable campaign ID.
3. Allow the user to select one campaign.
4. Prevent accidental duplicate attachment of the same Instantly campaign where the product data model requires uniqueness.

The picker must not save a campaign mapping until the user explicitly selects a campaign.

## Secure campaign attachment

Do not rely on a browser-side direct Supabase insert for the final Instantly campaign attachment if that operation can be moved safely to the server.

Create or use an authenticated server endpoint/action that accepts only the required identifiers, for example:

- clientId
- integrationId or resolved integration
- externalCampaignId
- optional Klaroh campaign display name

On the server:

1. Authenticate the current user.
2. Resolve the user's agency.
3. Verify the client belongs to that agency.
4. Verify the Instantly integration belongs to that agency and is enabled.
5. Verify the Instantly campaign ID exists in the connected Instantly account.
6. Insert or update the campaign mapping with the correct agency_id, client_id, and integration_id.
7. Return the created campaign record or safe result.

Never trust agency_id, user_id, integration ownership, or campaign ownership supplied by the browser.

## Initial metrics

After campaign selection, fetch the selected Instantly campaign's current analytics and populate the Klaroh cache.

Use the appropriate Instantly analytics endpoint for the selected campaign. Do not use the entire campaign list as a substitute for campaign-specific analytics.

Store only the metrics required by the existing Klaroh UI.

Calculate rates defensively. Never produce NaN or Infinity for zero denominators.

## Reload and latest data

When a client/campaign page is loaded or refreshed:

1. Load the client-specific Klaroh campaign mapping.
2. Resolve the associated Instantly integration server-side.
3. Fetch the latest data from Instantly for that selected campaign.
4. Update the local cache.
5. Render the latest available result.

Do not fetch every Instantly campaign for every client page.

The client page must only expose campaigns belonging to that client and agency.

If Instantly is temporarily unavailable, retain the last successful cache and show an appropriate stale/error state rather than destroying valid local data.

## Manual refresh

Provide a reliable manual refresh path for Instantly-backed client data.

The refresh operation should:

- authenticate the user
- verify client and campaign ownership
- fetch the latest Instantly data
- update the cache
- update last_synced
- return the refreshed metrics

Avoid duplicate concurrent refreshes from rapid clicks.

## Background sync

The existing shared sync logic may be retained, but it must be corrected to enforce agency isolation.

Any local campaign query used during an agency sync must be scoped to that agency. Never query all campaigns with `tool=instantly` and then match external IDs globally.

The safest matching key is effectively:

agency_id + integration_id + external_id

At minimum, ensure the local campaign belongs to the same agency and integration whose API key is being used.

Only update campaigns that are actually mapped to clients. Do not create new Klaroh campaigns during background sync.

Review the Vercel cron schedule and make it match the intended product behavior. Do not rely on comments to determine the actual schedule.

## Security requirements

- API keys must remain encrypted at rest using the existing encryption helper.
- Decryption must occur only on the server when making an Instantly API request.
- Never return decrypted keys to the browser.
- Never log API keys.
- Never put API keys in URL parameters.
- Validate authenticated ownership for every mutation.
- Enforce agency isolation on every read and write.
- Review and fix Supabase RLS policies where needed.

## Error handling

Handle at least:

- missing API key
- invalid API key
- expired/revoked API key
- Instantly 401
- Instantly 403
- Instantly rate limiting
- Instantly timeout/network failure
- malformed Instantly response
- missing campaign
- campaign no longer accessible
- duplicate campaign mapping
- missing client
- wrong-agency client
- missing integration
- disabled integration

Return useful user-safe errors. Do not expose internal stack traces or credentials.

## Existing implementation areas to inspect

Pay particular attention to these existing files and related dependencies:

- `src/app/api/save-instantly-key/route.ts`
- `src/app/api/instantly-campaigns/route.ts`
- `src/app/api/sync-instantly/route.ts`
- `src/components/InstantlyCampaignsModal.tsx`
- `src/components/CreateCampaignModal.tsx`
- `src/components/ConnectorModal.tsx`
- `src/lib/data/integrations.ts`
- `src/lib/types.ts`
- `src/app/(dashboard)/clients/integration-section.tsx`
- `src/app/(dashboard)/dashboard/dashboard-client.tsx`
- `src/components/SettingsModal.tsx`
- `supabase/23_add_instantly_integration.sql`
- `vercel.json`

Also inspect all related migrations and RLS policies before deciding whether a schema migration is required.

## Specific known problems to verify

The current implementation has several suspicious areas that must be confirmed and corrected if still present:

1. `src/app/api/instantly-campaigns/route.ts` uses the analytics endpoint as the campaign picker source. Replace with the proper campaign-list endpoint for discovery.
2. `src/components/CreateCampaignModal.tsx` performs the final Instantly campaign insert directly from the browser. Move this sensitive ownership-validated mutation to the server.
3. `src/app/api/sync-instantly/route.ts` queries local Instantly campaigns by tool without scoping the query to the current agency. Fix this cross-agency isolation issue.
4. Existing connector UI does not provide a clean reuse-existing-key versus replace-key flow. Add this without breaking Smartlead or demo behavior.
5. The save flow currently persists the API key before proving that the key can actually authenticate with Instantly. Validate first where practical.
6. The cron configuration must be checked against the desired sync frequency because the current implementation may not match its comments.

## Compatibility

Do not break:

- Smartlead integration
- demo campaigns
- existing clients
- existing campaign records
- existing dashboard views
- existing Supabase authentication
- existing encryption mechanism
- existing client ownership model

If a migration is required, create a new migration. Do not edit an already-applied migration as a shortcut.

## Implementation sequence

Phase 1: Investigation

- Trace the complete current Instantly flow.
- Inspect schema and RLS.
- Identify exact failure points.
- Produce a concise root-cause report before modifying code.

Phase 2: API and data-layer fixes

- Fix secure API-key persistence/reuse/replacement.
- Fix Instantly campaign discovery.
- Add secure campaign attachment.
- Fix selected-campaign analytics.
- Fix agency-scoped synchronization.

Phase 3: UI fixes

- Improve connection state.
- Add reuse/replace flow.
- Make campaign selection reliable.
- Add clear loading, success, and error states.
- Add manual refresh where the existing UI expects it.

Phase 4: Validation

Run:

- TypeScript checks
- ESLint
- production build
- relevant tests if present

Then verify the complete flow manually:

1. New agency with no Instantly key.
2. Enter valid key.
3. Key validates and saves encrypted.
4. Campaign list loads.
5. Select campaign.
6. Mapping persists after reload.
7. Correct client sees the selected campaign.
8. Another client does not see it.
9. Metrics load from Instantly.
10. Manual refresh updates metrics.
11. Full page reload retrieves current data.
12. Existing key can be reused without re-entering it.
13. Existing key can be replaced with a valid new key.
14. Invalid replacement key does not overwrite the working key.
15. Smartlead behavior still works.
16. Demo behavior still works.
17. Background sync updates only the correct agency's campaigns.
18. Instantly failures leave the last good cached data intact.

## Final engineering rule

Do not declare the issue fixed merely because the UI appears to work once.

The implementation must be reliable across refreshes, repeated attempts, existing connections, key replacement, multiple clients, multiple agencies, and temporary Instantly API failures.

Prefer the smallest maintainable change that establishes a clear separation between:

- credential/account connection
- client-to-campaign mapping
- live Instantly data retrieval
- cached campaign metrics
- background synchronization

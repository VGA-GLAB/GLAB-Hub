# Optional Steam profile setup

GLAB initial registration accepts an optional SteamID64 (17 ASCII digits, kept as text) and two independent, initially unchecked publication preferences. The profile panel lets the owner change or clear the ID and revoke either preference later. Empty ID is stored as null. These are self-declared settings, not Steam account verification or changes to Steam privacy settings.

The source of truth is Cernere managed project volputas, module steam_profile:

| Cr column | API field | Default |
| --- | --- | --- |
| steam_id | steamId | null |
| played_games_public | playedGamesPublic | false |
| steam_id_public | steamIdPublic | false |

Apply Cernere migration 055_volputas_steam_profile.sql before enabling storage. It preserves existing evidence and credentials and grants glab / legacy EducationLab access only to these three columns. No local GLAB copy is stored.

GET/PUT /api/x/vantan-user/steam-profile use the authenticated Cernere subject only; callers cannot supply a target user. Responses are private, no-store. Invalid input returns 400; Cr failure returns 503 without upstream details. Initial PUT /profile optionally accepts steamProfile with the same three API fields. Omission preserves existing Steam settings and old clients keep working. The Steam write precedes the required school-profile write, so its failure cannot complete the setup gate. The two Cr project writes are not a transaction; a successful Steam write can remain if the school write fails, and retrying writes the same values.

The optional UI first loads saved values. While loading or after an error it cannot submit guessed values; it displays the failure and allows setup without changing Steam settings. Missing stored privacy flags mean false; only literal true grants permission. Personal read failures are never converted to public consent. Public output is not added by this change: any future publishing consumer must apply the corresponding flag independently and fail closed on read errors. The existing recent-games suggestion endpoint is owner-only.

Reference: Memoria server/lib/steam-client.ts uses SteamID64 with GetRecentlyPlayedGames. This change registers the identifier and preferences; it does not import Memoria's private settings or fetch Steam games. Public pages, service restarts and migration execution are outside this implementation.

Validation: GLAB typecheck and build. Regression tests cover ID precision, independent privacy values, optional registration, error ordering and authenticated-owner routing; executing them requires the project's explicit test authorization.

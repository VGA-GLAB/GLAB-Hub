# SPEC-GLAB-PERMISSIONS-001: Own permission status and settings

The header provides a Cr permission-settings link to /data-optout on the configured CERNERE_FRONTEND_URL.
This link remains available to users who denied presence permission. GLab never changes consent itself.
The service overview displays the user's GLab administrator role and current Cernere permission status.
Unknown permission state is displayed explicitly and never treated as granted.

The authenticated dashboard permissions route derives userId from the session and calls Cernere's
project-bound managed_project.get_user_permissions. Browser-supplied user IDs are not accepted.
Availability and location controls remain hidden until user_data.module:presence is explicitly allowed.
Refresh, focus and visibility changes refresh the permission decision. Writes recheck permission server-side.
No administrator role bypasses the user's refusal. Cernere remains the final write authority.

Requires Cernere SPEC-PROJECT-USER-PERMISSIONS-001 (PR #3321); deploy that read API before this UI.

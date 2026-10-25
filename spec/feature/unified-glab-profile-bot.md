# Unified GLab profile and notification Bot

GLab reads and writes its profile columns on the existing `glab` Cernere registration. Names, roles and departments remain owned by Cernere; the Hub does not duplicate them in its database.

Deploy after Cernere migration 078 has copied the existing profile into GLab. Keep profile writers paused across the coordinated Cernere/GLab/Aedilis cutover. Aedilis retains read-only access to the profile module. Verify preservation before retiring the old profile registration.

The notification Bot is an internal GLab runtime. It reads pending consultations from the same SQLite database as the Hub and acknowledges Discord thread creation/resolution through the consult store. Existing notification state and retry behavior are retained. No Cr client credentials or service token are required by the notification scheduler; the Bot must not share the Hub launch credentials, which rotate per process launch.

The external consultation routes retain their existing authentication for external clients. Legacy disabled command helpers are not registered or executed by the notification-only runtime.

Validation covers profile transport targets and the shared consult queue's pending/acknowledged/resolved transitions. Production delivery must be verified separately without generating unsolicited test messages.

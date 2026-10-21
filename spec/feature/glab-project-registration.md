# GLab project registration

GLab uses Cernere managed project `glab`, storage slug/token audience `glab`, and
display name `GLab`. The launcher, SDK client, hub launch credential catalog and
Bot's target project must agree. EducationLab is the retired source registration.

Deploy only after Cernere migration 075 has copied the presence data and preserved
consent/opt-out settings. Stop GLab writers during the migration and restart with
fresh glab credentials afterward. Existing sessions require login again.

Acceptance: manifest cernereProjectKey and health service are glab, launch credentials
are issued for glab, migrated presence data remains available, and prior opt-outs
continue denying access. Do not re-enable consent as part of this migration.

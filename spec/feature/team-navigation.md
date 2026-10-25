# TEAM and WORKSPACE navigation

## SPEC-GLAB-TEAM-NAVIGATION-001

TEAM appears above WORKSPACE. It lists only active GLab projects with an existing
membership for the authenticated Cr subject. Projects and memberships remain the
sole source of truth; no parallel team registry or self-enrollment is introduced.
Each team provides a dashboard, member list and release list derived from existing
project data. Every detail request checks membership again, including administrators;
nonmembers, closed projects and unknown IDs all return 404. Existing workspace
project administration retains its existing permissions.

WORKSPACE renames Di to AI議論 and Cocoiru to アクティブなメンバー.
Events and facility/meeting booking share one expandable navigation group.
The active-member panel reads unexpired Cocoiru availability without changing it.
Team detail responses are private/no-store. Navigation discards late team responses
after another selection or shell disposal. Menus remain keyboard-accessible.

GLab admission approval is a separate host-wide prerequisite. This change neither
grants eligibility nor changes Cr authentication or project membership permissions.

# Public legal HTML

Publish the operator-approved UTF-8 HTML documents here as `privacy.html` and
`terms.html`. Initial Japanese copy follows neco's instruction to use conventional
wording. Keep the content aligned with actual data practices when these change.

The server returns these exact files at `/public/legal/privacy` and
`/public/legal/terms`, without cookies, login, JavaScript, database queries or
request interpolation. Until a file exists its endpoint returns static HTML
with HTTP 503. It does not redirect to authentication or return the SPA shell.

Use self-contained HTML with inline styles, Japanese language and viewport
metadata, a title, revision date and links between the two documents. The route
blocks scripts, frames, remote assets and form submission through CSP.
These files live outside `public/build` and are resolved from the project root,
so server bundling does not change their location. The deployed source checkout
must include both approved documents before publishing links to users.

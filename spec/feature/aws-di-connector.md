# AWS GLAB Di/Odeum connection verification

Actio: actio:a31860b4-9c51-4996-818a-1e92c4a0d073 (Di), actio:57c19db0-c96e-446e-9224-d7e86673a261 (Odeum).

neco requested AWS GLAB Di and Odeum connections to become genuinely green, including initial Odeum registration.

Di optionally receives `DISCUTERE_CF_ACCESS_CLIENT_ID` and `DISCUTERE_CF_ACCESS_CLIENT_SECRET` from Excubitor Vault. Both are required together and credentials require an HTTPS `DISCUTERE_URL`. Credentials remain server-side and are used for health and Di integration API calls; redirects are rejected to avoid sending credentials to a different origin. Browser login and Di publication authorization remain independent.

Di and Odeum health require a JSON object. HTTP 200 HTML (including an Access login page) cannot turn the connection green. Existing health failure flags still apply. Deployment acceptance requires actual target health from AWS plus the GLAB connector state, not just a configuration write.

Observed: AWS GLAB lacked both URLs; Di redirects Node fetch to Cloudflare Access HTML. Odeum relay bootstrap cloned main but setup failed due to unconfigured keys/build prerequisites. Runtime configuration belongs to Excubitor Vault; no secrets or fixed deployment URLs are stored here.

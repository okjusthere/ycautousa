# GitHub → Cloudflare automatic deployment

Cloudflare Workers Builds connects `okjusthere/ycautousa` to the existing
`yc-auto-web` Worker. Only pushes to `main` trigger production deployment;
non-production branch deployments are not configured. The root directory is `/`.

Node is pinned to `22.22.2` in `.node-version` and the build variable
`NODE_VERSION`. Dependencies are installed from the committed npm lockfile.

Build command:

```sh
npm run format:check && npm run lint && npm run typecheck && npm test && npm run preflight:deploy && CLOUDFLARE_ENV=production npm run build
```

Deploy command (runs only after the build command succeeds):

```sh
npm run deploy:ci
```

Formatting, lint, type, unit/integration test, preflight, or build failures stop
the pipeline before deployment. The existing production deployment stays live.
Playwright remains a separate local acceptance check (`npm run test:e2e`).

`deploy:ci` publishes the already-built Worker once, then runs
`scripts/verify-production.ts` against the fixed production URL,
`https://www.ycautousa.com`. The check validates bilingual pages and canonical
URLs, referenced same-origin JavaScript and CSS entry assets (status, MIME type,
and nonempty body; shared URLs are checked once), public JSON APIs, the sitemap and sample vehicle pages, robots.txt, legacy
About redirects, and unauthenticated admin protection. It only reads public
endpoints; it does not submit leads, send email, or edit inventory.

Each verification request has a 10-second timeout. A complete verification run
has a 90-second limit and can be retried twice, after 5 and 15 seconds, to allow
brief deployment propagation. These retries never republish the Worker. If all
three attempts fail, the deploy command exits nonzero so Workers Builds marks
the run failed and retains the check output. The newly deployed Worker is still
live: this is a post-deployment check, not an automatic rollback. Inspect the
failure and explicitly fix or roll back the deployment as described below.

Local `npm run deploy` performs preflight and the production build before using
the same `deploy:ci` publication and verification path. To run the read-only
checks separately, use
`APP_ORIGIN=https://www.ycautousa.com npm run verify:prod`.

The dedicated `yc-auto-web main builds` deployment token is stored only in
Cloudflare Builds, not GitHub or this repository. It has account-level Workers
Scripts Write and Account Settings Read permissions, explicitly authorized by
the owner. Cloudflare cannot restrict that publishing permission to one Worker.
Keep repository write access limited to trusted maintainers.

This pipeline does **not** seed inventory, run database migrations, change DNS,
or configure mail. Existing production secrets, D1, R2, and Access configuration
remain in place. Review and apply database migrations separately before code
that requires them is merged into `main`.

Build logs and deployment history are available under the Worker's Cloudflare
dashboard. For rollback, restore a known-good Worker version, then revert the
corresponding source change on `main` so a later push does not reintroduce it.
Rollback does not undo database or external configuration changes.

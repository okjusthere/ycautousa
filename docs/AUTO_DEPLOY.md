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
npx wrangler deploy --env production
```

Formatting, lint, type, unit/integration test, preflight, or build failures stop
the pipeline before deployment. The existing production deployment stays live.
Playwright remains a separate local acceptance check (`npm run test:e2e`).

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

# Cloudflare setup

These steps require a Cloudflare account with Workers, D1, R2, Images, Access, Turnstile, Email Service, and DNS permissions. Do not place secrets in `wrangler.jsonc` or git.

## 1. Authenticate and create resources

```bash
npx wrangler login
export CLOUDFLARE_ACCOUNT_ID="<account-id>"
npm run bootstrap:cloudflare -- --patch
npx wrangler d1 list
```

With `--patch`, the returned D1 `database_id` is safely substituted for both config placeholders. Without that flag, copy it manually. The preferred names are `yc-auto-web`, `yc-auto-prod`, and `yc-auto-vehicle-images`. The bootstrap script never deletes resources.

## 2. Configure variables and secrets

Set production values in the Worker environment (use `--env production` if you add an environment block):

```bash
npx wrangler secret put TURNSTILE_SECRET_KEY --env production
npx wrangler secret put IP_HASH_SALT --env production
```

Public variables to set: `APP_ORIGIN=https://www.ycautousa.com`, `CANONICAL_HOST=www.ycautousa.com`, `TURNSTILE_SITE_KEY`, `EMAIL_FROM`, `EMAIL_TO`, `ACCESS_TEAM_DOMAIN`, and `ACCESS_AUD_TAG`. `ACCESS_TEAM_DOMAIN` is the HTTPS Cloudflare Access team domain, such as `https://your-team.cloudflareaccess.com`; `ACCESS_AUD_TAG` is the Application Audience (AUD) tag for `yc-auto-admin`. `ADMIN_EMAILS` must be a comma-separated exact allowlist of one or two administrator emails. Use a random 32-byte salt for `IP_HASH_SALT`.

`ADMIN_EMAILS`, the Turnstile site key, `ACCESS_TEAM_DOMAIN`, and `ACCESS_AUD_TAG` are non-secret Worker variables; set them in the production `vars` block (or with the Cloudflare dashboard) after replacing the placeholders. `IP_HASH_SALT` is a secret and is intentionally absent from the production vars block.

## 3. Bind optional services

- Create a Turnstile widget for the production hostname and put its site key in `TURNSTILE_SITE_KEY`.
- Enable Cloudflare Images and add the `IMAGES` binding in the Worker dashboard/configuration. The app still serves original R2 bytes if Images is temporarily unavailable.
- Onboard and verify the sender domain in Cloudflare Email Service, then add the `EMAIL` send-email binding. Keep `EMAIL_TO` pointed to the lead recipient.
- Enable Cloudflare Web Analytics for the public hostname. It is aggregate traffic analytics; D1 conversion rows are intentionally minimal.

### Lead notification email

The production sender is `leads@ycautousa.com`, and the verified destination is `sophie@youxuancars.com`. The sender domain is onboarded under **Compute > Email Service > Email Sending**. Cloudflare manages the `cf-bounce` MX/SPF records, `cf-bounce._domainkey` DKIM record, and `_dmarc` record. Sending setup does not require moving the domain's incoming mailbox routing.

The production `send_email` binding in `wrangler.jsonc` is named `EMAIL`, restricted to Sophie as its `destination_address`, and restricted to `leads@ycautousa.com` in `allowed_sender_addresses`. Keep it inside `env.production`; email bindings are not inherited between environments. Set `EMAIL_FROM` to the sender and `EMAIL_TO` to the verified recipient. `EMAIL_TO` is authoritative and the notification field is read-only in Website Settings; changing recipients requires verifying the new address and updating both the binding and deployment variable.

New inquiries and notification jobs are saved atomically before background sending. A five-minute cron retries explicitly rejected rate-limit/quota attempts with bounded backoff; uncertain send results require mailbox review before an administrator confirms a resend. API acceptance produces `sent`, which does not confirm inbox delivery. Existing historical inquiries are not backfilled automatically, and customer acknowledgement emails are not enabled. Apply migration `0006_reliable_notifications.sql` before this Worker version. See [notification recovery](LEAD_NOTIFICATIONS.md) for states, limits, and operations.

Sending to an account's verified destination addresses is free and does not consume the outbound quota. Worker execution and storage still follow the account's existing plans. See [Cloudflare pricing](https://developers.cloudflare.com/email-service/platform/pricing/) and [send binding restrictions](https://developers.cloudflare.com/email-service/configuration/send-bindings/).

## 4. Access application

Create a self-hosted Access application named `yc-auto-admin` for:

```text
https://www.ycautousa.com/admin*
https://www.ycautousa.com/api/admin*
```

Use an Allow policy containing only the same exact administrator emails. Never use Everyone. Copy the application's AUD tag into `ACCESS_AUD_TAG` and the team domain into `ACCESS_TEAM_DOMAIN`. Access supplies `CF-Access-Jwt-Assertion`; the Worker fetches the pinned team's JWKS, verifies RS256, checks issuer/audience/time claims, and only then applies the email allowlist. The direct email header is used only for local development.

## 5. Deploy

```bash
npm run db:migrate:remote
CLOUDFLARE_ENV=production npm run build
npx wrangler deploy --env production
APP_ORIGIN=https://<preview-or-production-origin> npm run verify:prod
```

Bind the custom `www` hostname only after preview verification and the migration audit are approved. Preserve all existing MX, SPF, DKIM, DMARC, and other TXT records before changing DNS. Configure the apex hostname to redirect to `www` without disturbing mail records.

## Account actions still manual

Cloudflare account login, resource IDs, Access policy, Turnstile hostname/widget, Email Service sender-domain verification, Images binding, and DNS changes cannot be completed from this repository without account credentials. Record the completed IDs and date in `FINAL_STATUS.md` after setup.

# Deploying CECODES on Dokploy

For a Dokploy host. If you are deploying somewhere else, read
[DOCKER_DEPLOYMENT.md](./DOCKER_DEPLOYMENT.md) instead: it covers the same stack on a plain
server, and explains the reasoning this page only summarises.

The deployment uses [`docker-compose.dokploy.yml`](../docker-compose.dokploy.yml), not the
`docker-compose.yml` in the repo root. That is not a detail you can skip. The root file publishes
the app on port 3000, which is the port Dokploy's own interface listens on, and compose refuses to
start **any** service when one port binding fails. Pointing Dokploy at the wrong file does not give
you a slightly worse deployment; it gives you no deployment, with an error naming a port you never
chose.

## 1. Before you touch Dokploy

You need four things.

**A server running Dokploy.** Any size that builds a Next.js image: 2 vCPU and 4 GB of RAM is
comfortable, 2 GB is tight during the build.

**A hostname pointing at it.** An `A` record for the name you plan to use, for example
`huella.cecodes.org.co`, resolving to the server's IP. DNS must already work before you add the
domain in Dokploy, because Traefik asks Let's Encrypt for a certificate immediately and a name that
does not resolve gets refused.

**Access to the git repository** from the server, through Dokploy's GitHub app or a deploy key.

**A Resend API key and a verified sender domain**, if you want password reset to work. You can
deploy without one and add it later. Read section 6 first, because a deployment with no mail
configured fails in a way nobody notices.

## 2. Create the service

In your empty Dokploy project:

1. **Create Service, Compose.**
2. **Provider**: point it at this repository and the branch you deploy from (`main`).
3. **Compose Type**: **Docker Compose**. Not Docker Stack. Stack runs on Swarm and cannot build
   images, and this stack builds two of them from the `Dockerfile`, so it fails before it starts.
4. **Compose Path**: `./docker-compose.dokploy.yml`

## 3. Environment

Open the **Environment** tab and paste this, with your own values. Dokploy writes it to a `.env`
file next to the compose file, which is the file compose reads for `${...}` substitution, so
anything you set here replaces a default rather than adding to it.

```sh
# Required. The deployment stops with a message naming this variable if it is missing.
POSTGRES_PASSWORD=<a long random password>

# The public hostname, bare, no scheme. Must match the domain you add in step 4.
# Every emailed link is built from it, so a wrong value here sends people to the wrong site.
DOMAIN=huella.cecodes.org.co

# The first admin. Set this BEFORE the first deploy: the seed finds the admin by email, so
# changing it later creates a second admin rather than renaming the first.
ADMIN_EMAIL=you@yourdomain.org

# Mail. Leave these out and password reset is off (see section 6).
MAIL_TRANSPORT=resend
RESEND_API_KEY=<your resend key>
MAIL_FROM=CECODES <no-reply@yourdomain.org>
```

Do not set `ADMIN_PASSWORD`. With it unset, the seed generates a strong one and prints it once in
the init log, which is where you will read it in step 5. Set it only to choose the password
yourself, or later to recover an account nobody can get into.

Do not set `DATABASE_URL` either, unless you are pointing this at a Postgres that this stack is not
running. It defaults to the bundled `db` service and is built from `POSTGRES_PASSWORD`, so the two
cannot drift apart.

## 4. Domain

Open the **Domains** tab and add one:

- **Service Name**: `app`
- **Container Port**: `3000`
- **Host**: the same hostname you put in `DOMAIN`
- **HTTPS**: on, with Let's Encrypt

Dokploy injects the Traefik labels and finds the app on `dokploy-network`, which the compose file
already joins. `app` is the only service on that network: the database is on a private bridge and
is not reachable from outside the stack at all.

## 5. Deploy, and get the admin password

Hit **Deploy**.

**The first deployment is slow**, and that is expected rather than a hang. Besides building the
image, the init job imports the whole emission-factor library from the workbook in
`docs/reference`: about 1700 factors and 18 grid factors. Later deployments find the library
populated and skip it. If Dokploy's deployment timeout is short, raise it for this first run.

When it finishes, open **Logs**, select the **init** service, and find this near the end:

```
   ADMIN ACCOUNT CREATED
   email:    you@yourdomain.org
   password: ....
```

**Copy it now.** It is printed once, on the run that creates the row, and never again. Log in at
`https://<your domain>/login` and change it.

The same log is the whole initialization story in order: which migrations applied, what the seed
did, and every factor the import created, updated or skipped. It is the first place to look if
anything is wrong.

## 6. Mail, and the failure you will not notice

If you did not set `MAIL_TRANSPORT`, mail is off. That is deliberate: the alternative default
points at a Mailpit container that this file does not run, and a transport pointing at nothing is
worse than no transport.

Mail being off does not break the site and does not show an error anywhere. The app serves every
page normally. A password reset simply does nothing: the request is refused before a token is
written, and the person locked out of their account never receives the mail and never sees a
failure. Nobody reports this, which is why it is worth checking on purpose.

Nothing in the mail configuration can stop the app, by design. A wrong key or a missing
`MAIL_FROM` is reported in a banner at the top of the **app** service's log at boot, and the site
keeps serving. So read that banner after any change to these variables, then send yourself a real
password reset and confirm the link arrives and points at your domain.

## 7. Redeploying

Push to the deployed branch and hit **Deploy**, or turn on auto deploy.

The database volume (`pgdata`) survives redeployments. The init job re-runs every time and is
forward-only and idempotent: it applies pending migrations, leaves existing data alone, and never
drops, truncates or resets anything. The app does not start until init exits 0, so a failed
migration means the previous version keeps serving rather than a new one serving against a
half-migrated schema.

Two things to know:

**Do not raise the app's replica count.** The factor-library cache is per process. With a second
replica, an admin editing a factor invalidates only the replica that served the edit, and the
others keep serving stale factors until the entry expires. The comment in the compose file says
the same thing next to the setting.

**Back up the volume.** Losing `pgdata` loses every company, entry and result. Dokploy can schedule
a Postgres backup to S3-compatible storage; set one up before the client puts real data in. A
deployment nobody can restore is not deployed.

## 8. When something is wrong

**The stack will not start, and the error names a port.** You pointed Dokploy at
`docker-compose.yml` instead of `docker-compose.dokploy.yml`. Fix the Compose Path.

**`network dokploy-network declared as external, but could not be found`.** That network is created
by Dokploy when it installs itself. If it is missing, the Dokploy installation is incomplete;
`docker network create dokploy-network` is the workaround, but check the installation.

**The domain serves a Traefik 404.** Traefik cannot see the app. Check that the Domains entry names
service `app` and port `3000`, and that the app container actually started (Logs, service `app`).

**The app never becomes healthy.** Its healthcheck hits `/api/health/ready`, which runs a real
query through Prisma, so an unhealthy app usually means the database, not the app. Read the `db`
and `init` logs in that order.

**Password reset does nothing.** Section 6.

## What was and was not verified

The compose file in this repository was built and run end to end on a Docker host before this page
was written: the image builds, the database comes up healthy, init applies every migration and
imports 1721 factors and 18 grid factors, the admin account is created and its password printed,
and the app answers `200` on both `/api/health/ready` and `/login` when reached over
`dokploy-network` the way Traefik reaches it. No host port is published by any service.

What has not been exercised is Dokploy itself: its UI, its Traefik label injection, and Let's
Encrypt issuance. Those steps are written from Dokploy's documentation, not from a run. Expect the
tab names to be right and the field names to be close.

# Deploying padlok-api to EC2 t3.micro

This is the runbook for the production deploy of padlok-api on AWS EC2.
Stack: **EC2 t3.micro (Ubuntu 24.04) → nginx → Node 20 + PM2 → Supabase + Upstash**.

> Why EC2 over App Runner / Render? `t3.micro` is in the AWS free tier
> (750h/month for 12 months) so the first year is **$0**. After that
> swap to a `t4g.small` (~$12/mo) if traffic grows, or migrate to App
> Runner if you want zero-server-management.

---

## 1. Prereqs (one-time)

- AWS account with billing alarm at $5 (avoid surprises after free tier).
- A domain you control (`padlokit.com`) with DNS access.
- An [Upstash](https://upstash.com) account (free tier — for Redis).

## 2. Provision Upstash Redis (~2 min)

1. Sign up at upstash.com.
2. **Create database** → Type: Regional, Region: `eu-west-1` (closest to eu-north-1).
3. Copy the `UPSTASH_REDIS_URL` (the `rediss://` one — NOT the REST URL).
4. Stash it; you'll paste it into `.env` later.

## 3. Launch the EC2 instance (~5 min)

In the AWS console (region: **Stockholm — eu-north-1**, same as Amplify):

1. **EC2 → Launch instance**
   - Name: `padlok-api`
   - AMI: **Ubuntu Server 24.04 LTS** (free-tier eligible)
   - Instance type: `t3.micro`
   - Key pair: create new → `padlok-api-key` → download the `.pem` (you'll need it to SSH)
   - Network settings → **Edit**:
     - Allow SSH from **My IP** (not anywhere)
     - Allow HTTPS from anywhere
     - Allow HTTP from anywhere (needed for Let's Encrypt validation)
   - Storage: 30 GB gp3 (free tier ceiling)
   - Launch.
2. **Allocate Elastic IP** (so the IP doesn't change on stop/start):
   - EC2 → Elastic IPs → Allocate → Associate to the instance.
   - Note this IP — DNS points here.
3. SSH check from your laptop:
   ```bash
   chmod 400 ~/Downloads/padlok-api-key.pem
   ssh -i ~/Downloads/padlok-api-key.pem ubuntu@<ELASTIC-IP>
   ```

## 4. Bootstrap the box (~10 min)

Once SSH'd in, paste this entire block:

```bash
# System updates + build deps
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git build-essential nginx

# Node 20 (NodeSource APT repo — easiest reliable path)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v && npm -v   # 20.x and 10.x

# PM2 globally
sudo npm install -g pm2

# Certbot for Let's Encrypt
sudo apt install -y certbot python3-certbot-nginx
```

## 5. Deploy the app (~5 min)

```bash
cd /home/ubuntu
git clone https://github.com/Padlok-Official/padlok-api.git
cd padlok-api
npm ci

# Wire env (paste from your local .env.production, edited per template)
cp deploy/.env.production.example .env
nano .env   # fill in REDIS_URL, JWT_SECRET, double-check the rest

# Build + migrate + start
npm run build
npm run migrate
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup systemd     # copy the printed sudo line and run it

# Sanity check
curl http://localhost:4000/health
```

`/health` should return `{"status":"ok",...}`.

## 6. nginx + DNS + SSL (~10 min)

### 6a. Install the nginx config

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/padlok-api
sudo ln -s /etc/nginx/sites-available/padlok-api /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

### 6b. Point DNS

Wherever `padlokit.com` lives (Route 53 / Namecheap / etc.):

| Record | Type | Value |
|---|---|---|
| `api.padlokit.com` | A | `<EC2 Elastic IP>` |

Wait for DNS propagation (~1–5 min usually):

```bash
dig +short api.padlokit.com   # should return your Elastic IP
```

### 6c. Get the SSL cert

```bash
sudo certbot --nginx -d api.padlokit.com --non-interactive --agree-tos -m you@padlokit.com --redirect
```

Certbot rewrites `nginx.conf` to add the SSL block + the 80→443 redirect.
Renewal is auto via the systemd timer it installs.

```bash
curl https://api.padlokit.com/health
```

## 7. Update the dashboard

In the **Amplify console** (eu-north-1):

1. App `padLokdashboard` → **Hosting → Environment variables**.
2. Set:
   - `VITE_API_URL` = `https://api.padlokit.com/api/v1`
   - `VITE_SOCKET_URL` = `https://api.padlokit.com`
3. Hosting → **Redeploy this version** (or push any commit to retrigger).

## 8. Smoke test

- Open `https://admin.padlokit.com` in incognito.
- Log in with `admin@padlok.com` / your seeded password.
- Check the BI Overview live counters.
- Check the network tab: every request goes to `https://api.padlokit.com/api/v1/...` with `200`s.

---

## Routine operations

### Deploy a new version

From your laptop, push to `main`. On the server:

```bash
ssh ubuntu@<elastic-ip>
cd ~/padlok-api
git pull
npm ci
npm run build
npm run migrate    # only if there are new migrations
pm2 reload padlok-api
```

For zero-touch deploys later, set up a GitHub Action that SSHes via a deploy key. Out of scope for v1.

### View logs

```bash
pm2 logs padlok-api
pm2 logs padlok-api --lines 200
```

### Box ran out of disk

```bash
sudo journalctl --vacuum-time=7d
pm2 flush             # clears PM2 logs
```

### Rotate JWT secret

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
nano .env             # paste as JWT_SECRET=...
pm2 restart padlok-api
```
All existing access tokens become invalid — admins re-login. Refresh tokens are stored hashed in DB so they survive (will validate against the new secret on next refresh and re-sign).

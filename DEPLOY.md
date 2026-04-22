# Deploying gantryanalytics.com

Everything you need is already in this folder. Two steps: push the files to GitHub Pages, then point GoDaddy DNS at GitHub.

---

## 1. Push to GitHub Pages

### Option A — use an existing repo (recommended if you already have `projectvelocity` on GitHub)

From Terminal, inside this `Website` folder:

```bash
cd "/Users/craigbecher/Documents/Claude/Projects/Project Velocity/Website"
git init -b main
git remote add origin https://github.com/<your-username>/<repo-name>.git
git add .
git commit -m "Initial gantryanalytics.com site"
git push -u origin main
```

Then on GitHub:

1. Go to **Settings → Pages**.
2. Under **Source**, choose **Deploy from a branch**.
3. Branch: `main`, folder: `/ (root)`. Save.
4. Add a file named `CNAME` containing just `gantryanalytics.com` (or create it in GitHub directly under **Add file → Create new file**). This tells GitHub Pages which custom domain to serve.
5. Back on the Pages screen, add the custom domain `gantryanalytics.com` and check **Enforce HTTPS** once the cert provisions (usually 10–30 minutes).

### Option B — create a new dedicated repo

Same steps above, just make a new public repo called `gantryanalytics` first, then push.

---

## 2. Point GoDaddy DNS at GitHub Pages

Log in to GoDaddy → **My Products → DNS → Manage DNS for gantryanalytics.com**.

Delete the default parking records for `@` and `www`, then add:

| Type  | Name | Value             | TTL  |
|-------|------|-------------------|------|
| A     | @    | 185.199.108.153   | 600  |
| A     | @    | 185.199.109.153   | 600  |
| A     | @    | 185.199.110.153   | 600  |
| A     | @    | 185.199.111.153   | 600  |
| CNAME | www  | `<your-username>.github.io` | 600 |

Those four A records are GitHub's fixed Pages IPs. The `www` CNAME points `www.gantryanalytics.com` at GitHub.

Save. DNS propagates in minutes to a couple hours.

---

## 3. Verify

Once DNS propagates:

- `https://gantryanalytics.com/` → landing page
- `https://gantryanalytics.com/demo/` → the live interactive demo

If GitHub Pages reports the custom domain as unverified, follow the verification instructions in Settings → Pages (it adds a TXT record to confirm domain ownership).

---

## What's in this folder

```
Website/
├── index.html                 Landing page
├── style.css                  Styles (Montserrat + presentation palette)
├── walkthrough.mp4            Demo walkthrough recording (autoplay, loop, muted)
├── walkthrough.webm           Same video, alternate codec
├── walkthrough-poster.jpg     Poster frame shown before video loads
├── demo/                      Full interactive demo site (linked from landing page)
└── DEPLOY.md                  This file
```

The landing page hero, stats, what-we-do, who-it's-for, and demo sections all pull from the presentation you've been building. Update copy directly in `index.html` — there's no build step, it's just HTML/CSS.

To re-record the walkthrough after you update the demo, re-run the Playwright recording flow from our working folder (or ask me to regenerate it).

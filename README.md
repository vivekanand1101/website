# anandvivek.in

Personal website hosted at [anandvivek.in](https://anandvivek.in) via **Cloudflare Pages**.

This repo holds the production build only. The source lives in
[`vivekanand1101/portfolio`](https://github.com/vivekanand1101/portfolio)
(React, TypeScript, Vite).

## Structure

```
index.html   – Built page (references the current bundle in assets/)
assets/      – Hashed JS/CSS bundles; older ones are kept for cached clients
images/      – Site images
llms.txt     – Site guide for AI tools
```

## Publishing

1. In the portfolio repo, run `npm run build`.
2. Copy `dist/index.html`, `dist/llms.txt` and any new files from `dist/assets/` into this repo.
3. Commit and push to `main`. Cloudflare Pages deploys automatically.

## Hosting

Deployed via **Cloudflare Pages** connected to this GitHub repo. No build
command is needed; the files are served as they are.

### Domain Setup

DNS is managed on Cloudflare. Subdomains:

| Subdomain              | Hosted On        | Type                              |
|------------------------|------------------|-----------------------------------|
| anandvivek.in          | Cloudflare Pages | Personal site (this repo)         |
| writings.anandvivek.in | Cloudflare Pages | Hugo blog (`vivekanand1101/blog`) |
| readings.anandvivek.in | Cloudflare Pages | Reading list                      |
| jewel.anandvivek.in    | Oracle Cloud     | ERP (backend)                     |

## Local Preview

```bash
python3 -m http.server 8000
# visit http://localhost:8000
```

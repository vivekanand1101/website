# anandvivek.in

Personal website hosted at [anandvivek.in](https://anandvivek.in) via **Cloudflare Pages**.

## Structure

```
index.html   – Main page
style.css    – Styles
script.js    – Minimal JS (scroll animations)
```

## Hosting

Deployed via **Cloudflare Pages** connected to this GitHub repo.

### Domain Setup

DNS is managed on Cloudflare. Subdomains:

| Subdomain              | Hosted On        | Type             |
|------------------------|------------------|------------------|
| anandvivek.in          | Cloudflare Pages | Static site      |
| blog.anandvivek.in     | Cloudflare Pages | Static blog (MD) |
| jewel.anandvivek.in    | Oracle Cloud     | ERP (backend)    |

### Cloudflare Pages Setup

1. Go to Cloudflare Dashboard → Pages → Create a project
2. Connect this GitHub repo (`vivekanand1101/website`)
3. Build settings: leave blank (plain static site, no build step)
4. Add custom domain: `anandvivek.in`

## Local Development

```bash
python3 -m http.server 8000
# visit http://localhost:8000
```

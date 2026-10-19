# AGENTS.md

## Project Overview

Personal website for Vivek Anand, hosted at **anandvivek.in** via Cloudflare Pages.

This repo is the deploy target only: it holds the production build of the
React + TypeScript + Vite app in `/Users/vivekanand/portfolio`
(`git@github.com:vivekanand1101/portfolio.git`). Make content and code changes
there, never in the built files here.

## Repository

- **Repo**: `git@github.com:vivekanand1101/website.git`
- **Branch**: `main`
- **Deploy**: Pushes to `main` trigger automatic Cloudflare Pages deploys.
- **Local preview**: `python3 -m http.server 8080` from project root.

## Publishing a change

1. Edit the source in the portfolio repo and run `npm run build` there.
2. Copy `dist/index.html`, `dist/llms.txt` and new files from `dist/assets/` here.
   Keep older bundles in `assets/` so cached pages still load.
3. Do not copy `robots.txt`, `favicon.ico` or `placeholder.svg`; they have never been published.
4. Commit and push to `main`.

## File Structure

```
.
├── index.html          # Built page
├── assets/             # Hashed JS/CSS bundles
├── images/             # Site images
├── llms.txt            # Site guide for AI tools
├── favicon*.svg
├── AGENTS.md           # This file
└── README.md
```

`style.css` and `script.js` are left over from the earlier hand-written site
and are not used by `index.html`.

### Page sections (from the portfolio source)

1. **Navigation** - Experience, Reading, Writing, Contact
2. **Hero** - Personal intro, cricket, table tennis, portrait
3. **Experience** - Virtual Internships, Barq, Innovaccer, PaySense, Ethereal Machines, Pagure
4. **Technical practice** - Skills by category
5. **Education**
6. **Contact**
7. **Footer**

## Related Projects

- **Portfolio source**: `/Users/vivekanand/portfolio`
- **Blog**: `/Users/vivekanand/projects/blog` (Hugo, writings.anandvivek.in)
  - Theme: Paper
  - 10 published WordPress posts with `originalUrl` front matter
  - Has Playwright test suite
- **Reading list**: readings.anandvivek.in

## Content Guidelines

- No em dashes. Ever. Vivek considers them an AI tell.
- Keep copy natural and human. Humor is welcome.
- Cricket references are always appropriate.
- Work projects (especially Barq) are the highlight, not side projects.
- Side projects that are incomplete should not be mentioned.
- Do not publish the resume PDF.

## Deployment Notes

- Cloudflare Pages auto-deploys on push to `main`
- No build command needed (static files served directly)
- Cloudflare can aggressively cache CSS/JS. Users may need hard refresh or incognito to see updates.
- DNS: Cloudflare manages all `anandvivek.in` subdomains. Do NOT touch `jewel.anandvivek.in` (Oracle Cloud).

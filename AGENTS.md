# AGENTS.md

## Project Overview

Personal website for Vivek Anand, hosted at **anandvivek.in** via Cloudflare Pages.
One repository and one build serve every section:

| Path | Section | Source |
|---|---|---|
| `/` | About (home page) | React + TypeScript + Vite (`src/`, `public/`) |
| `/writing/` | Writing | Hugo (`writings/`) |
| `/reading/` | Reading | Python standard library (`readings/`) |

`shared/site.css` holds the palette, type, header and footer for all three. The header
markup lives in `src/components/Navigation.tsx`, `writings/layouts/partials/header.html`
and `readings/template.html`; change all three together.

## Repository

- **Repo**: `git@github.com:vivekanand1101/website.git`
- **Branch**: `main`
- **Build**: `npm run build` (needs Node, Hugo extended, Python 3) writes the whole site to `dist/`.
- **Deploy**: Pushes to `main` trigger a Cloudflare Pages build (`npm run build`, output `dist`,
  `HUGO_VERSION=0.158.0`).
- **Local preview**: `npm run build && npx vite preview`, then visit http://localhost:4173.
- **Tests**: `npm test` runs the writing Playwright suite against the preview server.

## Sections

### Home page (`src/components/`)

1. **Navigation** - Vivek Anand, Writing, Reading, About
2. **Hero** - One short intro with no visible heading: product engineer (backend roots, works across the product lifecycle, Barq and Virtual Internships), cricket then table tennis, remote for now; contact lives in the footer only; portrait
3. **Footer**

### Writing (`writings/`)

- 10 published WordPress posts with `originalUrl` front matter; the rest are drafts.
- New post: `hugo new content posts/my-new-post/index.md -s writings`.

### Reading (`readings/`)

- A daily Claude routine follows `readings/ROUTINE.md` and commits `readings/data/posts.json`.
- `readings/CRITERIA.md` decides which company-blog posts are kept.

## Content Guidelines

- No em dashes. Ever. Vivek considers them an AI tell.
- Keep copy natural and human. Humor is welcome.
- Cricket references are always appropriate.
- Don't oversell: no trophies or "surprisingly good" claims, and don't say Vivek writes a lot.
- Cricket is a childhood thing played for real, not a video game; leave out the first-computer and Road Rash story.
- Write like a person talks. No stock phrases like "if you'd like to talk about backend systems, engineering leadership, or working together".
- Work projects (especially Barq) are the highlight, not side projects.
- Side projects that are incomplete should not be mentioned.
- Do not publish the resume PDF.

## Deployment Notes

- Cloudflare can aggressively cache CSS/JS. Users may need hard refresh or incognito to see updates.
- DNS: Cloudflare manages all `anandvivek.in` subdomains. Do NOT touch `jewel.anandvivek.in` (Oracle Cloud).

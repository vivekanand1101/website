# anandvivek.in

Source for https://anandvivek.in: one repository, one Cloudflare Pages build, one theme.

| Path | Section | Built with |
|---|---|---|
| `/` | About (home page) | React, TypeScript and Vite (`src/`, `public/`) |
| `/writing/` | Writing | [Hugo](https://gohugo.io/) (`writings/`) |
| `/reading/` | Reading | Python standard library (`readings/`, see its README) |

`shared/site.css` holds the palette, type, header and footer every section uses. The header
markup is repeated in three places; keep them in step when the nav changes:
`src/components/Navigation.tsx`, `writings/layouts/partials/header.html`, `readings/template.html`.
Root `public/` holds the favicon and portrait used by every section.

## Development

```bash
npm ci
npm run dev      # home page only, http://localhost:8080
npm run build    # whole site into dist/
npx vite preview # serve dist/, including /writing/ and /reading/
```

`npm run build` needs Node, Hugo (extended) and Python 3.

### Writing a new post

```bash
hugo new content posts/my-new-post/index.md -s writings
```

Edit the generated file, set `draft: false` when ready, then push. `hugo server -s writings`
previews just the writing section (the shared portrait and favicon live at the site root, so
they only show in a full build).

## Cloudflare Pages build settings

| Field | Value |
|---|---|
| Build command | `npm run build` |
| Build output directory | `dist` |
| Environment variable | `HUGO_VERSION` = `0.158.0` |

## Attribution

The writing section's initial code was stolen from [Armin Ronacher’s blog](https://lucumr.pocoo.org/) and then modified by AI.

## Slops

`slops/projects.json` holds the short project descriptions for `/slops/`. The index uses `shared/site.css` and is built by `slops/build.py`. The full-quality game is in `public/slops/kerai-race/`; numeric data uses lossless gzip chunks below the Pages asset limit. Its build source and visual regression evidence remain in the Kerai Race project.

The published game is solo-only and runs entirely in the browser. There is no game Worker, Pages Function, Durable Object binding, or multiplayer backend.

The speedometer, touch controls and viewport layouts are maintained in `slops/kerai-race/`. `slops/build-game.py` writes their fingerprinted assets into the deployment output. The heavy scene assets remain in `public/slops/kerai-race/assets/`.

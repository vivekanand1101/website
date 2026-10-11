# AGENTS.md

## Project Overview

Personal website for Vivek Anand, hosted at **anandvivek.in** via Cloudflare Pages.

Static site: HTML + CSS + JS. No frameworks, no build step, no backend.

## Repository

- **Repo**: `git@github.com:vivekanand1101/website.git`
- **Branch**: `main`
- **Deploy**: Pushes to `main` trigger automatic Cloudflare Pages build.
- **Local preview**: `python3 -m http.server 8080` from project root.

## File Structure

```
.
├── index.html          # Single-page site with all sections
├── style.css           # All styles, CSS custom properties for theming
├── script.js           # Boot sequence, carousel, scroll animations
├── favicon.svg         # Green "VA" monospace on dark bg
├── KNOWLEDGE_BASE.md   # Personal details about Vivek (read this first)
├── AGENTS.md           # This file
└── README.md
```

## Design System

### Theme: Bihar fields meet terminal green

- **Dark earthy palette**: backgrounds in `#0c0f0a` range, green accents (`#8db560`), terracotta for highlights (`#c0785a`)
- **Fonts**: JetBrains Mono (terminal/code), DM Serif Display (headings), Inter (body)
- **Terminal aesthetic**: hero card styled as a macOS terminal window, YAML config card, boot sequence animation
- **Rural Bihar elements**: paddy field SVG landscape in hero, rolling cricket ball animation
- **No em dashes anywhere in visible content**

### CSS Custom Properties (defined in `:root`)

Key tokens: `--bg`, `--surface`, `--text`, `--text-muted`, `--green`, `--terracotta`, `--gold`, `--paddy`, `--font-mono`, `--font-display`, `--font-body`

### Sections

1. **Boot Sequence** - Terminal-style loading animation (skipped on revisit via sessionStorage)
2. **Hero** - Terminal card with `whoami`, paddy field SVG, cricket ball, three CTA buttons
3. **About** (01) - Personal story + YAML config card sidebar
4. **Work** (02) - Professional projects (Barq focus, Innovaccer, GSoC/Pagure, PaySense)
5. **Journey** (03) - Timeline from Kerai to present
6. **Testimonials** (04) - 7 LinkedIn recommendations in a rotating carousel
7. **Contact** (05) - Email + social links
8. **Footer**

### Testimonial Carousel

- Container: `.testimonial-carousel` > `.testimonial-viewport` (overflow hidden) > `.testimonial-track` (flex, translateX)
- Cards: `.testimonial-card` > `.testimonial-inner`
- Controls: `.carousel-controls` with prev/next buttons and dot indicators
- Auto-rotates every 6 seconds, pauses on hover, supports touch swipe
- JS manages state in `script.js`

## Related Projects

- **Blog**: `/Users/vivekanand/projects/blog` (Hugo, blog.anandvivek.in)
  - Theme: Paper
  - 22 migrated WordPress posts with `originalUrl` front matter
  - Has Playwright test suite (144 tests)

## Content Guidelines

- Read `KNOWLEDGE_BASE.md` before making content changes
- No em dashes. Ever. Vivek considers them an AI tell.
- Keep copy natural and human. Humor is welcome.
- Cricket references are always appropriate.
- Work projects (especially Barq) are the highlight, not side projects.
- Side projects that are incomplete should not be mentioned.

## Testing

No formal test suite for the website yet. For visual checks:

```bash
# Start local server
python3 -m http.server 8080

# Playwright screenshots (run from blog dir which has playwright installed)
cd /Users/vivekanand/projects/blog
node -e "
const { chromium } = require(require('path').join(process.cwd(), 'node_modules', '@playwright/test'));
(async () => {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto('http://localhost:8080', { waitUntil: 'networkidle' });
    await page.evaluate(() => sessionStorage.setItem('booted', '1'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await page.screenshot({ path: '/tmp/ss-website.png', fullPage: true });
    await browser.close();
})();
"
```

## Deployment Notes

- Cloudflare Pages auto-deploys on push to `main`
- No build command needed (static files served directly)
- Cloudflare can aggressively cache CSS/JS. Users may need hard refresh or incognito to see updates.
- DNS: Cloudflare manages all `anandvivek.in` subdomains. Do NOT touch `jewel.anandvivek.in` (Oracle Cloud).

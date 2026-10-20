const { test, expect } = require('@playwright/test');

// Run against a full build: npm run build && npx vite preview
const BASE = process.env.BASE || 'http://localhost:4173/writings';

// Published posts only; drafts (draft: true) are not built.
const ALL_POSTS = [
  '2016-08-10-access-levels-of-user-or-group-in-a-pagure-project',
  '2016-08-13-pkgs-fedoraproject-org-on-a-pagure-instance',
  '2016-08-16-users-project-watch-list-on-pagure',
  '2016-08-29-gsoc-wrap-up',
  '2017-09-05-star-a-project-on-pagure',
  '2017-09-09-realtime-events-using-tornado-and-rabbitmq',
  '2017-10-15-token-based-websocket-authentication',
  '2018-01-03-detecting-usb-insertion-removal-using-python',
  '2018-11-25-running-unique-tasks-in-celery',
  '2018-12-18-djangos-transaction-on_commit',
];

// Posts that must have code blocks (have ``` fences in markdown source)
const POSTS_WITH_CODE = [
  '2017-09-09-realtime-events-using-tornado-and-rabbitmq',
  '2017-10-15-token-based-websocket-authentication',
  '2018-01-03-detecting-usb-insertion-removal-using-python',
  '2018-11-25-running-unique-tasks-in-celery',
];

// Posts that must have images
const POSTS_WITH_IMAGES = [
  '2016-08-16-users-project-watch-list-on-pagure',
  '2017-09-05-star-a-project-on-pagure',
  '2017-10-15-token-based-websocket-authentication',
];

test.describe('Homepage', () => {
  test('loads and lists posts', async ({ page }) => {
    await page.goto(`${BASE}/`);
    await expect(page).toHaveTitle(/Vivek/);
    const links = page.locator('a[href*="/posts/"]');
    expect(await links.count()).toBeGreaterThanOrEqual(5);
  });

  test('all published posts are reachable', async ({ page }) => {
    for (const slug of ALL_POSTS) {
      const res = await page.goto(`${BASE}/posts/${slug}/`);
      expect(res.status(), `${slug} should return 200`).toBe(200);
    }
  });
});

test.describe('No broken WordPress shortcodes', () => {
  for (const slug of ALL_POSTS) {
    test(`${slug} has no [code] or [sourcecode] shortcodes`, async ({ page }) => {
      await page.goto(`${BASE}/posts/${slug}/`);
      const body = await page.locator('article').innerHTML();
      expect(body).not.toContain('[code');
      expect(body).not.toContain('[/code]');
      expect(body).not.toContain('[sourcecode');
      expect(body).not.toContain('[/sourcecode]');
    });
  }
});

test.describe('No raw markdown fences in rendered HTML', () => {
  for (const slug of ALL_POSTS) {
    test(`${slug} has no raw backtick fences`, async ({ page }) => {
      await page.goto(`${BASE}/posts/${slug}/`);
      const text = await page.locator('article').textContent();
      expect(text).not.toContain('```');
    });
  }
});

test.describe('No escaped underscores in rendered text', () => {
  for (const slug of ALL_POSTS) {
    test(`${slug} has no literal backslash-underscore`, async ({ page }) => {
      await page.goto(`${BASE}/posts/${slug}/`);
      const text = await page.locator('article').textContent();
      expect(text).not.toContain('\\_');
    });
  }
});

test.describe('No WordPress image URLs or in-content WordPress links', () => {
  for (const slug of ALL_POSTS) {
    test(`${slug} has no WordPress images or body links`, async ({ page }) => {
      await page.goto(`${BASE}/posts/${slug}/`);
      const imgs = page.locator('img[src*="wordpress.com"]');
      expect(await imgs.count(), `${slug} should not have WordPress image URLs`).toBe(0);
      // Links to vivekanandxyz.wordpress.com should only exist in the "Originally published" line, not in article body
      const bodyLinks = page.locator('section a[href*="vivekanandxyz.wordpress.com"]');
      expect(await bodyLinks.count(), `${slug} should not have WordPress links in body content`).toBe(0);
    });
  }
});

test.describe('Code blocks render properly', () => {
  for (const slug of POSTS_WITH_CODE) {
    test(`${slug} has rendered code blocks`, async ({ page }) => {
      await page.goto(`${BASE}/posts/${slug}/`);
      const codeBlocks = page.locator('article pre code, article .highlight pre');
      expect(await codeBlocks.count(), `${slug} should have at least one code block`).toBeGreaterThanOrEqual(1);
    });
  }
});

test.describe('Images render properly', () => {
  for (const slug of POSTS_WITH_IMAGES) {
    test(`${slug} has working images (no broken src)`, async ({ page }) => {
      await page.goto(`${BASE}/posts/${slug}/`);
      const images = page.locator('article img');
      const count = await images.count();
      expect(count, `${slug} should have at least one image`).toBeGreaterThanOrEqual(1);
      for (let i = 0; i < count; i++) {
        const src = await images.nth(i).getAttribute('src');
        expect(src, `image src should not be empty`).toBeTruthy();
        expect(src).not.toContain('wordpress.com');
      }
    });
  }
});

test.describe('Original WordPress link shown on migrated posts', () => {
  for (const slug of ALL_POSTS) {
    test(`${slug} has "Originally published on WordPress" link`, async ({ page }) => {
      await page.goto(`${BASE}/posts/${slug}/`);
      const link = page.locator('a[href*="vivekanandxyz.wordpress.com"]');
      expect(await link.count()).toBe(1);
      const href = await link.getAttribute('href');
      expect(href).toContain(slug.replace(/^\d{4}-\d{2}-\d{2}-/, ''));
    });
  }
});

test.describe('Post content is not empty', () => {
  for (const slug of ALL_POSTS) {
    test(`${slug} has meaningful content`, async ({ page }) => {
      await page.goto(`${BASE}/posts/${slug}/`);
      const text = await page.locator('article').textContent();
      expect(text.length, `${slug} should have substantial content`).toBeGreaterThan(100);
    });
  }
});

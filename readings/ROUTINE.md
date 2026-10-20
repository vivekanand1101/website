# Daily routine

Instructions for the scheduled Claude run that updates anandvivek.in/readings/.
Run every command from the repository root; all paths below are under `readings/`.

1. `python3 readings/build.py fetch` — pulls every feed and writes `readings/data/pending.json`,
   the posts that have no verdict yet. If it lists 0 posts, stop: nothing to do.
2. Read `readings/CRITERIA.md`, then judge every post in `readings/data/pending.json` from its title and
   summary. When the title and summary aren't enough to decide, open the post URL and skim it.
   Posts with `"always_shown": true` come from full-feed blogs and are always kept: set
   `relevant` to true and only choose which topics fit (often none).
3. Write `readings/data/verdicts.json` as one object keyed by post URL:
   `{"<url>": {"relevant": true, "topics": ["ai"], "reason": "One short sentence."}}`
   `topics` uses only `ai`, `backend`, `databases`, and is `[]` when none fit.
   Every URL from `readings/data/pending.json` must have an entry.
4. `python3 readings/build.py apply readings/data/verdicts.json`, then delete `readings/data/verdicts.json`.
5. Commit `readings/data/posts.json` with the message `Update posts YYYY-MM-DD` and push to `main`.
   The push triggers a Cloudflare Pages build, which publishes the site.

Do not change any other file.

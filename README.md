# StreamGarden — website

The download page for [StreamGarden](https://github.com/Obitouchiha002/streamgarden), an
Android video & audio downloader. Live at **https://streamgd.vercel.app**.

Plain static HTML, CSS and a little JavaScript — no build step, no framework. Deployed on
Vercel.

```
index.html          the whole page (desktop scrolls; mobile is an app shell)
styles.css          design tokens + both layouts
script.js           panel switching, download card, hero animation
shots/              real screenshots taken from the app
StreamGarden.apk    the release users download
vercel.json         serves the APK with the right content type
```

## Running it locally

```bash
python3 -m http.server 4000
# then open http://localhost:4000
```

## Shipping a new app version

1. Drop the new `StreamGarden.apk` in place of the old one.
2. Update the version in `index.html` — it appears in three places: the hero meta row, the
   download card's stats, and the footer's legal line. Update the size too if it changed.
3. Commit and push. Vercel redeploys from GitHub on its own; `vercel deploy --prod` also
   works once the folder is linked (below).

## Deploying by hand

The project lives under the **obitouchiha002** account, not a team. If `vercel` is logged
into a different account the deploy silently creates a *second* project instead of updating
this one, and `streamgd.vercel.app` keeps serving the old build.

```bash
npx vercel whoami          # must print obitouchiha002
npx vercel link --yes --scope obitouchiha002s-projects --project streamgarden
npx vercel deploy --prod --yes
```

If `whoami` prints anything else, run `npx vercel logout` then `npx vercel login` and pick
the right account. `.vercel/` and `.env.local` hold the link and a short-lived token — both
are gitignored and must stay that way.

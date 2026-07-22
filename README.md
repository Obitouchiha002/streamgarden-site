# StreamGarden — website

The download page for [StreamGarden](https://github.com/Obitouchiha002/streamgarden), an
Android video & audio downloader.

Plain static HTML, CSS and a little JavaScript — no build step, no framework. Deployed on
Vercel.

```
index.html          the whole page
styles.css          design tokens + layout
script.js           scroll reveals + the hero download animation
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
2. Update the version and size — they appear in `index.html` in the hero meta row, the
   download band, and the button label.
3. Commit and push; Vercel redeploys on its own.

# Recipebook

A dinner idea catalog and recipe builder. Installable on your phone and computer, works offline.

- **1,000 starter dinners**: about 650 American (Southern, Cajun & Creole, Tex-Mex, BBQ, Midwest, New England, Italian-American and more), 350 international, and about 100 substantial sides. No breads or desserts; those get their own sections later.
- **Find dishes** by name or ingredient, cuisine, protein, dish type, total time, difficulty and cooking method, or use **What's in my fridge** to rank dishes by how few extra ingredients they need.
- **Versions and cook log**: every edit saves a new version (v1, v2, …). Log each time you cook it (rating, notes, photo), compare any two versions, and star the winner as **Final**.
- **Compare & build**: put your recipe next to others from the web, a pasted recipe, or other dishes. All columns are scaled to the same servings. Tick the ingredient lines and steps you want, edit, and save the result as a new version.
- **Cook mode** (big text, screen stays on, step check-off, tap-to-start timers), **servings scaling** with US/metric conversion, and a **shopping list** grouped by store aisle.

The starter recipes are untested placeholders written from general cooking knowledge. They're meant to be cooked, tweaked and replaced with your own versions.

## Your data

Everything you change is stored in the browser on that device (IndexedDB). Use **Settings → Export backup file** regularly, and **Import** on another device to move your book.

## Web recipe helper (optional)

Recipe sites block browser apps from reading their pages, so searching and importing from the web uses a tiny free Cloudflare Worker: [`worker/recipe-helper.js`](worker/recipe-helper.js). Setup steps are in the app under **Settings → Web recipe helper**. Without it you can still paste recipe text into Compare.

## Project layout

```
index.html, css/, js/           the app (plain ES modules, no build step)
js/views/                       one module per screen
data/index.json                 which recipe files belong to each section
data/dinners/*.txt              the starter catalog (format below)
worker/recipe-helper.js         Cloudflare Worker for web search + import
tools/check-data.mjs            validates the catalog: node tools/check-data.mjs
sw.js, manifest.webmanifest     offline support / install
```

### Catalog format

```
@ Name | Cuisine | protein | method,method | prep min | cook min | servings | easy/medium/hard | main/soup/sandwich/side
One-line description.
- ingredient line
-- Section heading
> step
! tip or note
```

Adding the Breads or Desserts section later: add files under `data/`, list them in `data/index.json` under `breads` / `desserts`, and set `visible: true` for that section in `js/store.js`.

### Releasing an update

Bump `CACHE` in `sw.js` (e.g. `recipebook-v2`) so installed copies pick up new files.

# Neurosurgery CPT Look-Up Tool

Type a procedure, abbreviation or code and get the CPT code. Built for neurosurgery (spine, cranial, peripheral nerve, functional, neuro-endovascular, IONM, modifiers), with common general procedures, imaging, labs and HCPCS codes too.

**Open it:** https://mussidik1.github.io/Neurosurgery-CPT-Look-Up-Tool/

## Add it to your Home Screen

- **iPhone:** open the link in Safari, tap Share, then **Add to Home Screen**.
- **Android:** open the link in Chrome, tap the menu, then **Install app** (or **Add to Home screen**).

After the first visit it works offline.

## What it does

- Forgiving search: abbreviations (ACDF, TLIF, EVD, MVD), everyday phrasing ("burr hole for chronic subdural"), typos, "w/ and w/o contrast", code numbers and modifiers (`62`, `-22`, `XS`).
- Tap a result to copy the code. Star the ones you use. Recently copied codes show on the home screen.
- Browse by section with the codebook-style tabs.
- Notes flag typical add-ons and pairings (for example, ACDF 22551 with 22853 cage and 22845 plate) and codes that are new or revised for 2026.

## Important

Descriptions are plain-language summaries written for quick look-up. They are **not** the official AMA CPT descriptors. Confirm codes, full descriptors, NCCI edits and payer rules in the current CPT codebook or with your coding team before billing. CPT® is a registered trademark of the American Medical Association. This project is not affiliated with the AMA or CMS.

## Editing the code list

The data lives in `data/*.js`, one row per code:

```js
["*22551", "ACDF: anterior cervical discectomy and interbody fusion …", "acdf|anterior cervical fusion|…", "Optional note"],
```

A leading `*` marks the most common code in its family (it ranks a little higher). Synonyms are separated by `|`.

```bash
npm install          # fonts used by the app
npm test             # validates the data and runs ~250 search-quality checks
npm run build        # writes the site to ./site
npm run deploy       # builds, tests and publishes ./site to the gh-pages branch
```

The build fails if a code is duplicated, malformed, listed in the deleted-codes guard, or referenced in a note without existing in the data.

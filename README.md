# CPT Look-Up Tool

Type a procedure, abbreviation or code and get the CPT code. Built for neurosurgery (spine, cranial, peripheral nerve, functional, neuro-endovascular, IONM, modifiers), with common general procedures, imaging, labs and HCPCS codes too.

**Open it:** https://mussidik1.github.io/Neurosurgery-CPT-Look-Up-Tool/

## Add it to your Home Screen

- **iPhone:** open the link in Safari, tap Share, then **Add to Home Screen**.
- **Android:** open the link in Chrome, tap the menu, then **Install app** (or **Add to Home screen**).

After the first visit it works offline.

## What it does

- Forgiving search: abbreviations (ACDF, TLIF, EVD, MVD), everyday phrasing ("burr hole for chronic subdural"), spine levels ("open L2-5 laminectomy", "C5-6 ACDF"), typos, "w/ and w/o contrast", code numbers and modifiers (`62`, `-22`, `XS`).
- Tap a result to copy the code. Star the ones you use. Recently copied codes show on the home screen.
- Browse by section with the codebook-style tabs.
- Notes flag typical add-ons and pairings (for example, ACDF 22551 with 22853 cage and 22845 plate) and codes that are new or revised for 2026.
- "Not billed with" reminders for common pairs from CPT instructions (a curated list, not the full NCCI edit table).
- Common diagnoses (ICD-10-CM) on procedure cards; tap one to copy it.
- Settings: navy, light or match-device colors, and three text sizes. Two-column results on iPad and wider screens.

## Important

Descriptions are plain-language summaries written for quick look-up. They are **not** the official AMA CPT descriptors. Confirm codes, full descriptors, NCCI edits and payer rules in the current CPT codebook or with your coding team before billing. CPT® is a registered trademark of the American Medical Association. This project is not affiliated with the AMA or CMS.

## Editing the code list

The data lives in `data/*.js`, one row per code:

```js
["*22551", "ACDF: anterior cervical discectomy and interbody fusion …", "acdf|anterior cervical fusion|…", "Optional note"],
```

A leading `*` marks the most common code in its family (it ranks a little higher). Synonyms are separated by `|`.

- `data/bundles.js`: pairs that aren't billed together, `bundle(code, otherCode, reason)` and `included([codes], [inclusions], reason)`.
- `data/dx.js`: common diagnoses, `dx([procedure codes], [ICD-10-CM codes])`. After editing, run `python3 tools/icd-labels.py` (needs `pip install simple-icd-10-cm`); it rejects invalid or non-billable codes and writes the descriptions to `data/icd10.json`.

```bash
npm install          # fonts used by the app
npm test             # validates the data and runs ~250 search-quality checks
npm run build        # writes the site to ./site
npm run deploy       # builds, tests and publishes ./site to the gh-pages branch
```

The build fails if a code is duplicated, malformed, listed in the deleted-codes guard, or referenced in a note, bundling rule or diagnosis list without existing in the data.

Scripts and styles get a content hash in their file names at build time, and the service worker always fetches the page itself fresh when online, so a new release can't be mixed with an older cached file.

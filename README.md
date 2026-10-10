# AniVora Creative Studio — front-end starter

Responsive, premium dark creative-studio interface built with plain HTML, CSS and JavaScript. Intended as a front-end upgrade for the existing AniVora creative platform.

## Files
- `index.html` — dashboard and all workspace screens
- `styles.css` — responsive design
- `app.js` — navigation and prototype interactions

## Run
Open `index.html` in a modern browser. No build step is required.

## Put it into the existing GitHub/Vercel project
1. Back up the current website files first.
2. Add these files to the root of the **existing AniVora repository**; do not delete backend/API files or environment variables.
3. If the existing landing/dashboard URL uses `dashboard.html`, copy `index.html` to `dashboard.html` as well, or update existing links to the new entry page.
4. Commit and push. Vercel will redeploy the connected repository.

## Functional in this prototype
- Responsive navigation: Overview, Canvas, Video Studio, Beat Sync, Editor, Media Library, Projects and Settings
- Quick prompt handoff to Canvas
- Visual concept cards and local project saving
- Three-shot storyboard builder
- Local audio preview and adjustable BPM beat-map mock-up with rough caption timing
- Editor title/subtitle/accent preview, add timeline track, export JSON edit plan
- Searchable project/media-entry library, delete projects, save preferences
- Browser localStorage persistence

## Not connected yet
Real AI image/video generation, automatic beat detection, accurate lyric alignment, rendered video export, user accounts, cloud storage and cross-device sync need backend/API services. Canvas cards are concept briefs, not generated images. Imported media entries store metadata only; the actual files are not uploaded or persisted.

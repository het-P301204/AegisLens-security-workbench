# Screenshots

The images referenced by the README live here. All of them show the synthetic
sample dataset that ships with the project.

| File | Shows |
| ---- | ----- |
| `banner.svg` | README banner (vector, edit directly) |
| `social-preview.svg` / `.png` | GitHub social preview card, 1280×640 |
| `01-overview.png` | Dashboard: metrics, risk distribution, evidence gaps, activity |
| `02-findings.png` | Findings table with search, filters, and risk scores |
| `03-finding-detail.png` | One finding, including the Finding → Evidence → Control view |
| `04-evidence.png` | Evidence library with the "no verified evidence" panel |
| `05-controls.png` | Control coverage across the illustrative framework |
| `06-report.png` | Generated assessment report preview |
| `07-settings.png` | Assessment metadata and the risk model reference |
| `08-mobile-overview.png` | Dashboard at 390px |
| `09-tablet-controls.png` | Controls at 834px |
| `10-print-view.png` | Printable report served by `/api/reports/print` |

## Recapturing them

Start the application so both the API and the built frontend are on one origin:

```bash
cd frontend && npm run build && cd ../backend && uvicorn app.main:app --port 8000
```

Reset the data first if you have been experimenting, so the numbers in the images
match the ones the README quotes:

```bash
cd backend && python -m app.seed --force
```

Then capture each page. Use a **1440×960** viewport for the desktop images, and your
browser's full-page screenshot (in Chrome: DevTools → `Ctrl/Cmd+Shift+P` → *Capture
full size screenshot*).

| File | URL | Viewport |
| ---- | --- | -------- |
| `01-overview.png` | `http://127.0.0.1:8000/` | 1440×960, full page |
| `02-findings.png` | `/findings` | 1440×960, full page |
| `03-finding-detail.png` | `/findings/F-001` | 1440×960, full page |
| `04-evidence.png` | `/evidence` | 1440×960, full page |
| `05-controls.png` | `/controls` | 1440×960, full page |
| `06-report.png` | `/reports` | 1440×960, full page |
| `07-settings.png` | `/settings` | 1440×960, full page |
| `08-mobile-overview.png` | `/` | 390×844, viewport only |
| `09-tablet-controls.png` | `/controls` | 834×1112, viewport only |
| `10-print-view.png` | `/api/reports/print` | 1000×900, viewport only |

Keep the file names as they are — the README links to them directly.

## Social preview

`social-preview.png` is the image GitHub shows when the repository is shared. It is
rendered from `social-preview.svg` at exactly 1280×640. Edit the SVG, then re-render
it by opening the SVG at that viewport size and exporting a PNG.

Upload it under **Settings → General → Social preview** on the repository; GitHub
does not expose this setting through its API.

## Conventions

- Use the sample data, never real assessment content.
- Keep the dark theme; it is the product's default and the images should match it.
- Do not annotate with arrows or callouts. The interface should explain itself.
- PNG for screenshots, SVG for the banner.

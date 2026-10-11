# SafePath — floor-plan evacuation planning

A Next.js + PostgreSQL planning workspace with a static HTML/CSS/vanilla-JS homepage. This is a learning and planning model, not emergency navigation or a certified building-safety system.

## One coherent interface

The homepage and every application page use the same header, logo, menu links, account action, spacing, typography and responsive breakpoint. `/public/site.css` is the single source of navigation and footer styling. The navigation definition lives in `public/navigation.json`; React uses it directly, and browser tests verify that the static homepage markup matches it.

- Home: an expert-grade cinematic blueprint backdrop, detailed technical specifications (Heuristic Admissibility, Strict Pixel Overlap, Exclusion Boundaries), upload and practice-simulator actions, and a three-step workflow. The hero features a live CAD-style Dynamic Graph Solver canvas that simulates A* frontier expansion and path extraction, paired with a monospaced live terminal log console (Engine Console Log) that outputs real-time operations, vertices, and steps. Under `prefers-reduced-motion`, the console logs settle instantly and the canvas renders the resolved optimal path.
- Dashboard: a high-density expert Command Center. It provides extensive workspace telemetry metrics (Active Blueprints, Exit Nodes, Total Start Vertices, Saved Solver Passes), a live system status log panel showing server workers and database health, a searchable CAD-style floor-plan list with actual saved thumbnails, recent search scenario logs, and a structured layout-refinement guide.
- Floor plans: searchable saved models, review and simulator links, confirmation before deletion, and rollback on failed optimistic deletion.
- Upload / editor / simulator / theory: existing full-stack functionality, with matching neutral controls and readable typography. Semantic colors in the grid and status messages remain meaningful.
- History: actual stored runs and links to the current version of the associated map. Opening a map is not presented as replaying an old scenario.
- Account: email/password signup and sign-in, persisted display-name editing, and working sign-out. Guests see a useful sign-in state rather than hardcoded profile information.

There are no emoji characters, decorative trust logos or percentage/uptime claims in the UI. Headings use Inter for clarity. Technical grid glyphs, state colors and functional SVG tool controls are retained.

## Homepage files

```
public/index.html          static homepage
public/styles.css          homepage composition only
public/site.css            shared navigation, footer and base button styles
public/main.js             accessible menu, account state, and the A* hero illustration
public/navigation.json     navigation definition
public/assets/logo.webp    logo mark
```

A Next.js rewrite serves `public/index.html` at `/`. This lets the homepage remain plain HTML without replacing the server-backed application pages.

## Application files

- `src/components/SiteHeader.tsx` and `SiteFooter.tsx`: the application versions of the shared site header/footer.
- `src/components/DashboardLayout.tsx`: one site shell for all application pages, including sign-in.
- `src/app/shell.css`: workspace styling, not separate navigation styling.
- `src/app/api/maps/[id]/preview/route.ts`: SVG thumbnails drawn from each map's actual stored grid.
- `src/app/api/auth/me/route.ts`: authenticated profile loading and display-name updates.

Existing upload, conversion, A*, server validation, persistence and image-retention code is preserved.

## Planning workflow

1. Upload a supported raster image (PNG, JPEG, WebP, GIF, TIFF or AVIF; up to 12 MB and 40 MP).
2. The server normalizes the image and uses local English OCR, line evidence and color components to produce a reviewable grid.
3. Compare source and grid, adjust conversion settings, verify actual doorways and exits, and place people.
4. Correct uncertain geometry. Colored safety symbols do not automatically become active fires or verified exits.
5. Validate routes and save the reviewed model. A server-computed result and map are saved atomically.
6. Open that map in the simulator. Step through A*, compare heuristics, introduce explicit scenario hazards and recalculate.

Unknown cells, walls, windows and blocked passages are impassable. Red/green symbols are review candidates rather than inferred active hazards or usable exit doors. Grid distances are model units, not physical evacuation times. People are routed independently; congestion and exit capacities are not modeled.

## Data and authentication

Configure `DATABASE_URL` for PostgreSQL. Configure a strong `JWT_SECRET` for deployments; do not rely on a development fallback. Drizzle is used for database interactions. No new table or schema change was needed for this UI refinement.

Map/run list endpoints expose the existing shared workspace, including sample plans. This UI update does not claim per-user isolation of those shared collections. Dashboard counts reflect the loaded collections; recent runs are capped at 50.

The sample image is `public/samples/campus-plan.png`. `assets/ocr` contains the local OCR language model. The legacy seed script clears maps/runs; do not run it against personal data merely to refresh the interface.

## Verification

Unit tests:

`npx tsx --test tests/astar.test.ts tests/map-analysis.test.ts`

Browser tests with the app running:

`npx playwright test tests/landing.spec.ts tests/design-system.spec.ts tests/account.spec.ts tests/upload.spec.ts tests/refinement.spec.ts tests/monochrome.spec.ts tests/image-retention.spec.ts --workers=1`

These tests verify pixel-level header geometry/style parity between the static homepage and app, matching mobile breakpoints, keyboard focus handling, correct route links, real counts and previews, signup/profile persistence/sign-out, PNG and monochrome uploads, correction/undo, route validation, dynamic hazards and preservation of uploaded images on editing.

Production checks:

- `npx next typegen`
- `npm exec tsc -- --noEmit --pretty false`
- `npm run build`
- Platform-managed `build_and_start`, including `/api/health`.

For real emergencies, use posted signs and approved building/emergency instructions. Successful A* routing proves only reachability and optimality for the supplied grid, not that the real-world route is safe.

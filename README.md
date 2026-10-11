<div align="center">

<img src="public/assets/logo.webp" alt="SafePath logo" width="96" />

# SafePath

**Floor-plan evacuation modeling and A\* pathfinding simulation.**

Turn an architectural blueprint into a reviewable graph, then compute, visualize and benchmark optimal egress routes.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs)
![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-PGlite-336791?logo=postgresql&logoColor=white)
![Tests](https://img.shields.io/badge/tests-11%20unit%20%7C%2019%20E2E-brightgreen)

</div>

> **Safety notice:** SafePath is a learning and planning model. It is **not** emergency navigation software and **not** a certified building-safety system. In a real emergency, follow posted signage, certified fire-safety systems and instructions from local emergency personnel.

---

## Table of contents

- [Overview](#overview)
- [How it works](#how-it-works)
- [Features](#features)
- [Routes](#routes)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Project structure](#project-structure)
- [Testing](#testing)
- [Model assumptions and limitations](#model-assumptions-and-limitations)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

SafePath bridges **architectural blueprint analysis** (OCR and computer vision) with the **A\* graph search algorithm**. Upload a 2D floor plan, let the engine convert it into a grid, correct it in a CAD-style editor, and then solve multi-occupant, multi-exit shortest paths you can step through node by node.

It is built for safety planners, students and anyone who wants to see *why* a pathfinding algorithm makes the decisions it does.

## How it works

```
 Blueprint image  ──►  OCR & line detection  ──►  Human-in-the-loop     ──►  A* graph solver
 (PNG/JPEG/WebP…)      (Tesseract + Sharp)        grid editor                (multi-exit shortest path)
                                                  (walls, doors, exits,
                                                   occupants)
```

1. **Upload** a raster floor plan (PNG, JPEG, WebP, GIF, TIFF or AVIF; up to 12 MB and 40 MP).
2. **Scan.** The server normalizes the image and uses offline English OCR, line evidence and color components to produce a reviewable grid.
3. **Refine.** Compare the source image with the grid, adjust conversion thresholds, confirm real doorways and exits, and place occupants.
4. **Validate and save.** Routes are validated, and the server-computed result and map are saved atomically.
5. **Simulate.** Open the map in the simulator, step through A\*, compare heuristics, add hazards and recalculate.

## Features

### Blueprint ingestion and computer vision
- Image processing with **Sharp**: line detection, thresholding and noise reduction.
- Fully **offline OCR** using Tesseract.js with a bundled model (`assets/ocr/eng.traineddata.gz`).
- Exit candidates are flagged by reading signage, distinguishing real exit signs from "NO EXIT" and fire-equipment markings.
- Conversion preserves rooms and thin dividing walls instead of discarding them.

### Human-in-the-loop CAD grid editor
- Confirm exit doors, place occupant start positions and paint walkable corridors.
- Adjust darkness and aspect thresholds, with undo/correction support.
- Colored safety symbols are treated as **review candidates**, never as automatically verified exits or active fires.

### A\* solver and simulator
- Multi-occupant, multi-exit shortest paths.
- Heuristics: **Manhattan**, **Euclidean** and **Chebyshev**, verified against a ground-truth **Dijkstra** baseline.
- Strict movement physics: diagonal corner-cutting through walls is prohibited.
- **Dynamic hazards:** place fire or smoke in real time. The solver reroutes, or honestly reports that no route exists.
- **Step-by-step trace:** scrub through open-set and closed-set expansions to inspect each decision.

### Workspace
- Dashboard with workspace telemetry, SVG thumbnails drawn from each map's real stored grid, and a live system status panel.
- Searchable plan library with delete confirmation and rollback on failed optimistic deletes.
- Run history of explored nodes, path lengths, runtimes and outcomes.
- JWT-based email/password accounts with persistent profile editing.

### One coherent interface
- The static homepage and every app page share the same header, footer, spacing and breakpoints.
- `public/site.css` is the single source of navigation and footer styling, and `public/navigation.json` is the single navigation definition.
- Honors `prefers-reduced-motion`: the hero canvas renders the resolved path and console logs settle instantly.

## Routes

| Route | View | Description |
| --- | --- | --- |
| `/` | Landing page | Static blueprint showcase with an interactive A\* expansion canvas and live engine console log. |
| `/dashboard` | Command center | Active blueprints, exit nodes, start vertices, saved solver passes and thumbnails. |
| `/maps/new` | Upload and scan | Multi-step pipeline: upload, OCR labels, grid conversion, route validation. |
| `/maps` | Plan library | Searchable catalog of saved plans with previews, edit links and deletion safeguards. |
| `/simulator` | A\* simulator | Full-screen grid simulator with play/pause, hazard placement and step timeline. |
| `/theory` | Algorithm theory | Heuristic admissibility, tie-breaking rules and Dijkstra comparison benchmarks. |
| `/runs` | Run history | Audit log of explored nodes, path step counts, run times and outcomes. |
| `/auth`, `/profile` | Authentication | Sign up, sign in and profile management. |

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 16 (App Router, Turbopack), React 19, vanilla CSS design system |
| Database | PostgreSQL wire protocol via embedded `@electric-sql/pglite` and `pg-gateway` (port 5432), persisted to `.pgdata/` |
| ORM | Drizzle ORM (`users`, `floor_maps`, `runs`) |
| Image processing | Sharp |
| OCR | Tesseract.js with offline English model |
| Auth | JWT |
| Testing | `node:test` via `tsx`, Playwright |

## Getting started

### Prerequisites

- Node.js 20 or newer (the version required by Next.js 16)
- npm

### Install and run

```bash
git clone https://github.com/kirtankumarsanghi/SafePath.git
cd SafePath

npm install
cp .env.example .env     # then edit the values, see Configuration below

npm run dev
```

Then open <http://localhost:3000>.

To try it quickly, upload the bundled sample plan at `public/samples/campus-plan.png` on the `/maps/new` page.

### Production build

```bash
npx next typegen
npm exec tsc -- --noEmit --pretty false
npm run build
npm start
```

A health check is available at `/api/health`.

## Configuration

Copy `.env.example` to `.env` and set:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string. |
| `JWT_SECRET` | Secret used to sign session tokens. **Use a strong, unique value in any deployment.** Do not rely on a development fallback. |

> The legacy seed script **clears maps and runs**. Do not run it against data you want to keep.

## Project structure

```
SafePath/
├── assets/ocr/            Offline Tesseract language model
├── public/
│   ├── index.html         Static homepage
│   ├── styles.css         Homepage composition
│   ├── site.css           Shared navigation, footer and base button styles
│   ├── main.js            Menu, account state and the A* hero illustration
│   ├── navigation.json    Navigation definition
│   ├── assets/logo.webp   Logo mark
│   └── samples/           Sample floor plan
├── scripts/               Utility and seed scripts
├── src/
│   ├── app/               Next.js App Router pages, API routes and shell.css
│   └── components/        SiteHeader, SiteFooter, DashboardLayout, ...
├── tests/                 Unit and Playwright E2E tests
├── drizzle.config.json    Drizzle ORM configuration
└── next.config.ts         Rewrites `/` to the static homepage
```

A Next.js rewrite serves `public/index.html` at `/`, so the homepage stays plain HTML without replacing the server-backed application pages.

Notable API routes:

- `src/app/api/maps/[id]/preview/route.ts` returns SVG thumbnails drawn from each map's stored grid.
- `src/app/api/auth/me/route.ts` handles authenticated profile loading and display-name updates.

## Testing

**Unit tests (11):** admissibility, boundary conditions, dynamic hazards and OCR precision.

```bash
npx tsx --test tests/astar.test.ts tests/map-analysis.test.ts
```

**End-to-end tests (19):** run with the app already running.

```bash
npx playwright test \
  tests/landing.spec.ts tests/design-system.spec.ts tests/account.spec.ts \
  tests/upload.spec.ts tests/refinement.spec.ts tests/monochrome.spec.ts \
  tests/image-retention.spec.ts --workers=1
```

The E2E suite covers pixel-level header parity between the static homepage and the app, matching mobile breakpoints, keyboard focus handling, route links, real counts and previews, signup/profile persistence/sign-out, PNG and monochrome uploads, correction and undo, route validation, dynamic hazards and preservation of uploaded images when editing.

## Model assumptions and limitations

- Unknown cells, walls, windows and blocked passages are **impassable**.
- Red and green symbols are **review candidates**, not inferred hazards or verified exits.
- Grid distances are **model units**, not physical evacuation times.
- Occupants are routed **independently**. Congestion and exit capacity are not modeled.
- A successful A\* result proves only **reachability and optimality on the supplied grid**, not that the real-world route is safe.
- Map and run list endpoints expose a **shared workspace** (including sample plans). Per-user isolation of these collections is not implemented.

## Contributing

Issues and pull requests are welcome. Before opening a PR, please run the unit tests, type-check and a production build as described above.

## License

No license has been specified yet. Add a `LICENSE` file (for example MIT) and update this section.

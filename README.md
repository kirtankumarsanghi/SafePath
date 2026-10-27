<div align="center">

<img src="public/assets/logo.webp" alt="SafePath logo" width="110" />

# SafePath

### Upload a floor plan. Watch an algorithm find the way out.

**Floor-plan evacuation modeling and A\* pathfinding, with every search step made visible.**

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs)
![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-PGlite-336791?logo=postgresql&logoColor=white)
![Unit tests](https://img.shields.io/badge/unit%20tests-13%2F13%20passing-brightgreen)
![Typecheck](https://img.shields.io/badge/typecheck-passing-brightgreen)
![CI](https://img.shields.io/badge/CI-GitHub%20Actions-2088FF?logo=githubactions&logoColor=white)

[Quick start](#-quick-start) · [Screenshots](#-screenshots) · [Results](#-results) · [How it works](#-how-it-works) · [Docs](#-table-of-contents)

<br />

<img src="docs/screenshots/simulator.png" alt="SafePath A* simulator solving a grid" width="900" />

</div>

> **Safety notice:** SafePath is a learning and planning model. It is **not** emergency navigation software and **not** a certified building-safety system. In a real emergency, follow posted signage, certified fire-safety systems and instructions from local emergency personnel.

---

## Table of contents

- [What is SafePath?](#-what-is-safepath)
- [Highlights](#-highlights)
- [Screenshots](#-screenshots)
- [Results](#-results)
- [Quick start](#-quick-start)
- [How it works](#-how-it-works)
- [Understanding A\*](#-understanding-a-in-plain-words)
- [Features in detail](#-features-in-detail)
- [Pages](#-pages)
- [Cell types](#-cell-types)
- [Tech stack](#-tech-stack)
- [Architecture](#-architecture)
- [Configuration](#-configuration)
- [npm scripts](#-npm-scripts)
- [Project structure](#-project-structure)
- [API reference](#-api-reference)
- [Database](#-database)
- [Deployment](#-deployment)
- [Testing](#-testing)
- [Limitations](#-limitations)
- [Troubleshooting](#-troubleshooting)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🧭 What is SafePath?

You have a picture of a building floor plan. You want to know: **"If people are standing here, what is the shortest way out?"**

SafePath answers in three moves:

| Step | What happens | Why it matters |
| :---: | --- | --- |
| **1. Read** | The floor-plan image is converted into a grid (graph paper where every square is a wall or open floor). | Computers can't search a picture, but they can search a grid. |
| **2. Review** | You fix mistakes in a grid editor: mark real exits, place people, repair walls. | OCR and vision are never perfect, so a human stays in control. |
| **3. Solve** | The **A\*** algorithm finds each person's shortest route, and you can replay it step by step. | You see *why* it chose a route, not only the answer. |

It is built for **students** learning algorithms, **teachers** who want a visual demo, **hobbyist planners** exploring layouts, and **developers** studying a full-stack project (computer vision, database, auth, tests, CI).

## ✨ Highlights

- 🖼️ **Image to grid.** Sharp-based line detection and fully offline Tesseract OCR.
- ✏️ **Human-in-the-loop editor.** Nothing detected is trusted blindly. Colored symbols are only *candidates*.
- 🧠 **A\* with three heuristics.** Manhattan, Euclidean and Chebyshev, checked against an independent Dijkstra baseline.
- 🔥 **Dynamic hazards.** Drop fire while it runs. The route recalculates, or honestly reports that no route exists.
- ⏯️ **Step-by-step trace.** Play, pause and scrub through every open and closed node, with `g`, `h` and `f` values.
- 🧵 **Runs in a Web Worker.** Heavy search stays off the main thread, so the UI never freezes.
- 🔐 **Accounts and history.** JWT login, saved plans and an audit log of every run.
- ☁️ **Works without a database.** Falls back to bundled demo plans (great for Vercel previews).
- ✅ **Tested.** 13 unit tests plus Playwright end-to-end tests, run in CI.

## 📸 Screenshots

Captured from the running app (dark theme, 1440×900).

| Landing page | Dashboard |
| :---: | :---: |
| <img src="docs/screenshots/landing.png" alt="Landing page" width="440" /> | <img src="docs/screenshots/dashboard.png" alt="Dashboard" width="440" /> |
| Live A\* canvas and engine log | Counts, plan thumbnails, system status |

| Upload and scan | Plan library |
| :---: | :---: |
| <img src="docs/screenshots/upload.png" alt="Upload and scan" width="440" /> | <img src="docs/screenshots/library.png" alt="Plan library" width="440" /> |
| Multi-step upload, OCR and conversion | Searchable saved plans |

| Algorithm theory | Run history |
| :---: | :---: |
| <img src="docs/screenshots/theory.png" alt="Theory page" width="440" /> | <img src="docs/screenshots/runs.png" alt="Run history" width="440" /> |
| Heuristics and Dijkstra comparison | Nodes explored, cost and outcome per run |

**Reading the simulator screenshot at the top:** `P1` is a person, `E1` is the exit, the green line is the final path (cost **10.00**), purple cells are explored nodes (**15**), and yellow cells are slow terrain that the route avoids where possible.

## 📊 Results

All numbers below were **measured on this repository** (not estimated). The tests were run with `npm run test:unit` and `npm run typecheck`. The benchmark ran the bundled sample plans from [`src/lib/sample-data.ts`](src/lib/sample-data.ts) through [`runEvacuation`](src/lib/astar.ts), averaged over 50 runs on a normal development laptop.

### ✅ Verification summary

| Check | Result |
| --- | --- |
| Unit tests (`node:test` via `tsx`) | **13 / 13 passed**, 0 failed, 0 skipped |
| TypeScript strict typecheck (`tsc --noEmit`) | **Passed**, 0 errors |
| Every heuristic vs an independent Dijkstra baseline | **Same optimal cost** on weighted, multi-exit grids |
| Blank image | **0 exits and 0 starts invented** |
| Corner cutting through walls | **Prevented** (tested) |

### 🏁 Heuristic benchmark on the sample buildings

Lower **nodes explored** means the heuristic guided the search better. All three found the **same optimal cost**, which is exactly what an admissible heuristic must do.

| Building (grid) | People to exits | Heuristic | Routes found | Path costs | Nodes explored | Avg. time |
| --- | :---: | --- | :---: | --- | :---: | :---: |
| University Lecture Hall (30×22) | 2 | **Manhattan** | 2 / 2 | 10.00, 17.00 | **60** | 0.41 ms |
| | | Euclidean | 2 / 2 | 10.00, 17.00 | 94 | 0.58 ms |
| | | Chebyshev | 2 / 2 | 10.00, 17.00 | 102 | 0.55 ms |
| Office Building Level 3 (32×24) | 2 | **Manhattan** | 2 / 2 | 18.00, 21.00 | **108** | 0.36 ms |
| | | Euclidean | 2 / 2 | 18.00, 21.00 | 152 | 0.66 ms |
| | | Chebyshev | 2 / 2 | 18.00, 21.00 | 161 | 0.51 ms |
| Hospital Wing (34×26) | 3 | **Manhattan** | 3 / 3 | 13.00 ×3 | **57** | 0.22 ms |
| | | Euclidean | 3 / 3 | 13.00 ×3 | 95 | 0.40 ms |
| | | Chebyshev | 3 / 3 | 13.00 ×3 | 110 | 0.46 ms |

**What the results tell us**

- **Manhattan explored the fewest nodes in every building** (about 36% fewer than Euclidean on the Lecture Hall, 29% fewer on the Office, 40% fewer on the Hospital). This is expected: SafePath moves 4-directionally by default (up, down, left, right), and Manhattan distance matches that movement exactly, so it gives the tightest valid estimate.
- **All heuristics returned identical path costs.** Different guesses change how much work is done, never the quality of the answer.
- **Everything solves in well under a millisecond** at these sizes, so the app responds instantly, and the Web Worker keeps larger grids smooth.
- Costs are in **grid units**, not meters or seconds.

### 🔥 Dynamic hazard behavior

The first two rows are asserted by the Playwright test `simulator.spec.ts` on the small demo grid. The last row is covered by the unit test for dynamic hazards.

| Situation | Path cost | Result |
| --- | :---: | --- |
| Clean grid, Manhattan | **10.00** | Exit reached |
| Fire placed on the original route | **12.00** | Route recalculated around the fire, no "no route" alert |
| Fire sealing every route | n/a | App reports **"no route"** honestly instead of drawing a fake path |

> Benchmark note: timings depend on your machine. The node counts and path costs are deterministic and will match when you re-run the benchmark.

### Reproduce the results yourself

```bash
npm run test:unit      # 13 tests
npm run typecheck      # strict TypeScript
npm run test:e2e       # Playwright end-to-end suite
```

## 🚀 Quick start

**Prerequisites:** Node.js 20+ (22 recommended), npm, Git.

```bash
git clone https://github.com/kirtankumarsanghi/SafePath.git
cd SafePath

npm install
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env

npm run dev                 # also starts the embedded PostgreSQL-compatible database
```

Open **<http://localhost:3000>**. You do not need to install PostgreSQL. Local development uses an embedded database that saves to `.pgdata/`.

### Try it in 2 minutes

1. Open `/auth` and create an account.
2. Open `/maps/new` and upload the bundled sample [`public/samples/campus-plan.png`](public/samples/campus-plan.png).
3. Review the grid, confirm the exits and place a few people.
4. Save, open `/simulator` and press **Play**.
5. Choose **Toggle fire**, click a cell on the route, and watch it reroute.

Or skip all that: open `/simulator` and click **Small demo**.

### Production build

```bash
npm run build
npm start
```

Health check: <http://localhost:3000/api/health>

## ⚙️ How it works

```
 Blueprint image ──► Read it (OCR +   ──► Human review &   ──► A* solver finds
 PNG/JPEG/WebP…      line detection)      fix in editor        shortest path for
                                          (walls, doors,       every person
                                           exits, people)
```

1. **Upload.** Raster image (PNG, JPEG, WebP, GIF, TIFF, AVIF), up to **12 MB** and **40 megapixels**.
2. **Scan.** The server cleans the image and finds walls (Sharp), text such as "EXIT" (offline Tesseract OCR) and colored symbols (kept as *candidates* only).
3. **Refine.** Compare the original with the grid. Adjust thresholds, paint corridors and walls, confirm real exits, place people, undo mistakes.
4. **Validate and save.** The server checks that starts and exits exist and are in bounds, then saves the map and its computed result together, so a failure never leaves half-saved data.
5. **Simulate.** Open the simulator: play, scrub, change heuristics, add hazards.

## 🧠 Understanding A\* in plain words

**The goal:** find the shortest path from a start square to an exit square across a grid with walls.

- **Dijkstra** spreads out evenly in every direction like ripples in a pond. It's correct but wastes work in the wrong directions.
- **A\*** also spreads out, but always expands the most *promising* square next, scored by:

```
f(n) = g(n) + h(n)
```

| Symbol | Meaning |
| :---: | --- |
| `g` | Distance **already walked** from the start to this square. |
| `h` | Our **guess** of the distance left to the exit (the *heuristic*). |
| `f` | Estimated total cost through this square. The lowest `f` goes first. |

- **Open set:** squares seen but not yet expanded (the frontier).
- **Closed set:** squares already expanded.

The simulator draws both, so you can watch the frontier grow.

### The three heuristics

| Heuristic | Intuition | Formula |
| --- | --- | --- |
| **Manhattan** | Count blocks like a taxi (no diagonals). | `|dx| + |dy|` |
| **Euclidean** | Straight-line distance. | `sqrt(dx² + dy²)` |
| **Chebyshev** | The larger of the horizontal or vertical gap. | `max(|dx|, |dy|)` |

A heuristic must **never overestimate** the true remaining distance (it must be *admissible*) or A\* could return a path that isn't the shortest. The unit tests prove this against Dijkstra.

### Rules of movement

- You cannot **cut diagonally** between two wall corners.
- **Obstacles** are walkable but cost **3** instead of 1, so routes avoid them when they can.
- **No route?** If walls or fire block everything, SafePath says so. It never invents a path.

Core code: [`src/lib/astar.ts`](src/lib/astar.ts).

## 🧩 Features in detail

<details>
<summary><b>Blueprint ingestion (computer vision)</b></summary>

- **Sharp** performs line detection, thresholding and noise reduction.
- **Tesseract.js** runs OCR offline using the bundled `assets/ocr/eng.traineddata.gz`.
- Real exit signs are separated from **"NO EXIT"** text and fire-equipment markings.
- Thin walls and small rooms are preserved rather than erased.
- Red and green symbols are *review candidates*, never auto-verified.
</details>

<details>
<summary><b>Grid editor</b></summary>

- Paint walls, corridors, doors, exits and start positions.
- Tune darkness and aspect thresholds and see the grid update.
- Undo and correction support.
- The original uploaded image is kept when you return to edit a map.
</details>

<details>
<summary><b>Solver and simulator</b></summary>

- Multiple people and multiple exits, each solved independently.
- Play, pause, step forward and back, speed control, optional `f(n)` overlay.
- Live stats: path cost, nodes explored, open list, closed list, compute time, routes found.
- Fire, doors, walls and slow terrain can be edited on the grid at any time.
- Search runs in `src/workers/astar.worker.ts`.
</details>

<details>
<summary><b>Workspace</b></summary>

- Dashboard with counts, status and thumbnails drawn from each map's real stored grid.
- Searchable plan library with delete confirmation and automatic rollback if a delete fails.
- Run history with explored nodes, path length, runtime and outcome.
- Email and password accounts with JWT and an editable profile.
</details>

<details>
<summary><b>Interface</b></summary>

- The static homepage and all app pages share the same header, footer, spacing and breakpoints.
- `public/site.css` is the single source of header and footer styling. `public/navigation.json` defines the menu once.
- Honors `prefers-reduced-motion`.
- Light and dark theme.
</details>

## 🗺️ Pages

| Route | Name | Purpose |
| --- | --- | --- |
| `/` | Landing | Live A\* animation and engine log. |
| `/dashboard` | Command center | Overview of maps, exits, starts and runs. |
| `/maps/new` | Upload and scan | Upload, OCR, convert, validate. |
| `/maps` | Plan library | Search, preview, edit, delete. |
| `/maps/[id]` | Map editor | Edit a saved map. |
| `/simulator` | Simulator | Play, step, hazards, heuristics. |
| `/theory` | Theory | Heuristics and Dijkstra comparison. |
| `/runs` | Run history | Audit log of simulations. |
| `/auth` | Sign up or in | Account access. |
| `/profile` | Profile | Display name, sign out. |

## 🧱 Cell types

| Type | Walkable | Meaning |
| --- | :---: | --- |
| `empty` | ✅ cost 1 | Open floor. |
| `unknown` | ✅ review | Unclear area. Stays walkable, so check it against the source image. |
| `door` | ✅ | Doorway. |
| `start` | ✅ | A person's starting position. |
| `exit` | ✅ goal | Confirmed exit. |
| `obstacle` | ✅ cost 3 | Slows movement. |
| `wall` | ❌ | Solid wall. |
| `window` | ❌ | Treated as blocked. |
| `blocked` | ❌ | Manually blocked passage. |
| `fire` | ❌ | Active hazard. Keeps the terrain underneath, so removing it restores the floor. |

## 🛠️ Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 16 (App Router, Turbopack), React 19, TypeScript (strict), custom CSS design system |
| Backend | Next.js API routes |
| Database | PostgreSQL via embedded **PGlite** and **pg-gateway** (port 5432), saved to `.pgdata/`. Any external PostgreSQL also works. |
| ORM | Drizzle ORM |
| Image processing | Sharp |
| OCR | Tesseract.js, offline English model |
| Auth | JWT and bcryptjs |
| Icons | lucide-react |
| Testing | `node:test` via `tsx`, Playwright |
| CI | GitHub Actions |

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ Browser                                                      │
│  Landing (static HTML)    Next.js pages (React)              │
│                           Upload → Editor → Simulator        │
│                           Web Worker runs A* off-thread      │
└──────────────┬───────────────────────────────────────────────┘
               │ fetch /api/...
┌──────────────▼───────────────────────────────────────────────┐
│ Next.js server (API routes)                                  │
│  /api/maps/analyze  → Sharp + Tesseract (image → grid)       │
│  /api/maps, /api/runs, /api/auth/*  → validation + Drizzle   │
└──────────────┬───────────────────────────────────────────────┘
               │ SQL
┌──────────────▼───────────────────────────────────────────────┐
│ PostgreSQL (embedded PGlite locally, or external server)     │
│  users · floor_maps · runs                                   │
└──────────────────────────────────────────────────────────────┘
```

`next.config.ts` rewrites `/` to `public/index.html`, so the homepage stays fast plain HTML while every other page is a server-backed Next.js page.

## 🔧 Configuration

Copy `.env.example` to `.env`:

| Variable | Required | Purpose |
| --- | :---: | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string. Local default: `postgresql://postgres:postgres@127.0.0.1:5432/app_db` |
| `JWT_SECRET` | Yes | Signs login tokens. **Use a long, random, unique value in any deployment.** |

> ⚠️ The example `JWT_SECRET` is for local development only. Never reuse it in production.
>
> ⚠️ `npm run seed` **clears maps and runs**. Don't run it on data you want to keep.

## 📜 npm scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server and embedded database. |
| `npm run build` | Production build. |
| `npm start` | Run the production build. |
| `npm run db` | Start only the embedded database. |
| `npm run seed` | Seed sample data (**destructive**). |
| `npm run lint` | ESLint. |
| `npm run typecheck` | TypeScript check. |
| `npm run test:unit` / `npm test` | Unit tests. |
| `npm run test:e2e` | Playwright end-to-end tests. |

## 📁 Project structure

```
SafePath/
├── .github/workflows/ci.yml    CI: lint, types, unit tests, build, E2E
├── assets/ocr/                 Offline Tesseract model
├── docs/screenshots/           Images used in this README
├── public/                     Static homepage and assets
│   ├── index.html · styles.css · site.css · main.js
│   ├── navigation.json         Menu definition (single source of truth)
│   └── samples/                Sample floor plans
├── scripts/
│   ├── run-cmd.cjs             Cross-platform runner (ensures Node 20+, env defaults)
│   └── db-server.mjs           Embedded PostgreSQL server
├── src/
│   ├── app/                    Pages and API routes (App Router)
│   ├── components/             FloorPlanEditor, GridView, HeuristicExplorer, SiteHeader, ...
│   ├── db/                     Connection and Drizzle schema
│   ├── lib/                    Core logic (below)
│   └── workers/astar.worker.ts A* in a background thread
├── tests/                      Unit tests and Playwright specs
├── next.config.ts · playwright.config.ts · drizzle.config.json
└── package.json
```

| `src/lib` file | Responsibility |
| --- | --- |
| `astar.ts` | A\* algorithm, heuristics, multi-exit solving, trace frames. |
| `map-analysis.ts` | Image to grid: OCR, line detection, exit candidates. |
| `map-model.ts` / `map-topology.ts` | Map types, validation and connectivity checks. |
| `imageToGrid.ts` / `sign-regions.ts` | Conversion helpers and sign-region detection. |
| `compute-client.ts` | Talks to the background worker. |
| `custom-maps-storage.ts` / `run-storage.ts` / `workspace-client.ts` | Loading and saving maps and runs. |
| `auth.ts` | JWT creation and verification. |
| `sample-data.ts` / `seed.ts` | Bundled demo plans and seeding. |

## 🔌 API reference

| Method and path | Purpose |
| --- | --- |
| `POST /api/auth/signup` | Create an account. |
| `POST /api/auth/login` | Sign in. |
| `GET/PATCH /api/auth/me` | Load or update the profile. |
| `POST /api/maps/analyze` | Upload an image, receive a grid and candidates. |
| `GET/POST /api/maps` | List or save maps. |
| `GET/PUT/DELETE /api/maps/[id]` | Read, update or delete a map. |
| `GET /api/maps/[id]/preview` | SVG thumbnail from the stored grid. |
| `GET /api/maps/[id]/image` | Original uploaded image. |
| `GET/POST /api/runs` | List or save runs. |
| `GET /api/health` | Health and database mode. |

## 🗄️ Database

Defined in [`src/db/schema.ts`](src/db/schema.ts):

| Table | Stores |
| --- | --- |
| `users` | Email, hashed password, display name. |
| `floor_maps` | Title, source image, analysis, grid size and cells, exits, starts, obstacles. |
| `runs` | Heuristic, paths, nodes explored, time, config. |

Grid cells are stored as JSON: `{ "x,y": "cellType" }`. Passwords are stored only as bcrypt hashes.

## ☁️ Deployment

- If `DATABASE_URL` is missing, or points to `localhost` while running on **Vercel**, SafePath starts in **demo mode** with bundled sample plans.
- `GET /api/health` reports `"mode": "demo"` or `"mode": "database"`.
- For a full deployment, set `DATABASE_URL` to a hosted PostgreSQL (Neon, Supabase, AWS RDS, etc.). SSL is enabled automatically for non-local hosts.
- Always set a strong `JWT_SECRET`.
- `next.config.ts` already bundles the OCR model for the analyze route.

## 🧪 Testing

**Unit tests (13).** Heuristic correctness vs Dijkstra, blocked start or goal, unreachable people, trace frames, dynamic hazards, thin walls, blank images, exit-sign vs "NO EXIT" text, cropping, edit-tool rules, window blocking, diagonal pre-checks.

```bash
npm run test:unit
```

**End-to-end (Playwright).** The config starts the app automatically if it isn't running.

```bash
npx playwright install chromium   # first time only
npm run test:e2e
```

Specs: `landing`, `design-system`, `account`, `upload`, `monochrome`, `refinement`, `image-retention`, `simulator`. They cover header and footer parity, mobile breakpoints, keyboard focus, sign-up and profile persistence, PNG and monochrome uploads, correction and undo, route validation, simulator g/h/f display, hazards and image retention.

**CI.** [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push to `main` and every pull request: install, lint, typecheck, unit tests, build, then the full E2E suite against a disposable PostgreSQL container.

## ⚠️ Limitations

- Walls, windows and blocked passages are **impassable**.
- Unknown cells stay **walkable review candidates**. Check them against the source image.
- Red and green symbols are **candidates**, never assumed hazards or verified exits.
- Distances are **model units**, not real seconds or meters.
- People are routed **independently**. Crowding and exit capacity are **not** modeled.
- A successful result proves only that a shortest route exists **on the supplied grid**, not that the real route is safe.
- Maps and runs lists are a **shared workspace** (including samples). Per-user privacy is not implemented.
- OCR supports **English only**.

## 🩺 Troubleshooting

| Problem | Fix |
| --- | --- |
| Port 3000 or 5432 already in use | Stop the other process, or point `DATABASE_URL` elsewhere. Next.js will pick the next free web port. |
| Node version too old | Install Node 20+ (22 recommended). |
| Sharp or Tesseract errors | Re-run `npm install`. Use a supported image under 12 MB and 40 MP. |
| Everything says "demo mode" | `DATABASE_URL` is unset or unreachable. Check `/api/health`. |
| Exits not detected | Normal for hand-drawn or unusual plans. Add exits manually in the editor. |
| Playwright can't find a browser | `npx playwright install chromium`. |
| Reset local data | Stop the app and delete `.pgdata/` (**deletes all saved maps and users**). |

## 🤝 Contributing

1. Fork the repo and create a branch.
2. Make your change.
3. Run `npm run lint`, `npm run typecheck`, `npm run test:unit` and `npm run build`.
4. Open a pull request describing what and why.

## 📄 License

No license has been specified yet. Add a `LICENSE` file (for example MIT) and update this section.

---

<div align="center">

Built with Next.js, TypeScript and A\*. If SafePath helped you learn something, consider giving it a ⭐.

</div>


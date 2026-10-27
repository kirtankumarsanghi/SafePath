<div align="center">

<img src="public/assets/logo.webp" alt="SafePath logo" width="96" />

# SafePath

**Turn a building floor plan into a map a computer can solve, then watch it find the fastest way out.**

Floor-plan evacuation modeling and A\* pathfinding simulation.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs)
![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-PGlite-336791?logo=postgresql&logoColor=white)
![Tests](https://img.shields.io/badge/tests-13%20unit%20%7C%20E2E%20Playwright-brightgreen)

</div>

> **Safety notice:** SafePath is a learning and planning model. It is **not** emergency navigation software and **not** a certified building-safety system. In a real emergency, follow posted signage, certified fire-safety systems and instructions from local emergency personnel.

---

## Table of contents

1. [What is SafePath? (in plain words)](#1-what-is-safepath-in-plain-words)
2. [Who is it for?](#2-who-is-it-for)
3. [The big idea in 60 seconds](#3-the-big-idea-in-60-seconds)
4. [Step-by-step: how a floor plan becomes an escape route](#4-step-by-step-how-a-floor-plan-becomes-an-escape-route)
5. [Features in detail](#5-features-in-detail)
6. [The pages (routes)](#6-the-pages-routes)
7. [Understanding the algorithm (A\* made simple)](#7-understanding-the-algorithm-a-made-simple)
8. [Cell types: what the grid is made of](#8-cell-types-what-the-grid-is-made-of)
9. [Tech stack](#9-tech-stack)
10. [Architecture and data flow](#10-architecture-and-data-flow)
11. [Getting started](#11-getting-started)
12. [Configuration](#12-configuration)
13. [Available npm scripts](#13-available-npm-scripts)
14. [Project structure](#14-project-structure)
15. [API reference](#15-api-reference)
16. [Database](#16-database)
17. [Deploying (Vercel and demo mode)](#17-deploying-vercel-and-demo-mode)
18. [Testing](#18-testing)
19. [Model assumptions and limitations](#19-model-assumptions-and-limitations)
20. [Troubleshooting](#20-troubleshooting)
21. [Contributing](#21-contributing)
22. [License](#22-license)

---

## 1. What is SafePath? (in plain words)

Imagine you have a picture of a building's floor plan, the kind you see on the back of a hotel room door. You want to know: **"If a fire starts here, what is the shortest way out for people standing in these spots?"**

SafePath answers that question in three moves:

1. **It reads the picture.** You upload the floor plan image. SafePath finds the walls, rooms and exit signs and turns the image into a **grid**, like graph paper where every square is either a wall or open floor.
2. **It lets you fix mistakes.** Computers misread pictures sometimes. So you get an editor where you can correct walls, mark real doors and exits, and place people.
3. **It finds the best route and shows its thinking.** Using a famous algorithm called **A\*** (pronounced "A-star"), it calculates the shortest path from each person to the nearest exit. You can play it like a video, pause it, step through it one square at a time, and even add **fire** to see the route change.

The key point is that SafePath doesn't just show you the answer. It shows you **how** the algorithm arrived at it.

## 2. Who is it for?

| You are... | SafePath helps you... |
| --- | --- |
| A **student** learning algorithms | See A\* run square by square, and compare different "heuristics" (guessing strategies). |
| A **teacher** | Demonstrate pathfinding visually with real floor plans instead of abstract graphs. |
| A **safety planner / hobbyist** | Explore how layout, blocked exits and hazards affect escape routes. |
| A **developer** | Study a full-stack Next.js project that combines computer vision, a database, auth and testing. |

## 3. The big idea in 60 seconds

```
 Blueprint image  ──►  Read it (OCR +      ──►  Human review &    ──►  A* solver finds
 (PNG/JPEG/WebP)       line detection)          fix in the editor      shortest escape path
                                                (walls, doors,         for every person
                                                 exits, people)
```

- **Input:** a picture of a floor plan.
- **Middle:** a grid of squares you can edit.
- **Output:** colored paths showing how each person gets to an exit, plus statistics (steps, nodes explored, time).

## 4. Step-by-step: how a floor plan becomes an escape route

1. **Upload.** On the `/maps/new` page you upload a raster image (PNG, JPEG, WebP, GIF, TIFF or AVIF). Limits: up to **12 MB** and **40 megapixels**.
2. **Scan.** The server cleans the image and looks for:
   - **Walls and lines** (using the Sharp image library, thresholding and noise reduction).
   - **Text** such as "EXIT" (using Tesseract OCR, fully **offline**, no internet needed).
   - **Colored symbols** (green exit signs, red fire equipment), which are marked as *candidates* for you to confirm.
3. **Refine.** You see the original image next to the generated grid. You can:
   - change the **darkness threshold** (how dark a pixel must be to count as a wall),
   - paint walkable corridors or walls,
   - confirm which candidates are **real exits**,
   - place **occupant start positions** (where people stand),
   - undo mistakes.
4. **Validate and save.** The server checks the map is sensible (starts and exits exist, are inside the grid, and so on) and saves the map **and** its computed result together, so you never end up with half-saved data.
5. **Simulate.** Open the **Simulator**. Press play, scrub the timeline, switch heuristics, and drop fire or smoke on the map. The route recalculates, or honestly tells you that **no route exists**.

## 5. Features in detail

### 5.1 Blueprint ingestion (computer vision)
- **Sharp** handles line detection, thresholding and noise reduction.
- **Tesseract.js** does OCR using a bundled language file at `assets/ocr/eng.traineddata.gz`, so it works without internet.
- Real exit signs are told apart from **"NO EXIT"** text and **fire-equipment** markings.
- Thin walls and small rooms are **kept**, not accidentally erased.
- Colored safety symbols are only ever **review candidates**. SafePath never assumes a red symbol is a fire or a green one is a verified exit.

### 5.2 Human-in-the-loop grid editor
- Paint walls, corridors, doors, exits and starting points.
- Tune conversion thresholds and see the grid update.
- Undo and correction support.
- Your original uploaded image is **kept** when you come back to edit a map.

### 5.3 A\* solver and simulator
- **Multiple people, multiple exits.** Each person finds their own shortest path to an exit.
- **Three heuristics:** Manhattan, Euclidean and Chebyshev (explained in [section 7](#7-understanding-the-algorithm-a-made-simple)).
- **Checked against Dijkstra.** The tests compare every heuristic to an independent Dijkstra search to prove results are truly optimal.
- **Realistic movement.** You cannot cut diagonally through the corner of a wall.
- **Dynamic hazards.** Place fire or smoke while the simulation is running. The solver reroutes, or reports that no safe route exists.
- **Step-by-step trace.** Scrub back and forth through every "open" and "closed" square the algorithm considered.
- **Runs in the background.** The heavy calculation runs in a Web Worker (`src/workers/astar.worker.ts`) so the page stays smooth.

### 5.4 Workspace
- **Dashboard** with counts, live system status and map thumbnails drawn from each map's real stored grid.
- **Plan library:** searchable list of saved maps, with a confirmation before delete (and automatic rollback if a delete fails).
- **Run history:** a log of every simulation (nodes explored, path length, time, outcome).
- **Accounts:** email and password sign-up/sign-in using JWT, with an editable profile.

### 5.5 One consistent interface
- The static homepage and the app pages share the same header, footer, spacing and mobile breakpoints.
- `public/site.css` is the single source for header/footer styling.
- `public/navigation.json` is the single definition of the menu links.
- Respects the operating-system setting **"reduce motion"**: animations settle instantly.
- Light and dark theme polish across the landing page, simulator and theory pages.

## 6. The pages (routes)

| Route | Name | What you do there |
| --- | --- | --- |
| `/` | Landing page | See a live A\* animation and an engine console log. |
| `/dashboard` | Command center | Overview of maps, exits, start points and saved runs. |
| `/maps/new` | Upload and scan | Upload a plan, review OCR, convert to grid, validate. |
| `/maps` | Plan library | Search, preview, edit and delete saved plans. |
| `/maps/[id]` | Map detail / editor | Edit an existing map with the grid editor. |
| `/simulator` | A\* simulator | Play/pause, step through, place hazards, change heuristic. |
| `/theory` | Algorithm theory | Learn about heuristics, tie-breaking and the Dijkstra benchmark. |
| `/runs` | Run history | Audit log of every simulation. |
| `/auth` | Sign up / sign in | Create an account or log in. |
| `/profile` | Profile | Change your display name, sign out. |

## 7. Understanding the algorithm (A\* made simple)

**The problem:** find the shortest path from a start square to an exit square across a grid with walls.

**The naive way (Dijkstra):** spread out in every direction equally, like ripples in a pond, until you hit the exit. It is correct but wastes time exploring in the wrong direction.

**The smart way (A\*):** also spread out, but always pick the most promising square next. "Promising" is scored by:

```
f = g + h
```

| Letter | Meaning |
| --- | --- |
| `g` | How far we have **already walked** from the start to this square. |
| `h` | Our **guess** of how far is left from this square to the exit (the *heuristic*). |
| `f` | The total estimated cost of a path going through this square. Lowest `f` is explored first. |

**Open set / Closed set:**
- **Open** = squares we have seen but not yet fully explored (the frontier).
- **Closed** = squares already fully explored.

The simulator draws both so you can literally watch the frontier grow.

### The three heuristics

| Heuristic | Idea | Best when | Formula |
| --- | --- | --- | --- |
| **Manhattan** | Count blocks like a taxi in a city (no diagonals). | Movement is up/down/left/right. | `abs(dx) + abs(dy)` |
| **Euclidean** | Straight-line "as the crow flies" distance. | Diagonal moves are allowed. | `sqrt(dx² + dy²)` |
| **Chebyshev** | The larger of the horizontal or vertical distance. | Diagonal moves cost the same as straight ones. | `max(abs(dx), abs(dy))` |

A heuristic must **never overestimate** the true remaining distance (this is called being *admissible*). If it does, A\* may return a path that is not the shortest. SafePath's unit tests verify this against Dijkstra.

### Other rules
- **Diagonal corner-cutting is not allowed.** You cannot squeeze diagonally between two wall corners.
- **Obstacles** (such as debris or furniture) can be walked through but cost **3** instead of 1, so the algorithm tries to avoid them.
- **No route?** If walls or fire block every path, SafePath says so honestly rather than inventing a path.

The core code is in [`src/lib/astar.ts`](src/lib/astar.ts).

## 8. Cell types: what the grid is made of

Every square on the grid has a type:

| Type | Walkable? | Meaning |
| --- | --- | --- |
| `empty` | Yes (cost 1) | Open floor. |
| `unknown` | Yes (review) | Not sure what was there. Stays walkable, but check it against the original image. |
| `door` | Yes | A doorway. |
| `start` | Yes | A person's starting position. |
| `exit` | Yes (goal) | A confirmed exit. |
| `obstacle` | Yes (cost 3) | Slows movement, so the route avoids it when possible. |
| `wall` | **No** | Solid wall. |
| `window` | **No** | Windows are treated as blocked. |
| `blocked` | **No** | A manually blocked passage. |
| `fire` | **No** | Active hazard, impassable. Fire keeps the terrain underneath it, so removing the fire restores the floor. |

## 9. Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 16 (App Router, Turbopack), React 19, TypeScript (strict), hand-written CSS design system |
| Backend | Next.js API routes (Node.js runtime) |
| Database | PostgreSQL via embedded **PGlite** + **pg-gateway** (port 5432), saved to `.pgdata/`. Any external PostgreSQL also works. |
| ORM | Drizzle ORM (tables: `users`, `floor_maps`, `runs`) |
| Image processing | Sharp |
| OCR | Tesseract.js, offline English model |
| Auth | JWT (`jsonwebtoken`) and `bcryptjs` password hashing |
| Icons | lucide-react |
| Testing | `node:test` via `tsx` (unit), Playwright (end-to-end) |
| CI | GitHub Actions |

> You do not need to install PostgreSQL yourself. In local development SafePath starts an embedded PostgreSQL-compatible database for you.

## 10. Architecture and data flow

```
┌────────────────────────────────────────────────────────────────────┐
│ Browser                                                            │
│  Landing (static HTML)   Next.js pages (React)                     │
│  └─ public/index.html    ├─ Upload → Editor → Simulator            │
│                          └─ Web Worker runs A* off the main thread │
└───────────────┬────────────────────────────────────────────────────┘
                │ fetch /api/...
┌───────────────▼────────────────────────────────────────────────────┐
│ Next.js server (API routes)                                        │
│  /api/maps/analyze  → Sharp + Tesseract (image → grid)             │
│  /api/maps, /api/runs, /api/auth/*  → validation + Drizzle ORM     │
└───────────────┬────────────────────────────────────────────────────┘
                │ SQL
┌───────────────▼────────────────────────────────────────────────────┐
│ PostgreSQL (embedded PGlite locally, or any external server)       │
│  users · floor_maps · runs                                         │
└────────────────────────────────────────────────────────────────────┘
```

A small trick: `next.config.ts` **rewrites** `/` to `public/index.html`, so the homepage stays plain, fast HTML while every other page is a server-backed Next.js page.

## 11. Getting started

### Prerequisites
- **Node.js 20 or newer** (22 recommended; Next.js 16 needs 20+)
- **npm**
- **Git**

### Install and run

```bash
# 1. Get the code
git clone https://github.com/kirtankumarsanghi/SafePath.git
cd SafePath

# 2. Install dependencies
npm install

# 3. Create your environment file
cp .env.example .env        # on Windows PowerShell: Copy-Item .env.example .env

# 4. Start the dev server (also starts the embedded database)
npm run dev
```

Open <http://localhost:3000>.

### Try it in 2 minutes
1. Go to `/auth` and create an account.
2. Go to `/maps/new` and upload the bundled sample `public/samples/campus-plan.png`.
3. Review the generated grid, confirm exits, place a few people.
4. Save, then open `/simulator` and press **play**.
5. Drop some **fire** in the way and watch the route change.

### Production build

```bash
npm run build
npm start
```

Health check: <http://localhost:3000/api/health>

## 12. Configuration

Copy `.env.example` to `.env` and edit:

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string. Default for local: `postgresql://postgres:postgres@127.0.0.1:5432/app_db` |
| `JWT_SECRET` | Yes | Secret used to sign login tokens. **Use a long, random, unique value in any real deployment.** |

> **Warning:** the example value of `JWT_SECRET` is for local development only. Never reuse it in production.

> **Warning:** the legacy seed script (`npm run seed`) **clears maps and runs**. Do not run it on data you want to keep.

## 13. Available npm scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the development server (and embedded DB). |
| `npm run build` | Create an optimized production build. |
| `npm start` | Run the production build. |
| `npm run db` | Start the embedded database server only. |
| `npm run seed` | Seed sample data (**destructive**, see warning above). |
| `npm run lint` | Check code style with ESLint. |
| `npm run typecheck` | Check TypeScript types without building. |
| `npm run test:unit` (or `npm test`) | Run the 13 unit tests. |
| `npm run test:e2e` | Run the Playwright end-to-end tests. |

The `scripts/run-cmd.cjs` helper makes sure a Node 20+ binary is used and that `DATABASE_URL`/`JWT_SECRET` have defaults when not set.

## 14. Project structure

```
SafePath/
├── .github/workflows/ci.yml   Continuous integration (lint, types, tests, build, E2E)
├── assets/ocr/                Offline Tesseract language model
├── public/                    Static homepage and assets
│   ├── index.html             Landing page
│   ├── styles.css             Landing page styling
│   ├── site.css               Shared header/footer/button styles
│   ├── main.js                Menu, account state, hero A* animation
│   ├── navigation.json        Menu definition (single source of truth)
│   ├── assets/logo.webp       Logo
│   └── samples/               Sample floor plans (PNG and SVG)
├── scripts/
│   ├── run-cmd.cjs            Cross-platform command runner
│   └── db-server.mjs          Embedded PostgreSQL server
├── src/
│   ├── app/                   Pages and API routes (Next.js App Router)
│   │   ├── api/               auth, maps, runs, health endpoints
│   │   ├── dashboard/ maps/ runs/ simulator/ theory/ auth/ profile/
│   │   └── *.css              Global, shell and planner styles
│   ├── components/            FloorPlanEditor, GridView, HeuristicExplorer,
│   │                          SiteHeader, SiteFooter, DashboardLayout, PlanTile
│   ├── db/                    Database connection and Drizzle schema
│   ├── lib/                   Core logic (see below)
│   └── workers/astar.worker.ts  Runs A* in a background thread
├── tests/                     Unit tests and Playwright E2E specs
├── drizzle.config.json        Drizzle ORM config
├── next.config.ts             Rewrites `/`, bundles OCR files
├── playwright.config.ts       E2E test configuration
└── package.json
```

### Key files in `src/lib/`

| File | Responsibility |
| --- | --- |
| `astar.ts` | The A\* algorithm, heuristics, multi-exit solving, trace frames. |
| `map-analysis.ts` | Turns an image into a grid (OCR, line detection, exit candidates). |
| `map-model.ts` | Shared map data types and validation rules. |
| `map-topology.ts` | Checks connectivity between starts, doors and exits. |
| `imageToGrid.ts` | Image-to-grid conversion helpers. |
| `sign-regions.ts` | Finds sign-like regions (green/red symbols). |
| `compute-client.ts` | Talks to the background worker. |
| `custom-maps-storage.ts`, `run-storage.ts`, `workspace-client.ts` | Loading and saving maps/runs from the browser. |
| `auth.ts` | JWT creation and verification. |
| `sample-data.ts`, `seed.ts` | Bundled demo plans and seeding. |

## 15. API reference

| Method and path | Purpose |
| --- | --- |
| `POST /api/auth/signup` | Create an account. |
| `POST /api/auth/login` | Log in and receive a token. |
| `GET/PATCH /api/auth/me` | Load or update the signed-in profile. |
| `POST /api/maps/analyze` | Upload an image and receive a generated grid and candidates. |
| `GET/POST /api/maps` | List maps or save a new validated map. |
| `GET/PUT/DELETE /api/maps/[id]` | Read, update or delete one map. |
| `GET /api/maps/[id]/preview` | SVG thumbnail drawn from the stored grid. |
| `GET /api/maps/[id]/image` | The original uploaded image. |
| `GET/POST /api/runs` | List or save simulation runs. |
| `GET /api/health` | Health and database status. |

## 16. Database

Three tables, defined in [`src/db/schema.ts`](src/db/schema.ts):

| Table | Stores |
| --- | --- |
| `users` | Email, hashed password, display name. |
| `floor_maps` | Title, original image, analysis, grid size, grid cells, exits, starts, obstacles. |
| `runs` | Each simulation: heuristic used, paths, nodes explored, time taken, config. |

Grid cells are stored as JSON in the form `{ "x,y": "cellType" }`. Passwords are never stored in plain text.

## 17. Deploying (Vercel and demo mode)

SafePath is designed to still work if no real database is available:

- If `DATABASE_URL` is missing, or points to `localhost` while running on **Vercel**, the app starts in **demo mode** with bundled sample floor plans.
- `GET /api/health` reports which mode you are in (`"mode": "demo"` or `"database"`).
- For a full deployment, set `DATABASE_URL` to a hosted PostgreSQL (Neon, Supabase, AWS RDS and similar). SSL is enabled automatically for non-local databases, and tables are created automatically.
- Always set a strong `JWT_SECRET` in your hosting dashboard.
- `next.config.ts` already includes the OCR model and Tesseract files in the analyze route's bundle.

## 18. Testing

### Unit tests (13)
Cover: heuristic correctness against Dijkstra, blocked start/goal, unreachable people, trace frames, dynamic hazards, thin walls, blank images (no invented exits), exit-sign vs "NO EXIT" text, cropping, edit-tool rules, window blocking, and diagonal pre-checks.

```bash
npm run test:unit
```

### End-to-end tests (Playwright)
`playwright.config.ts` starts the app automatically if it is not already running.

```bash
npx playwright install chromium   # first time only
npm run test:e2e
```

They cover: header/footer consistency, mobile breakpoints, keyboard focus, sign-up and profile persistence, PNG and monochrome uploads, corrections and undo, route validation, simulator controls, dynamic hazards, and keeping uploaded images when editing.

### Continuous integration
`.github/workflows/ci.yml` runs on every push to `main` and every pull request: install, lint, typecheck, unit tests, production build, and the full E2E suite against a throwaway PostgreSQL container.

## 19. Model assumptions and limitations

Please read these before trusting any result:

- Walls, windows and blocked passages are **impassable**.
- Unknown cells stay **walkable review candidates**. Check them against the source image.
- Red and green symbols are **review candidates**, never assumed to be hazards or verified exits.
- Grid distances are **model units**, not real seconds or meters.
- People are routed **independently**. Crowding and exit capacity are **not** modeled.
- A successful A\* result only proves **a shortest route exists on the grid you supplied**. It does not prove the real building route is safe.
- Maps and runs lists are a **shared workspace** (including sample plans). Per-user privacy for these lists is not implemented yet.
- OCR supports **English only**.

## 20. Troubleshooting

| Problem | Fix |
| --- | --- |
| `Port 5432 already in use` | Another PostgreSQL is running. Stop it or point `DATABASE_URL` elsewhere. |
| `Node version too old` | Install Node 20+ (22 recommended). |
| Sharp or Tesseract errors | Re-run `npm install`. Make sure the image is a supported format under 12 MB / 40 MP. |
| Everything says "demo mode" | `DATABASE_URL` is not set or unreachable. Check `/api/health`. |
| Exits not detected | Normal for hand-drawn or unusual plans. Add exits manually in the editor. |
| Playwright cannot find a browser | Run `npx playwright install chromium`. |
| Reset local data | Stop the app and delete the `.pgdata/` folder (**this deletes all saved maps and users**). |

## 21. Contributing

Issues and pull requests are welcome.

1. Fork the repo and create a branch.
2. Make your change.
3. Run `npm run lint`, `npm run typecheck`, `npm run test:unit` and `npm run build`.
4. Open a pull request describing what and why.

## 22. License

No license has been specified yet. Add a `LICENSE` file (for example MIT) and update this section.

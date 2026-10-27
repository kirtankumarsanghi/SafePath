# Contributing to SafePath

Thank you for your interest in contributing to **SafePath**!

## Development Workflow

1. **Fork and clone** the repository:
   ```bash
   git clone https://github.com/kirtankumarsanghi/SafePath.git
   cd SafePath
   npm install
   cp .env.example .env
   ```
2. **Create a feature branch**:
   ```bash
   git checkout -b feat/your-feature-name
   ```
3. **Run local checks** before opening a Pull Request:
   ```bash
   npm run lint
   npm run typecheck
   npm run test:unit
   npm run build
   ```
4. **End-to-end verification** (when modifying UI or routes):
   ```bash
   npx playwright install chromium
   npm run test:e2e
   ```

## Guidelines

- **Safety & Honesty First:** Never auto-confirm unverified OCR/color candidates as real exits or active hazards. Always preserve human-in-the-loop review.
- **Algorithm Admissibility:** Any changes to `src/lib/astar.ts` must preserve heuristic admissibility and pass the Dijkstra baseline comparison tests.
- **Accessibility:** Keep keyboard navigation (`Tab`, `Escape`, arrow keys) and screen-reader labels intact.

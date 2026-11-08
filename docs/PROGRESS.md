# Delivery progress

Snapshot: 2026-11-08, Europe/Kyiv. Current authorized scope: stages 00-03; stop before business modules. Q-01 through Q-05 remain open.

## Foundation delivery log

- Both setup PRs #1 were still open and unmerged at the start. Both clean feature branches `feature/00-03-foundation` start at their setup heads: backend `f4eaf210bb97780f4d930cbb606d362fc4b8e1ba`, frontend `18756f1eacda3fb83c00a523d410f8438a3a0e8c`. No local main update was necessary or performed. New PRs will explicitly depend on the setup PRs.
- Stage 00: complete proposed product Use Case and UML class diagrams, plus booking pattern sequence, are in MODELING.md. All three compiled and rendered locally using PlantUML 1.2026.9, image digest `sha256:9b5071ab56a4192aac458ab4b0d42261c22c8109695894ae5be6013c3be6cac1`. A separate source review checked all actors, use-case IDs, relationship multiplicities and conditional confirmation/refund effects. One class-source syntax issue was fixed before successful rendering. Business behavior and GoF implementations remain planned.

The preparation record below is historical. Later foundation log entries supersede its current-state and next-action descriptions.

## Current state

Both repositories were empty locally and remotely at the initial inspection, with unborn local `master` branches and GitHub's intended default branch `main`. There was no existing application work to preserve. The parent workspace is not a Git repository.

The documentation baseline includes English product requirements, a mandatory/optional verification matrix, staged delivery and contract synchronization, a proposed architecture, open decisions, current-status READMEs and ignore rules. The original local source was copied unchanged to `docs/project.md`; it remains local while English product documents are published. SHA-256 of both source and archive: `3007989B9382778A793013D37EAF5F34CD8D98EDB077E1780E85C212927770CE`.

No product modules, framework scaffolds, package files, migrations, Compose configuration, OpenAPI schemas, API clients or CI workflows have been created. Stage 00 planning is prepared, but the Use Case and whole-system class diagrams remain planned. Application compatibility has not been established.

## Environment checks actually performed

| Check | Observed result |
|---|---|
| Workspace | `C:/Users/Vitalii/Desktop/ActiveHub`; both independent repository directories exist; parent `.git` absent |
| Initial Git status/branches/history | Both clean and unborn on master; no commit history or remote refs |
| Backend origin | `https://github.com/Vitaliiir16/activehub-backend.git` |
| Frontend origin | `https://github.com/Vitaliiir16/activehub-frontend.git` |
| Git | 2.55.0.windows.2 |
| Authorship | Existing owner name/email resolve in both repositories; no identity or global settings changed |
| GitHub CLI | 2.103.3, found at `C:/Program Files/GitHub CLI/gh.exe`; absent from sandbox PATH |
| GitHub authorization | Owner account authenticated through Windows keyring; no token printed |
| Remote access | Both `git ls-remote --symref origin` calls succeeded with no refs; repository API reports push permission for both, public visibility and default branch main |
| Node.js | v24.18.0 |
| npm.cmd / npx.cmd | Both 11.16.0 |
| Docker CLI | 29.9.2, per-user path `C:/Users/Vitalii/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe` |
| Docker Compose | v5.6.1 |
| Docker Engine | Running Linux engine 29.9.2, amd64, Docker Desktop 4.96.3; zero existing containers during inspection |
| Tool access caveat | Sandbox user caused Git ownership errors and omitted per-user Docker PATH. Owner-context checks succeeded; no global safe-directory exception or machine change was made. |

No packages were installed and no containers were created. Installed versions were observed, not certified against a nonexistent application.

## Documentation verification

The full original specification was read. All seven distinct optional [S] capabilities were inventoried against the source. Mandatory business invariants are mapped individually BR-01 through BR-23, field validation V-01 through V-14 and notification cases N-01 through N-20. Grouped mandatory requirements retain all listed subcases.

Archive SHA-256 equality was verified. Automated checks passed across all 12 publishable files: English authored text, no local-only terminology, no token/private-key signatures, no trailing whitespace and all relative Markdown targets present. Matrix inventories passed: 105 mandatory scope rows, 23 business invariants, 20 mandatory notification cases, 14 validation rules and seven optional capabilities, with unique IDs. Both staged diffs passed `git diff --cached --check`. Ignore probes confirmed environment files, dependencies, builds, coverage and local secrets are excluded while `.env.example` is allowed. The source archive and local instructions are excluded through repository-local rules and absent from the staged filenames.

A separate same-session full staged-diff review compared the requirements, matrix, architecture, decisions and READMEs to the source. It corrected the U13/U14 profile/preferences versus notification-settings labels and removed an unnecessary age-label interpretation. This was not an independent review. Initial publication succeeded; remote main hashes matched local hashes in both repositories and both worktrees were clean after push.

Application lint, typecheck, build, domain tests, PostgreSQL integration and E2E: **not run** because applications, scripts and infrastructure do not yet exist. No independent review session or CI run has occurred.

## Revision and publication record

| Snapshot boundary | Backend revision | Frontend revision | Meaning |
|---|---|---|---|
| Initial inspection | None (unborn branch) | None (unborn branch) | Empty local and remote repositories |
| Published main baseline | `492eff2f77f974b97573591251054b6df5f209de` | `89201bc3855288a19aeaf8f03b5f51a8a26c7f96` | Documentation-only pair; both push operations succeeded and remote refs matched |

Initial meaningful documentation commits were published on `main` without an artificial empty base. Backend baseline: [492eff2](https://github.com/Vitaliiir16/activehub-backend/commit/492eff2f77f974b97573591251054b6df5f209de). Frontend baseline: [89201bc](https://github.com/Vitaliiir16/activehub-frontend/commit/89201bc3855288a19aeaf8f03b5f51a8a26c7f96). Both repositories now have a `setup/documentation-handoff` branch for this verification record and pinned frontend references. The exact pair above describes the published main baselines, not this file's eventual commit. Final setup hashes and PR links belong in the handoff or a subsequent snapshot; no tested application pair exists. No merge is authorized.

## Blockers and owner decisions

No environment or repository-preparation blocker remains. Business-rule questions are scoped in ASSUMPTIONS.md: Q-01 already-spent points reversal versus nonnegative balance; Q-02 free-quota month and rescheduling; Q-03 exact booking cutoff; Q-04 corporate exhaustion/card eligibility. Q-05 records the dedicated-admin-list scope inconsistency. None blocks this preparation; the affected behavior needs a decision before acceptance.

## Next actions

1. Owner review and merge of the setup publication-record PRs; the initial documentation is already available on main. Q-01 through Q-05 remain open and are not implied approved by publication.
2. Stop after preparation. On the next authorized implementation run, finish stage 00 Use Case/class modeling, then stage 01 scaffolds and stage 02 infrastructure with real check scripts and environment examples. Keep the fixed stack and all mandatory scope.
3. Before further changes inspect the final setup branch heads/PR status in both repositories and the delivery handoff, then reconcile this snapshot with any subsequent owner work.

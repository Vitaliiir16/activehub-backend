# System models

Stage 00 models describe the complete intended product. All business classes, use cases and GoF collaborations shown here are **proposed**, including optional [S] extensions. Creating a diagram does not implement its behavior. Q-01 through Q-05 remain open.

- [Use Case diagram](diagrams/use-cases.svg), [editable PlantUML source](diagrams/use-cases.puml): all G1-G4, U1-U16, O1-O14, A1-A9 and System S1-S7. Optional G4/O14 and redemption are marked [S]. System S1-S7 are mandatory identifiers.
- [Whole-system class diagram](diagrams/classes.svg), [source](diagrams/classes.puml): presentation, application services, domain entities, multiplicities, variation policies and infrastructure ports/adapters.
- [Planned pattern collaboration](diagrams/booking-patterns.svg), [source](diagrams/booking-patterns.puml): booking transaction, Strategy, State, price chain, outbox Observer and mail Adapter.

Use Case include arrows point from the including behavior to required behavior; extend arrows point from optional/conditional behavior to its base. Confirmation and refunds are conditional: manual approval alone does not award points while card payment is still due. Shared authorization applies to all protected operations. The guest has no catalog access; administrators have no booking or chat-content access.

All logical entities include UUID and timestamps. The diagram shows exclusive role profiles, payment subject exclusivity, shared conversations and preserved history. Proposed technical records (sessions, jobs, outbox, idempotency and transition history) are additions needed to satisfy persistence and retry requirements, not completed tables. The bootstrap migration in stage 02 will implement only the minimum account/admin and reference/configuration tables required for seeds.

The architecture explains each proposed pattern and when a simpler implementation is appropriate. No GoF implementation is claimed by these diagrams. Update the model's status and real source links as each later module is delivered.

Render locally with the PlantUML Docker image (record its resolved digest in progress):

```powershell
docker run --rm --mount "type=bind,source=$((Get-Location).Path)/docs/diagrams,target=/data" plantuml/plantuml -tsvg -nometadata /data/*.puml
```

The SVG artifacts are committed so reviewers can inspect the diagrams without installing Java or Graphviz. No remote rendering service receives the source.

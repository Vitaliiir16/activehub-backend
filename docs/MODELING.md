# System models

The whole-system class model and booking collaboration describe the intended product. Stages 04-07 implement accounts, catalog, card/free bookings and simulated payments. The architecture document includes the current marketplace module/transaction diagram. The original whole-system and pattern diagrams remain target designs; their old stage 04 colors are historical, not a current completion claim. The Use Case diagram marks complete account cases green and welcome-only subsets yellow. Q-01 through Q-05 remain open.

- [Use Case diagram](diagrams/use-cases.svg), [editable PlantUML source](diagrams/use-cases.puml): all G1-G4, U1-U16, O1-O14, A1-A9 and System S1-S7. Optional G4/O14 and redemption are marked [S]. System S1-S7 are mandatory identifiers.
- [Whole-system class diagram](diagrams/classes.svg), [source](diagrams/classes.puml): presentation, application services, domain entities, multiplicities, variation policies and infrastructure ports/adapters.
- [Planned pattern collaboration](diagrams/booking-patterns.svg), [source](diagrams/booking-patterns.puml): booking transaction, Strategy, State, price chain, outbox Observer and mail Adapter.
- [Implemented account modules](diagrams/accounts-current.svg), [source](diagrams/accounts-current.puml): actual source modules, SQL tables, worker and mail port/Adapter. Module stereotypes describe real function modules rather than invented runtime classes.

Use Case include arrows point from the including behavior to required behavior; extend arrows point from optional/conditional behavior to its base. Confirmation and refunds are conditional: manual approval alone does not award points while card payment is still due. Shared authorization applies to all protected operations. The guest has no catalog access; administrators have no booking or chat-content access.

The logical class model preserves role profiles, payment subjects, shared conversations and history. Stage 04 migrations add real user/organizer profiles, directions/preferences, settings, sessions/CSRF contexts, owned images, notifications/outbox and initial card metadata. Financial entities, general jobs/idempotency and their proposed classes remain planned. The account implementation uses cohesive TypeScript function modules; the whole-system class design must not be mistaken for a list of implemented classes.

The implemented account diagram and README identify the real WelcomeMail/MailpitWelcomeMail Adapter. Other GoF collaborations remain proposed. G1/G2/G3, U13/U14/U16, O12 and A8 are implemented; U15/O13/S4 currently cover welcome notifications/email only. The optional administrator list and password recovery remain planned.

Render locally with the PlantUML Docker image (record its resolved digest in progress):

```powershell
docker run --rm --mount "type=bind,source=$((Get-Location).Path)/docs/diagrams,target=/data" plantuml/plantuml -tsvg -nometadata /data/*.puml
```

The SVG artifacts are committed so reviewers can inspect the diagrams without installing Java or Graphviz. No remote rendering service receives the source.

## Stage 05-07 model reconciliation

Actual EventRow/SessionRow/BookingRow types map to events/event_sessions/bookings. booking_history records transitions; payments holds attempts/last4 and refunds enforces one full return per successful payment. Photo and idempotency records are infrastructure entities. The current implemented module diagram and transaction boundaries are in [ARCHITECTURE.md](ARCHITECTURE.md). SeatPolicy Strategy, PaymentGateway/SimulatedCardGateway Adapter and the stage 09 PriceStep Chain of Responsibility are implemented; GoF State and Observer remain proposed. All communications/reminder use cases remain partial until stage 10. The existing whole-system class diagram is retained as the target model, rather than relabelling future classes as runtime code.

# System models

The stage 13 models describe actual implementation and preserve all mandatory source Use Case IDs.

- [Use Cases](diagrams/use-cases.svg), [PlantUML](diagrams/use-cases.puml): Guest, User, Organizer, Administrator and System; G1-G3, U1-U16, O1-O13, A1-A9 and S1-S7. Grey [S] cases remain optional. System S identifiers are mandatory use cases.
- [Class model](diagrams/classes.svg), [PlantUML](diagrams/classes.puml): real TypeScript function modules, interfaces, row types and SQL records with role profiles, events/sessions, bookings/history, payments/refunds, immutable purchases, visits/points/quota, chat and delivery infrastructure.
- [Booking collaboration](diagrams/booking-patterns.svg), [PlantUML](diagrams/booking-patterns.puml): seat Strategy, pricing Chain of Responsibility, payment/SMTP Adapters, confirmation and transactional compensation.

Module stereotypes group functions; they do not claim runtime classes. The original stage 04 account-only diagram is retained as historical context. State, Observer, Builder and Singleton are not labelled implemented patterns. Source paths, real symbols and SOLID/GRASP examples are in [ARCHITECTURE.md](ARCHITECTURE.md).

The three updated diagrams were compiled locally with PlantUML image sha256:9b5071ab56a4192aac458ab4b0d42261c22c8109695894ae5be6013c3be6cac1. SVGs are committed for review without installing tools. Rendering commands operate only on changed sources; no external rendering service receives project material.

Diagram colour means implementation presence, not exhaustive test coverage. Consult [FINAL_ACCEPTANCE.md](FINAL_ACCEPTANCE.md) and the matrix for the exact verification boundary. Q-01 through Q-05 follow the recorded owner decisions.

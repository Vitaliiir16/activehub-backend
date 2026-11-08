import { z } from "zod";
export const kind = z.enum([
  "TRAINING",
  "SECTION",
  "HALL_RENTAL",
  "TEAM_SEARCH",
  "EVENT",
]);
const skill = z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED", "ANY"]),
  age = z.enum(["CHILDREN", "TEENS", "ADULTS", "SENIORS", "ANY"]);
export const instant = z.iso.datetime({ offset: true });
export const sessionInput = z.strictObject({
  startsAt: instant,
  endsAt: instant,
  seatsTotal: z.number().int().min(1).max(1000),
});
const eventFields = {
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(1).max(5000),
  directionId: z.uuid(),
  cityId: z.uuid(),
  address: z.string().trim().min(1).max(500),
  skill,
  age,
  priceMinor: z.number().int().min(0).max(10000000),
  promoPriceMinor: z.number().int().min(0).max(10000000).nullable().optional(),
  promoUntil: instant.nullable().optional(),
  seatsPerSession: z.number().int().min(1).max(1000),
  confirmationMode: z.enum(["AUTO", "MANUAL"]).optional(),
  trainerName: z.string().trim().max(100).optional(),
};
export const eventCreate = z.strictObject({
  ...eventFields,
  kind,
  sessions: z.array(sessionInput).min(1).max(60),
});
export const eventPatch = z
  .strictObject(eventFields)
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    "Change at least one field",
  );
export const reason = z.strictObject({
  reason: z.string().trim().min(1).max(500),
});
export const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};
const filters = {
  id: z.uuid().optional(),
  title: z.string().max(120).optional(),
  organizerId: z.uuid().optional(),
  cityId: z.union([z.uuid(), z.literal("all")]).optional(),
  directionId: z.uuid().optional(),
  kind: kind.optional(),
  skill: skill.optional(),
  age: age.optional(),
  dateFrom: z.iso.date().optional(),
  dateTo: z.iso.date().optional(),
  minPriceMinor: z.coerce.number().int().min(0).optional(),
  maxPriceMinor: z.coerce.number().int().min(0).optional(),
  availableOnly: z.enum(["true", "false"]).optional(),
  trainerName: z.string().max(100).optional(),
};
export const eventQuery = z.strictObject({
  ...pagination,
  ...filters,
  status: z
    .enum(["ACTIVE", "PAUSED", "CANCELLED", "BLOCKED", "DELETED"])
    .optional(),
  sort: z
    .enum(["nearest", "priceAsc", "priceDesc", "newest"])
    .default("nearest"),
});
export const organizerQuery = z.strictObject({
  ...pagination,
  name: z.string().max(100).optional(),
  type: z.enum(["TRAINER", "CLUB", "VENUE", "ORGANIZER"]).optional(),
  directionId: z.uuid().optional(),
  cityId: z.uuid().optional(),
  sort: z.enum(["newest", "oldest"]).default("newest"),
});
export const sessionQuery = z.strictObject({
  ...pagination,
  eventId: z.uuid().optional(),
  dateFrom: z.iso.date().optional(),
  dateTo: z.iso.date().optional(),
  status: z.enum(["SCHEDULED", "CANCELLED", "COMPLETED"]).optional(),
  sort: z
    .enum(["newest", "oldest", "startsAtAsc", "startsAtDesc"])
    .default("startsAtAsc"),
});

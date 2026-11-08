import { z } from "zod";

const name = (min: number, max: number) => z.string().trim().min(min).max(max);
export const email = z
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());
export const password = z
  .string()
  .min(8)
  .max(256)
  .regex(/[A-Za-z]/, "Include a letter")
  .regex(/[0-9]/, "Include a digit");
const phone = z
  .string()
  .regex(
    /^\+[1-9][0-9]{7,14}$/,
    "Use international format, for example +380501234567",
  );
const ids = z
  .array(z.uuid())
  .max(100)
  .refine(
    (values) => new Set(values).size === values.length,
    "Choose each direction once",
  );
const gender = z.enum(["MALE", "FEMALE", "UNDISCLOSED"]);
const type = z.enum(["TRAINER", "CLUB", "VENUE", "ORGANIZER"]);
const common = {
  email,
  password,
  passwordConfirmation: password,
  phone,
  cityId: z.uuid(),
};
const confirmed = (data: { password: string; passwordConfirmation: string }) =>
  data.password === data.passwordConfirmation;
export const userRegistration = z
  .strictObject({
    ...common,
    firstName: name(2, 50),
    lastName: name(2, 50),
    gender,
  })
  .refine(confirmed, {
    path: ["passwordConfirmation"],
    message: "Passwords do not match",
  });
export const organizerRegistration = z
  .strictObject({
    ...common,
    name: name(2, 100),
    type,
    directionIds: ids.min(1),
    description: name(0, 5000).optional(),
  })
  .refine(confirmed, {
    path: ["passwordConfirmation"],
    message: "Passwords do not match",
  });
export const loginInput = z.strictObject({
  email,
  password: z.string().min(1).max(256),
});
export const adminInput = z.strictObject({
  email,
  password,
  displayName: name(2, 100),
});
export const passwordInput = z.strictObject({
  currentPassword: z.string().min(1).max(256),
  newPassword: password,
});
export const statusInput = z.strictObject({
  status: z.enum(["ACTIVE", "BLOCKED"]),
  reason: name(1, 500),
});
const userPatch = z.strictObject({
  email: email.optional(),
  firstName: name(2, 50).optional(),
  lastName: name(2, 50).optional(),
  phone: phone.optional(),
  cityId: z.uuid().optional(),
  gender: gender.optional(),
  photoId: z.uuid().nullable().optional(),
  preferredDirectionIds: ids.optional(),
});
const organizerPatch = z.strictObject({
  email: email.optional(),
  name: name(2, 100).optional(),
  type: type.optional(),
  phone: phone.nullable().optional(),
  cityId: z.uuid().optional(),
  description: name(0, 5000).optional(),
  logoId: z.uuid().nullable().optional(),
  directionIds: ids.min(1).optional(),
});
const adminPatch = z.strictObject({
  email: email.optional(),
  displayName: name(2, 100).optional(),
});
export const profileSchemas = {
  USER: userPatch,
  ORGANIZER: organizerPatch,
  ADMIN: adminPatch,
};
export const settingsInput = z.strictObject({
  remindersEmail: z.boolean(),
  promotionsEmail: z.boolean(),
  loyaltyEmail: z.boolean(),
  messagesEmail: z.boolean(),
});
export const pageInput = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(["newest", "oldest"]).default("newest"),
});

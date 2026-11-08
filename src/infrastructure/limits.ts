function bounded(name: string, fallback: number, max: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1 || value > max)
    throw Error(`Invalid ${name} configuration`);
  return value;
}
export const limits = () => ({
  photos: bounded("MAX_EVENT_PHOTOS", 8, 8),
  sessions: bounded("MAX_EVENT_SESSIONS", 60, 60),
  uploadBytes: bounded("MAX_UPLOAD_BYTES", 5 * 1024 * 1024, 5 * 1024 * 1024),
});

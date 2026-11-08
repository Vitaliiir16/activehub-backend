import { invalid } from "../accounts/http";
interface SeatPolicy {
  validate(seats: number): void;
  exclusive: boolean;
}
// Strategy: booking kinds select a SeatPolicy to keep exclusive and ordinary capacity rules separate.
const ordinary: SeatPolicy = {
  exclusive: false,
  validate(seats) {
    if (seats < 1 || seats > 10)
      invalid("seats", "Choose between one and ten places");
  },
};
const single: SeatPolicy = {
  exclusive: false,
  validate(seats) {
    if (seats !== 1) invalid("seats", "This activity accepts one booking unit");
  },
};
const hall: SeatPolicy = { ...single, exclusive: true };
export const seatPolicy = (kind: string) =>
  kind === "HALL_RENTAL" ? hall : kind === "TEAM_SEARCH" ? single : ordinary;
export const withinCutoff = (startsAt: Date, now: Date, seconds: number) =>
  startsAt.getTime() - now.getTime() >= seconds * 1000;

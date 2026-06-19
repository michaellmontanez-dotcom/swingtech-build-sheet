// 4-letter room codes. Excludes easily-confused letters (I, O) to keep codes
// readable when shouted across a living room.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";

export function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}

export function normalizeRoomCode(input: string): string {
  return (input || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
}

export function isValidRoomCode(code: string): boolean {
  return /^[A-Z]{4}$/.test(code);
}

import { randomBytes, randomInt } from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const gameCode = () => Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
export const newId = () => randomBytes(8).toString("hex");
export const newToken = () => randomBytes(24).toString("base64url");
export const secureRandom = (n: number) => randomInt(n);

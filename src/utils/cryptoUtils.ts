import { Buffer } from 'buffer';
import { sha256 } from 'crypto-js';

const WORD_LIST = [
  "abandon", "ability", "able", "about", "above", "absent", "absorb", "abstract", "absurd", "abuse",
  "access", "accident", "account", "accuse", "achieve", "acid", "acoustic", "acquire", "across", "act",
  // ... more words would be here in a real implementation
];

export const generateSeedPhrase = (): string[] => {
  const words: string[] = [];
  for (let i = 0; i < 12; i++) {
    const randomIndex = Math.floor(Math.random() * WORD_LIST.length);
    words.push(WORD_LIST[randomIndex]);
  }
  return words;
};

export const generateBitcoinAddress = (): string => {
  // This is a simplified version - in production, use a proper Bitcoin library
  const randomBytes = new Uint8Array(20);
  crypto.getRandomValues(randomBytes);
  return `bc1${Buffer.from(randomBytes).toString('hex')}`;
};

export const formatBitcoinAmount = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 8,
    maximumFractionDigits: 8,
  }).format(amount);
};
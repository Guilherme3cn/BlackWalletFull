import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist as englishWordlist } from '@scure/bip39/wordlists/english';
import { HDKey } from '@scure/bip32';
import { bech32 } from '@scure/base';
import { sha256 } from '@noble/hashes/sha256';
import { ripemd160 } from '@noble/hashes/ripemd160';

const SATOSHIS_IN_BTC = 100000000;
const DERIVATION_PATH = "m/84'/0'/0'/0/0";
const BECH32_PREFIX = 'bc';

const randomBytes = (size) => {
  if (!globalThis.crypto?.getRandomValues) {
    // Ensure polyfill is loaded even if module import order changes
    require('react-native-get-random-values');
  }

  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('crypto.getRandomValues must be defined');
  }

  const buffer = new Uint8Array(size);
  globalThis.crypto.getRandomValues(buffer);
  return buffer;
};

const english = Array.isArray(englishWordlist)
  ? englishWordlist
  : String(englishWordlist).trim().split('\n');

export const generateSeedPhrase = (strength = 128) => {
  const mnemonic = generateMnemonic(english, strength, randomBytes);
  return mnemonic.trim().split(' ');
};

export const parseSeedPhrase = (phraseText = '') => {
  if (typeof phraseText !== 'string') {
    return [];
  }

  return phraseText
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
};

const isValidSeedLength = (length) => length >= 12 && length <= 24 && length % 3 === 0;

export const validateSeedPhrase = (words) => {
  if (!Array.isArray(words) || !isValidSeedLength(words.length)) {
    return false;
  }

  try {
    return validateMnemonic(words.join(' '), english);
  } catch (error) {
    console.error('Error validating seed phrase', error);
    return false;
  }
};

export const generateBitcoinAddress = (seedPhrase) => {
  if (!Array.isArray(seedPhrase) || seedPhrase.length === 0) {
    return '';
  }

  try {
    const mnemonic = seedPhrase.join(' ');
    const seed = mnemonicToSeedSync(mnemonic);
    const root = HDKey.fromMasterSeed(seed);
    const child = root.derive(DERIVATION_PATH);

    if (!child?.publicKey) {
      throw new Error('Unable to derive public key');
    }

    const publicKey = child.publicKey;
    const hash = ripemd160(sha256(publicKey));
    const words = bech32.toWords(hash);

    return bech32.encode(BECH32_PREFIX, [0, ...words]);
  } catch (error) {
    console.error('Error generating Bitcoin address', error);
    return '';
  }
};

export const getAddressBalance = async (address) => {
  if (!address) {
    return 0;
  }

  try {
    const response = await fetch(`https://blockstream.info/api/address/${address}`);

    if (!response.ok) {
      throw new Error(`Balance request failed with status ${response.status}`);
    }

    const data = await response.json();
    const funded = data?.chain_stats?.funded_txo_sum ?? 0;
    const spent = data?.chain_stats?.spent_txo_sum ?? 0;

    return (funded - spent) / SATOSHIS_IN_BTC;
  } catch (error) {
    console.error('Error fetching address balance', error);
    throw error;
  }
};

export const formatBitcoinAmount = (amount) => {
  if (Number.isNaN(amount)) {
    return '0.00000000';
  }

  return Number(amount).toFixed(8);
};

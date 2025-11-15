import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist as englishWordlist } from '@scure/bip39/wordlists/english';
import { HDKey } from '@scure/bip32';
import { sha256 } from '@noble/hashes/sha256';
import { ripemd160 } from '@noble/hashes/ripemd160';
import { bytesToHex, concatBytes, hexToBytes } from '@noble/hashes/utils';
import { secp256k1 } from '@noble/curves/secp256k1';
import { Buffer } from 'buffer';
if (typeof globalThis.Buffer === 'undefined') {
  globalThis.Buffer = Buffer;
}

const bitcoin = require('bitcoinjs-lib');

export const SATOSHIS_IN_BTC = 100000000;
const HD_ADDRESS_TYPES = {
  legacy: {
    purpose: 44,
    getPayment: (pubkey, network) => bitcoin.payments.p2pkh({ pubkey, network }),
  },
  segwit: {
    purpose: 49,
    getPayment: (pubkey, network) =>
      bitcoin.payments.p2sh({
        redeem: bitcoin.payments.p2wpkh({ pubkey, network }),
        network,
      }),
  },
  bech32: {
    purpose: 84,
    getPayment: (pubkey, network) => bitcoin.payments.p2wpkh({ pubkey, network }),
  },
};
export const DEFAULT_ADDRESS_TYPE = 'bech32';
const BITCOIN_NETWORK = bitcoin.networks.bitcoin;
const BLOCKSTREAM_API_BASE = 'https://blockstream.info/api';
const USER_AGENT = 'blackvault-wallet/1.0 (+https://github.com/blackvault)';
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const MIN_CHANGE_VALUE = 546; // dust threshold in satoshis
const DEFAULT_TX_VERSION = 2;
const DEFAULT_SEQUENCE = 0xffffffff;
const SIGHASH_ALL = 0x01;

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE58_MAP = (() => {
  const map = {};
  for (let i = 0; i < BASE58_ALPHABET.length; i += 1) {
    map[BASE58_ALPHABET[i]] = i;
  }
  return map;
})();

const bytesEqual = (a, b) => {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
};

const base58Decode = (value) => {
  const input = value.trim();
  if (!input) {
    return new Uint8Array(0);
  }

  let num = 0n;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const digit = BASE58_MAP[char];
    if (digit === undefined) {
      throw new Error(`Caractere base58 invalido: ${char}`);
    }
    num = num * 58n + BigInt(digit);
  }

  const bytes = [];
  while (num > 0n) {
    bytes.push(Number(num % 256n));
    num /= 256n;
  }
  const bytesArray = Uint8Array.from(bytes.reverse());

  let leadingZeros = 0;
  for (let i = 0; i < input.length && input[i] === '1'; i += 1) {
    leadingZeros += 1;
  }

  if (leadingZeros === 0) {
    return bytesArray;
  }

  const result = new Uint8Array(leadingZeros + bytesArray.length);
  result.set(bytesArray, leadingZeros);
  return result;
};

const base58Encode = (data) => {
  if (!data?.length) {
    return '';
  }

  let num = 0n;
  for (let i = 0; i < data.length; i += 1) {
    num = num * 256n + BigInt(data[i]);
  }

  let encoded = '';
  while (num > 0n) {
    const rem = Number(num % 58n);
    encoded = BASE58_ALPHABET[rem] + encoded;
    num /= 58n;
  }

  let leadingZeros = 0;
  for (let i = 0; i < data.length && data[i] === 0; i += 1) {
    leadingZeros += 1;
  }

  return '1'.repeat(leadingZeros) + encoded;
};

const base58CheckDecode = (value) => {
  const payload = base58Decode(value);
  if (payload.length < 4) {
    throw new Error('xpub invalido ou corrompido.');
  }

  const data = payload.slice(0, payload.length - 4);
  const checksum = payload.slice(payload.length - 4);
  const expected = sha256d(data).slice(0, 4);

  if (!bytesEqual(checksum, expected)) {
    throw new Error('xpub invalido ou corrompido.');
  }

  return data;
};

const base58CheckEncode = (data) => {
  const checksum = sha256d(data).slice(0, 4);
  return base58Encode(concatBytes(data, checksum));
};

const ADDRESS_RATE_LIMIT_MS = 0;
const ADDRESS_MAX_RETRIES = 3;
const RATE_LIMIT_BASE_DELAY_MS = 1500;
const RATE_LIMIT_MAX_DELAY_MS = 6000;
const MAX_BACKOFF_MS = 30000;
const MAX_RATE_LIMIT_ATTEMPTS = 5;
const GLOBAL_MIN_API_INTERVAL_MS = 1200;
let nextAddressRequestTime = 0;
let nextApiSlotTime = 0;

const canRetryAttempt = (attempt) => ADDRESS_MAX_RETRIES <= 0 || attempt < ADDRESS_MAX_RETRIES;

const computeBackoffDelay = (attempt, retryAfterMs, { maxFallbackDelay = MAX_BACKOFF_MS } = {}) => {
  const exponent = Math.max(attempt - 1, 0);
  const exponential = RATE_LIMIT_BASE_DELAY_MS * Math.pow(2, exponent);
  const fallbackDelay = Math.min(exponential, maxFallbackDelay);
  const baseDelay =
    Number.isFinite(retryAfterMs) && retryAfterMs > 0 ? retryAfterMs : fallbackDelay;
  const jitter = Math.floor(Math.random() * 400);
  return baseDelay + jitter;
};

const acquireApiSlot = async () => {
  const now = Date.now();
  const waitTime = nextApiSlotTime - now;
  if (waitTime > 0) {
    await delay(waitTime);
  }
  const base = Math.max(Date.now(), nextApiSlotTime);
  nextApiSlotTime = base + GLOBAL_MIN_API_INTERVAL_MS;
};

const scheduleAddressRequest = async () => {
  if (ADDRESS_RATE_LIMIT_MS <= 0) {
    return;
  }
  const now = Date.now();
  const waitTime = nextAddressRequestTime - now;
  if (waitTime > 0) {
    await delay(waitTime);
  }
  const baseTime = Math.max(now, nextAddressRequestTime);
  nextAddressRequestTime = baseTime + ADDRESS_RATE_LIMIT_MS;
};

const fingerprintHexToBuffer = (value) => {
  if (typeof value !== 'string') {
    return null;
  }

  const sanitized = value.trim().replace(/^0x/i, '').toLowerCase();
  if (!sanitized || sanitized.length !== 8 || !/^[0-9a-f]+$/i.test(sanitized)) {
    return null;
  }

  try {
    return Buffer.from(sanitized, 'hex');
  } catch (error) {
    return null;
  }
};

const hash160 = (data) => ripemd160(sha256(data));

const sha256d = (data) => sha256(sha256(data));

const toUint32LE = (value) => {
  const buffer = new Uint8Array(4);
  new DataView(buffer.buffer).setUint32(0, value >>> 0, true);
  return buffer;
};

const toUint64LE = (value) => {
  const big = typeof value === 'bigint' ? value : BigInt(value);
  const buffer = new Uint8Array(8);
  const view = new DataView(buffer.buffer);
  view.setUint32(0, Number(big & 0xffffffffn), true);
  view.setUint32(4, Number((big >> 32n) & 0xffffffffn), true);
  return buffer;
};

const encodeVarInt = (value) => {
  if (value < 0xfd) {
    return Uint8Array.of(value);
  }
  if (value <= 0xffff) {
    const buffer = new Uint8Array(3);
    buffer[0] = 0xfd;
    new DataView(buffer.buffer, 1).setUint16(0, value, true);
    return buffer;
  }
  if (value <= 0xffffffff) {
    const buffer = new Uint8Array(5);
    buffer[0] = 0xfe;
    new DataView(buffer.buffer, 1).setUint32(0, value, true);
    return buffer;
  }
  const buffer = new Uint8Array(9);
  buffer[0] = 0xff;
  const big = BigInt(value);
  const view = new DataView(buffer.buffer, 1);
  view.setUint32(0, Number(big & 0xffffffffn), true);
  view.setUint32(4, Number((big >> 32n) & 0xffffffffn), true);
  return buffer;
};

const encodeVarSlice = (slice) => concatBytes(encodeVarInt(slice.length), slice);

const reverseBytes = (bytes) => Uint8Array.from(bytes).reverse();

const hexToReverseBytes = (hex) => reverseBytes(hexToBytes(hex));

const createP2PKHScriptCode = (pubKeyHash) =>
  concatBytes(Uint8Array.of(0x76, 0xa9, 0x14), pubKeyHash, Uint8Array.of(0x88, 0xac));

const estimateFee = (inputCount, outputCount, feeRate) => {
  const baseSize = 10; // version, varint, locktime etc.
  const segwitMarker = 2; // marker + flag
  const inputSize = 68; // approximate vbytes for P2WPKH input
  const outputSize = 31; // approximate vbytes for P2WPKH output
  const virtualSize = baseSize + segwitMarker + inputCount * inputSize + outputCount * outputSize;
  return Math.ceil(virtualSize * feeRate);
};

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

const normalizeAddressType = (type) => (type && HD_ADDRESS_TYPES[type] ? type : DEFAULT_ADDRESS_TYPE);

const getDerivationPath = ({ type, change, index }) => {
  const normalized = normalizeAddressType(type);
  const config = HD_ADDRESS_TYPES[normalized];
  if (!Number.isInteger(index) || index < 0) {
    throw new Error('Derivation index must be a non-negative integer.');
  }

  const accountIndex = 0;
  const changeIndex = change ? 1 : 0;
  return `m/${config.purpose}'/0'/${accountIndex}'/${changeIndex}/${index}`;
};

const getAccountDerivationPath = (type) => {
  const normalized = normalizeAddressType(type);
  const config = HD_ADDRESS_TYPES[normalized];
  const accountIndex = 0;
  return `m/${config.purpose}'/0'/${accountIndex}'`;
};

const deriveWalletNode = (seedPhrase, path) => {
  const mnemonic = seedPhrase.join(' ');
  const seed = mnemonicToSeedSync(mnemonic);
  const root = HDKey.fromMasterSeed(seed);
  const child = root.derive(path);

  if (!child?.publicKey) {
    throw new Error('Unable to derive public key');
  }

  if (!child?.privateKey) {
    throw new Error('Unable to derive private key');
  }

  return child;
};

const deriveNodeFromAccountXpub = (accountXpub, { change, index }) => {
  if (!accountXpub) {
    throw new Error('Account xpub must be provided for public derivation.');
  }

  let accountNode;
  try {
    accountNode = HDKey.fromExtendedKey(accountXpub);
  } catch (error) {
    throw new Error('Account xpub invalido. Verifique se esta completo e pertence a esta carteira.');
  }

  const branchNode = accountNode.deriveChild(change ? 1 : 0);
  const child = branchNode.deriveChild(index);

  if (!child?.publicKey) {
    throw new Error('Unable to derive public key from account xpub');
  }

  return child;
};

const getWalletDetails = (seedPhrase, options = {}) => {
  const normalizedType = normalizeAddressType(options.type);
  const change = Boolean(options.change);
  const index = Number.isInteger(options.index) ? options.index : 0;
  const path = getDerivationPath({ type: normalizedType, change, index });
  const hasSeed = Array.isArray(seedPhrase) && seedPhrase.length > 0;
  const accountXpub = options.accountXpub;

  if (!hasSeed && !accountXpub) {
    throw new Error('Seed phrase or account xpub is required for derivation.');
  }

  const child = hasSeed ? deriveWalletNode(seedPhrase, path) : deriveNodeFromAccountXpub(accountXpub, { change, index });
  const publicKey = child.publicKey;
  const privateKey = child.privateKey ?? null;
  const pubKeyHash = hash160(publicKey);
  const payment = HD_ADDRESS_TYPES[normalizedType].getPayment(Buffer.from(publicKey), BITCOIN_NETWORK);

  if (!payment?.address) {
    throw new Error('Unable to derive payment address.');
  }

  const outputScript = bitcoin.address.toOutputScript(payment.address, BITCOIN_NETWORK);

  return {
    node: child,
    address: payment.address,
    publicKey,
    privateKey,
    pubKeyHash,
    outputScript: Uint8Array.from(outputScript),
    path,
    accountPath: getAccountDerivationPath(normalizedType),
    type: normalizedType,
    change,
    index,
  };
};

export const deriveAddressDetails = (seedPhrase, options = {}) => {
  const details = getWalletDetails(seedPhrase, options);
  const { address, index, change, type, path, accountPath } = details;

  return {
    address,
    index,
    change,
    type,
    path,
    accountPath,
  };
};

const formatFingerprint = (fingerprint) => fingerprint.toString(16).padStart(8, '0');

const SLIP132_MAP = {
  ypub: { targetVersion: 0x0488b21e },
  zpub: { targetVersion: 0x0488b21e },
  Ypub: { targetVersion: 0x0488b21e },
  Zpub: { targetVersion: 0x0488b21e },
  upub: { targetVersion: 0x043587cf },
  vpub: { targetVersion: 0x043587cf },
  Upub: { targetVersion: 0x043587cf },
  Vpub: { targetVersion: 0x043587cf },
};

export const normalizeAccountXpubInput = (rawInput = '', { type = DEFAULT_ADDRESS_TYPE } = {}) => {
  if (typeof rawInput !== 'string') {
    throw new Error('xpub invalido.');
  }

  const trimmed = rawInput.trim();
  if (!trimmed) {
    return '';
  }

  const base58Alphabet = /[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+/g;
  const matches = trimmed.match(base58Alphabet);
  if (!matches || !matches.length) {
    throw new Error('xpub invalido.');
  }

  // Escolhe o maior trecho base58 encontrado (assuming ser o xpub/zpub)
  const candidate = matches.reduce((longest, current) => (current.length > longest.length ? current : longest), '');
  if (!candidate.startsWith('xpub') && !candidate.startsWith('tpub') && !SLIP132_MAP[candidate.slice(0, 4)]) {
    throw new Error('xpub invalido ou formato nao suportado.');
  }

  const prefix = candidate.slice(0, 4);
  const mapping = SLIP132_MAP[prefix];
  if (!mapping) {
    return candidate;
  }

  try {
    const data = bs58check.decode(candidate);
    const targetVersion =
      mapping.targetVersion ?? (type === 'bech32' ? 0x0488b21e : 0x0488b21e); // fallback para xpub mainnet
    const buffer = Buffer.from(data);
    buffer.writeUInt32BE(targetVersion, 0);
    return bs58check.encode(buffer);
  } catch (error) {
    throw new Error('xpub invalido ou corrompido.');
  }
};

export const deriveAccountKeysFromSeed = (seedPhrase, options = {}) => {
  if (!Array.isArray(seedPhrase) || !seedPhrase.length) {
    throw new Error('Seed phrase is required to derive account keys.');
  }

  const normalizedType = normalizeAddressType(options.type);
  const accountPath = getAccountDerivationPath(normalizedType);
  const mnemonic = seedPhrase.join(' ');
  const seed = mnemonicToSeedSync(mnemonic);
  const master = HDKey.fromMasterSeed(seed);
  const accountNode = master.derive(accountPath);

  if (!accountNode?.publicExtendedKey) {
    throw new Error('Unable to derive account xpub.');
  }

  return {
    accountPath,
    accountXpub: accountNode.publicExtendedKey,
    accountXprv: accountNode.privateExtendedKey ?? null,
    masterFingerprint: formatFingerprint(master.fingerprint ?? 0),
  };
};

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

export const generateBitcoinAddress = (seedPhrase, options = {}) => {
  if (!Array.isArray(seedPhrase) || seedPhrase.length === 0) {
    return '';
  }

  try {
    const { address } = getWalletDetails(seedPhrase, options);
    return address;
  } catch (error) {
    console.error('Error generating Bitcoin address', error);
    return '';
  }
};

export const fetchAddressSummary = async (address) => {
  if (!address) {
    throw new Error('Address must be provided.');
  }

  let attempt = 1;
  let rateLimitAttempts = 0;

  while (true) {
    await scheduleAddressRequest();

    let response;
    try {
      await acquireApiSlot();
      response = await fetch(`${BLOCKSTREAM_API_BASE}/address/${address}`, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
        },
      });
    } catch (networkError) {
      if (!canRetryAttempt(attempt)) {
        const error = new Error('Nao foi possivel consultar o saldo: rede indisponivel.');
        error.cause = networkError;
        throw error;
      }

      const retryDelay = computeBackoffDelay(attempt);
      await delay(retryDelay);
      attempt += 1;
      continue;
    }

    if (!response.ok) {
      const error = new Error(`Falha ao consultar saldo (status ${response.status})`);
      error.status = response.status;

      const isRateLimited = response.status === 429;
      const isServerError = response.status >= 500 && response.status < 600;

      if (!isRateLimited) {
        rateLimitAttempts = 0;
      }

      if (isRateLimited) {
        error.code = 'RATE_LIMITED';
        const retryHeader = response.headers?.get('retry-after');
        const retrySeconds = retryHeader ? Number(retryHeader) : NaN;
        if (Number.isFinite(retrySeconds) && retrySeconds > 0) {
          error.retryAfterMs = retrySeconds * 1000;
        }
        error.message = 'Limite de requisicoes da API atingido. Tentando novamente...';
        const penalty = Math.max(
          error.retryAfterMs ?? RATE_LIMIT_BASE_DELAY_MS,
          RATE_LIMIT_BASE_DELAY_MS,
        );
        nextAddressRequestTime = Date.now() + penalty;
        nextApiSlotTime = Math.max(nextApiSlotTime, Date.now() + penalty);
        rateLimitAttempts += 1;
      }

      if (isServerError) {
        error.message = canRetryAttempt(attempt)
          ? 'Servico da API temporariamente indisponivel. Tentando novamente...'
          : 'Servico da API temporariamente indisponivel. Tente novamente em instantes.';
      }

      const shouldRetryRateLimited =
        isRateLimited && rateLimitAttempts <= MAX_RATE_LIMIT_ATTEMPTS;
      const shouldRetryServerError = isServerError && canRetryAttempt(attempt);

      if (shouldRetryRateLimited || shouldRetryServerError) {
        const retryDelay = isRateLimited
          ? computeBackoffDelay(rateLimitAttempts, error.retryAfterMs, {
              maxFallbackDelay: RATE_LIMIT_MAX_DELAY_MS,
            })
          : computeBackoffDelay(attempt, error.retryAfterMs);
        await delay(retryDelay);
        attempt += 1;
        continue;
      }

      if (isRateLimited) {
        error.message =
          rateLimitAttempts > MAX_RATE_LIMIT_ATTEMPTS
            ? 'Limite de requisicoes da API atingido repetidamente. Tente novamente em instantes.'
            : 'Limite de requisicoes da API atingido. Tente novamente em alguns segundos.';
      }

      throw error;
    }

    const data = await response.json();
    const chainStats = data?.chain_stats ?? {};
    const mempoolStats = data?.mempool_stats ?? {};

    const fundedChain = Number(chainStats.funded_txo_sum ?? 0);
    const spentChain = Number(chainStats.spent_txo_sum ?? 0);
    const fundedMempool = Number(mempoolStats.funded_txo_sum ?? 0);
    const spentMempool = Number(mempoolStats.spent_txo_sum ?? 0);

    const balanceSat = fundedChain + fundedMempool - (spentChain + spentMempool);
    const totalReceivedSat = fundedChain + fundedMempool;
    const totalSentSat = spentChain + spentMempool;
    const hasActivity =
      Number(chainStats.funded_txo_count ?? 0) > 0 ||
      Number(mempoolStats.funded_txo_count ?? 0) > 0 ||
      Number(chainStats.spent_txo_count ?? 0) > 0;
    const pendingReceivedSat = Number(mempoolStats.funded_txo_sum ?? 0);
    const pendingReceivedCount = Number(mempoolStats.funded_txo_count ?? 0);

    return {
      address,
      balanceSat,
      balance: balanceSat / SATOSHIS_IN_BTC,
      totalReceivedSat,
      totalSentSat,
      hasActivity,
      chainStats,
      mempoolStats,
      pendingReceivedSat,
      pendingReceivedCount,
    };
  }
};

export const getAddressBalance = async (address) => {
  const summary = await fetchAddressSummary(address);
  return summary.balance;
};

export const getWalletAddressesBalance = async (addresses = []) => {
  if (!Array.isArray(addresses) || !addresses.length) {
    return {
      balance: 0,
      summaries: [],
      summaryMap: {},
      pendingReceivedSat: 0,
    };
  }

  const summaries = [];
  const MAX_ATTEMPTS = 4;
  const BASE_DELAY_MS = 800;

  for (const entry of addresses) {
    let attempt = 0;
    while (attempt < MAX_ATTEMPTS) {
      try {
        const summary = await fetchAddressSummary(entry.address);
        summaries.push(summary);
        const cooldown = 50 + Math.floor(Math.random() * 100);
        await delay(cooldown);
        break;
      } catch (error) {
        attempt += 1;
        const retryable =
          (error?.status === 429 || error?.code === 'RATE_LIMITED') && attempt < MAX_ATTEMPTS;

        if (retryable) {
          const retryAfter = Number(error?.retryAfterMs ?? 0);
          const exponential = BASE_DELAY_MS * Math.pow(2, attempt - 1);
          const backoff = Math.max(exponential, retryAfter);
          const jitter = Math.floor(Math.random() * 400);
          await delay(backoff + jitter);
          continue;
        }

        throw error;
      }
    }
  }

  const balance = summaries.reduce((total, item) => total + item.balance, 0);
  const summaryMap = summaries.reduce((acc, item) => {
    acc[item.address] = item;
    return acc;
  }, {});
  const pendingReceivedSat = summaries.reduce(
    (total, item) => total + Number(item.pendingReceivedSat ?? 0),
    0,
  );

  return {
    balance,
    summaries,
    summaryMap,
    pendingReceivedSat,
  };
};

const fetchAddressTransactions = async (address) => {
  if (!address) {
    return {
      confirmed: [],
      pending: [],
    };
  }

  const fetchJsonWithRetry = async (url, { description }) => {
    let attempt = 1;
    let rateLimitAttempts = 0;

    while (true) {
      let response;
      try {
        await acquireApiSlot();
        response = await fetch(url, {
          headers: {
            'User-Agent': USER_AGENT,
            Accept: 'application/json',
          },
        });
      } catch (networkError) {
        if (!canRetryAttempt(attempt)) {
          const error = new Error(`Nao foi possivel ${description}: rede indisponivel.`);
          error.cause = networkError;
          throw error;
        }

        const retryDelay = computeBackoffDelay(attempt);
        await delay(retryDelay);
        attempt += 1;
        continue;
      }

      if (!response.ok) {
        const error = new Error(`${description} falhou (status ${response.status})`);
        error.status = response.status;

        const isRateLimited = response.status === 429;
        const isServerError = response.status >= 500 && response.status < 600;

        if (!isRateLimited) {
          rateLimitAttempts = 0;
        }

        if (isRateLimited) {
          error.code = 'RATE_LIMITED';
          const retryHeader = response.headers?.get('retry-after');
          const retrySeconds = retryHeader ? Number(retryHeader) : NaN;
          if (Number.isFinite(retrySeconds) && retrySeconds > 0) {
            error.retryAfterMs = retrySeconds * 1000;
          }
          error.message = 'Limite de requisicoes da API atingido. Tentando novamente...';
          const penalty = Math.max(
            error.retryAfterMs ?? RATE_LIMIT_BASE_DELAY_MS,
            RATE_LIMIT_BASE_DELAY_MS,
          );
          nextApiSlotTime = Math.max(nextApiSlotTime, Date.now() + penalty);
          rateLimitAttempts += 1;
        }

        if (isServerError) {
          error.message = canRetryAttempt(attempt)
            ? 'Servico da API temporariamente indisponivel. Tentando novamente...'
            : 'Servico da API temporariamente indisponivel. Tente novamente em instantes.';
        }

        const shouldRetryRateLimited =
          isRateLimited && rateLimitAttempts <= MAX_RATE_LIMIT_ATTEMPTS;
        const shouldRetryServerError = isServerError && canRetryAttempt(attempt);

        if (shouldRetryRateLimited || shouldRetryServerError) {
          const retryDelay = isRateLimited
            ? computeBackoffDelay(rateLimitAttempts, error.retryAfterMs, {
                maxFallbackDelay: RATE_LIMIT_MAX_DELAY_MS,
              })
            : computeBackoffDelay(attempt, error.retryAfterMs);
          await delay(retryDelay);
          attempt += 1;
          continue;
        }

        if (isRateLimited) {
          error.message =
            rateLimitAttempts > MAX_RATE_LIMIT_ATTEMPTS
              ? 'Limite de requisicoes da API atingido repetidamente. Tente novamente em instantes.'
              : 'Limite de requisicoes da API atingido. Tente novamente em alguns segundos.';
        }

        throw error;
      }

      return response.json();
    }
  };

  const confirmedData = await fetchJsonWithRetry(
    `${BLOCKSTREAM_API_BASE}/address/${address}/txs`,
    { description: 'buscar transacoes confirmadas' },
  );

  let pendingData = [];
  try {
    pendingData = await fetchJsonWithRetry(
      `${BLOCKSTREAM_API_BASE}/address/${address}/txs/mempool`,
      { description: 'buscar transacoes pendentes' },
    );
  } catch (error) {
    // Ignora falhas após tentativas no mempool para não interromper o fluxo.
  }

  return {
    confirmed: Array.isArray(confirmedData) ? confirmedData : [],
    pending: Array.isArray(pendingData) ? pendingData : [],
  };
};

const getTxTimestamp = (tx) => {
  const blockTime = tx?.status?.block_time ?? null;
  if (Number.isFinite(blockTime)) {
    return Number(blockTime);
  }

  const fallback = tx?.timestamp ?? tx?.time ?? tx?.seen_at ?? tx?.received_at ?? null;
  return Number.isFinite(Number(fallback)) ? Number(fallback) : Math.floor(Date.now() / 1000);
};

export const getWalletTransactionHistory = async (addresses = []) => {
  if (!Array.isArray(addresses) || !addresses.length) {
    return [];
  }

  const normalized = addresses
    .filter((item) => item?.address)
    .map((item) => ({
      address: item.address,
      change: Boolean(item.change),
      index: Number.isInteger(item.index) ? item.index : 0,
      type: item.type ?? DEFAULT_ADDRESS_TYPE,
      used: Boolean(item.used),
      balanceSat: Number(item.balanceSat ?? item.balance ?? 0),
      pendingSat: Number(item.pendingSat ?? item.pendingReceivedSat ?? 0),
    }));

  const uniqueMap = new Map();
  normalized.forEach((item) => {
    if (!uniqueMap.has(item.address)) {
      uniqueMap.set(item.address, item);
    }
  });

  const uniqueAddresses = Array.from(uniqueMap.values());
  const activeAddresses = uniqueAddresses.filter(
    (item) => item.used || item.pendingSat > 0 || item.balanceSat > 0,
  );

  let targetAddresses = activeAddresses;
  if (!targetAddresses.length) {
    const primaryReceiving = uniqueAddresses
      .filter((item) => !item.change)
      .sort((a, b) => (b.index ?? 0) - (a.index ?? 0))[0];
    targetAddresses = primaryReceiving ? [primaryReceiving] : uniqueAddresses.slice(0, 1);
  }

  if (!targetAddresses.length) {
    return [];
  }

  const addressSet = new Set(targetAddresses.map((item) => item.address));
  const txMap = new Map();

  for (const entry of targetAddresses) {
    try {
      const { confirmed, pending } = await fetchAddressTransactions(entry.address);
      const allTransactions = [...pending, ...confirmed];

      allTransactions.forEach((tx) => {
        const existing = txMap.get(tx.txid);
        if (existing) {
          if (!existing.confirmed && tx?.status?.confirmed) {
            existing.confirmed = true;
            existing.blockHeight = tx?.status?.block_height ?? null;
            existing.blockTime = getTxTimestamp(tx);
          }
          return;
        }

        const inputs = Array.isArray(tx?.vin) ? tx.vin : [];
        const outputs = Array.isArray(tx?.vout) ? tx.vout : [];

        let totalSentSat = 0;
        inputs.forEach((input) => {
          const prevoutAddress = input?.prevout?.scriptpubkey_address;
          const value = Number(input?.prevout?.value ?? 0);
          if (prevoutAddress && addressSet.has(prevoutAddress)) {
            totalSentSat += value;
          }
        });

        let totalReceivedSat = 0;
        const relatedOutputs = [];
        outputs.forEach((output) => {
          const outputAddress = output?.scriptpubkey_address;
          const value = Number(output?.value ?? 0);
          if (outputAddress && addressSet.has(outputAddress)) {
            totalReceivedSat += value;
            relatedOutputs.push({
              address: outputAddress,
              value,
              change: uniqueMap.get(outputAddress)?.change ?? false,
            });
          }
        });

        const netSat = totalReceivedSat - totalSentSat;
        const direction = netSat >= 0 ? 'in' : 'out';

        txMap.set(tx.txid, {
          txid: tx.txid,
          confirmed: Boolean(tx?.status?.confirmed),
          blockHeight: tx?.status?.block_height ?? null,
          blockTime: getTxTimestamp(tx),
          fee: Number(tx?.fee ?? 0),
          totalReceivedSat,
          totalSentSat,
          netSat,
          direction,
          relatedOutputs,
        });
      });
    } catch (error) {
      console.error(`Erro ao buscar historico para ${entry.address}`, error);
    }
  }

  const history = Array.from(txMap.values());
  history.sort((a, b) => {
    if (a.confirmed !== b.confirmed) {
      return a.confirmed ? 1 : -1;
    }

    return (b.blockTime ?? 0) - (a.blockTime ?? 0);
  });

  return history;
};

export const formatBitcoinAmount = (amount) => {
  if (Number.isNaN(amount)) {
    return '0.00000000';
  }

  return Number(amount).toFixed(8);
};

const fetchAddressUtxos = async (address) => {
  const response = await fetch(`${BLOCKSTREAM_API_BASE}/address/${address}/utxo`);

  if (!response.ok) {
    throw new Error(`Failed to fetch UTXOs (${response.status})`);
  }

  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error('Invalid UTXO response.');
  }

  return data.map((item) => ({
    txid: item.txid,
    vout: item.vout,
    value: item.value,
    status: item.status,
  }));
};

const selectUtxosForAmount = (utxos, targetAmount, feeRate) => {
  const sorted = [...utxos].sort((a, b) => a.value - b.value);
  const selected = [];
  let total = 0;
  let fee = 0;
  let change = 0;
  let changeBelowDust = 0;

  for (const utxo of sorted) {
    selected.push(utxo);
    total += utxo.value;

    // Assume no change first
    fee = estimateFee(selected.length, 1, feeRate);
    change = total - targetAmount - fee;

    if (change >= MIN_CHANGE_VALUE) {
      const feeWithChange = estimateFee(selected.length, 2, feeRate);
      const tentativeChange = total - targetAmount - feeWithChange;
      if (tentativeChange >= MIN_CHANGE_VALUE) {
        change = tentativeChange;
        fee = feeWithChange;
      } else if (tentativeChange >= 0) {
        changeBelowDust = tentativeChange;
        change = 0;
        fee = feeWithChange;
      }
    } else if (change < 0) {
      change = 0;
    }

    if (total >= targetAmount + fee + change) {
      break;
    }
  }

  if (total < targetAmount + fee + change) {
    throw new Error('Saldo insuficiente para cobrir valor e taxa.');
  }

  if (change > 0 && change < MIN_CHANGE_VALUE) {
    // If change is below dust, merge it into the fee.
    changeBelowDust = change;
    fee += change;
    change = 0;
  }

  return {
    selected,
    fee,
    change,
    changeBelowDust,
  };
};

const prepareTransactionTemplate = async ({
  seedPhrase,
  accountXpub,
  recipientAddress,
  amountBtc,
  feeRate,
  addressType = DEFAULT_ADDRESS_TYPE,
  receivingAddresses = [],
  changeAddresses = [],
  nextChangeIndex = 0,
}) => {
  const normalizedSeed = Array.isArray(seedPhrase) && seedPhrase.length ? seedPhrase : null;

  if (!normalizedSeed && !accountXpub) {
    throw new Error('Seed phrase ou account xpub necessario para derivacao.');
  }

  if (!recipientAddress) {
    throw new Error('Informe um endereco de destino.');
  }

  if (!Number.isFinite(amountBtc) || amountBtc <= 0) {
    throw new Error('Informe uma quantidade valida de BTC.');
  }

  if (!Number.isFinite(feeRate) || feeRate <= 0) {
    throw new Error('Taxa de mineracao invalida.');
  }

  const normalizedType = normalizeAddressType(addressType);
  if (normalizedType !== 'bech32') {
    throw new Error('Fluxo suportado apenas para enderecos bech32 no momento.');
  }

  if (!Number.isInteger(nextChangeIndex) || nextChangeIndex < 0) {
    throw new Error('Indice de troco invalido.');
  }

  const trackedEntries = [...receivingAddresses, ...changeAddresses]
    .filter((item) => item?.address)
    .map((item) => ({
      address: item.address,
      index: Number.isInteger(item.index) && item.index >= 0 ? item.index : 0,
      change: Boolean(item.change),
      type: item.type ?? normalizedType,
    }));

  if (!trackedEntries.length) {
    throw new Error('Nenhum endereco derivado encontrado para esta carteira.');
  }

  const uniqueEntries = Array.from(
    trackedEntries.reduce((map, entry) => {
      if (!map.has(entry.address)) {
        map.set(entry.address, entry);
      }
      return map;
    }, new Map()),
    ([, value]) => value,
  );

  const amountSat = Math.round(amountBtc * SATOSHIS_IN_BTC);

  const utxoGroups = await Promise.all(
    uniqueEntries.map(async (entry) => {
      const utxosForAddress = await fetchAddressUtxos(entry.address);
      return utxosForAddress.map((utxo) => ({
        ...utxo,
        address: entry.address,
        source: {
          address: entry.address,
          index: entry.index,
          change: entry.change,
          type: entry.type,
        },
      }));
    }),
  );

  const utxos = utxoGroups.flat();
  if (!utxos.length) {
    throw new Error('Nao ha UTXOs disponiveis para esta carteira.');
  }

  const { selected, fee, change, changeBelowDust } = selectUtxosForAmount(utxos, amountSat, feeRate);

  let recipientScript;
  try {
    recipientScript = Uint8Array.from(bitcoin.address.toOutputScript(recipientAddress, BITCOIN_NETWORK));
  } catch (error) {
    throw new Error('Endereco de destino invalido.');
  }

  const inputs = selected.map((utxo) => {
    const source = utxo.source ?? {};
    const details = getWalletDetails(normalizedSeed, {
      type: source.type ?? normalizedType,
      change: Boolean(source.change),
      index: Number.isInteger(source.index) ? source.index : 0,
      accountXpub: normalizedSeed ? undefined : accountXpub,
    });

    if (!details?.publicKey || !details?.outputScript) {
      throw new Error('Falha ao derivar dados publicos para uma entrada.');
    }

    return {
      txid: utxo.txid,
      vout: utxo.vout,
      value: utxo.value,
      sequence: DEFAULT_SEQUENCE,
      publicKey: details.publicKey,
      privateKey: details.privateKey ?? null,
      pubKeyHash: details.pubKeyHash,
      outputScript: details.outputScript,
      path: details.path,
      accountPath: details.accountPath,
      address: details.address,
      change: Boolean(source.change),
      index: Number.isInteger(source.index) ? source.index : 0,
      type: source.type ?? normalizedType,
    };
  });

  const outputs = [
    {
      value: amountSat,
      script: recipientScript,
      address: recipientAddress,
      isChange: false,
      type: normalizedType,
      path: null,
      publicKey: null,
    },
  ];

  let changeDetails = null;
  if (change > 0) {
    const details = getWalletDetails(normalizedSeed, {
      type: normalizedType,
      change: true,
      index: nextChangeIndex,
      accountXpub: normalizedSeed ? undefined : accountXpub,
    });

    if (!details?.publicKey || !details?.outputScript) {
      throw new Error('Falha ao derivar endereco de troco.');
    }

    outputs.push({
      value: change,
      script: details.outputScript,
      address: details.address,
      isChange: true,
      type: normalizedType,
      path: details.path,
      publicKey: details.publicKey,
    });

    changeDetails = {
      address: details.address,
      index: nextChangeIndex,
      change: true,
      type: normalizedType,
      path: details.path,
      publicKey: details.publicKey,
      outputScript: details.outputScript,
    };
  }

  const txOutputs = outputs.map((item) => ({
    value: item.value,
    script: item.script,
  }));

  const inputCount = inputs.length;
  const outputCount = outputs.length;
  const virtualSize = estimateFee(inputCount, outputCount, 1);
  const totalInputValue = selected.reduce((sum, item) => sum + item.value, 0);

  return {
    inputs,
    outputs,
    txOutputs,
    fee,
    change,
    changeBelowDust,
    changeDetails,
    selectedUtxos: selected,
    amountSat,
    recipientAddress,
    recipientScript,
    normalizedType,
    virtualSize,
    totalInputValue,
  };
};

const computeTransactionHashes = (inputs, outputs) => {
  const prevouts = concatBytes(
    ...inputs.map((input) => concatBytes(hexToReverseBytes(input.txid), toUint32LE(input.vout))),
  );
  const sequences = concatBytes(...inputs.map((input) => toUint32LE(input.sequence ?? DEFAULT_SEQUENCE)));
  const outputsSerialized = concatBytes(
    ...outputs.map((output) => concatBytes(toUint64LE(output.value), encodeVarSlice(output.script))),
  );

  return {
    hashPrevouts: sha256d(prevouts),
    hashSequence: sha256d(sequences),
    hashOutputs: sha256d(outputsSerialized),
  };
};

const serializeTransaction = (inputs, outputs, witnesses, includeWitness = true) => {
  const parts = [toUint32LE(DEFAULT_TX_VERSION)];

  if (includeWitness) {
    parts.push(Uint8Array.of(0x00, 0x01)); // marker + flag
  }

  parts.push(encodeVarInt(inputs.length));
  inputs.forEach((input) => {
    parts.push(hexToReverseBytes(input.txid));
    parts.push(toUint32LE(input.vout));
    parts.push(encodeVarInt(0)); // empty scriptSig
    parts.push(toUint32LE(input.sequence ?? DEFAULT_SEQUENCE));
  });

  parts.push(encodeVarInt(outputs.length));
  outputs.forEach((output) => {
    parts.push(toUint64LE(BigInt(output.value)));
    parts.push(encodeVarSlice(output.script));
  });

  if (includeWitness) {
    inputs.forEach((_, index) => {
      const stack = witnesses[index] ?? [];
      parts.push(encodeVarInt(stack.length));
      stack.forEach((item) => {
        parts.push(encodeVarSlice(item));
      });
    });
  }

  parts.push(toUint32LE(0)); // locktime
  return concatBytes(...parts);
};

const computeVirtualSize = (baseTx, fullTx) => {
  const base = baseTx.length;
  const total = fullTx.length;
  const witness = total - base;
  const weight = base * 4 + witness;
  return Math.ceil(weight / 4);
};

const buildSignedTransaction = ({ inputs, outputs }) => {
  const { hashPrevouts, hashSequence, hashOutputs } = computeTransactionHashes(inputs, outputs);
  const witnesses = [];

  inputs.forEach((input) => {
    if (!input?.privateKey || !input?.publicKey || !input?.pubKeyHash) {
      throw new Error('Missing signing data for input.');
    }

    const scriptCode = createP2PKHScriptCode(input.pubKeyHash);
    const preimage = concatBytes(
      toUint32LE(DEFAULT_TX_VERSION),
      hashPrevouts,
      hashSequence,
      hexToReverseBytes(input.txid),
      toUint32LE(input.vout),
      encodeVarSlice(scriptCode),
      toUint64LE(BigInt(input.value)),
      toUint32LE(input.sequence ?? DEFAULT_SEQUENCE),
      hashOutputs,
      toUint32LE(0), // locktime
      toUint32LE(SIGHASH_ALL),
    );

    const digest = sha256d(preimage);
    const signature = secp256k1.sign(digest, input.privateKey).normalizeS();
    const signatureDer = signature.toDERRawBytes();
    const signatureWithHashType = concatBytes(signatureDer, Uint8Array.of(SIGHASH_ALL));
    witnesses.push([signatureWithHashType, input.publicKey]);
  });

  const fullTx = serializeTransaction(inputs, outputs, witnesses, true);
  const baseTx = serializeTransaction(inputs, outputs, witnesses, false);
  const txid = bytesToHex(reverseBytes(sha256d(baseTx)));
  const vsize = computeVirtualSize(baseTx, fullTx);

  return {
    rawTransaction: bytesToHex(fullTx),
    txid,
    vsize,
  };
};

export const sendBitcoinTransaction = async ({
  seedPhrase,
  recipientAddress,
  amountBtc,
  feeRate,
  addressType = DEFAULT_ADDRESS_TYPE,
  receivingAddresses = [],
  changeAddresses = [],
  nextChangeIndex = 0,
  previewOnly = false,
}) => {
  if (!Array.isArray(seedPhrase) || seedPhrase.length === 0) {
    throw new Error('Frase semente invalida.');
  }

  const plan = await prepareTransactionTemplate({
    seedPhrase,
    accountXpub: null,
    recipientAddress,
    amountBtc,
    feeRate,
    addressType,
    receivingAddresses,
    changeAddresses,
    nextChangeIndex,
  });

  const { rawTransaction, txid, vsize } = buildSignedTransaction({
    inputs: plan.inputs,
    outputs: plan.txOutputs,
  });

  if (!previewOnly) {
    const response = await fetch(`${BLOCKSTREAM_API_BASE}/tx`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: rawTransaction,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(errorBody || `Falha ao transmitir a transacao (${response.status}).`);
    }
  }

  return {
    txid,
    fee: plan.fee,
    feeRate: plan.fee / vsize,
    change: plan.change,
    changeAddress: plan.changeDetails
      ? {
          address: plan.changeDetails.address,
          index: plan.changeDetails.index,
          change: true,
          type: plan.changeDetails.type,
        }
      : null,
    usedInputs: plan.selectedUtxos.map((item) => item.source ?? { address: item.address }),
    changeBelowDust: plan.changeBelowDust,
    rawTransaction,
    preview: previewOnly,
  };
};

export const createPsbtTransaction = async ({
  accountXpub,
  masterFingerprint,
  recipientAddress,
  amountBtc,
  feeRate,
  addressType = DEFAULT_ADDRESS_TYPE,
  receivingAddresses = [],
  changeAddresses = [],
  nextChangeIndex = 0,
}) => {
  if (typeof accountXpub !== 'string' || !accountXpub.trim()) {
    throw new Error('Account xpub invalido.');
  }

  const plan = await prepareTransactionTemplate({
    seedPhrase: null,
    accountXpub: accountXpub.trim(),
    recipientAddress,
    amountBtc,
    feeRate,
    addressType,
    receivingAddresses,
    changeAddresses,
    nextChangeIndex,
  });

  const providedFingerprint = fingerprintHexToBuffer(masterFingerprint ?? '');
  let fallbackFingerprint = null;
  if (!providedFingerprint) {
    try {
      const node = HDKey.fromExtendedKey(accountXpub.trim());
      const parentHex = node.parentFingerprint.toString(16).padStart(8, '0');
      fallbackFingerprint = Buffer.from(parentHex, 'hex');
    } catch (error) {
      fallbackFingerprint = null;
    }
  }

  const fingerprintBuffer = providedFingerprint ?? fallbackFingerprint ?? Buffer.alloc(4, 0);

  const psbt = new bitcoin.Psbt({ network: BITCOIN_NETWORK });

  plan.inputs.forEach((input) => {
    psbt.addInput({
      hash: input.txid,
      index: input.vout,
      sequence: input.sequence ?? DEFAULT_SEQUENCE,
      witnessUtxo: {
        script: Buffer.from(input.outputScript),
        value: input.value,
      },
      bip32Derivation: [
        {
          masterFingerprint: fingerprintBuffer,
          path: input.path,
          pubkey: Buffer.from(input.publicKey),
        },
      ],
    });
  });

  plan.outputs.forEach((output) => {
    const outputData = {
      script: Buffer.from(output.script),
      value: output.value,
    };

    if (output.isChange && output.publicKey) {
      outputData.bip32Derivation = [
        {
          masterFingerprint: fingerprintBuffer,
          path: output.path,
          pubkey: Buffer.from(output.publicKey),
        },
      ];
    }

    psbt.addOutput(outputData);
  });

  return {
    psbtBase64: psbt.toBase64(),
    fee: plan.fee,
    virtualSize: plan.virtualSize,
    feeRate: plan.virtualSize > 0 ? plan.fee / plan.virtualSize : 0,
    change: plan.change,
    changeAddress: plan.changeDetails
      ? {
          address: plan.changeDetails.address,
          index: plan.changeDetails.index,
          change: true,
          type: plan.changeDetails.type,
        }
      : null,
    changeBelowDust: plan.changeBelowDust,
    amountSat: plan.amountSat,
    totalInputValue: plan.totalInputValue,
    inputs: plan.inputs.map((input) => ({
      txid: input.txid,
      vout: input.vout,
      value: input.value,
      address: input.address,
      change: input.change,
      index: input.index,
      type: input.type,
      path: input.path,
    })),
    outputs: plan.outputs.map((output) => ({
      value: output.value,
      address: output.address ?? null,
      isChange: Boolean(output.isChange),
      path: output.path ?? null,
    })),
    selectedUtxos: plan.selectedUtxos.map((item) => ({
      txid: item.txid,
      vout: item.vout,
      value: item.value,
      address: item.address,
      source: item.source,
    })),
  };
};

const decodePsbt = (psbtBase64) => {
  if (typeof psbtBase64 !== 'string' || !psbtBase64.trim()) {
    throw new Error('PSBT invalida.');
  }

  try {
    return bitcoin.Psbt.fromBase64(psbtBase64.trim(), { network: BITCOIN_NETWORK });
  } catch (error) {
    throw new Error('PSBT invalida ou corrompida.');
  }
};

export const parsePsbtDetails = (psbtBase64) => {
  const psbt = decodePsbt(psbtBase64);

  const inputs = psbt.txInputs.map((input, index) => {
    const inputData = psbt.data.inputs[index] ?? {};
    const witnessUtxo = inputData.witnessUtxo;
    if (!witnessUtxo || typeof witnessUtxo.value !== 'number') {
      throw new Error(`Entrada ${index + 1} da PSBT sem dados de UTXO.`);
    }

    const derivation =
      Array.isArray(inputData.bip32Derivation) && inputData.bip32Derivation.length
        ? inputData.bip32Derivation[0]
        : null;

    return {
      txid: bytesToHex(reverseBytes(Uint8Array.from(input.hash))),
      vout: input.index,
      sequence: input.sequence ?? DEFAULT_SEQUENCE,
      value: witnessUtxo.value,
      path: derivation?.path ?? null,
      masterFingerprint: derivation?.masterFingerprint
        ? bytesToHex(Uint8Array.from(derivation.masterFingerprint))
        : null,
      isSigned: Array.isArray(inputData.partialSig) && inputData.partialSig.length > 0,
    };
  });

  const totalInput = inputs.reduce((sum, item) => sum + item.value, 0);

  const outputs = psbt.txOutputs.map((output, index) => {
    let address = null;
    try {
      address = bitcoin.address.fromOutputScript(Buffer.from(output.script), BITCOIN_NETWORK);
    } catch (error) {
      address = null;
    }

    const outputData = psbt.data.outputs[index] ?? {};
    const derivation =
      Array.isArray(outputData.bip32Derivation) && outputData.bip32Derivation.length
        ? outputData.bip32Derivation[0]
        : null;

    return {
      value: output.value,
      address,
      isChange: Boolean(derivation),
      path: derivation?.path ?? null,
    };
  });

  const totalOutput = outputs.reduce((sum, item) => sum + item.value, 0);
  const fee = totalInput - totalOutput;
  const virtualSize = estimateFee(psbt.txInputs.length, psbt.txOutputs.length, 1);
  const feeRate = virtualSize > 0 ? fee / virtualSize : 0;
  const fullySigned = psbt.data.inputs.every(
    (input) => Array.isArray(input?.partialSig) && input.partialSig.length > 0,
  );

  return {
    inputs,
    outputs,
    totalInput,
    totalOutput,
    fee,
    virtualSize,
    feeRate,
    fullySigned,
  };
};

export const signPsbtWithSeedPhrase = (psbtBase64, seedPhrase) => {
  if (!Array.isArray(seedPhrase) || !seedPhrase.length) {
    throw new Error('Frase semente invalida.');
  }

  const mnemonic = seedPhrase.join(' ');
  const seed = mnemonicToSeedSync(mnemonic);
  const master = HDKey.fromMasterSeed(seed);
  const psbt = decodePsbt(psbtBase64);

  psbt.data.inputs.forEach((input, index) => {
    if (Array.isArray(input.partialSig) && input.partialSig.length) {
      return; // ja assinado
    }

    const derivation =
      Array.isArray(input.bip32Derivation) && input.bip32Derivation.length
        ? input.bip32Derivation[0]
        : null;

    if (!derivation?.path) {
      throw new Error(`Entrada ${index + 1} sem caminho BIP32 para derivacao.`);
    }

    const node = master.derive(derivation.path);
    if (!node?.privateKey) {
      throw new Error(`Falha ao derivar chave privada para ${derivation.path}.`);
    }

    const privateKey = node.privateKey;
    const publicKey = node.publicKey ?? secp256k1.getPublicKey(privateKey, true);

    psbt.signInput(index, {
      publicKey: Buffer.from(publicKey),
      sign: (hash) => {
        const signature = secp256k1.sign(hash, privateKey).normalizeS();
        return Buffer.from(signature.toCompactRawBytes());
      },
    });
  });

  const verifySignature = (pubkey, hash, signature) => {
    try {
      const compact =
        signature.length === 64
          ? signature
          : secp256k1.Signature.fromDER(signature).toCompactRawBytes();
      return secp256k1.verify(compact, hash, pubkey);
    } catch (error) {
      return false;
    }
  };

  try {
    psbt.validateSignaturesOfAllInputs((pubkey, hash, signature) =>
      verifySignature(pubkey, hash, signature),
    );
  } catch (error) {
    throw new Error(error?.message || 'Falha ao validar assinaturas da PSBT.');
  }

  return psbt.toBase64();
};

export const finalizeSignedPsbt = (psbtBase64) => {
  const psbt = decodePsbt(psbtBase64);

  try {
    psbt.finalizeAllInputs();
  } catch (error) {
    throw new Error(error?.message || 'PSBT nao esta completamente assinada.');
  }

  const transaction = psbt.extractTransaction();

  return {
    psbtBase64: psbt.toBase64(),
    txHex: transaction.toHex(),
    txid: transaction.getId(),
    virtualSize: transaction.virtualSize(),
  };
};

export const broadcastSignedPsbt = async (psbtBase64) => {
  const { txHex, txid, virtualSize } = finalizeSignedPsbt(psbtBase64);

  const response = await fetch(`${BLOCKSTREAM_API_BASE}/tx`, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
    },
    body: txHex,
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(errorBody || `Falha ao transmitir a transacao (${response.status}).`);
  }

  return {
    txid,
    txHex,
    virtualSize,
  };
};


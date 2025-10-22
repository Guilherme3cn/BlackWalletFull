import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist as englishWordlist } from '@scure/bip39/wordlists/english';
import { HDKey } from '@scure/bip32';
import { bech32 } from '@scure/base';
import { sha256 } from '@noble/hashes/sha256';
import { ripemd160 } from '@noble/hashes/ripemd160';
import { bytesToHex, concatBytes, hexToBytes } from '@noble/hashes/utils';
import { secp256k1 } from '@noble/curves/secp256k1';

export const SATOSHIS_IN_BTC = 100000000;
const DERIVATION_PATH = "m/84'/0'/0'/0/0";
const BECH32_PREFIX = 'bc';
const BLOCKSTREAM_API_BASE = 'https://blockstream.info/api';
const MIN_CHANGE_VALUE = 546; // dust threshold in satoshis
const DEFAULT_TX_VERSION = 2;
const DEFAULT_SEQUENCE = 0xffffffff;
const SIGHASH_ALL = 0x01;

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

const createP2WPKHScriptPubKey = (pubKeyHash) => concatBytes(Uint8Array.of(0x00, 0x14), pubKeyHash);

const createP2PKHScriptCode = (pubKeyHash) =>
  concatBytes(Uint8Array.of(0x76, 0xa9, 0x14), pubKeyHash, Uint8Array.of(0x88, 0xac));

const bech32AddressToScript = (address) => {
  const decoded = bech32.decode(address);
  if (decoded?.prefix !== BECH32_PREFIX) {
    throw new Error('Unsupported address prefix.');
  }

  const [version, ...dataWords] = decoded.words;
  if (version !== 0) {
    throw new Error('Only SegWit v0 addresses are supported.');
  }

  const program = bech32.fromWords(dataWords);
  if (program.length === 20) {
    return createP2WPKHScriptPubKey(program);
  }

  if (program.length === 32) {
    return concatBytes(Uint8Array.of(0x00, 0x20), program);
  }

  throw new Error('Unsupported witness program length.');
};

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

const deriveWalletNode = (seedPhrase) => {
  const mnemonic = seedPhrase.join(' ');
  const seed = mnemonicToSeedSync(mnemonic);
  const root = HDKey.fromMasterSeed(seed);
  const child = root.derive(DERIVATION_PATH);

  if (!child?.publicKey) {
    throw new Error('Unable to derive public key');
  }

  if (!child?.privateKey) {
    throw new Error('Unable to derive private key');
  }

  return child;
};

const getWalletDetails = (seedPhrase) => {
  const child = deriveWalletNode(seedPhrase);
  const publicKey = child.publicKey;
  const privateKey = child.privateKey;
  const pubKeyHash = hash160(publicKey);
  const words = bech32.toWords(pubKeyHash);
  const address = bech32.encode(BECH32_PREFIX, [0, ...words]);

  return {
    node: child,
    address,
    publicKey,
    privateKey,
    pubKeyHash,
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

export const generateBitcoinAddress = (seedPhrase) => {
  if (!Array.isArray(seedPhrase) || seedPhrase.length === 0) {
    return '';
  }

  try {
    const { address } = getWalletDetails(seedPhrase);
    return address;
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
    fee += change;
    change = 0;
  }

  return {
    selected,
    fee,
    change,
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

const buildSignedTransaction = ({ inputs, outputs, privateKey, publicKey, pubKeyHash }) => {
  const scriptCode = createP2PKHScriptCode(pubKeyHash);
  const { hashPrevouts, hashSequence, hashOutputs } = computeTransactionHashes(inputs, outputs);
  const witnesses = [];

  inputs.forEach((input) => {
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
    const signature = secp256k1.sign(digest, privateKey).normalizeS();
    const signatureDer = signature.toDERRawBytes();
    const signatureWithHashType = concatBytes(signatureDer, Uint8Array.of(SIGHASH_ALL));
    witnesses.push([signatureWithHashType, publicKey]);
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

export const sendBitcoinTransaction = async ({ seedPhrase, recipientAddress, amountBtc, feeRate }) => {
  if (!Array.isArray(seedPhrase) || seedPhrase.length === 0) {
    throw new Error('Frase semente invalida.');
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

  const amountSat = Math.round(amountBtc * SATOSHIS_IN_BTC);
  const { address, privateKey, publicKey, pubKeyHash } = getWalletDetails(seedPhrase);

  const utxos = await fetchAddressUtxos(address);
  if (!utxos.length) {
    throw new Error('Nao ha UTXOs disponiveis para esta carteira.');
  }

  const { selected, fee, change } = selectUtxosForAmount(utxos, amountSat, feeRate);

  const inputs = selected.map((utxo) => ({
    txid: utxo.txid,
    vout: utxo.vout,
    value: utxo.value,
    sequence: DEFAULT_SEQUENCE,
  }));

  const outputs = [
    {
      value: amountSat,
      script: bech32AddressToScript(recipientAddress),
    },
  ];

  if (change > 0) {
    outputs.push({
      value: change,
      script: createP2WPKHScriptPubKey(pubKeyHash),
    });
  }

  const { rawTransaction, txid, vsize } = buildSignedTransaction({
    inputs,
    outputs,
    privateKey,
    publicKey,
    pubKeyHash,
  });

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

  return {
    txid,
    fee,
    feeRate: fee / vsize,
    change,
  };
};

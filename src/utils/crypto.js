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
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const MIN_CHANGE_VALUE = 546; // dust threshold in satoshis
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

const getWalletDetails = (seedPhrase, options = {}) => {
  if (!Array.isArray(seedPhrase) || seedPhrase.length === 0) {
    throw new Error('Seed phrase is required for derivation.');
  }

  const normalizedType = normalizeAddressType(options.type);
  const change = Boolean(options.change);
  const index = Number.isInteger(options.index) ? options.index : 0;
  const path = getDerivationPath({ type: normalizedType, change, index });
  const child = deriveWalletNode(seedPhrase, path);
  const publicKey = child.publicKey;
  const privateKey = child.privateKey;
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
    type: normalizedType,
    change,
    index,
  };
};

export const deriveAddressDetails = (seedPhrase, options = {}) => {
  const details = getWalletDetails(seedPhrase, options);
  const { address, index, change, type, path } = details;

  return {
    address,
    index,
    change,
    type,
    path,
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

  const response = await fetch(`${BLOCKSTREAM_API_BASE}/address/${address}`);

  if (!response.ok) {
    const error = new Error(`Balance request failed with status ${response.status}`);
    error.status = response.status;
    if (response.status === 429) {
      error.code = 'RATE_LIMITED';
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
  const BASE_DELAY_MS = 500;

  for (const entry of addresses) {
    let attempt = 0;
    while (attempt < MAX_ATTEMPTS) {
      try {
        const summary = await fetchAddressSummary(entry.address);
        summaries.push(summary);
        await wait(120);
        break;
      } catch (error) {
        attempt += 1;
        const retryable =
          (error?.status === 429 || error?.code === 'RATE_LIMITED') && attempt < MAX_ATTEMPTS;

        if (retryable) {
          const backoff = BASE_DELAY_MS * Math.pow(2, attempt - 1);
          await wait(backoff);
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

  const confirmedResponse = await fetch(`${BLOCKSTREAM_API_BASE}/address/${address}/txs`);
  if (!confirmedResponse.ok) {
    throw new Error(`Falha ao buscar transacoes confirmadas (${confirmedResponse.status})`);
  }

  const confirmedData = await confirmedResponse.json();

  let pendingData = [];
  try {
    const pendingResponse = await fetch(`${BLOCKSTREAM_API_BASE}/address/${address}/txs/mempool`);
    if (pendingResponse.ok) {
      pendingData = await pendingResponse.json();
    }
  } catch (error) {
    // Ignora falhas em consultas ao mempool, afinal a consulta confirmada já agrega histórico.
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
    }));

  const uniqueMap = new Map();
  normalized.forEach((item) => {
    if (!uniqueMap.has(item.address)) {
      uniqueMap.set(item.address, item);
    }
  });

  const uniqueAddresses = Array.from(uniqueMap.values());
  const addressSet = new Set(uniqueAddresses.map((item) => item.address));
  const txMap = new Map();

  for (const entry of uniqueAddresses) {
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
    throw new Error('Envio suportado apenas para enderecos bech32 no momento.');
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

  const inputs = selected.map((utxo) => {
    const source = utxo.source ?? {};
    const details = getWalletDetails(seedPhrase, {
      type: source.type ?? normalizedType,
      change: Boolean(source.change),
      index: Number.isInteger(source.index) ? source.index : 0,
    });

    return {
      txid: utxo.txid,
      vout: utxo.vout,
      value: utxo.value,
      sequence: DEFAULT_SEQUENCE,
      privateKey: details.privateKey,
      publicKey: details.publicKey,
      pubKeyHash: details.pubKeyHash,
    };
  });

  let recipientScript;
  try {
    recipientScript = Uint8Array.from(bitcoin.address.toOutputScript(recipientAddress, BITCOIN_NETWORK));
  } catch (error) {
    throw new Error('Endereco de destino invalido.');
  }

  const outputs = [
    {
      value: amountSat,
      script: recipientScript,
    },
  ];

  let changeAddressInfo = null;
  if (change > 0) {
    const changeDetails = getWalletDetails(seedPhrase, {
      type: normalizedType,
      change: true,
      index: nextChangeIndex,
    });

    outputs.push({
      value: change,
      script: changeDetails.outputScript,
    });

    changeAddressInfo = {
      address: changeDetails.address,
      index: nextChangeIndex,
      change: true,
      type: normalizedType,
    };
  }

  const { rawTransaction, txid, vsize } = buildSignedTransaction({ inputs, outputs });

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
    fee,
    feeRate: fee / vsize,
    change,
    changeAddress: changeAddressInfo,
    usedInputs: selected.map((item) => item.source ?? { address: item.address }),
    changeBelowDust,
    rawTransaction,
    preview: previewOnly,
  };
};

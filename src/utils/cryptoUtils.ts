import * as bitcoin from 'bitcoinjs-lib';
import * as bip39 from 'bip39';
import { ECPairFactory } from 'ecpair';
import { BIP32Factory } from 'bip32';
import * as ecc from '@bitcoinerlab/secp256k1';

const ECPair = ECPairFactory(ecc);
const bip32 = BIP32Factory(ecc);
const network = bitcoin.networks.bitcoin; // Use testnet for testing: bitcoin.networks.testnet

// Generate real mnemonic (seed phrase)
export const generateSeedPhrase = (): string[] => {
  const mnemonic = bip39.generateMnemonic();
  return mnemonic.split(' ');
};

// Generate Bitcoin address from seed phrase
export const generateBitcoinAddress = (seedPhrase: string[]): string => {
  try {
    const mnemonic = seedPhrase.join(' ');
    const seed = bip39.mnemonicToSeedSync(mnemonic);
    
    // Derive the key pair using BIP84 (Native SegWit)
    const root = bip32.fromSeed(seed, network);
    const path = `m/84'/0'/0'/0/0`; // First receiving address
    const child = root.derivePath(path);
    
    // Generate Native SegWit address
    const { address } = bitcoin.payments.p2wpkh({
      pubkey: child.publicKey,
      network,
    });

    return address || '';
  } catch (error) {
    console.error('Error generating Bitcoin address:', error);
    return '';
  }
};

// Get balance from address using Blockstream API
export const getAddressBalance = async (address: string): Promise<number> => {
  try {
    const response = await fetch(`https://blockstream.info/api/address/${address}`);
    const data = await response.json();
    return data.chain_stats.funded_txo_sum / 100000000; // Convert satoshis to BTC
  } catch (error) {
    console.error('Error fetching balance:', error);
    return 0;
  }
};

// Sign a Bitcoin transaction
export const signTransaction = async (
  seedPhrase: string[],
  toAddress: string,
  amount: number,
  fee: number
): Promise<string> => {
  try {
    const mnemonic = seedPhrase.join(' ');
    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const root = bip32.fromSeed(seed, network);
    const path = `m/84'/0'/0'/0/0`;
    const child = root.derivePath(path);
    const keyPair = ECPair.fromPrivateKey(child.privateKey!);

    // Create transaction (simplified version)
    const psbt = new bitcoin.Psbt({ network });
    
    // Add inputs and outputs (this is simplified - in reality, you need to fetch UTXOs)
    // psbt.addInput(...)
    // psbt.addOutput(...)
    
    psbt.signAllInputs(keyPair);
    psbt.finalizeAllInputs();
    
    return psbt.extractTransaction().toHex();
  } catch (error) {
    console.error('Error signing transaction:', error);
    throw new Error('Failed to sign transaction');
  }
};

export const formatBitcoinAmount = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 8,
    maximumFractionDigits: 8,
  }).format(amount);
};
import React from 'react';
import { View, Text, TouchableOpacity, Alert, Linking } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { formatBitcoinAmount } from '../utils/crypto';
import { walletCardStyles as styles } from '../styles/walletCardStyles';

const formatUsd = (value) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value || 0);

const WalletCard = ({ address, balance, usdValue, onRefreshPrice }) => {
  const handleCopyAddress = async () => {
    if (!address) {
      return;
    }

    await Clipboard.setStringAsync(address);
    Alert.alert('Endereco copiado', 'O endereco Bitcoin foi copiado para a area de transferencia.');
  };

  const handleOpenExplorer = () => {
    if (!address) {
      return;
    }

    Linking.openURL(`https://mempool.space/address/${address}`);
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Cold Wallet</Text>
        <Text style={styles.subtitle}>Monitoramento seguro do seu saldo</Text>
        </View>
        <View style={styles.headerButtons}>
          <TouchableOpacity onPress={onRefreshPrice} style={styles.iconButton}>
            <Text style={styles.iconText}>REF</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleOpenExplorer} style={styles.iconButton}>
            <Text style={styles.iconText}>WEB</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Saldo</Text>
        <Text style={styles.balanceText}>{formatBitcoinAmount(balance)} BTC</Text>
        <Text style={styles.usdText}>{formatUsd(usdValue)}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Endereco</Text>
        <View style={styles.addressRow}>
          <Text numberOfLines={1} ellipsizeMode="middle" style={styles.addressText}>
            {address || 'Carregando...'}
          </Text>
          <TouchableOpacity onPress={handleCopyAddress} style={styles.copyButton}>
            <Text style={styles.copyButtonText}>Copiar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export default WalletCard;

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Alert, Linking, ImageBackground, Animated, Easing } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { formatBitcoinAmount, SATOSHIS_IN_BTC } from '../utils/crypto';
import { walletCardStyles as styles } from '../styles/walletCardStyles';
import { Ionicons } from '@expo/vector-icons';

const MIN_REFRESH_ANIMATION_MS = 2000;

const formatUsd = (value) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value || 0);

const formatBrl = (value) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 2,
  }).format(value || 0);

const WalletCard = ({
  address,
  balance,
  usdValue,
  onRefreshPrice,
  btcPrice,
  isRefreshing = false,
  canRefreshPrice = true,
}) => {
  const [balanceDisplayMode, setBalanceDisplayMode] = useState('btc'); // btc -> sats -> brl
  const rotateValue = useRef(new Animated.Value(0)).current;
  const animationRef = useRef(null);
  const animationStartRef = useRef(0);
  const stopTimeoutRef = useRef(null);
  const isAnimatingRef = useRef(false);
  const latestRefreshingRef = useRef(isRefreshing);

  const startAnimation = useCallback(() => {
    animationStartRef.current = Date.now();

    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }

    if (isAnimatingRef.current) {
      return;
    }

    rotateValue.setValue(0);
    const animation = Animated.loop(
      Animated.timing(rotateValue, {
        toValue: 1,
        duration: 800,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );

    animationRef.current = animation;
    animation.start();
    isAnimatingRef.current = true;
  }, [rotateValue]);

  const stopWithMinimumDuration = useCallback(() => {
    if (!isAnimatingRef.current) {
      return;
    }

    const startedAt = animationStartRef.current || 0;
    const elapsed = Date.now() - startedAt;
    const remaining = Math.max(0, MIN_REFRESH_ANIMATION_MS - elapsed);

    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current);
    }

    stopTimeoutRef.current = setTimeout(() => {
      stopTimeoutRef.current = null;

      if (!isAnimatingRef.current) {
        return;
      }

      animationRef.current?.stop();
      rotateValue.stopAnimation(() => {
        rotateValue.setValue(0);
      });
      animationRef.current = null;
      isAnimatingRef.current = false;
    }, remaining);
  }, [rotateValue]);

  useEffect(() => {
    latestRefreshingRef.current = isRefreshing;

    if (isRefreshing) {
      startAnimation();
      return;
    }

    if (isAnimatingRef.current) {
      stopWithMinimumDuration();
    }
  }, [isRefreshing, startAnimation, stopWithMinimumDuration]);

  useEffect(
    () => () => {
      if (stopTimeoutRef.current) {
        clearTimeout(stopTimeoutRef.current);
        stopTimeoutRef.current = null;
      }

      if (animationRef.current) {
        animationRef.current.stop();
        animationRef.current = null;
      }
      rotateValue.stopAnimation(() => {
        rotateValue.setValue(0);
      });
      isAnimatingRef.current = false;
    },
    [rotateValue],
  );

  const handleRefreshPress = useCallback(() => {
    if (!canRefreshPrice || typeof onRefreshPrice !== 'function') {
      return;
    }

    startAnimation();

    let result;
    try {
      result = onRefreshPrice();
    } catch (error) {
      if (!latestRefreshingRef.current) {
        stopWithMinimumDuration();
      }
      return;
    }

    Promise.resolve(result)
      .catch(() => undefined)
      .finally(() => {
        if (!latestRefreshingRef.current) {
          stopWithMinimumDuration();
        }
      });
  }, [canRefreshPrice, onRefreshPrice, startAnimation, stopWithMinimumDuration]);

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

  const handleCycleBalanceMode = () => {
    setBalanceDisplayMode((prev) => {
      if (prev === 'btc') return 'sats';
      if (prev === 'sats') return 'brl';
      return 'btc';
    });
  };

  const safeBalance = Number(balance || 0);

  useEffect(() => {
    if (balanceDisplayMode === 'brl' && !btcPrice?.brl && typeof onRefreshPrice === 'function') {
      onRefreshPrice();
    }
  }, [balanceDisplayMode, btcPrice?.brl, onRefreshPrice]);

  const balanceLabel = useMemo(() => {
    switch (balanceDisplayMode) {
      case 'sats': {
        const sats = Math.round(safeBalance * SATOSHIS_IN_BTC);
        return `${sats.toLocaleString()} sats`;
      }
      case 'brl': {
        if (!btcPrice?.brl) {
          return 'R$ --';
        }
        const brlValue = safeBalance * btcPrice.brl;
        return formatBrl(brlValue);
      }
      case 'btc':
      default:
        return `${formatBitcoinAmount(safeBalance)} BTC`;
    }
  }, [balanceDisplayMode, btcPrice, safeBalance]);

  const secondaryLabel = useMemo(() => {
    if (balanceDisplayMode === 'btc' || balanceDisplayMode === 'sats') {
      const usdText = formatUsd(usdValue);
      const brlText = btcPrice?.brl ? formatBrl(safeBalance * btcPrice.brl) : null;
      return brlText ? `${usdText} • ${brlText}` : usdText;
    }

    const sats = Math.round(safeBalance * SATOSHIS_IN_BTC);
    return `${formatBitcoinAmount(safeBalance)} BTC • ${sats.toLocaleString()} sats`;
  }, [balanceDisplayMode, btcPrice, safeBalance, usdValue]);

  const refreshSpin = rotateValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <ImageBackground
      source={require('../../assets/images/blackcard.png')}
      style={styles.card}
      imageStyle={styles.cardImage}
      resizeMode="cover"
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Cold Wallet</Text>
          <Text style={styles.subtitle}>Monitoramento seguro do seu saldo</Text>
        </View>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            onPress={handleRefreshPress}
            activeOpacity={0.8}
            style={[styles.iconButton, !canRefreshPrice ? styles.iconButtonDisabled : null]}
            disabled={!canRefreshPrice}
          >
            <Animated.View style={{ transform: [{ rotate: refreshSpin }] }}>
              <Ionicons name="refresh" size={20} color={styles.iconText.color} />
            </Animated.View>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleOpenExplorer} activeOpacity={0.8} style={styles.iconButton}>
            <Text style={styles.iconText}>WEB</Text>
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.section}>
        <Text style={styles.label}>Saldo</Text>
        <TouchableOpacity activeOpacity={0.85} onPress={handleCycleBalanceMode}>
          <Text style={styles.balanceText}>{balanceLabel}</Text>
        </TouchableOpacity>
        <Text style={styles.usdText}>{secondaryLabel}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Endereco</Text>
        <View style={styles.addressRow}>
          <Text numberOfLines={1} ellipsizeMode="middle" style={styles.addressText}>
            {address || 'Carregando...'}
          </Text>
          <TouchableOpacity onPress={handleCopyAddress} activeOpacity={0.8} style={styles.copyButton}>
            <Text style={styles.copyButtonText}>Copiar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ImageBackground>
  );
};

export default WalletCard;



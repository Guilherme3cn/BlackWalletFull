import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ActivityIndicator, Image, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import WalletCard from '../components/WalletCard';
import SeedPhrase from '../components/SeedPhrase';
import {
  SATOSHIS_IN_BTC,
  formatBitcoinAmount,
  generateBitcoinAddress,
  generateSeedPhrase,
  getAddressBalance,
  sendBitcoinTransaction,
} from '../utils/crypto';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { homeStyles as styles } from '../styles/homeStyles';
import { Feather } from '@expo/vector-icons';
import { colors } from '../theme/colors';

const WALLET_DATA_KEY = 'bitcoin-wallet-data';
const PASSWORD_KEY = 'wallet-password';
const FEE_REFRESH_INTERVAL = 60000;
const ESTIMATED_TX_SIZE_VBYTES = 110;
const FEE_API_URL = 'https://mempool.space/api/v1/fees/recommended';

const fetchBtcPrice = async () => {
  const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,brl');

  if (!response.ok) {
    throw new Error(`Falha ao buscar preco BTC: ${response.status}`);
  }

  const data = await response.json();
  const usdPrice = data?.bitcoin?.usd;
  const brlPrice = data?.bitcoin?.brl;

  if (!usdPrice || !brlPrice) {
    throw new Error('Precos do Bitcoin indisponiveis');
  }

  return {
    usd: Number(usdPrice),
    brl: Number(brlPrice),
  };
};

const HomeScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [seedPhrase, setSeedPhrase] = useState([]);
  const [address, setAddress] = useState('');
  const [balance, setBalance] = useState(0);
  const [btcPrice, setBtcPrice] = useState({ usd: null, brl: null });
  const [loadingWallet, setLoadingWallet] = useState(true);
  const [priceRefreshing, setPriceRefreshing] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [isOnline, setIsOnline] = useState(false);
  const [generatingWallet, setGeneratingWallet] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [sendModalVisible, setSendModalVisible] = useState(false);
  const [sendAddress, setSendAddress] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [sendPercentage, setSendPercentage] = useState(null);
  const [sendStatus, setSendStatus] = useState(null);
  const [feeRate, setFeeRate] = useState(null);
  const [feeProfile, setFeeProfile] = useState('fastest');
  const [feeUpdating, setFeeUpdating] = useState(false);
  const [feeError, setFeeError] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [sendingTransaction, setSendingTransaction] = useState(false);
  const [receiveModalVisible, setReceiveModalVisible] = useState(false);
  const [cameraModule, setCameraModule] = useState(null);
  const [cameraModuleError, setCameraModuleError] = useState(null);
  const didToggleRef = useRef(false);
  const cameraModuleRef = useRef(null);
  const feeIntervalRef = useRef(null);
  const sendStatusTimeoutRef = useRef(null);
  const percentageOptions = useMemo(
    () => [
      { label: '25%', value: 0.25 },
      { label: '50%', value: 0.5 },
      { label: '75%', value: 0.75 },
      { label: 'Max', value: 1 },
    ],
    [],
  );

  const { usd: btcPriceUsd } = btcPrice;

  const parsedSendAmount = useMemo(() => {
    if (!sendAmount) {
      return 0;
    }
    const normalized = String(sendAmount).replace(',', '.');
    const value = Number.parseFloat(normalized);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }, [sendAmount]);

  const estimatedFeeBtc = useMemo(() => {
    if (!feeRate || feeRate <= 0) {
      return 0;
    }
    return (feeRate * ESTIMATED_TX_SIZE_VBYTES) / SATOSHIS_IN_BTC;
  }, [feeRate]);

  const estimatedTotalBtc = useMemo(() => {
    return parsedSendAmount + estimatedFeeBtc;
  }, [estimatedFeeBtc, parsedSendAmount]);

  const estimatedFeeUsd = useMemo(() => {
    if (!btcPriceUsd || !estimatedFeeBtc) {
      return null;
    }
    return estimatedFeeBtc * btcPriceUsd;
  }, [btcPriceUsd, estimatedFeeBtc]);

  const estimatedTotalUsd = useMemo(() => {
    if (!btcPriceUsd) {
      return null;
    }
    return estimatedTotalBtc * btcPriceUsd;
  }, [btcPriceUsd, estimatedTotalBtc]);

  const feeOptions = useMemo(
    () => [
      { key: 'fastest', label: 'Alta', description: 'Confirma em ~1 bloco' },
      { key: 'medium', label: 'Media', description: 'Confirma em ~3 blocos' },
      { key: 'economy', label: 'Economica', description: 'Confirma em 6+ blocos' },
    ],
    [],
  );

  const selectedFeeOption = useMemo(
    () => feeOptions.find((option) => option.key === feeProfile) ?? feeOptions[0],
    [feeOptions, feeProfile],
  );

  const CameraComponent = useMemo(() => cameraModule?.CameraView ?? null, [cameraModule]);

  const showFeedback = useCallback((type, message) => {
    setFeedback({ type, message, timestamp: Date.now() });
  }, []);

  const busyOverlayMessage = useMemo(() => {
    if (loadingWallet) {
      return 'Preparando sua carteira...';
    }
    if (generatingWallet) {
      return 'Gerando nova carteira...';
    }
    if (loggingOut) {
      return 'Saindo da carteira...';
    }
    if (sendingTransaction) {
      return 'Enviando transacao...';
    }
    return null;
  }, [generatingWallet, loadingWallet, loggingOut, sendingTransaction]);

  const handleToggleConnection = useCallback(() => {
    setIsOnline((prev) => !prev);
  }, []);

  const handleSendBitcoin = useCallback(() => {
    if (!isOnline) {
      showFeedback('error', 'Ative o modo online para enviar BTC.');
      return;
    }

    if (!address) {
      showFeedback('error', 'Endereco da carteira indisponivel.');
      return;
    }

    setSendAddress('');
    setSendAmount('');
    setSendModalVisible(true);
    setSendPercentage(null);
    setFeeProfile('fastest');
    setSendStatus(null);
  }, [address, isOnline, showFeedback]);

  const handleReceiveBitcoin = useCallback(() => {
    if (!address) {
      showFeedback('error', 'Endereco da carteira indisponivel.');
      return;
    }

    setReceiveModalVisible(true);
  }, [address, showFeedback]);

  const handleCloseSendModal = useCallback(() => {
    setIsScanning(false);
    setSendModalVisible(false);
    setSendAddress('');
    setSendAmount('');
    setSendPercentage(null);
    setFeeProfile('fastest');
    setCameraModuleError(null);
    setSendingTransaction(false);
    setSendStatus(null);
    if (sendStatusTimeoutRef.current) {
      clearTimeout(sendStatusTimeoutRef.current);
      sendStatusTimeoutRef.current = null;
    }
  }, []);

  const loadCameraModule = useCallback(async () => {
    if (cameraModuleRef.current) {
      return cameraModuleRef.current;
    }

    try {
      const module = await import('expo-camera');
      cameraModuleRef.current = module;
      setCameraModule(module);
      return module;
    } catch (error) {
      console.error('Erro ao carregar modulo da camera', error);
      throw error;
    }
  }, []);

  const handleScanQrCode = useCallback(async () => {
    if (sendingTransaction) {
      return;
    }

    try {
      const camera = await loadCameraModule();

      const requestPermission =
        camera?.requestCameraPermissionsAsync ?? camera?.Camera?.requestPermissionsAsync;

      if (!requestPermission) {
        showFeedback('error', 'Camera nao disponivel neste dispositivo.');
        return;
      }

      const permission = await requestPermission();

      if (!permission?.granted) {
        showFeedback('error', 'Permissao de camera negada.');
        return;
      }

      if (!camera?.CameraView) {
        showFeedback('error', 'Leitor de QR Code indisponivel neste dispositivo.');
        setCameraModuleError('Leitor de QR Code indisponivel neste dispositivo.');
        return;
      }

      setCameraModuleError(null);
      setIsScanning(true);
    } catch (error) {
      console.error('Erro ao preparar camera para leitura de QR Code', error);
      setCameraModuleError('Nao foi possivel acessar a camera do dispositivo.');
      showFeedback('error', 'Nao foi possivel acessar a camera do dispositivo.');
    }
  }, [loadCameraModule, sendingTransaction, showFeedback]);

  const handleQrCodeScanned = useCallback(
    ({ data }) => {
      if (!isScanning) {
        return;
      }

      if (!data) {
        showFeedback('error', 'QR Code invalido.');
        return;
      }

      let extractedAddress = data.trim();
      let extractedAmount = null;

      if (extractedAddress.toLowerCase().startsWith('bitcoin:')) {
        const withoutScheme = extractedAddress.slice('bitcoin:'.length);
        const [addressPart, queryPart] = withoutScheme.split('?');
        extractedAddress = addressPart?.trim() ?? '';

        if (queryPart) {
          queryPart.split('&').forEach((pair) => {
            const [rawKey, rawValue] = pair.split('=');
            if (!rawKey || !rawValue) {
              return;
            }

            const key = rawKey.trim().toLowerCase();
            const value = decodeURIComponent(rawValue.trim());

            if (key === 'amount' && value) {
              extractedAmount = value;
            }
          });
        }
      }

      if (!extractedAddress) {
        showFeedback('error', 'QR Code nao contem um endereco valido.');
        return;
      }

      setSendAddress(extractedAddress);
      if (extractedAmount) {
        setSendAmount(extractedAmount);
      }
      setSendPercentage(null);

      setIsScanning(false);
      showFeedback('success', 'Endereco preenchido via QR Code.');
    },
    [isScanning, setSendAddress, setSendAmount, showFeedback],
  );

  const handleCancelScan = useCallback(() => {
    setIsScanning(false);
  }, []);

  const handleSelectFeeProfile = useCallback(
    (profile) => {
      setFeeProfile(profile);
      setSendStatus(null);
      if (sendModalVisible) {
        if (feeIntervalRef.current) {
          clearInterval(feeIntervalRef.current);
          feeIntervalRef.current = null;
        }
        fetchMinerFee();
      }
    },
    [fetchMinerFee, sendModalVisible],
  );

  const fetchMinerFee = useCallback(async () => {
    if (!isOnline) {
      setFeeError('Ative o modo online para calcular a taxa.');
      return;
    }

    try {
      setFeeUpdating(true);
      setFeeError(null);
      const response = await fetch(FEE_API_URL);
      if (!response.ok) {
        throw new Error(`Status ${response.status}`);
      }

      const data = await response.json();
      let rate;
      if (feeProfile === 'fastest') {
        rate = Number(data?.fastestFee);
      } else if (feeProfile === 'medium') {
        rate = Number(data?.halfHourFee);
      } else if (feeProfile === 'economy') {
        rate = Number(data?.hourFee ?? data?.economyFee);
      }

      if (!Number.isFinite(rate) || rate <= 0) {
        rate =
          Number(data?.fastestFee) ||
          Number(data?.halfHourFee) ||
          Number(data?.hourFee) ||
          Number(data?.economyFee) ||
          Number(data?.minimumFee);
      }

      if (!Number.isFinite(rate) || rate <= 0) {
        throw new Error('Resposta sem taxa valida');
      }

      setFeeRate(rate);
    } catch (error) {
      console.error('Erro ao atualizar taxa de mineracao', error);
      setFeeError('Nao foi possivel atualizar a taxa de mineracao.');
    } finally {
      setFeeUpdating(false);
    }
  }, [feeProfile, isOnline]);

  useEffect(() => {
    if (!sendModalVisible) {
      setFeeRate(null);
      setFeeError(null);
      setFeeUpdating(false);
      if (feeIntervalRef.current) {
        clearInterval(feeIntervalRef.current);
        feeIntervalRef.current = null;
      }
      if (sendStatusTimeoutRef.current) {
        clearTimeout(sendStatusTimeoutRef.current);
        sendStatusTimeoutRef.current = null;
      }
      return;
    }

    if (!isOnline) {
      setFeeError('Ative o modo online para calcular a taxa.');
      if (feeIntervalRef.current) {
        clearInterval(feeIntervalRef.current);
        feeIntervalRef.current = null;
      }
      setFeeRate(null);
      return;
    }

    fetchMinerFee();
    feeIntervalRef.current = setInterval(fetchMinerFee, FEE_REFRESH_INTERVAL);

    return () => {
      if (feeIntervalRef.current) {
        clearInterval(feeIntervalRef.current);
        feeIntervalRef.current = null;
      }
    };
  }, [fetchMinerFee, feeProfile, isOnline, sendModalVisible]);

  useEffect(() => {
    return () => {
      if (sendStatusTimeoutRef.current) {
        clearTimeout(sendStatusTimeoutRef.current);
        sendStatusTimeoutRef.current = null;
      }
    };
  }, []);

  const handleSelectSendPercentage = useCallback(
    (value) => {
      setSendPercentage(value);
      setSendStatus(null);
      if (!balance || balance <= 0) {
        setSendAmount('0');
        return;
      }

      const amount = balance * value;
      setSendAmount(formatBitcoinAmount(amount));
    },
    [balance],
  );

  const handleSubmitSend = useCallback(async () => {
    if (sendingTransaction) {
      return;
    }

    if (!isOnline) {
      const message = 'Ative o modo online para enviar BTC.';
      showFeedback('error', message);
      setSendStatus({ type: 'error', message });
      return;
    }

    if (!sendAddress.trim()) {
      const message = 'Informe o endereco de destino.';
      showFeedback('error', message);
      setSendStatus({ type: 'error', message });
      return;
    }

    if (!sendAmount.trim()) {
      const message = 'Informe a quantidade de BTC a enviar.';
      showFeedback('error', message);
      setSendStatus({ type: 'error', message });
      return;
    }

    if (!feeRate) {
      const message = 'Nao foi possivel calcular a taxa de mineracao.';
      showFeedback('error', message);
      setSendStatus({ type: 'error', message });
      return;
    }

    if (!Array.isArray(seedPhrase) || !seedPhrase.length) {
      const message = 'Frase semente indisponivel.';
      showFeedback('error', message);
      setSendStatus({ type: 'error', message });
      return;
    }

    if (!parsedSendAmount || parsedSendAmount <= 0) {
      const message = 'Quantidade invalida de BTC.';
      showFeedback('error', message);
      setSendStatus({ type: 'error', message });
      return;
    }

    const totalToSpend = estimatedTotalBtc;
    if (!Number.isFinite(totalToSpend) || totalToSpend <= 0) {
      const message = 'Nao foi possivel calcular o total da transacao.';
      showFeedback('error', message);
      setSendStatus({ type: 'error', message });
      return;
    }

    if (totalToSpend > balance) {
      const message = `Saldo insuficiente. Disponivel: ${formatBitcoinAmount(balance)} BTC. Necessario: ${formatBitcoinAmount(totalToSpend)} BTC (valor + taxa).`;
      showFeedback('error', message);
      setSendStatus({ type: 'error', message });
      return;
    }

    try {
      setSendingTransaction(true);
      setSendStatus(null);
      const result = await sendBitcoinTransaction({
        seedPhrase,
        recipientAddress: sendAddress.trim(),
        amountBtc: parsedSendAmount,
        feeRate,
      });

      const successMessage = `Transferencia enviada com sucesso. TXID: ${result.txid}`;
      showFeedback('success', successMessage);
      setSendStatus({ type: 'success', message: successMessage });
      if (sendStatusTimeoutRef.current) {
        clearTimeout(sendStatusTimeoutRef.current);
      }
      sendStatusTimeoutRef.current = setTimeout(() => {
        handleCloseSendModal();
      }, 1500);

      await fetchBalance();
    } catch (error) {
      console.error('Erro ao enviar transacao', error);
      const message = error?.message ?? 'Nao foi possivel enviar a transacao.';
      showFeedback('error', message);
      setSendStatus({ type: 'error', message });
    } finally {
      setSendingTransaction(false);
    }
  }, [
    balance,
    estimatedTotalBtc,
    feeRate,
    fetchBalance,
    handleCloseSendModal,
    isOnline,
    parsedSendAmount,
    seedPhrase,
    sendAddress,
    sendAmount,
    sendingTransaction,
    showFeedback,
  ]);

  const qrCodeUri = useMemo(() => {
    if (!address) {
      return null;
    }

    const encoded = encodeURIComponent(address);
    return `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encoded}`;
  }, [address]);

  const usdValue = useMemo(() => {
    if (!btcPriceUsd) {
      return 0;
    }

    return balance * btcPriceUsd;
  }, [balance, btcPriceUsd]);

  const fetchBalance = useCallback(
    async (targetAddress = address) => {
      if (!targetAddress || !isOnline) {
        return;
      }

      try {
        const value = await getAddressBalance(targetAddress);
        setBalance(value);
      } catch (error) {
        showFeedback('error', 'Erro ao atualizar saldo. Verifique sua conexao.');
      }
    },
    [address, isOnline, showFeedback],
  );

  const refreshBtcPrice = useCallback(async () => {
    if (!isOnline) {
      showFeedback('error', 'Ative o modo online para atualizar o preco do Bitcoin.');
      return;
    }

    try {
      setPriceRefreshing(true);
      const price = await fetchBtcPrice();
      setBtcPrice(price);
      showFeedback('success', 'Preco do Bitcoin atualizado com sucesso.');
    } catch (error) {
      showFeedback('error', 'Nao foi possivel atualizar o preco do Bitcoin.');
    } finally {
      setPriceRefreshing(false);
    }
  }, [isOnline, showFeedback]);

  const regenerateWallet = useCallback(
    async (skipFeedback = false) => {
      try {
        setGeneratingWallet(true);
        await new Promise((resolve) => setTimeout(resolve, 100));
        const newSeedPhrase = generateSeedPhrase();
        const newAddress = generateBitcoinAddress(newSeedPhrase);

        await AsyncStorage.setItem(
          WALLET_DATA_KEY,
          JSON.stringify({
            seedPhrase: newSeedPhrase,
            address: newAddress,
          }),
        );

        setSeedPhrase(newSeedPhrase);
        setAddress(newAddress);
        await fetchBalance(newAddress);
        if (!skipFeedback) {
          showFeedback('success', 'Nova carteira gerada. Guarde a frase semente com seguranca.');
        }
      } catch (error) {
        Alert.alert('Erro', 'Nao foi possivel gerar uma nova carteira.');
        console.error('Erro ao gerar carteira', error);
      } finally {
        setGeneratingWallet(false);
      }
    },
    [fetchBalance, showFeedback],
  );

  const confirmRegenerateWallet = useCallback(() => {
    Alert.alert(
      'Criar nova carteira?',
      'Se voce nao salvar as palavras atuais, perdera acesso a esta carteira. Deseja continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Criar nova', style: 'destructive', onPress: () => regenerateWallet() },
      ],
    );
  }, [regenerateWallet]);

  const loadWalletFromStorage = useCallback(async () => {
    try {
      const storedData = await AsyncStorage.getItem(WALLET_DATA_KEY);

      if (storedData) {
        const parsed = JSON.parse(storedData);
        setSeedPhrase(parsed.seedPhrase || []);
        setAddress(parsed.address || '');
      } else {
        await regenerateWallet(true);
      }
    } catch (error) {
      Alert.alert('Erro', 'Nao foi possivel carregar os dados da carteira.');
      console.error('Erro carregando carteira', error);
    } finally {
      setLoadingWallet(false);
    }
  }, [regenerateWallet]);

  const handleLogout = useCallback(async () => {
    try {
      setLoggingOut(true);
      await new Promise((resolve) => setTimeout(resolve, 100));
      await AsyncStorage.multiRemove([PASSWORD_KEY, WALLET_DATA_KEY]);
      navigation.reset({
        index: 0,
        routes: [{ name: 'Login' }],
      });
    } finally {
      setLoggingOut(false);
    }
  }, [navigation]);

  const confirmLogout = useCallback(() => {
    Alert.alert(
      'Sair da carteira?',
      'Se voce nao salvar as palavras atuais, perdera acesso a esta carteira. Deseja sair mesmo assim?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Realmente sair', style: 'destructive', onPress: () => handleLogout() },
      ],
    );
  }, [handleLogout]);

  useEffect(() => {
    const ensurePassword = async () => {
      const password = await AsyncStorage.getItem(PASSWORD_KEY);
      if (!password) {
        setLoadingWallet(false);
        navigation.reset({
          index: 0,
          routes: [{ name: 'Sign' }],
        });
        return;
      }
      loadWalletFromStorage();
    };

    ensurePassword();
  }, [loadWalletFromStorage, navigation]);

  useEffect(() => {
    if (!address || !isOnline) {
      return;
    }

    fetchBalance();

    const interval = setInterval(() => {
      fetchBalance();
    }, 30000);

    return () => clearInterval(interval);
  }, [address, fetchBalance, isOnline]);

  useEffect(() => {
    if (!didToggleRef.current) {
      return;
    }

    if (isOnline) {
      showFeedback('success', 'Modo online ativado. Atualizando dados...');
      fetchBalance();
      refreshBtcPrice();
    } else {
      showFeedback('info', 'Modo offline ativado. Atualizacao de dados desabilitada.');
    }
  }, [isOnline, fetchBalance, refreshBtcPrice, showFeedback]);

  useEffect(() => {
    didToggleRef.current = true;
  }, []);

  useEffect(() => {
    if (!feedback) {
      return;
    }

    const timeout = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(timeout);
  }, [feedback]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'bottom', 'left']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        bounces
        overScrollMode="always"
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.heading}>Black Vault wallet</Text>
            <Text style={styles.headingSubtitle}>Controle total da sua chave privada</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={confirmRegenerateWallet}
              style={[styles.headerButton, styles.outlineButton]}
            >
              <Text style={styles.headerButtonText}>Nova Carteira</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleToggleConnection}
              style={[
                styles.headerButton,
                styles.outlineButton,
                { width: 44, height: 44, paddingHorizontal: 0, justifyContent: 'center', alignItems: 'center' },
              ]}
              accessibilityLabel={isOnline ? 'Alternar para modo offline' : 'Alternar para modo online'}
            >
              <Feather name={isOnline ? 'wifi' : 'wifi-off'} size={20} color={isOnline ? colors.primary : colors.danger} />
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={confirmLogout}
              style={[styles.headerButton, styles.dangerButton]}
            >
              <Text style={[styles.headerButtonText, styles.dangerButtonText]}>Sair</Text>
            </TouchableOpacity>
          </View>
        </View>

        <WalletCard
          address={address}
          balance={balance}
          usdValue={usdValue}
          btcPrice={btcPrice}
          onRefreshPrice={refreshBtcPrice}
        />

        <View style={styles.quickActions}>
          <TouchableOpacity
            activeOpacity={0.85}
            style={[styles.quickActionButton, styles.sendButton]}
            onPress={handleSendBitcoin}
          >
            <Feather name="arrow-up-right" size={18} color={colors.primaryText} style={styles.quickActionIcon} />
            <Text style={styles.quickActionText}>Enviar BTC</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.85}
            style={[styles.quickActionButton, styles.receiveButton]}
            onPress={handleReceiveBitcoin}
          >
            <Feather name="arrow-down-left" size={18} color={colors.primary} style={styles.quickActionIcon} />
            <Text style={styles.quickActionTextSecondary}>Receber BTC</Text>
          </TouchableOpacity>
        </View>

        <SeedPhrase words={seedPhrase} />

        <Text style={styles.disclaimer}>
          ATENCAO: Mantenha sua frase semente em segurança. Nunca compartilhe com terceiros.
        </Text>

        {priceRefreshing ? <Text style={styles.loadingText}>Atualizando preco...</Text> : null}
      </ScrollView>
      {feedback ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: insets.top + 16,
            left: 16,
            right: 16,
            zIndex: 20,
            elevation: 4,
          }}
        >
          <View
            style={[
              styles.feedback,
              feedback.type === 'error' ? styles.feedbackError : styles.feedbackSuccess,
            ]}
          >
            <Text style={styles.feedbackText}>{feedback.message}</Text>
          </View>
        </View>
      ) : null}
      {busyOverlayMessage ? (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: 32,
          }}
        >
          <ActivityIndicator size="large" color={colors.primary} />
          <Text
            style={{
              marginTop: 16,
              color: colors.mutedForeground,
              fontSize: 16,
              textAlign: 'center',
            }}
          >
            {busyOverlayMessage}
          </Text>
        </View>
    ) : null}
      <Modal
        visible={sendModalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCloseSendModal}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Enviar BTC</Text>
            {isScanning ? (
              <>
                {CameraComponent ? (
                  <>
                    <View style={styles.qrScannerContainer}>
                      <CameraComponent
                        style={styles.qrScanner}
                        facing="back"
                        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                        onBarcodeScanned={handleQrCodeScanned}
                      />
                    </View>
                    <Text style={styles.qrScannerHint}>Aponte para o QR Code do destinatario</Text>
                  </>
                ) : (
                  <View style={styles.qrScannerFallback}>
                    <Feather name="camera-off" size={36} color={colors.mutedForeground} />
                    <Text style={styles.qrScannerFallbackText}>
                      {cameraModuleError ??
                        'Camera indisponivel. Verifique se o dispositivo suporta leitura de QR code.'}
                    </Text>
                  </View>
                )}
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.qrScannerCancel}
                  onPress={handleCancelScan}
                >
                  <Text style={styles.qrScannerCancelText}>Cancelar leitura</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={styles.sendModalOptions}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    disabled={sendingTransaction}
                    style={[
                      styles.modalOptionButton,
                      sendingTransaction ? styles.modalOptionButtonDisabled : null,
                    ]}
                    onPress={handleScanQrCode}
                  >
                    <Feather name="camera" size={18} color={colors.primaryText} />
                    <Text style={styles.modalOptionButtonText}>Ler QR Code</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.modalDividerText}>Ou informe manualmente</Text>
                <TextInput
                  value={sendAddress}
                  onChangeText={(value) => {
                    setSendAddress(value);
                    setSendStatus(null);
                  }}
                  placeholder="Endereco do destinatario"
                  placeholderTextColor={colors.mutedForeground}
                  style={styles.modalInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <View style={styles.feeOptionsRow}>
                  {feeOptions.map((option) => {
                    const isActive = feeProfile === option.key;
                    return (
                      <TouchableOpacity
                        key={option.key}
                        activeOpacity={0.85}
                        style={[styles.feeOptionButton, isActive ? styles.feeOptionButtonActive : null]}
                        onPress={() => handleSelectFeeProfile(option.key)}
                      >
                        <Text
                          style={[styles.feeOptionText, isActive ? styles.feeOptionTextActive : null]}
                        >
                          {option.label}
                        </Text>
                        <Text
                          style={[
                            styles.feeOptionDescription,
                            isActive ? styles.feeOptionDescriptionActive : null,
                          ]}
                        >
                          {option.description}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <TextInput
                  value={sendAmount}
                  onChangeText={(value) => {
                    setSendAmount(value);
                    setSendPercentage(null);
                    setSendStatus(null);
                  }}
                  placeholder="Quantidade de BTC"
                  placeholderTextColor={colors.mutedForeground}
                  style={styles.modalInput}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                />
                <View style={styles.percentageRow}>
                  {percentageOptions.map((option) => {
                    const isActive = sendPercentage === option.value;
                    const isDisabled = balance <= 0;
                    return (
                      <TouchableOpacity
                        key={option.label}
                        activeOpacity={0.85}
                        disabled={isDisabled}
                        style={[
                          styles.percentageButton,
                          isActive ? styles.percentageButtonActive : null,
                          isDisabled ? styles.percentageButtonDisabled : null,
                        ]}
                        onPress={() => handleSelectSendPercentage(option.value)}
                      >
                        <Text
                          style={[
                            styles.percentageButtonText,
                            isActive ? styles.percentageButtonTextActive : null,
                            isDisabled ? styles.percentageButtonTextDisabled : null,
                          ]}
                        >
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <View style={styles.feeInfo}>
                  <View style={styles.feeInfoLine}>
                    <Text style={styles.feeInfoLabel}>Taxa estimada</Text>
                    <Text style={styles.feeInfoValue}>
                      {feeRate ? `${formatBitcoinAmount(estimatedFeeBtc)} BTC` : '-'}
                    </Text>
                  </View>
                  <Text style={styles.feeInfoMeta}>
                    {feeUpdating
                      ? 'Atualizando taxa...'
                      : feeError
                      ? feeError
                      : feeRate
                      ? `${feeRate} sat/vByte - ${selectedFeeOption.description}`
                      : 'Taxa estimada indisponivel.'}
                  </Text>
                  {btcPriceUsd && feeRate ? (
                    <Text style={styles.feeInfoSecondary}>
                      ~ ${estimatedFeeUsd?.toFixed(2) ?? '0.00'} USD
                    </Text>
                  ) : null}
                  <View style={[styles.feeInfoLine, { marginTop: 8 }]}>
                    <Text style={styles.feeInfoLabel}>Total com taxa</Text>
                    <Text style={styles.feeInfoValue}>
                      {parsedSendAmount > 0 || estimatedFeeBtc > 0
                        ? `${formatBitcoinAmount(estimatedTotalBtc)} BTC`
                        : '-'}
                    </Text>
                  </View>
                  {btcPriceUsd && (parsedSendAmount > 0 || estimatedFeeBtc > 0) ? (
                    <Text style={styles.feeInfoSecondary}>
                      ~ ${estimatedTotalUsd?.toFixed(2) ?? '0.00'} USD
                    </Text>
                  ) : null}
                </View>
                {sendStatus ? (
                  <Text
                    style={
                      sendStatus.type === 'success' ? styles.sendSuccessText : styles.sendErrorText
                    }
                  >
                    {sendStatus.message}
                  </Text>
                ) : null}
                <TouchableOpacity
                  activeOpacity={0.85}
                  disabled={sendingTransaction}
                  style={[
                    styles.modalPrimaryButton,
                    sendingTransaction ? styles.modalPrimaryButtonDisabled : null,
                  ]}
                  onPress={handleSubmitSend}
                >
                  <Text style={styles.modalPrimaryButtonText}>
                    {sendingTransaction ? 'Enviando...' : 'Enviar'}
                  </Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity
              activeOpacity={0.85}
              disabled={sendingTransaction}
              style={[
                styles.modalClose,
                sendingTransaction ? styles.modalPrimaryButtonDisabled : null,
              ]}
              onPress={handleCloseSendModal}
            >
              <Text style={styles.modalCloseText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <Modal
        visible={receiveModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setReceiveModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Receber BTC</Text>
            {qrCodeUri ? (
              <Image source={{ uri: qrCodeUri }} style={styles.receiveModalQr} resizeMode="contain" />
            ) : (
              <Text style={styles.modalFallback}>Endereco da carteira indisponivel.</Text>
            )}
            <Text style={styles.modalAddress} selectable>
              {address}
            </Text>
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.modalClose}
              onPress={() => setReceiveModalVisible(false)}
            >
              <Text style={styles.modalCloseText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

export default HomeScreen;





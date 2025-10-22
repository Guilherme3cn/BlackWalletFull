import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ActivityIndicator, Image, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';
import WalletCard from '../components/WalletCard';
import SeedPhrase from '../components/SeedPhrase';
import { generateBitcoinAddress, generateSeedPhrase, getAddressBalance } from '../utils/crypto';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { homeStyles as styles } from '../styles/homeStyles';
import { Feather } from '@expo/vector-icons';
import { colors } from '../theme/colors';

const WALLET_DATA_KEY = 'bitcoin-wallet-data';
const PASSWORD_KEY = 'wallet-password';

const fetchBtcUsdPrice = async () => {
  const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');

  if (!response.ok) {
    throw new Error(`Falha ao buscar preco BTC: ${response.status}`);
  }

  const data = await response.json();
  const price = data?.bitcoin?.usd;

  if (!price) {
    throw new Error('Preco do Bitcoin indisponivel');
  }

  return Number(price);
};

const HomeScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [seedPhrase, setSeedPhrase] = useState([]);
  const [address, setAddress] = useState('');
  const [balance, setBalance] = useState(0);
  const [btcPrice, setBtcPrice] = useState(null);
  const [loadingWallet, setLoadingWallet] = useState(true);
  const [priceRefreshing, setPriceRefreshing] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [isOnline, setIsOnline] = useState(false);
  const [generatingWallet, setGeneratingWallet] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [sendModalVisible, setSendModalVisible] = useState(false);
  const [sendAddress, setSendAddress] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [receiveModalVisible, setReceiveModalVisible] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const didToggleRef = useRef(false);

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
  }, []);

  const handleScanQrCode = useCallback(async () => {
    try {
      if (!cameraPermission?.granted) {
        if (!requestCameraPermission) {
          showFeedback('error', 'Camera nao disponivel neste dispositivo.');
          return;
        }

        const permission = await requestCameraPermission();
        if (!permission?.granted) {
          showFeedback('error', 'Permissao de camera negada.');
          return;
        }
      }

      setIsScanning(true);
    } catch (error) {
      console.error('Erro ao solicitar permissao da camera', error);
      showFeedback('error', 'Nao foi possivel acessar a camera do dispositivo.');
    }
  }, [cameraPermission, requestCameraPermission, showFeedback]);

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

      setIsScanning(false);
      showFeedback('success', 'Endereco preenchido via QR Code.');
    },
    [isScanning, setSendAddress, setSendAmount, showFeedback],
  );

  const handleCancelScan = useCallback(() => {
    setIsScanning(false);
  }, []);

  const handleSubmitSend = useCallback(() => {
    if (!isOnline) {
      showFeedback('error', 'Ative o modo online para enviar BTC.');
      return;
    }

    if (!sendAddress.trim() || !sendAmount.trim()) {
      showFeedback('error', 'Informe o endereco de destino e a quantidade de BTC.');
      return;
    }

    Alert.alert('Enviar BTC', 'Fluxo de envio de BTC em desenvolvimento.');
  }, [isOnline, sendAddress, sendAmount, showFeedback]);

  const qrCodeUri = useMemo(() => {
    if (!address) {
      return null;
    }

    const encoded = encodeURIComponent(address);
    return `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encoded}`;
  }, [address]);

  const usdValue = useMemo(() => {
    if (!btcPrice) {
      return 0;
    }

    return balance * btcPrice;
  }, [balance, btcPrice]);

  const showFeedback = useCallback((type, message) => {
    setFeedback({ type, message, timestamp: Date.now() });
  }, []);

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
      const price = await fetchBtcUsdPrice();
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
      {loadingWallet || generatingWallet || loggingOut ? (
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
          {loadingWallet
            ? 'Preparando sua carteira...'
            : generatingWallet
            ? 'Gerando nova carteira...'
            : 'Saindo da carteira...'}
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
                <View style={styles.qrScannerContainer}>
                  <CameraView
                    style={styles.qrScanner}
                    facing="back"
                    barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                    onBarcodeScanned={handleQrCodeScanned}
                  />
                </View>
                <Text style={styles.qrScannerHint}>Aponte para o QR Code do destinatario</Text>
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
                    style={styles.modalOptionButton}
                    onPress={handleScanQrCode}
                  >
                    <Feather name="camera" size={18} color={colors.primaryText} />
                    <Text style={styles.modalOptionButtonText}>Ler QR Code</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.modalDividerText}>Ou informe manualmente</Text>
                <TextInput
                  value={sendAddress}
                  onChangeText={setSendAddress}
                  placeholder="Endereco do destinatario"
                  placeholderTextColor={colors.mutedForeground}
                  style={styles.modalInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TextInput
                  value={sendAmount}
                  onChangeText={setSendAmount}
                  placeholder="Quantidade de BTC"
                  placeholderTextColor={colors.mutedForeground}
                  style={styles.modalInput}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                />
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.modalPrimaryButton}
                  onPress={handleSubmitSend}
                >
                  <Text style={styles.modalPrimaryButtonText}>Enviar</Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.modalClose}
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



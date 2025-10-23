import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import WalletCard from '../components/WalletCard';
import SeedPhrase from '../components/SeedPhrase';
import {
  SATOSHIS_IN_BTC,
  DEFAULT_ADDRESS_TYPE,
  deriveAddressDetails,
  formatBitcoinAmount,
  generateSeedPhrase,
  getWalletAddressesBalance,
  getWalletTransactionHistory,
  sendBitcoinTransaction,
  MIN_CHANGE_VALUE,
  fetchAddressSummary,
} from '../utils/crypto';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { homeStyles as styles } from '../styles/homeStyles';
import { Feather } from '@expo/vector-icons';
import { colors } from '../theme/colors';

const arraysShallowEqual = (left = [], right = []) => {
  if (left === right) {
    return true;
  }

  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
};

const compareAddressEntries = (left = [], right = []) => {
  if (left === right) {
    return true;
  }

  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    const a = left[index];
    const b = right[index];

    if (!a || !b) {
      return false;
    }

    if (
      a.address !== b.address ||
      a.index !== b.index ||
      Boolean(a.change) !== Boolean(b.change) ||
      Boolean(a.used) !== Boolean(b.used) ||
      (a.type ?? DEFAULT_ADDRESS_TYPE) !== (b.type ?? DEFAULT_ADDRESS_TYPE)
    ) {
      return false;
    }
  }

  return true;
};

const isWalletStateEqual = (prev, next) => {
  if (prev === next) {
    return true;
  }

  if (!prev || !next) {
    return false;
  }

  if (prev.addressType !== next.addressType) {
    return false;
  }

  if (prev.receivingIndex !== next.receivingIndex || prev.changeIndex !== next.changeIndex) {
    return false;
  }

  if (!arraysShallowEqual(prev.seedPhrase ?? [], next.seedPhrase ?? [])) {
    return false;
  }

  if (
    !compareAddressEntries(prev.receivingAddresses ?? [], next.receivingAddresses ?? []) ||
    !compareAddressEntries(prev.changeAddresses ?? [], next.changeAddresses ?? [])
  ) {
    return false;
  }

  return true;
};

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
  const [walletData, setWalletData] = useState(null);
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
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [transactionsError, setTransactionsError] = useState(null);
  const [addressSummaries, setAddressSummaries] = useState({});
  const zeroBalanceMapRef = useRef({});
  const didToggleRef = useRef(false);
  const cameraModuleRef = useRef(null);
  const feeIntervalRef = useRef(null);
  const sendStatusTimeoutRef = useRef(null);
  const walletDataRef = useRef(null);
  const [pendingIncomingSat, setPendingIncomingSat] = useState(0);

  const seedPhrase = walletData?.seedPhrase ?? [];
  const hasPendingIncoming = useMemo(() => pendingIncomingSat > 0, [pendingIncomingSat]);

  const buildWalletState = useCallback((seedWords, baseData = {}) => {
    const normalizedSeed = Array.isArray(seedWords) ? seedWords : [];
    const type = baseData.addressType ?? DEFAULT_ADDRESS_TYPE;

    const receivingRaw = Array.isArray(baseData.receivingAddresses) ? baseData.receivingAddresses : [];
    const changeRaw = Array.isArray(baseData.changeAddresses) ? baseData.changeAddresses : [];

    let receiving = receivingRaw
      .filter((item) => item?.address)
      .map((item, idx) => ({
        address: item.address,
        index: Number.isInteger(item.index) && item.index >= 0 ? item.index : idx,
        type: item.type ?? type,
        change: false,
        used: Boolean(item.used),
      }));

    let change = changeRaw
      .filter((item) => item?.address)
      .map((item, idx) => ({
        address: item.address,
        index: Number.isInteger(item.index) && item.index >= 0 ? item.index : idx,
        type: item.type ?? type,
        change: true,
        used: Boolean(item.used),
      }));

    let receivingIndex =
      Number.isInteger(baseData.receivingIndex) && baseData.receivingIndex >= 0
        ? baseData.receivingIndex
        : receiving.length;

    let changeIndex =
      Number.isInteger(baseData.changeIndex) && baseData.changeIndex >= 0
        ? baseData.changeIndex
        : change.length;

    if (!receiving.length && normalizedSeed.length) {
      const first = deriveAddressDetails(normalizedSeed, {
        type,
        change: false,
        index: 0,
      });

      receiving = [
        {
          address: first.address,
          index: 0,
          type,
          change: false,
          used: false,
        },
      ];
      receivingIndex = 1;
    }

    receivingIndex = Math.max(receivingIndex, receiving.length);
    changeIndex = Math.max(changeIndex, change.length);

  return {
    seedPhrase: normalizedSeed,
    addressType: type,
    receivingIndex,
    changeIndex,
    receivingAddresses: receiving,
    changeAddresses: change,
    discoveryComplete: Boolean(baseData.discoveryComplete),
  };
}, [deriveAddressDetails]);

const discoverWalletUsage = useCallback(
  async (seedWords, baseWallet, { gapLimit = 3, maxScan = 20 } = {}) => {
    if (!Array.isArray(seedWords) || !seedWords.length) {
      return {
        wallet: {
          ...baseWallet,
          discoveryComplete: true,
        },
        summaryMap: {},
        pendingReceivedSat: 0,
      };
    }

    const type = baseWallet.addressType ?? DEFAULT_ADDRESS_TYPE;

    const scanBranch = async (changeFlag) => {
      const results = new Map();
      const summaries = {};

      const existing = (changeFlag ? baseWallet.changeAddresses : baseWallet.receivingAddresses) ?? [];
      existing.forEach((item) => {
        results.set(item.index, {
          address: item.address,
          index: item.index,
          type: item.type ?? type,
          change: changeFlag,
          used: Boolean(item.used),
        });
      });

      let index = 0;
      let emptyStreak = 0;
      let lastActiveIndex = -1;

      while (index < maxScan && emptyStreak < gapLimit) {
        let entry = results.get(index);

        if (!entry) {
          const derived = deriveAddressDetails(seedWords, {
            type,
            change: changeFlag,
            index,
          });
          entry = {
            address: derived.address,
            index,
            type,
            change: changeFlag,
            used: false,
          };
          results.set(index, entry);
        }

        if (!summaries[entry.address]) {
          try {
            summaries[entry.address] = await fetchAddressSummary(entry.address);
          } catch (error) {
            console.error(`Erro descobrindo endereco ${entry.address}`, error);
            summaries[entry.address] = {
              address: entry.address,
              balance: 0,
              balanceSat: 0,
              pendingReceivedSat: 0,
              totalReceivedSat: 0,
              hasActivity: false,
            };
          }
        }

        const summary = summaries[entry.address];
        const hasActivity =
          Number(summary.balanceSat ?? 0) > 0 ||
          Number(summary.pendingReceivedSat ?? 0) > 0 ||
          Number(summary.totalReceivedSat ?? 0) > 0 ||
          summary.hasActivity;

        if (hasActivity && !entry.used) {
          entry.used = true;
        }

        if (hasActivity) {
          lastActiveIndex = index;
          emptyStreak = 0;
        } else {
          emptyStreak += 1;
        }

        index += 1;
      }

      const deduped = [...results.values()].sort((a, b) => a.index - b.index);

      if (!changeFlag) {
        const nextIndex =
          lastActiveIndex >= 0
            ? lastActiveIndex + 1
            : deduped.length
            ? deduped[deduped.length - 1].index + 1
            : 0;
        const exists = deduped.some((item) => item.index === nextIndex);
        if (!exists) {
          const derived = deriveAddressDetails(seedWords, {
            type,
            change: false,
            index: nextIndex,
          });
          deduped.push({
            address: derived.address,
            index: nextIndex,
            type,
            change: false,
            used: false,
          });
          summaries[derived.address] = {
            address: derived.address,
            balance: 0,
            balanceSat: 0,
            pendingReceivedSat: 0,
            totalReceivedSat: 0,
            hasActivity: false,
          };
        }
      }

      return { addresses: deduped, summaries };
    };

    const receivingScan = await scanBranch(false);
    const changeScan = await scanBranch(true);

    const summaryMap = { ...receivingScan.summaries, ...changeScan.summaries };

    const receivingAddresses = receivingScan.addresses;
    const changeAddresses = changeScan.addresses;

    const receivingIndex = receivingAddresses.length
      ? Math.max(...receivingAddresses.map((item) => item.index)) + 1
      : baseWallet.receivingIndex ?? 0;

    const changeIndex = changeAddresses.length
      ? Math.max(...changeAddresses.map((item) => item.index)) + 1
      : baseWallet.changeIndex ?? 0;

    const pendingReceivedSat = receivingAddresses.reduce(
      (total, entry) => total + Number(summaryMap[entry.address]?.pendingReceivedSat ?? 0),
      0,
    );

    return {
      wallet: {
        ...baseWallet,
        receivingAddresses,
        changeAddresses,
        receivingIndex,
        changeIndex,
        discoveryComplete: true,
      },
      summaryMap,
      pendingReceivedSat,
    };
  },
  [deriveAddressDetails, fetchAddressSummary],
);
  const resolveDisplayAddress = useCallback((data) => {
    if (!data?.receivingAddresses?.length) {
      return '';
    }

    const receiving = data.receivingAddresses.filter((item) => !item.change);
    if (!receiving.length) {
      return '';
    }

    const unused = receiving.filter((item) => !item.used);
    if (unused.length) {
      return unused[unused.length - 1].address;
    }

    return receiving[receiving.length - 1].address;
  }, []);

  const persistWalletData = useCallback(async (data) => {
    if (!data) {
      return;
    }

    let shouldPersist = false;

    setWalletData((previous) => {
      if (isWalletStateEqual(previous, data)) {
        return previous;
      }

      shouldPersist = true;
      return data;
    });

    if (!shouldPersist) {
      return;
    }

    try {
      await AsyncStorage.setItem(WALLET_DATA_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('Erro ao salvar dados da carteira', error);
    }
  }, []);

  useEffect(() => {
    walletDataRef.current = walletData;
  }, [walletData]);

  const loadTransactionHistory = useCallback(async () => {
    if (!walletDataRef.current) {
      setTransactions([]);
      return;
    }

    if (!isOnline) {
      setTransactionsError('Ative o modo online para carregar o historico.');
      setTransactions([]);
      return;
    }

    try {
      setTransactionsLoading(true);
      setTransactionsError(null);
      const addresses = [
        ...(walletDataRef.current.receivingAddresses ?? []),
        ...(walletDataRef.current.changeAddresses ?? []),
      ];
      const history = await getWalletTransactionHistory(addresses);
      setTransactions(history);
    } catch (error) {
      console.error('Erro ao carregar historico de transacoes', error);
      setTransactionsError('Nao foi possivel carregar o historico de transacoes.');
    } finally {
      setTransactionsLoading(false);
    }
  }, [isOnline]);

  const handleOpenHistory = useCallback(() => {
    setHistoryModalVisible(true);
  }, []);

  const handleCloseHistory = useCallback(() => {
    setHistoryModalVisible(false);
    setTransactionsError(null);
  }, []);

  const handleRefreshHistory = useCallback(() => {
    loadTransactionHistory();
  }, [loadTransactionHistory]);

  const openTransactionInExplorer = useCallback((txid) => {
    if (!txid) {
      return;
    }

    Linking.openURL(`https://mempool.space/tx/${txid}`);
  }, []);

  const openAddressInExplorer = useCallback((addr) => {
    if (!addr) {
      return;
    }

    Linking.openURL(`https://mempool.space/address/${addr}`);
  }, []);

  const formatHistoryAmount = useCallback((amountSat = 0, direction = 'in') => {
    const amountBtc = Math.abs(Number(amountSat ?? 0)) / SATOSHIS_IN_BTC;
    const prefix = direction === 'out' ? '-' : '+';
    return `${prefix}${formatBitcoinAmount(amountBtc)} BTC`;
  }, []);

  const formatHistoryDate = useCallback((timestamp) => {
    if (!Number.isFinite(Number(timestamp))) {
      return 'Sem data';
    }

    const date = new Date(Number(timestamp) * 1000);
    return date.toLocaleString('pt-BR');
  }, []);

  useEffect(() => {
    if (historyModalVisible) {
      loadTransactionHistory();
    }
  }, [historyModalVisible, loadTransactionHistory]);

  useEffect(() => {
    if (hasPendingIncoming && sendModalVisible) {
      handleCloseSendModal();
      showFeedback('info', 'Aguarde a confirmacao das transacoes pendentes antes de enviar BTC.');
    }
  }, [hasPendingIncoming, sendModalVisible, handleCloseSendModal, showFeedback]);

  const percentageOptions = useMemo(
    () => [
      { label: '25%', value: 0.25 },
      { label: '50%', value: 0.5 },
      { label: '75%', value: 0.75 },
      { label: 'Max', value: 1 },
    ],
    [],
  );

  const address = useMemo(
    () => resolveDisplayAddress(walletData),
    [walletData, resolveDisplayAddress],
  );

  const pendingIncomingBtc = useMemo(
    () => pendingIncomingSat / SATOSHIS_IN_BTC,
    [pendingIncomingSat],
  );

  const addressBalances = useMemo(() => {
    if (!walletData) {
      return [];
    }

    const baseType = walletData.addressType ?? DEFAULT_ADDRESS_TYPE;
    const entries = new Map();

    (walletData.receivingAddresses ?? []).forEach((item) => {
      entries.set(item.address, {
        ...item,
        change: false,
        type: item.type ?? baseType,
        used: Boolean(item.used),
      });
    });

    (walletData.changeAddresses ?? []).forEach((item) => {
      entries.set(item.address, {
        ...item,
        change: true,
        type: item.type ?? baseType,
        used: Boolean(item.used),
      });
    });

    Object.keys(addressSummaries ?? {}).forEach((address) => {
      if (!entries.has(address)) {
        entries.set(address, {
          address,
          index: entries.size,
          change: true,
          type: baseType,
          used: true,
        });
      }
    });

    return [...entries.values()]
      .map((entry) => {
        const summary = addressSummaries?.[entry.address] ?? {};
        const balanceSat =
          Number(summary?.balanceSat ?? 0) ||
          Math.round(Number(summary?.balance ?? 0) * SATOSHIS_IN_BTC);
        const pendingSat = Number(summary?.pendingReceivedSat ?? 0);

        if (!entry.change && !entry.used && balanceSat <= 0 && pendingSat <= 0) {
          return null;
        }

        if (balanceSat <= 0 && pendingSat <= 0) {
          return null;
        }

        const labelPrefix = entry.change ? 'Troco' : 'Recebimento';
        const label =
          entry.index !== undefined && entry.index !== null
            ? `${labelPrefix} #${entry.index}`
            : `${labelPrefix}`;

        return {
          address: entry.address,
          label,
          change: entry.change,
          index: entry.index ?? 0,
          balanceSat,
          balanceBtc: balanceSat / SATOSHIS_IN_BTC,
          pendingSat,
          pendingBtc: pendingSat / SATOSHIS_IN_BTC,
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (a.change === b.change) {
          return (a.index ?? 0) - (b.index ?? 0);
        }
        return a.change ? 1 : -1;
      });
  }, [addressSummaries, walletData]);

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

    if (hasPendingIncoming) {
      const pendingText = formatBitcoinAmount(pendingIncomingBtc);
      showFeedback(
        'error',
        `Existe uma transacao recebida pendente (~${pendingText} BTC). Aguarde a confirmacao antes de enviar BTC.`,
      );
      return;
    }

    setSendAddress('');
    setSendAmount('');
    setSendModalVisible(true);
    setSendPercentage(null);
    setFeeProfile('fastest');
    setSendStatus(null);
  }, [address, hasPendingIncoming, isOnline, pendingIncomingBtc, showFeedback]);

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

    if (!walletData) {
      const message = 'Dados da carteira indisponiveis.';
      showFeedback('error', message);
      setSendStatus({ type: 'error', message });
      return;
    }

    if (hasPendingIncoming) {
      const message = `Existe uma transacao de recebimento pendente (~${formatBitcoinAmount(
        pendingIncomingBtc,
      )} BTC). Aguarde a confirmacao para enviar BTC.`;
      showFeedback('error', message);
      setSendStatus({ type: 'error', message });
      return;
    }

    setSendStatus(null);

    const nextChangeIndex =
      Number.isInteger(walletData.changeIndex) && walletData.changeIndex >= 0
        ? walletData.changeIndex
        : (walletData.changeAddresses?.length ?? 0);

    const handleSendError = (error) => {
      console.error('Erro ao enviar transacao', error);
      const message = error?.message ?? 'Nao foi possivel enviar a transacao.';
      showFeedback('error', message);
      setSendStatus({ type: 'error', message });
    };

    const processSendResult = async (result) => {
      const successMessage = `Transferencia enviada com sucesso. TXID: ${result.txid}`;
      showFeedback('success', successMessage);
      setSendStatus({ type: 'success', message: successMessage });
      if (sendStatusTimeoutRef.current) {
        clearTimeout(sendStatusTimeoutRef.current);
      }
      sendStatusTimeoutRef.current = setTimeout(() => {
        handleCloseSendModal();
      }, 1500);

      const usedInputs = Array.isArray(result.usedInputs) ? result.usedInputs : [];
      const markUsed = (entry) => {
        if (!entry) {
          return entry;
        }

        const wasUsed = usedInputs.some((input) => input?.address === entry.address);
        if (wasUsed && !entry.used) {
          return { ...entry, used: true };
        }
        return entry;
      };

      const updatedReceiving = (walletData.receivingAddresses ?? []).map(markUsed);
      const updatedChange = (walletData.changeAddresses ?? []).map(markUsed);

      let changeIndex = nextChangeIndex;
      let changeAddresses = updatedChange;

      if (result.changeAddress?.address) {
        const exists = changeAddresses.some((item) => item.address === result.changeAddress.address);

        if (exists) {
          changeAddresses = changeAddresses.map((item) =>
            item.address === result.changeAddress.address ? { ...item, used: true } : item,
          );
        } else {
          changeAddresses = [...changeAddresses, { ...result.changeAddress, used: true }];
        }

        changeIndex = result.changeAddress.index + 1;
      }

      const updatedWallet = {
        ...walletData,
        receivingAddresses: updatedReceiving,
        changeAddresses,
        changeIndex,
      };

      await persistWalletData(updatedWallet);
      await fetchWalletBalance(updatedWallet);
    };

    const broadcastTransaction = async () => {
      setSendStatus(null);
      const result = await sendBitcoinTransaction({
        seedPhrase,
        recipientAddress: sendAddress.trim(),
        amountBtc: parsedSendAmount,
        feeRate,
        addressType: walletData.addressType ?? DEFAULT_ADDRESS_TYPE,
        receivingAddresses: walletData.receivingAddresses ?? [],
        changeAddresses: walletData.changeAddresses ?? [],
        nextChangeIndex,
      });

      await processSendResult(result);
    };

    const promptDustConfirmation = (changeDustSat) => {
      const dustBtc = changeDustSat / SATOSHIS_IN_BTC;
      Alert.alert(
        'Troco abaixo do minimo',
        `O troco restante (${formatBitcoinAmount(dustBtc)} BTC) e inferior ao minimo de ${MIN_CHANGE_VALUE} sats e sera incorporado na taxa. Deseja continuar mesmo assim?`,
        [
          {
            text: 'Cancelar',
            style: 'cancel',
            onPress: () => {
              setSendingTransaction(false);
            },
          },
          {
            text: 'Continuar',
            style: 'destructive',
            onPress: () => {
              setSendingTransaction(true);
              (async () => {
                try {
                  await broadcastTransaction();
                } catch (error) {
                  handleSendError(error);
                } finally {
                  setSendingTransaction(false);
                }
              })();
            },
          },
        ],
      );
    };

    try {
      setSendingTransaction(true);
      const preview = await sendBitcoinTransaction({
        seedPhrase,
        recipientAddress: sendAddress.trim(),
        amountBtc: parsedSendAmount,
        feeRate,
        addressType: walletData.addressType ?? DEFAULT_ADDRESS_TYPE,
        receivingAddresses: walletData.receivingAddresses ?? [],
        changeAddresses: walletData.changeAddresses ?? [],
        nextChangeIndex,
        previewOnly: true,
      });

      if (preview.changeBelowDust > 0) {
        setSendingTransaction(false);
        promptDustConfirmation(preview.changeBelowDust);
        return;
      }

      await broadcastTransaction();
    } catch (error) {
      handleSendError(error);
    } finally {
      setSendingTransaction(false);
    }
  }, [
    balance,
    estimatedTotalBtc,
    feeRate,
    fetchWalletBalance,
    handleCloseSendModal,
    isOnline,
    parsedSendAmount,
    persistWalletData,
    seedPhrase,
    sendAddress,
    sendAmount,
    sendingTransaction,
    hasPendingIncoming,
    pendingIncomingBtc,
    showFeedback,
    walletData,
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

  const fetchWalletBalance = useCallback(
    async (targetWallet = walletDataRef.current) => {
      if (!isOnline || !targetWallet) {
        return;
      }

      const trackedAddresses = [
        ...(Array.isArray(targetWallet.receivingAddresses) ? targetWallet.receivingAddresses : []),
        ...(Array.isArray(targetWallet.changeAddresses) ? targetWallet.changeAddresses : []),
      ].filter((item) => item?.address);

      if (!trackedAddresses.length) {
        setBalance(0);
        setPendingIncomingSat(0);
        setAddressSummaries({});
        zeroBalanceMapRef.current = {};
        return;
      }

      try {
        const {
          balance: initialBalance,
          summaryMap,
        } = await getWalletAddressesBalance(trackedAddresses);

        let workingWallet = targetWallet;
        let didUpdate = false;
        const summaryRecords = { ...summaryMap };
        const now = Date.now();
        const previousZeroMap = zeroBalanceMapRef.current || {};
        const nextZeroMap = { ...previousZeroMap };
        const walletSeed = Array.isArray(targetWallet.seedPhrase)
          ? targetWallet.seedPhrase
          : walletDataRef.current?.seedPhrase ?? [];

        const nextReceiving = workingWallet.receivingAddresses.map((item) => {
          if (item.used) {
            return item;
          }

          const summary = summaryRecords[item.address];
          if (summary?.totalReceivedSat > 0) {
            didUpdate = true;
            return { ...item, used: true };
          }

          return item;
        });

        const nextChange = workingWallet.changeAddresses.map((item) => {
          if (item.used) {
            return item;
          }

          const summary = summaryRecords[item.address];
          if (summary?.hasActivity || Number(summary?.balanceSat ?? 0) > 0) {
            didUpdate = true;
            return { ...item, used: true };
          }

          return item;
        });

        if (didUpdate) {
          workingWallet = {
            ...targetWallet,
            receivingAddresses: nextReceiving,
            changeAddresses: nextChange,
          };
        }

        const addressMetadata = new Map();
        (workingWallet.receivingAddresses ?? []).forEach((item) => {
          addressMetadata.set(item.address, { change: false, used: Boolean(item.used) });
        });
        (workingWallet.changeAddresses ?? []).forEach((item) => {
          addressMetadata.set(item.address, { change: true, used: Boolean(item.used) });
        });

        const ensureFreshReceivingAddress = () => {
          if (!walletSeed.length) {
            return null;
          }

          const hasUnused = (workingWallet.receivingAddresses ?? []).some((item) => !item.used);
          if (hasUnused) {
            return null;
          }

          const nextIndex =
            Number.isInteger(workingWallet.receivingIndex) && workingWallet.receivingIndex >= 0
              ? workingWallet.receivingIndex
              : (workingWallet.receivingAddresses ?? []).length;

          const nextDetails = deriveAddressDetails(walletSeed, {
            type: workingWallet.addressType ?? DEFAULT_ADDRESS_TYPE,
            change: false,
            index: nextIndex,
          });

          const newReceivingEntry = {
            address: nextDetails.address,
            index: nextIndex,
            type: workingWallet.addressType ?? DEFAULT_ADDRESS_TYPE,
            change: false,
            used: false,
          };

          workingWallet = {
            ...workingWallet,
            receivingIndex: nextIndex + 1,
            receivingAddresses: [...(workingWallet.receivingAddresses ?? []), newReceivingEntry],
          };

          summaryRecords[newReceivingEntry.address] = {
            address: newReceivingEntry.address,
            balance: 0,
            balanceSat: 0,
            pendingReceivedSat: 0,
            totalReceivedSat: 0,
            hasActivity: false,
          };

          addressMetadata.set(newReceivingEntry.address, { change: false, used: false });
          didUpdate = true;
          return newReceivingEntry.address;
        };

        ensureFreshReceivingAddress();

        const filteredSummaryRecords = {};
        const addressesToArchive = new Set();
        Object.entries(summaryRecords).forEach(([address, summary]) => {
          const metadata = addressMetadata.get(address);
          const shouldArchive = metadata ? metadata.change || Boolean(metadata.used) : true;
          const balanceSat =
            Number(summary?.balanceSat ?? 0) ||
            Math.round(Number(summary?.balance ?? 0) * SATOSHIS_IN_BTC);
          const pendingSat = Number(summary?.pendingReceivedSat ?? 0);
          const hasValue =
            balanceSat > 0 ||
            pendingSat > 0 ||
            Number(summary?.totalReceivedSat ?? 0) > 0 ||
            summary?.hasActivity;

          if (hasValue) {
            filteredSummaryRecords[address] = summary;
            return;
          }

          const previousTimestamp = previousZeroMap[address];
          if (shouldArchive && previousTimestamp && now - previousTimestamp >= 60000) {
            addressesToArchive.add(address);
            return;
          }

          if (shouldArchive) {
            nextZeroMap[address] = previousTimestamp ?? now;
          }

          filteredSummaryRecords[address] = summary;
        });

        if (addressesToArchive.size) {
          const filteredReceiving = (workingWallet.receivingAddresses ?? []).filter(
            (item) => !addressesToArchive.has(item.address),
          );
          const filteredChange = (workingWallet.changeAddresses ?? []).filter(
            (item) => !addressesToArchive.has(item.address),
          );

          if (
            filteredReceiving.length !== (workingWallet.receivingAddresses ?? []).length ||
            filteredChange.length !== (workingWallet.changeAddresses ?? []).length
          ) {
            workingWallet = {
              ...workingWallet,
              receivingAddresses: filteredReceiving,
              changeAddresses: filteredChange,
            };
            didUpdate = true;
          }
        }

        const newAddressAfterCleanup = ensureFreshReceivingAddress();
        if (newAddressAfterCleanup && !filteredSummaryRecords[newAddressAfterCleanup]) {
          filteredSummaryRecords[newAddressAfterCleanup] = summaryRecords[newAddressAfterCleanup];
        }

        const finalReceiving = workingWallet.receivingAddresses ?? [];
        const pendingIncomingSatForReceiving = finalReceiving.reduce((total, entry) => {
          const summary = filteredSummaryRecords[entry.address];
          if (!summary) {
            return total;
          }
          return total + Number(summary?.pendingReceivedSat ?? 0);
        }, 0);

        const aggregatedBalance = Object.values(filteredSummaryRecords).reduce(
          (total, summary) => total + Number(summary?.balance ?? 0),
          0,
        );

        setBalance(aggregatedBalance || initialBalance);
        setPendingIncomingSat(pendingIncomingSatForReceiving);
        setAddressSummaries(filteredSummaryRecords);
        zeroBalanceMapRef.current = nextZeroMap;

        if (didUpdate) {
          await persistWalletData(workingWallet);
        }
      } catch (error) {
        if (isOnline) {
          setIsOnline(false);
          showFeedback('info', 'Conexao indisponivel. Alternando para modo offline.');
        } else {
          showFeedback('error', 'Erro ao atualizar saldo. Verifique sua conexao.');
        }
        setAddressSummaries({});
        setPendingIncomingSat(0);
        zeroBalanceMapRef.current = {};
      }
    },
    [isOnline, persistWalletData, deriveAddressDetails, showFeedback],
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
        const initialState = buildWalletState(newSeedPhrase, {
          addressType: DEFAULT_ADDRESS_TYPE,
          receivingAddresses: [],
          changeAddresses: [],
          discoveryComplete: true,
        });

        await persistWalletData(initialState);
        await fetchWalletBalance(initialState);

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
    [buildWalletState, fetchWalletBalance, persistWalletData, showFeedback],
  );

  const confirmRegenerateWallet = useCallback(() => {
    const showConfirmation = () => {
      Alert.alert(
        'Criar nova carteira?',
        'Se voce nao salvar as palavras atuais, perdera acesso a esta carteira. Deseja continuar?',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Criar nova', style: 'destructive', onPress: () => regenerateWallet() },
        ],
      );
    };

    if (balance > 0) {
      Alert.alert(
        'Saldo detectado',
        'Existe saldo disponível nesta carteira. Transfira seus BTC para outra carteira antes de criar uma nova para evitar a perda dos fundos.',
        [
          { text: 'Entendi', style: 'cancel' },
          {
            text: 'Continuar mesmo assim',
            style: 'destructive',
            onPress: () => showConfirmation(),
          },
        ],
      );
      return;
    }

    showConfirmation();
  }, [balance, regenerateWallet]);

  const loadWalletFromStorage = useCallback(async () => {
    try {
      const storedData = await AsyncStorage.getItem(WALLET_DATA_KEY);

      if (!storedData) {
        await regenerateWallet(true);
        return;
      }

      const parsed = JSON.parse(storedData);
      let normalized = buildWalletState(parsed.seedPhrase || [], parsed);
      let initialSummaries = {};
      let initialPendingSat = 0;

      if (!normalized.discoveryComplete) {
        try {
          const discovery = await discoverWalletUsage(normalized.seedPhrase, normalized);
          normalized = discovery.wallet;
          initialSummaries = discovery.summaryMap;
          initialPendingSat = discovery.pendingReceivedSat;
        } catch (discoveryError) {
          console.error('Erro ao descobrir enderecos utilizados', discoveryError);
        }
      }

      setWalletData(normalized);
      zeroBalanceMapRef.current = {};
      if (Object.keys(initialSummaries).length) {
        setAddressSummaries(initialSummaries);
        setPendingIncomingSat(initialPendingSat);
      }

      await AsyncStorage.setItem(WALLET_DATA_KEY, JSON.stringify(normalized));
      await fetchWalletBalance(normalized);
    } catch (error) {
      Alert.alert('Erro', 'Nao foi possivel carregar os dados da carteira.');
      console.error('Erro carregando carteira', error);
    } finally {
      setLoadingWallet(false);
    }
  }, [buildWalletState, discoverWalletUsage, fetchWalletBalance, regenerateWallet]);

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
    if (!isOnline || !walletDataRef.current) {
      return;
    }

    fetchWalletBalance();

    const interval = setInterval(() => {
      fetchWalletBalance();
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchWalletBalance, isOnline]);

  useEffect(() => {
    if (!didToggleRef.current) {
      return;
    }

    if (isOnline) {
      showFeedback('success', 'Modo online ativado. Atualizando dados...');
      fetchWalletBalance();
      refreshBtcPrice();
    } else {
      showFeedback('info', 'Modo offline ativado. Atualizacao de dados desabilitada.');
    }
  }, [isOnline, fetchWalletBalance, refreshBtcPrice, showFeedback]);

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
              style={[
                styles.quickActionButton,
              styles.sendButton,
              hasPendingIncoming ? styles.quickActionButtonDisabled : null,
            ]}
            onPress={handleSendBitcoin}
            disabled={hasPendingIncoming}
          >
            <Feather
              name="arrow-up-right"
              size={18}
              color={hasPendingIncoming ? colors.mutedForeground : colors.primaryText}
              style={styles.quickActionIcon}
            />
            <Text
              style={[
                styles.quickActionText,
                hasPendingIncoming ? styles.quickActionTextDisabled : null,
              ]}
            >
              Enviar BTC
            </Text>
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

        {hasPendingIncoming ? (
          <Text style={styles.pendingNotice}>
            Transação recebida pendente (~{formatBitcoinAmount(pendingIncomingBtc)} BTC) aguardando confirmação.
          </Text>
        ) : null}

        <TouchableOpacity
          activeOpacity={0.85}
          style={styles.historyButton}
          onPress={handleOpenHistory}
          >
            <Feather name="clock" size={20} color={colors.primaryText} style={styles.historyButtonIcon} />
            <View style={styles.historyButtonTextContainer}>
              <Text style={styles.historyButtonTitle}>Histórico de transações</Text>
              <Text style={styles.historyButtonSubtitle}>Acompanhe entradas e saídas confirmadas</Text>
            </View>
          </TouchableOpacity>

          {addressBalances.length ? (
            <View style={styles.addressBalancesSection}>
              <Text style={styles.addressBalancesTitle}>Endereços monitorados</Text>
              {addressBalances.map((item) => (
                <View key={item.address} style={styles.addressBalanceItem}>
                  <View style={styles.addressBalanceHeader}>
                    <Text style={styles.addressBalanceLabel}>{item.label}</Text>
                    <Text style={styles.addressBalanceValue}>{formatBitcoinAmount(item.balanceBtc)} BTC</Text>
                  </View>
                  <Text style={styles.addressBalanceAddress} numberOfLines={1} ellipsizeMode="middle">
                    {item.address}
                  </Text>
                  {item.pendingSat > 0 ? (
                    <Text style={styles.addressBalancePending}>
                      Pendente: {formatBitcoinAmount(item.pendingBtc)} BTC
                    </Text>
                  ) : null}
                  <TouchableOpacity
                    activeOpacity={0.8}
                    style={styles.addressBalanceLink}
                    onPress={() => openAddressInExplorer(item.address)}
                  >
                    <Feather name="external-link" size={14} color={colors.primaryText} />
                    <Text style={styles.addressBalanceLinkText}>Ver no mempool</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : null}

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
            <Text style={styles.modalHint}>
              O saldo restante apos um envio pode ser movido automaticamente para um endereco de troco oculto, mas continua vinculado a sua seed.
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
      <Modal
        visible={historyModalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCloseHistory}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, styles.historyModalCard]}>
            <Text style={styles.modalTitle}>Historico de transacoes</Text>
            {transactionsLoading ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <>
                {transactionsError ? (
                  <Text style={styles.historyError}>{transactionsError}</Text>
                ) : null}
                {transactions.length ? (
                  <ScrollView style={styles.historyList}>
                    {transactions.map((tx) => (
                      <View key={tx.txid} style={styles.historyItem}>
                        <View style={styles.historyItemHeader}>
                          <Text
                            style={[
                              styles.historyAmount,
                              tx.direction === 'out'
                                ? styles.historyAmountNegative
                                : styles.historyAmountPositive,
                            ]}
                          >
                            {formatHistoryAmount(tx.netSat, tx.direction)}
                          </Text>
                          <Text
                            style={[
                              styles.historyStatus,
                              tx.confirmed ? styles.historyStatusCompleted : styles.historyStatusPending,
                            ]}
                          >
                            {tx.confirmed ? 'Concluida' : 'Pendente'}
                          </Text>
                        </View>
                        <Text style={styles.historyMeta}>{formatHistoryDate(tx.blockTime)}</Text>
                        <Text style={styles.historyTxid} numberOfLines={1} ellipsizeMode="middle">
                          {tx.txid}
                        </Text>
                        <TouchableOpacity
                          activeOpacity={0.8}
                          style={styles.historyLinkButton}
                          onPress={() => openTransactionInExplorer(tx.txid)}
                        >
                          <Text style={styles.historyLinkText}>Ver no mempool</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </ScrollView>
                ) : (
                  <Text style={styles.historyEmptyText}>Nenhuma transacao encontrada.</Text>
                )}
              </>
            )}
            <View style={styles.historyActions}>
              <TouchableOpacity
                activeOpacity={0.85}
                style={[styles.historyActionButton, transactionsLoading ? styles.modalPrimaryButtonDisabled : null]}
                onPress={handleRefreshHistory}
                disabled={transactionsLoading}
              >
                <Text style={styles.historyActionButtonText}>
                  {transactionsLoading ? 'Atualizando...' : 'Atualizar'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.historyCloseButton}
                onPress={handleCloseHistory}
              >
                <Text style={styles.historyCloseButtonText}>Fechar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

export default HomeScreen;





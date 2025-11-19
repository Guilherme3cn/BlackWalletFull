import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Animated,
  Image,
  Linking,
  Modal,
  PanResponder,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import WalletCard from '../components/WalletCard';
import SeedPhrase from '../components/SeedPhrase';
import {
  SATOSHIS_IN_BTC,
  DEFAULT_ADDRESS_TYPE,
  deriveAddressDetails,
  deriveAccountKeysFromSeed,
  formatBitcoinAmount,
  generateSeedPhrase,
  getWalletAddressesBalance,
  getWalletTransactionHistory,
  createPsbtTransaction,
  parsePsbtDetails,
  signPsbtWithSeedPhrase,
  broadcastSignedPsbt,
  sendBitcoinTransaction,
  MIN_CHANGE_VALUE,
  fetchAddressSummary,
} from '../utils/crypto';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { homeStyles as styles } from '../styles/homeStyles';
import { Feather } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { WALLET_MODE_LABELS, WALLET_MODES } from '../constants/walletModes';

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

  if ((prev.mode ?? WALLET_MODES.FULL) !== (next.mode ?? WALLET_MODES.FULL)) {
    return false;
  }

  if ((prev.accountXpub ?? null) !== (next.accountXpub ?? null)) {
    return false;
  }

  if ((prev.masterFingerprint ?? null) !== (next.masterFingerprint ?? null)) {
    return false;
  }

  if ((prev.accountPath ?? null) !== (next.accountPath ?? null)) {
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
const BALANCE_REFRESH_MIN_MS = 15000;
const ADDRESS_DISCOVERY_GAP_LIMIT = 3;
const ADDRESS_DISCOVERY_MAX_SCAN = 30;

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
  const [isOnline, setIsOnline] = useState(true);
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
  const [psbtModalVisible, setPsbtModalVisible] = useState(false);
  const [psbtAddress, setPsbtAddress] = useState('');
  const [psbtAmount, setPsbtAmount] = useState('');
  const [psbtStatus, setPsbtStatus] = useState(null);
  const [psbtDraft, setPsbtDraft] = useState(null);
  const [creatingPsbt, setCreatingPsbt] = useState(false);
  const [psbtPercentage, setPsbtPercentage] = useState(null);
  const [signedPsbtInput, setSignedPsbtInput] = useState('');
  const [broadcastStatus, setBroadcastStatus] = useState(null);
  const [broadcastingPsbt, setBroadcastingPsbt] = useState(false);
  const [signModalVisible, setSignModalVisible] = useState(false);
  const [psbtToSign, setPsbtToSign] = useState('');
  const [signedPsbt, setSignedPsbt] = useState(null);
  const [signStatus, setSignStatus] = useState(null);
  const [signingPsbt, setSigningPsbt] = useState(false);
  const sendModalPosition = useRef(new Animated.ValueXY()).current;
  const signModalPosition = useRef(new Animated.ValueXY()).current;
  const sendModalPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dx) > 6 || Math.abs(gestureState.dy) > 6,
        onPanResponderGrant: () => {
          sendModalPosition.extractOffset();
        },
        onPanResponderMove: Animated.event(
          [null, { dx: sendModalPosition.x, dy: sendModalPosition.y }],
          { useNativeDriver: false },
        ),
        onPanResponderRelease: () => {
          sendModalPosition.flattenOffset();
        },
        onPanResponderTerminate: () => {
          sendModalPosition.flattenOffset();
        },
      }),
    [sendModalPosition],
  );
  const signModalPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dx) > 6 || Math.abs(gestureState.dy) > 6,
        onPanResponderGrant: () => {
          signModalPosition.extractOffset();
        },
        onPanResponderMove: Animated.event(
          [null, { dx: signModalPosition.x, dy: signModalPosition.y }],
          { useNativeDriver: false },
        ),
        onPanResponderRelease: () => {
          signModalPosition.flattenOffset();
        },
        onPanResponderTerminate: () => {
          signModalPosition.flattenOffset();
        },
      }),
    [signModalPosition],
  );
  const [scanMode, setScanMode] = useState(null);
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
  const [pendingPsbtSat, setPendingPsbtSat] = useState(0);
  const lastBalanceFetchRef = useRef(0);

  const seedPhrase = walletData?.seedPhrase ?? [];
  const hasPendingIncoming = useMemo(() => pendingIncomingSat > 0, [pendingIncomingSat]);
  const hasPendingPsbt = useMemo(() => pendingPsbtSat > 0, [pendingPsbtSat]);
  const walletMode = walletData?.mode ?? WALLET_MODES.FULL;
  const isFullMode = walletMode === WALLET_MODES.FULL;
  const isOnlineProtectedMode = walletMode === WALLET_MODES.ONLINE_PROTECTED;
  const isOfflineProtectedMode = walletMode === WALLET_MODES.OFFLINE_PROTECTED;
  const hasSeedAvailable = seedPhrase.length > 0;
  const accountXpub = walletData?.accountXpub ?? null;
  const canUseNetwork = !isOfflineProtectedMode;
  const canRefreshPrice = canUseNetwork && isOnline;
  const canInitiateDirectSend = isFullMode;
  const canShowSeed = hasSeedAvailable;
  const isFeeModalActive = sendModalVisible || psbtModalVisible;
  const primaryActionLabel = isFullMode
    ? 'Enviar BTC'
    : isOnlineProtectedMode
    ? 'Enviar PSBT'
    : 'Assinar BTC';
  const isPrimaryActionDisabled = isFullMode
    ? hasPendingIncoming || !canInitiateDirectSend
    : isOnlineProtectedMode
    ? !isOnline || hasPendingIncoming || hasPendingPsbt
    : !hasSeedAvailable;
  const modeInfoMessage = useMemo(() => {
    if (isOnlineProtectedMode) {
      return 'Modo online protegido: utilize este aparelho para sincronizar saldos e montar PSBTs.';
    }
    if (isOfflineProtectedMode) {
      return 'Modo offline protegido: mantenha este dispositivo desconectado e use-o apenas para assinar transacoes.';
    }
    return null;
  }, [isOfflineProtectedMode, isOnlineProtectedMode]);
  const modeBadgeStyle = useMemo(
    () => [
      styles.modeBadge,
      isOfflineProtectedMode ? styles.modeBadgeDanger : null,
      isOnlineProtectedMode ? styles.modeBadgeWarning : null,
    ],
    [isOfflineProtectedMode, isOnlineProtectedMode],
  );

  const buildWalletState = useCallback(
    (seedWords, baseData = {}) => {
      const normalizedSeed = Array.isArray(seedWords) ? seedWords : [];
      const type = baseData.addressType ?? DEFAULT_ADDRESS_TYPE;
      const knownModes = Object.values(WALLET_MODES);
      const fallbackMode = normalizedSeed.length ? WALLET_MODES.FULL : WALLET_MODES.ONLINE_PROTECTED;
      const mode = knownModes.includes(baseData.mode) ? baseData.mode : fallbackMode;

      let accountXpub = baseData.accountXpub ?? null;
      let masterFingerprint = baseData.masterFingerprint ?? null;
      let accountPath = baseData.accountPath ?? null;

      const canDeriveWithSeed = normalizedSeed.length > 0;

      if (canDeriveWithSeed) {
        try {
          const accountKeys = deriveAccountKeysFromSeed(normalizedSeed, { type });
          if (!accountXpub) {
            accountXpub = accountKeys.accountXpub;
          }
          if (!masterFingerprint) {
            masterFingerprint = accountKeys.masterFingerprint;
          }
          if (!accountPath) {
            accountPath = accountKeys.accountPath;
          }
        } catch (error) {
          console.error('Erro ao derivar dados publicos da seed', error);
        }
      }

      const canDeriveWithPublic = Boolean(accountXpub);

      if (!canDeriveWithSeed && !canDeriveWithPublic) {
        throw new Error('Nenhuma fonte de derivacao disponivel para gerar enderecos.');
      }

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

      const deriveAddress = ({ changeFlag, index }) =>
        deriveAddressDetails(canDeriveWithSeed ? normalizedSeed : null, {
          type,
          change: changeFlag,
          index,
          accountXpub: !canDeriveWithSeed ? accountXpub : undefined,
        });

      if (!receiving.length && (canDeriveWithSeed || canDeriveWithPublic)) {
        const first = deriveAddress({ changeFlag: false, index: 0 });
        receiving = [
          {
            address: first.address,
            index: 0,
            type,
            change: false,
            used: false,
          },
        ];
      }

      let receivingIndex =
        Number.isInteger(baseData.receivingIndex) && baseData.receivingIndex >= 0
          ? baseData.receivingIndex
          : receiving.length;

      let changeIndex =
        Number.isInteger(baseData.changeIndex) && baseData.changeIndex >= 0 ? baseData.changeIndex : change.length;

      receivingIndex = Math.max(receivingIndex, receiving.length);
      changeIndex = Math.max(changeIndex, change.length);

      return {
        mode,
        seedPhrase: normalizedSeed,
        accountXpub: accountXpub ?? undefined,
        masterFingerprint: masterFingerprint ?? undefined,
        accountPath: accountPath ?? undefined,
        addressType: type,
        receivingIndex,
        changeIndex,
        receivingAddresses: receiving,
        changeAddresses: change,
        discoveryComplete: Boolean(baseData.discoveryComplete),
      };
    },
    [deriveAccountKeysFromSeed, deriveAddressDetails],
  );

  const discoverWalletUsage = useCallback(
    async (seedWords, baseWallet, { gapLimit = 3, maxScan = 20 } = {}) => {
      const type = baseWallet.addressType ?? DEFAULT_ADDRESS_TYPE;
      const mode = baseWallet.mode ?? WALLET_MODES.FULL;
      const accountXpub = baseWallet.accountXpub;
      const hasSeed = Array.isArray(seedWords) && seedWords.length > 0;
      const canDeriveWithSeed = hasSeed;
      const canDeriveWithPublic = Boolean(accountXpub);

      if (mode === WALLET_MODES.OFFLINE_PROTECTED) {
        return {
          wallet: {
            ...baseWallet,
            discoveryComplete: true,
          },
          summaryMap: {},
          pendingReceivedSat: 0,
        };
      }

      if (!canDeriveWithSeed && !canDeriveWithPublic) {
        return {
          wallet: {
            ...baseWallet,
            discoveryComplete: true,
          },
          summaryMap: {},
          pendingReceivedSat: 0,
        };
      }

      const deriveAddress = (changeFlag, index) =>
        deriveAddressDetails(canDeriveWithSeed ? seedWords : null, {
          type,
          change: changeFlag,
          index,
          accountXpub: !canDeriveWithSeed ? accountXpub : undefined,
        });

      const buildEmptySummary = (addr) => ({
        address: addr,
        balance: 0,
        balanceSat: 0,
        pendingReceivedSat: 0,
        totalReceivedSat: 0,
        hasActivity: false,
      });

      const scanBranch = async (changeFlag, branchState = { rateLimited: false, aborted: false }) => {
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

        if (branchState.rateLimited && branchState.aborted) {
          existing.forEach((item) => {
            if (!summaries[item.address]) {
              summaries[item.address] = buildEmptySummary(item.address);
            }
          });
          const deduped = [...results.values()].sort((a, b) => a.index - b.index);
          return { addresses: deduped, summaries };
        }

        let index = 0;
        let emptyStreak = 0;
        let lastActiveIndex = -1;

        while (index < maxScan && emptyStreak < gapLimit) {
          let entry = results.get(index);

          if (!entry) {
            const derived = deriveAddress(changeFlag, index);
            entry = {
              address: derived.address,
              index,
              type,
              change: changeFlag,
              used: false,
            };
            results.set(index, entry);
          }

          let summary = summaries[entry.address];
          let rateLimitTriggered = false;
          if (!summary) {
            try {
              summary = await fetchAddressSummary(entry.address);
            } catch (error) {
              const message = typeof error?.message === 'string' ? error.message : '';
              const isRateLimitError =
                error?.code === 'RATE_LIMITED' || /limite de requisicoes/i.test(message);
              if (isRateLimitError) {
                console.warn(`Limite da API ao descobrir endereco ${entry.address}`, error);
                branchState.rateLimited = true;
                branchState.aborted = true;
                rateLimitTriggered = true;
              } else {
                console.error(`Erro descobrindo endereco ${entry.address}`, error);
              }
              summary = buildEmptySummary(entry.address);
            }
            summaries[entry.address] = summary;

            if (rateLimitTriggered) {
              break;
            }
          }

          const hasActivity =
            Number(summary?.balanceSat ?? 0) > 0 ||
            Number(summary?.pendingReceivedSat ?? 0) > 0 ||
            Number(summary?.totalReceivedSat ?? 0) > 0 ||
            summary?.hasActivity;

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

        if (!changeFlag && !branchState.rateLimited) {
          const nextIndex =
            lastActiveIndex >= 0
              ? lastActiveIndex + 1
              : deduped.length
              ? deduped[deduped.length - 1].index + 1
              : 0;
          const exists = deduped.some((item) => item.index === nextIndex);
          if (!exists) {
            const derived = deriveAddress(false, nextIndex);
            deduped.push({
              address: derived.address,
              index: nextIndex,
              type,
              change: false,
              used: false,
            });
            summaries[derived.address] = buildEmptySummary(derived.address);
          }
        }

        return { addresses: deduped, summaries };
      };

      const receivingState = { rateLimited: false, aborted: false };
      const receivingScan = await scanBranch(false, receivingState);
      const changeState = {
        rateLimited: receivingState.rateLimited,
        aborted: receivingState.aborted,
      };
      const changeScan = await scanBranch(true, changeState);

      const summaryMap = { ...receivingScan.summaries, ...changeScan.summaries };

      const receivingAddresses = receivingScan.addresses;
      const changeAddresses = changeScan.addresses;

      const receivingIndex = receivingAddresses.length
        ? Math.max(...receivingAddresses.map((item) => item.index)) + 1
        : baseWallet.receivingIndex ?? 0;

      const changeIndex = changeAddresses.length
        ? Math.max(...changeAddresses.map((item) => item.index)) + 1
        : baseWallet.changeIndex ?? 0;

      const pendingReceivedSat = [...receivingAddresses, ...changeAddresses].reduce(
        (total, entry) => total + Number(summaryMap[entry.address]?.pendingReceivedSat ?? 0),
        0,
      );

      const encounteredRateLimit = receivingState.rateLimited || changeState.rateLimited;

      return {
        wallet: {
          ...baseWallet,
          receivingAddresses,
          changeAddresses,
          receivingIndex,
          changeIndex,
          discoveryComplete: !encounteredRateLimit,
        },
        summaryMap,
        pendingReceivedSat,
        rateLimited: encounteredRateLimit,
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

  useEffect(() => {
    if (!sendModalVisible) {
      sendModalPosition.stopAnimation(() => {
        sendModalPosition.setValue({ x: 0, y: 0 });
        sendModalPosition.setOffset({ x: 0, y: 0 });
      });
    }
  }, [sendModalPosition, sendModalVisible]);

  useEffect(() => {
    if (!signModalVisible) {
      signModalPosition.stopAnimation(() => {
        signModalPosition.setValue({ x: 0, y: 0 });
        signModalPosition.setOffset({ x: 0, y: 0 });
      });
    }
  }, [signModalPosition, signModalVisible]);

  useEffect(() => {
    if (!canUseNetwork && isOnline) {
      setIsOnline(false);
    }
  }, [canUseNetwork, isOnline]);

  const loadTransactionHistory = useCallback(async () => {
    if (!walletDataRef.current) {
      setTransactions([]);
      return;
    }

    if (!canUseNetwork) {
      setTransactionsError('Disponivel apenas no dispositivo online.');
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
  }, [canUseNetwork, isOnline]);

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
    if (!hasPendingIncoming) {
      return;
    }

    if (sendModalVisible) {
      handleCloseSendModal();
      showFeedback('info', 'Aguarde a confirmacao das transacoes pendentes antes de enviar BTC.');
      return;
    }

    if (psbtModalVisible) {
      handleClosePsbtModal();
      showFeedback('info', 'Aguarde a confirmacao das transacoes pendentes antes de montar uma PSBT.');
    }
  }, [
    handleClosePsbtModal,
    handleCloseSendModal,
    hasPendingIncoming,
    psbtModalVisible,
    sendModalVisible,
    showFeedback,
  ]);

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

  const pendingPsbtBtc = useMemo(
    () => pendingPsbtSat / SATOSHIS_IN_BTC,
    [pendingPsbtSat],
  );

  const pendingIncomingBtc = useMemo(
    () => pendingIncomingSat / SATOSHIS_IN_BTC,
    [pendingIncomingSat],
  );

  const availableBalance = useMemo(
    () => Math.max(balance - pendingPsbtBtc, 0),
    [balance, pendingPsbtBtc],
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

  const parsedPsbtAmount = useMemo(() => {
    if (!psbtAmount) {
      return 0;
    }
    const normalized = String(psbtAmount).replace(',', '.');
    const value = Number.parseFloat(normalized);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }, [psbtAmount]);

  const psbtEstimatedTotalBtc = useMemo(() => {
    return parsedPsbtAmount + estimatedFeeBtc;
  }, [estimatedFeeBtc, parsedPsbtAmount]);

  const psbtEstimatedTotalUsd = useMemo(() => {
    if (!btcPriceUsd) {
      return null;
    }
    return psbtEstimatedTotalBtc * btcPriceUsd;
  }, [btcPriceUsd, psbtEstimatedTotalBtc]);

  const psbtDraftSummary = useMemo(() => {
    if (!psbtDraft?.psbtBase64) {
      return null;
    }
    try {
      return parsePsbtDetails(psbtDraft.psbtBase64);
    } catch (error) {
      console.error('Erro ao analisar detalhes da PSBT', error);
      return null;
    }
  }, [psbtDraft]);

  const psbtFeeBtc = useMemo(() => {
    if (!psbtDraftSummary) {
      return 0;
    }
    return psbtDraftSummary.fee / SATOSHIS_IN_BTC;
  }, [psbtDraftSummary]);

  const psbtFeeRatePerVbyte = useMemo(() => {
    if (!psbtDraftSummary || !psbtDraftSummary.virtualSize) {
      return null;
    }
    return psbtDraftSummary.fee / psbtDraftSummary.virtualSize;
  }, [psbtDraftSummary]);

  const psbtChangeBtc = useMemo(() => {
    if (!psbtDraft?.change) {
      return 0;
    }
    return psbtDraft.change / SATOSHIS_IN_BTC;
  }, [psbtDraft]);

  const psbtToSignSummary = useMemo(() => {
    if (!psbtToSign?.trim()) {
      return null;
    }
    try {
      return parsePsbtDetails(psbtToSign.trim());
    } catch (error) {
      return null;
    }
  }, [psbtToSign]);

  const psbtToSignBreakdown = useMemo(() => {
    if (!psbtToSignSummary) {
      return null;
    }
    const changeSat = psbtToSignSummary.outputs
      .filter((output) => output.isChange)
      .reduce((sum, item) => sum + (item.value ?? 0), 0);
    const recipientSat = psbtToSignSummary.totalOutput - changeSat;
    return {
      feeBtc: psbtToSignSummary.fee / SATOSHIS_IN_BTC,
      changeBtc: changeSat / SATOSHIS_IN_BTC,
      recipientBtc: recipientSat / SATOSHIS_IN_BTC,
      feeRate: psbtToSignSummary.feeRate,
      virtualSize: psbtToSignSummary.virtualSize,
    };
  }, [psbtToSignSummary]);

  const signedPsbtSummary = useMemo(() => {
    if (!signedPsbt?.psbtBase64) {
      return null;
    }
    try {
      return parsePsbtDetails(signedPsbt.psbtBase64);
    } catch (error) {
      console.error('Erro ao analisar detalhes da PSBT assinada', error);
      return null;
    }
  }, [signedPsbt]);

  const signedPsbtBreakdown = useMemo(() => {
    if (!signedPsbtSummary) {
      return null;
    }
    const changeSat = signedPsbtSummary.outputs
      .filter((output) => output.isChange)
      .reduce((sum, item) => sum + (item.value ?? 0), 0);
    const recipientSat = signedPsbtSummary.totalOutput - changeSat;
    return {
      feeBtc: signedPsbtSummary.fee / SATOSHIS_IN_BTC,
      changeBtc: changeSat / SATOSHIS_IN_BTC,
      recipientBtc: recipientSat / SATOSHIS_IN_BTC,
      feeRate: signedPsbtSummary.feeRate,
      virtualSize: signedPsbtSummary.virtualSize,
    };
  }, [signedPsbtSummary]);

  const signedPsbtQrUri = useMemo(() => {
    if (!signedPsbt?.psbtBase64) {
      return null;
    }
    try {
      const encoded = encodeURIComponent(signedPsbt.psbtBase64);
      return `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encoded}`;
    } catch (error) {
      console.error('Erro ao montar QR da PSBT assinada', error);
      return null;
    }
  }, [signedPsbt]);

  const signedPsbtInputSummary = useMemo(() => {
    if (!signedPsbtInput?.trim()) {
      return null;
    }
    try {
      return parsePsbtDetails(signedPsbtInput.trim());
    } catch (error) {
      return null;
    }
  }, [signedPsbtInput]);

  const signedPsbtInputBreakdown = useMemo(() => {
    if (!signedPsbtInputSummary) {
      return null;
    }
    const changeSat = signedPsbtInputSummary.outputs
      .filter((output) => output.isChange)
      .reduce((sum, item) => sum + (item.value ?? 0), 0);
    const recipientSat = signedPsbtInputSummary.totalOutput - changeSat;
    return {
      feeBtc: signedPsbtInputSummary.fee / SATOSHIS_IN_BTC,
      changeBtc: changeSat / SATOSHIS_IN_BTC,
      recipientBtc: recipientSat / SATOSHIS_IN_BTC,
      feeRate: signedPsbtInputSummary.feeRate,
      virtualSize: signedPsbtInputSummary.virtualSize,
      fullySigned: signedPsbtInputSummary.fullySigned,
    };
  }, [signedPsbtInputSummary]);

  const psbtQrUri = useMemo(() => {
    if (!psbtDraft?.psbtBase64) {
      return null;
    }
    try {
      const encoded = encodeURIComponent(psbtDraft.psbtBase64);
      return `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encoded}`;
    } catch (error) {
      console.error('Erro ao montar QR da PSBT', error);
      return null;
    }
  }, [psbtDraft]);

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

  const resolvedCameraModule = useMemo(() => {
    if (!cameraModule) {
      return null;
    }
    if (cameraModule.default && typeof cameraModule.default === 'object') {
      return { ...cameraModule, ...cameraModule.default };
    }
    return cameraModule;
  }, [cameraModule]);

  const cameraSupport = useMemo(() => {
    if (!resolvedCameraModule) {
      return null;
    }

    if (resolvedCameraModule.CameraView) {
      return {
        Component: resolvedCameraModule.CameraView,
        getProps: (handler) => ({
          style: styles.qrScanner,
          facing: 'back',
          barcodeScannerSettings: { barcodeTypes: ['qr'] },
          onBarcodeScanned: handler,
        }),
      };
    }

    if (resolvedCameraModule.Camera) {
      const LegacyCamera = resolvedCameraModule.Camera;
      const legacyType =
        resolvedCameraModule.CameraType?.back ??
        resolvedCameraModule.Camera.Constants?.Type?.back ??
        resolvedCameraModule.Constants?.Type?.back ??
        undefined;

      const qrType =
        resolvedCameraModule?.BarCodeScanner?.Constants?.BarCodeType?.qr ??
        resolvedCameraModule?.Camera?.Constants?.BarCodeType?.qr ??
        'qr';

      return {
        Component: LegacyCamera,
        getProps: (handler) => ({
          style: styles.qrScanner,
          type: legacyType,
          barCodeScannerSettings: { barCodeTypes: [qrType] },
          onBarCodeScanned: handler,
        }),
      };
    }

    return null;
  }, [resolvedCameraModule]);

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
    if (isOfflineProtectedMode) {
      Alert.alert(
        'Modo offline protegido',
        'Este dispositivo deve permanecer desconectado. Use o aparelho online para sincronizar.',
      );
      return;
    }
    setIsOnline((prev) => !prev);
  }, [isOfflineProtectedMode]);

  const handleSendBitcoin = useCallback(() => {
    if (!canInitiateDirectSend) {
      showFeedback(
        'info',
        isOnlineProtectedMode
          ? 'Use o fluxo de PSBT para enviar BTC a partir deste dispositivo online.'
          : 'Este dispositivo atua apenas como assinador offline. Use o fluxo de PSBT para assinar transacoes.',
      );
      return;
    }

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
  }, [address, canInitiateDirectSend, hasPendingIncoming, isOnline, isOnlineProtectedMode, pendingIncomingBtc, showFeedback]);

  const handleReceiveBitcoin = useCallback(() => {
    if (!address) {
      showFeedback('error', 'Endereco da carteira indisponivel.');
      return;
    }

    setReceiveModalVisible(true);
  }, [address, showFeedback]);

  const handleCopyXpub = useCallback(() => {
    if (!accountXpub) {
      showFeedback('error', 'xpub indisponivel neste dispositivo.');
      return;
    }

    Clipboard.setStringAsync(accountXpub)
      .then(() => {
        showFeedback('success', 'xpub copiado para a area de transferencia.');
      })
      .catch((error) => {
        console.error('Erro ao copiar xpub', error);
        showFeedback('error', 'Nao foi possivel copiar o xpub.');
      });
  }, [accountXpub, showFeedback]);

  const handleCloseSendModal = useCallback(() => {
    setIsScanning(false);
    setScanMode(null);
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

  const handleOpenPsbtModal = useCallback(() => {
    if (!isOnlineProtectedMode) {
      showFeedback('info', 'O fluxo de PSBT esta disponivel apenas no modo online protegido.');
      return;
    }

    if (!isOnline) {
      showFeedback('error', 'Ative o modo online para gerar a PSBT.');
      return;
    }

    if (pendingPsbtSat > 0) {
      showFeedback('info', 'Existe uma PSBT pendente. Conclua ou cancele antes de gerar outra.');
      return;
    }

    if (!walletData?.accountXpub) {
      showFeedback('error', 'xpub da conta indisponivel neste dispositivo.');
      return;
    }

    if (hasPendingIncoming) {
      const pendingText = formatBitcoinAmount(pendingIncomingBtc);
      showFeedback(
        'info',
        `Existe uma transacao recebida pendente (~${pendingText} BTC). Aguarde a confirmacao antes de montar a PSBT.`,
      );
      return;
    }

    setPsbtAddress('');
    setPsbtAmount('');
    setPsbtStatus(null);
    setPsbtDraft(null);
    setCreatingPsbt(false);
    setPsbtPercentage(null);
    setSignedPsbtInput('');
    setBroadcastStatus(null);
    setBroadcastingPsbt(false);
    setFeeProfile('fastest');
    setFeeError(null);
    setFeeRate(null);
    setPsbtModalVisible(true);
  }, [
    hasPendingIncoming,
    isOnline,
    isOnlineProtectedMode,
    pendingIncomingBtc,
    showFeedback,
    walletData,
    pendingPsbtSat,
  ]);

  const handleClosePsbtModal = useCallback(() => {
    setPendingPsbtSat(0);
    setPsbtModalVisible(false);
    setIsScanning(false);
    setScanMode(null);
    setIsScanning(false);
    setScanMode(null);
    setPsbtAddress('');
    setPsbtAmount('');
    setPsbtStatus(null);
    setPsbtDraft(null);
    setCreatingPsbt(false);
    setPsbtPercentage(null);
    setSignedPsbtInput('');
    setBroadcastStatus(null);
    setBroadcastingPsbt(false);
  }, []);

  const handleCreatePsbt = useCallback(async () => {
    if (creatingPsbt) {
      return;
    }

    const trimmedAddress = psbtAddress.trim();

    if (!trimmedAddress) {
      const message = 'Informe o endereco de destino.';
      showFeedback('error', message);
      setPsbtStatus({ type: 'error', message });
      return;
    }

    if (!feeRate || feeRate <= 0) {
      const message = 'Nao foi possivel calcular a taxa de mineracao.';
      showFeedback('error', message);
      setPsbtStatus({ type: 'error', message });
      return;
    }

    if (!walletData?.accountXpub) {
      const message = 'xpub da conta indisponivel neste dispositivo.';
      showFeedback('error', message);
      setPsbtStatus({ type: 'error', message });
      return;
    }

    if (!parsedPsbtAmount || parsedPsbtAmount <= 0) {
      const message = 'Quantidade invalida de BTC.';
      showFeedback('error', message);
      setPsbtStatus({ type: 'error', message });
      return;
    }

    const totalToSpend = psbtEstimatedTotalBtc;
    if (!Number.isFinite(totalToSpend) || totalToSpend <= 0) {
      const message = 'Nao foi possivel calcular o total da transacao.';
      showFeedback('error', message);
      setPsbtStatus({ type: 'error', message });
      return;
    }

    if (totalToSpend > availableBalance) {
      const message = `Saldo insuficiente. Disponivel: ${formatBitcoinAmount(
        availableBalance,
      )} BTC. Necessario: ${formatBitcoinAmount(totalToSpend)} BTC (valor + taxa).`;
      showFeedback('error', message);
      setPsbtStatus({ type: 'error', message });
      return;
    }

    if (hasPendingIncoming) {
      const message = `Existe uma transacao de recebimento pendente (~${formatBitcoinAmount(
        pendingIncomingBtc,
      )} BTC). Aguarde a confirmacao para montar a PSBT.`;
      showFeedback('error', message);
      setPsbtStatus({ type: 'error', message });
      return;
    }

    setPsbtStatus(null);
    setCreatingPsbt(true);

    const finalizePsbtDraft = (result) => {
      const amountSat =
        Number.isFinite(Number(result.amountSat))
          ? Number(result.amountSat)
          : Math.round(Number(result.amountBtc ?? 0) * SATOSHIS_IN_BTC);
      const feeSat = Number.isFinite(Number(result.fee)) ? Number(result.fee) : 0;
      const reservedSat = Math.max(amountSat + feeSat, 0);
      setPendingPsbtSat(reservedSat);
      setPsbtDraft({
        ...result,
        recipientAddress: trimmedAddress,
        amountBtc: parsedPsbtAmount,
        feeRate,
        nextChangeIndex,
      });
      setPsbtStatus({
        type: 'success',
        message: 'PSBT gerada. Escaneie com o dispositivo offline para assinar.',
      });
    };

    const nextChangeIndex =
      Number.isInteger(walletData.changeIndex) && walletData.changeIndex >= 0
        ? walletData.changeIndex
        : (walletData.changeAddresses?.length ?? 0);

    try {
      const result = await createPsbtTransaction({
        accountXpub: walletData.accountXpub,
        masterFingerprint: walletData.masterFingerprint ?? null,
        recipientAddress: trimmedAddress,
        amountBtc: parsedPsbtAmount,
        feeRate,
        addressType: walletData.addressType ?? DEFAULT_ADDRESS_TYPE,
        receivingAddresses: walletData.receivingAddresses ?? [],
        changeAddresses: walletData.changeAddresses ?? [],
        nextChangeIndex,
      });

      if (result.changeBelowDust > 0) {
        const dustBtc = result.changeBelowDust / SATOSHIS_IN_BTC;
        Alert.alert(
          'Troco abaixo do minimo',
          `O troco restante (${formatBitcoinAmount(dustBtc)} BTC) e inferior ao minimo de ${MIN_CHANGE_VALUE} sats e sera incorporado na taxa. Deseja continuar mesmo assim?`,
          [
            {
              text: 'Cancelar',
              style: 'cancel',
              onPress: () => {
                setPsbtStatus({
                  type: 'error',
                  message: 'Geracao de PSBT cancelada. Ajuste o valor para evitar perda de troco.',
                });
              },
            },
            {
              text: 'Continuar',
              style: 'destructive',
              onPress: () => {
                finalizePsbtDraft(result);
              },
            },
          ],
        );
        return;
      }

      finalizePsbtDraft(result);
    } catch (error) {
      console.error('Erro ao gerar PSBT', error);
      const message = error?.message ?? 'Nao foi possivel gerar a PSBT.';
      showFeedback('error', message);
      setPsbtStatus({ type: 'error', message });
    } finally {
      setCreatingPsbt(false);
    }
  }, [
    availableBalance,
    creatingPsbt,
    feeRate,
    hasPendingIncoming,
    parsedPsbtAmount,
    pendingIncomingBtc,
    psbtAddress,
    psbtEstimatedTotalBtc,
    showFeedback,
    walletData,
  ]);

  const handleCopyPsbtToClipboard = useCallback(() => {
    if (!psbtDraft?.psbtBase64) {
      showFeedback('error', 'PSBT indisponivel para copiar.');
      return;
    }

    Clipboard.setStringAsync(psbtDraft.psbtBase64)
      .then(() => {
        showFeedback('success', 'PSBT copiada para a area de transferencia.');
      })
      .catch((error) => {
        console.error('Erro ao copiar PSBT', error);
        showFeedback('error', 'Nao foi possivel copiar a PSBT.');
      });
  }, [psbtDraft, showFeedback]);

  const handlePasteSignedPsbt = useCallback(async () => {
    try {
      const clipboardValue = await Clipboard.getStringAsync();
      const normalized = clipboardValue?.trim();
      if (!normalized) {
        showFeedback('error', 'Nenhuma PSBT assinada encontrada na area de transferencia.');
        return;
      }
      setSignedPsbtInput(normalized);
      setBroadcastStatus(null);
      showFeedback('success', 'PSBT assinada colada da area de transferencia.');
    } catch (error) {
      console.error('Erro ao ler area de transferencia', error);
      showFeedback('error', 'Nao foi possivel ler a area de transferencia.');
    }
  }, [showFeedback]);

  const handleBroadcastPsbt = useCallback(async () => {
    if (broadcastingPsbt) {
      return;
    }

    if (!psbtDraft || !psbtDraftSummary) {
      showFeedback('error', 'Nenhuma PSBT foi gerada neste dispositivo.');
      setBroadcastStatus({
        type: 'error',
        message: 'Nenhuma PSBT foi gerada neste dispositivo.',
      });
      return;
    }

    if (!walletData) {
      showFeedback('error', 'Dados da carteira indisponiveis.');
      setBroadcastStatus({ type: 'error', message: 'Dados da carteira indisponiveis.' });
      return;
    }

    const normalized = signedPsbtInput.trim();
    if (!normalized) {
      const message = 'Cole ou leia a PSBT assinada para transmitir.';
      showFeedback('error', message);
      setBroadcastStatus({ type: 'error', message });
      return;
    }

    if (!signedPsbtInputSummary) {
      const message = 'PSBT assinada invalida.';
      showFeedback('error', message);
      setBroadcastStatus({ type: 'error', message });
      return;
    }

    if (!signedPsbtInputSummary.fullySigned) {
      const message = 'A PSBT informada nao esta totalmente assinada.';
      showFeedback('error', message);
      setBroadcastStatus({ type: 'error', message });
      return;
    }

    if (
      signedPsbtInputSummary.totalInput !== psbtDraftSummary.totalInput ||
      signedPsbtInputSummary.totalOutput !== psbtDraftSummary.totalOutput ||
      signedPsbtInputSummary.fee !== psbtDraftSummary.fee
    ) {
      const message = 'A PSBT assinada nao corresponde ao rascunho atual.';
      showFeedback('error', message);
      setBroadcastStatus({ type: 'error', message });
      return;
    }

    setBroadcastStatus(null);
    setBroadcastingPsbt(true);

    try {
      const { txid } = await broadcastSignedPsbt(normalized);

      const usedInputs = Array.isArray(psbtDraft.selectedUtxos)
        ? psbtDraft.selectedUtxos.map((item) => item.source ?? { address: item.address })
        : [];
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
      let changeAddresses = (walletData.changeAddresses ?? []).map(markUsed);

      let changeIndex =
        Number.isInteger(walletData.changeIndex) && walletData.changeIndex >= 0
          ? walletData.changeIndex
          : walletData.changeAddresses?.length ?? 0;

      if (psbtDraft.changeAddress?.address) {
        const exists = changeAddresses.some(
          (item) => item.address === psbtDraft.changeAddress.address,
        );

        if (exists) {
          changeAddresses = changeAddresses.map((item) =>
            item.address === psbtDraft.changeAddress.address ? { ...item, used: true } : item,
          );
        } else {
          changeAddresses = [...changeAddresses, { ...psbtDraft.changeAddress, used: true }];
        }

        const changeIdx = psbtDraft.changeAddress.index ?? changeIndex;
        changeIndex = Math.max(changeIndex, changeIdx + 1);
      }

      const updatedWallet = {
        ...walletData,
        receivingAddresses: updatedReceiving,
        changeAddresses,
        changeIndex,
      };

      await persistWalletData(updatedWallet);
      await fetchWalletBalance(updatedWallet, { force: true });

      const successMessage = `Transacao transmitida com sucesso. TXID: ${txid}`;
      setBroadcastStatus({ type: 'success', message: successMessage });
      showFeedback('success', successMessage);
      setPendingPsbtSat(0);
      setPsbtDraft(null);
      setSignedPsbtInput('');
      setTimeout(() => {
        handleClosePsbtModal();
      }, 1200);
    } catch (error) {
      console.error('Erro ao transmitir PSBT', error);
      const message = error?.message ?? 'Falha ao transmitir a transacao.';
      setBroadcastStatus({ type: 'error', message });
      showFeedback('error', message);
    } finally {
      setBroadcastingPsbt(false);
    }
  }, [
    broadcastingPsbt,
    fetchWalletBalance,
    handleClosePsbtModal,
    persistWalletData,
    psbtDraft,
    psbtDraftSummary,
    showFeedback,
    signedPsbtInput,
    signedPsbtInputSummary,
    walletData,
  ]);

  const handleOpenSignModal = useCallback(() => {
    if (!isOfflineProtectedMode) {
      showFeedback('info', 'O fluxo de assinatura esta disponivel apenas no modo offline protegido.');
      return;
    }

    if (!hasSeedAvailable) {
      showFeedback('error', 'Seed indisponivel neste dispositivo.');
      return;
    }

    setPsbtToSign('');
    setSignedPsbt(null);
    setSignStatus(null);
    setSigningPsbt(false);
    setScanMode(null);
    setIsScanning(false);
    setSignModalVisible(true);
  }, [hasSeedAvailable, isOfflineProtectedMode, showFeedback]);

  const handleCloseSignModal = useCallback(() => {
    setSignModalVisible(false);
    setPsbtToSign('');
    setSignedPsbt(null);
    setSignStatus(null);
    setSigningPsbt(false);
    setScanMode(null);
    setIsScanning(false);
  }, []);

  const handlePastePsbtFromClipboard = useCallback(async () => {
    try {
      const clipboardValue = await Clipboard.getStringAsync();
      const normalized = clipboardValue?.trim();
      if (!normalized) {
        showFeedback('error', 'Nenhum conteudo valido na area de transferencia.');
        return;
      }
      setPsbtToSign(normalized);
      setSignStatus(null);
      showFeedback('success', 'PSBT colada da area de transferencia.');
    } catch (error) {
      console.error('Erro ao ler area de transferencia', error);
      showFeedback('error', 'Nao foi possivel ler a area de transferencia.');
    }
  }, [showFeedback]);

  const handleSignPsbt = useCallback(async () => {
    if (signingPsbt) {
      return;
    }

    const normalized = psbtToSign.trim();
    if (!normalized) {
      const message = 'Cole ou leia uma PSBT antes de assinar.';
      showFeedback('error', message);
      setSignStatus({ type: 'error', message });
      return;
    }

    if (!psbtToSignSummary) {
      const message = 'PSBT invalida. Verifique o conteudo informado.';
      showFeedback('error', message);
      setSignStatus({ type: 'error', message });
      return;
    }

    if (!hasSeedAvailable) {
      const message = 'Seed indisponivel para assinar a PSBT.';
      showFeedback('error', message);
      setSignStatus({ type: 'error', message });
      return;
    }

    setSignStatus(null);
    setSigningPsbt(true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    try {
      const signedBase64 = await Promise.resolve().then(() =>
        signPsbtWithSeedPhrase(normalized, seedPhrase),
      );
      setSignedPsbt({ psbtBase64: signedBase64 });
      setSignStatus({
        type: 'success',
        message: 'PSBT assinada com sucesso. Escaneie o QR no dispositivo online para finalizar.',
      });
    } catch (error) {
      console.error('Erro ao assinar PSBT', error);
      const message = error?.message ?? 'Nao foi possivel assinar a PSBT.';
      showFeedback('error', message);
      setSignStatus({ type: 'error', message });
    } finally {
      setSigningPsbt(false);
    }
  }, [hasSeedAvailable, psbtToSign, psbtToSignSummary, seedPhrase, showFeedback, signingPsbt]);

  const handleCopySignedPsbt = useCallback(() => {
    if (!signedPsbt?.psbtBase64) {
      showFeedback('error', 'Nenhuma PSBT assinada para copiar.');
      return;
    }

    Clipboard.setStringAsync(signedPsbt.psbtBase64)
      .then(() => {
        showFeedback('success', 'PSBT assinada copiada para a area de transferencia.');
      })
      .catch((error) => {
        console.error('Erro ao copiar PSBT assinada', error);
        showFeedback('error', 'Nao foi possivel copiar a PSBT assinada.');
      });
  }, [showFeedback, signedPsbt]);

  const handlePrimaryAction = useMemo(() => {
    if (isFullMode) {
      return handleSendBitcoin;
    }
    if (isOnlineProtectedMode) {
      return handleOpenPsbtModal;
    }
    return handleOpenSignModal;
  }, [handleOpenPsbtModal, handleOpenSignModal, handleSendBitcoin, isFullMode, isOnlineProtectedMode]);

  const loadCameraModule = useCallback(async () => {
    if (cameraModuleRef.current) {
      return cameraModuleRef.current;
    }

    try {
      const module = require('expo-camera');
      const resolved = module?.default ? { ...module, ...module.default } : module;
      cameraModuleRef.current = resolved;
      setCameraModule(resolved);
      return resolved;
    } catch (syncError) {
      try {
        const module = await import('expo-camera');
        const resolved = module?.default ? { ...module, ...module.default } : module;
        cameraModuleRef.current = resolved;
        setCameraModule(resolved);
        return resolved;
      } catch (error) {
        console.error('Erro ao carregar modulo da camera', error);
        throw error;
      }
    }
  }, []);

  const handleScanQrCode = useCallback(
    async (mode = 'send') => {
      if (mode === 'send' && sendingTransaction) {
        return;
      }

      try {
        const camera = await loadCameraModule();

        const requestPermission =
          camera?.Camera?.requestCameraPermissionsAsync ??
          camera?.Camera?.requestPermissionsAsync ??
          camera?.requestCameraPermissionsAsync ??
          camera?.requestPermissionsAsync;

        if (!requestPermission) {
          showFeedback('error', 'Camera nao disponivel neste dispositivo.');
          return;
        }

        const permission = await requestPermission();

        if (!permission?.granted) {
          showFeedback('error', 'Permissao de camera negada.');
          return;
        }

        const hasCameraView = Boolean(camera?.CameraView);
        const hasLegacyCamera = Boolean(camera?.Camera);

        if (!hasCameraView && !hasLegacyCamera) {
          showFeedback('error', 'Leitor de QR Code indisponivel neste dispositivo.');
          setCameraModuleError('Leitor de QR Code indisponivel neste dispositivo.');
          return;
        }

        setCameraModuleError(null);
        setScanMode(mode);
        setIsScanning(true);
      } catch (error) {
        console.error('Erro ao preparar camera para leitura de QR Code', error);
        setCameraModuleError('Nao foi possivel acessar a camera do dispositivo.');
        showFeedback('error', 'Nao foi possivel acessar a camera do dispositivo.');
      }
    },
    [loadCameraModule, sendingTransaction, showFeedback],
  );

  const handleQrCodeScanned = useCallback(
    ({ data }) => {
      if (!isScanning) {
        return;
      }

      if (!data) {
        showFeedback('error', 'QR Code invalido.');
        return;
      }

      if (scanMode === 'psbt') {
        const normalized = data.trim();
        if (!normalized) {
          showFeedback('error', 'PSBT invalida.');
          return;
        }

        setIsScanning(false);
        setScanMode(null);
        setPsbtToSign(normalized);
        setSignStatus(null);
        try {
          parsePsbtDetails(normalized);
          showFeedback('success', 'PSBT importada com sucesso.');
        } catch (error) {
          showFeedback('error', error?.message ?? 'PSBT invalida.');
        }
        return;
      }

      if (scanMode === 'psbtRecipient') {
        let extractedAddress = data.trim();

        if (extractedAddress.toLowerCase().startsWith('bitcoin:')) {
          const withoutScheme = extractedAddress.slice('bitcoin:'.length);
          const [addressPart] = withoutScheme.split('?');
          extractedAddress = addressPart?.trim() ?? '';
        }

        if (!extractedAddress) {
          showFeedback('error', 'QR Code nao contem um endereco valido.');
          return;
        }

        setPsbtAddress(extractedAddress);
        setPsbtStatus(null);
        setScanMode(null);
        setIsScanning(false);
        showFeedback('success', 'Endereco do destinatario carregado via QR Code.');
        return;
      }

      if (scanMode === 'broadcast') {
        const normalized = data.trim();
        if (!normalized) {
          showFeedback('error', 'PSBT assinada invalida.');
          return;
        }

        setIsScanning(false);
        setScanMode(null);
        setSignedPsbtInput(normalized);
        setBroadcastStatus(null);
        try {
          parsePsbtDetails(normalized);
          showFeedback('success', 'PSBT assinada importada com sucesso.');
        } catch (error) {
          showFeedback('error', error?.message ?? 'PSBT assinada invalida.');
        }
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
        showFeedback('error', 'Endereco extraido do QR Code invalido.');
        return;
      }

      setSendAddress(extractedAddress);
      if (extractedAmount) {
        setSendAmount(extractedAmount);
      }
      setSendPercentage(null);
      setScanMode(null);
      setIsScanning(false);
      showFeedback('success', 'Endereco carregado do QR Code.');
    },
    [isScanning, scanMode, showFeedback],
  );
  const CameraComponent = cameraSupport?.Component ?? null;
  const cameraComponentProps =
    CameraComponent && cameraSupport ? cameraSupport.getProps(handleQrCodeScanned) : null;

  const handleCancelScan = useCallback(() => {
    setIsScanning(false);
    setScanMode(null);
  }, []);

  const handleSelectFeeProfile = useCallback(
    (profile) => {
      setFeeProfile(profile);
      setSendStatus(null);
      setPsbtStatus(null);
      if (isFeeModalActive) {
        if (feeIntervalRef.current) {
          clearInterval(feeIntervalRef.current);
          feeIntervalRef.current = null;
        }
        fetchMinerFee();
      }
    },
    [fetchMinerFee, isFeeModalActive],
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
    if (!isFeeModalActive) {
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
  }, [fetchMinerFee, feeProfile, isOnline, isFeeModalActive]);

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

  const handleSelectPsbtPercentage = useCallback(
    (value) => {
      setPsbtPercentage(value);
      setPsbtStatus(null);
      if (!availableBalance || availableBalance <= 0) {
        setPsbtAmount('0');
        return;
      }

      const amount = availableBalance * value;
      setPsbtAmount(formatBitcoinAmount(amount));
    },
    [availableBalance],
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
      await fetchWalletBalance(updatedWallet, { force: true });
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

    return availableBalance * btcPriceUsd;
  }, [availableBalance, btcPriceUsd]);

  const fetchWalletBalance = useCallback(
    async (targetWallet = walletDataRef.current, options = {}) => {
      const force = Boolean(options.force);

      if (!targetWallet) {
        return;
      }

      const walletMode = targetWallet.mode ?? WALLET_MODES.FULL;
      if (walletMode === WALLET_MODES.OFFLINE_PROTECTED) {
        return;
      }

      if (!isOnline && !force) {
        return;
      }

      const now = Date.now();

      if (!force && now - lastBalanceFetchRef.current < BALANCE_REFRESH_MIN_MS) {
        return;
      }

      lastBalanceFetchRef.current = now;

      let workingWallet = targetWallet;
      let didUpdate = false;
      const baseSeed = Array.isArray(targetWallet.seedPhrase)
        ? targetWallet.seedPhrase
        : walletDataRef.current?.seedPhrase ?? [];
      const baseAccountXpub = targetWallet.accountXpub ?? walletDataRef.current?.accountXpub ?? null;
      const canDeriveWithSeed = Array.isArray(baseSeed) && baseSeed.length > 0;
      const canDeriveWithXpub = Boolean(baseAccountXpub);
      let discoverySummaries = null;
      let discoveryPendingSat = 0;

      const shouldRunDiscovery =
        (force || !targetWallet.discoveryComplete) && (canDeriveWithSeed || canDeriveWithXpub);

      if (shouldRunDiscovery) {
        try {
          const discovery = await discoverWalletUsage(baseSeed, workingWallet, {
            gapLimit: ADDRESS_DISCOVERY_GAP_LIMIT,
            maxScan: ADDRESS_DISCOVERY_MAX_SCAN,
          });

          if (!isWalletStateEqual(workingWallet, discovery.wallet)) {
            workingWallet = discovery.wallet;
            didUpdate = true;
          }

          if (discovery.summaryMap && Object.keys(discovery.summaryMap).length) {
            discoverySummaries = discovery.summaryMap;
          }

          if (Number.isFinite(discovery.pendingReceivedSat)) {
            discoveryPendingSat = discovery.pendingReceivedSat;
          }
        } catch (error) {
          console.error('Erro ao ressincronizar enderecos da carteira', error);
        }
      }

      const trackedAddresses = [
        ...(Array.isArray(workingWallet.receivingAddresses) ? workingWallet.receivingAddresses : []),
        ...(Array.isArray(workingWallet.changeAddresses) ? workingWallet.changeAddresses : []),
      ].filter((item) => item?.address);

      if (!trackedAddresses.length) {
        setBalance(0);
        setPendingIncomingSat(0);
        setAddressSummaries({});
        zeroBalanceMapRef.current = {};
        lastBalanceFetchRef.current = Date.now();
        if (didUpdate) {
          await persistWalletData(workingWallet);
        }
        return;
      }

      try {
        const {
          balance: initialBalance,
          summaryMap,
        } = await getWalletAddressesBalance(trackedAddresses);

        const summaryRecords = {
          ...(discoverySummaries ?? {}),
          ...summaryMap,
        };

        const timestamp = Date.now();
        const previousZeroMap = zeroBalanceMapRef.current || {};
        const nextZeroMap = { ...previousZeroMap };
        const walletSeed = Array.isArray(workingWallet.seedPhrase)
          ? workingWallet.seedPhrase
          : baseSeed;
        const accountXpub = workingWallet.accountXpub ?? baseAccountXpub;
        const canDeriveWithSeedFinal = Array.isArray(walletSeed) && walletSeed.length > 0;
        const canDeriveWithXpubFinal = Boolean(accountXpub);

        const nextReceiving = (workingWallet.receivingAddresses ?? []).map((item) => {
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

        const nextChange = (workingWallet.changeAddresses ?? []).map((item) => {
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

        const receivingChanged = !compareAddressEntries(
          workingWallet.receivingAddresses ?? [],
          nextReceiving,
        );
        const changeChanged = !compareAddressEntries(
          workingWallet.changeAddresses ?? [],
          nextChange,
        );

        if (receivingChanged || changeChanged || didUpdate) {
          workingWallet = {
            ...workingWallet,
            receivingAddresses: nextReceiving,
            changeAddresses: nextChange,
          };
          didUpdate = true;
        }

        const addressMetadata = new Map();
        (workingWallet.receivingAddresses ?? []).forEach((item) => {
          addressMetadata.set(item.address, { change: false, used: Boolean(item.used) });
        });
        (workingWallet.changeAddresses ?? []).forEach((item) => {
          addressMetadata.set(item.address, { change: true, used: Boolean(item.used) });
        });

        const ensureFreshReceivingAddress = () => {
          if (!canDeriveWithSeedFinal && !canDeriveWithXpubFinal) {
            return null;
          }

          const hasUnused = (workingWallet.receivingAddresses ?? []).some((entry) => !entry.used);
          if (hasUnused) {
            return null;
          }

          const nextIndex =
            Number.isInteger(workingWallet.receivingIndex) && workingWallet.receivingIndex >= 0
              ? workingWallet.receivingIndex
              : (workingWallet.receivingAddresses ?? []).length;

          const nextDetails = deriveAddressDetails(canDeriveWithSeedFinal ? walletSeed : null, {
            type: workingWallet.addressType ?? DEFAULT_ADDRESS_TYPE,
            change: false,
            index: nextIndex,
            accountXpub: !canDeriveWithSeedFinal ? accountXpub : undefined,
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
          if (shouldArchive && previousTimestamp && timestamp - previousTimestamp >= 60000) {
            addressesToArchive.add(address);
            return;
          }

          if (shouldArchive) {
            nextZeroMap[address] = previousTimestamp ?? timestamp;
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

        const fallbackPendingFromDiscovery =
          discoverySummaries && Object.keys(discoverySummaries).length
            ? (workingWallet.receivingAddresses ?? []).reduce((total, entry) => {
                const summary = discoverySummaries[entry.address];
                if (!summary) {
                  return total;
                }
                return total + Number(summary?.pendingReceivedSat ?? 0);
              }, 0)
            : 0;
        const normalizedPendingIncoming =
          pendingIncomingSatForReceiving > 0
            ? pendingIncomingSatForReceiving
            : fallbackPendingFromDiscovery;

        setBalance(aggregatedBalance || initialBalance);
        setPendingIncomingSat(normalizedPendingIncoming);
        setAddressSummaries(filteredSummaryRecords);
        zeroBalanceMapRef.current = nextZeroMap;

        if (didUpdate) {
          await persistWalletData(workingWallet);
        }
      } catch (error) {
        console.error('Erro ao atualizar saldo da carteira', error);
        const errorMessage = typeof error?.message === 'string' ? error.message : '';
        const isRateLimited = errorMessage.includes('status 429');

        if (isRateLimited) {
          showFeedback('error', 'Limite de requisicoes atingido. Aguarde alguns instantes e tente novamente.');
        } else if (isOnline) {
          showFeedback('error', 'Nao foi possivel atualizar o saldo no momento. Verifique sua conexao.');
        } else {
          showFeedback('error', 'Erro ao atualizar saldo. Verifique sua conexao.');
        }
        if (!isRateLimited) {
          if (discoverySummaries && Object.keys(discoverySummaries).length) {
            setAddressSummaries(discoverySummaries);
            const pendingFromDiscovery = (workingWallet.receivingAddresses ?? []).reduce(
              (total, entry) => {
                const summary = discoverySummaries[entry.address];
                if (!summary) {
                  return total;
                }
                return total + Number(summary?.pendingReceivedSat ?? 0);
              },
              0,
            );
            setPendingIncomingSat(pendingFromDiscovery);
          } else {
            setAddressSummaries({});
            setPendingIncomingSat(0);
          }
          zeroBalanceMapRef.current = {};
        }
      } finally {
        lastBalanceFetchRef.current = Date.now();
      }
    },
    [discoverWalletUsage, isOnline, persistWalletData, deriveAddressDetails, showFeedback],
  );

  const refreshBtcPrice = useCallback(async () => {
    if (!canUseNetwork) {
      showFeedback('info', 'Atualize o preco utilizando o dispositivo online da carteira.');
      return;
    }

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
  }, [canUseNetwork, isOnline, showFeedback]);

  const handleRefreshWallet = useCallback(async () => {
    if (!walletDataRef.current) {
      showFeedback('error', 'Dados da carteira indisponiveis para atualizar.');
      return;
    }

    if (!canUseNetwork) {
      showFeedback('info', 'Atualize os dados utilizando o dispositivo online da carteira.');
      return;
    }

    if (!isOnline) {
      showFeedback('error', 'Ative o modo online para atualizar a carteira.');
      return;
    }

    await Promise.allSettled([
      fetchWalletBalance(walletDataRef.current, { force: true }),
      refreshBtcPrice(),
    ]);
  }, [canUseNetwork, fetchWalletBalance, isOnline, refreshBtcPrice, showFeedback]);

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
          mode: walletMode,
        });

        await persistWalletData(initialState);
        await fetchWalletBalance(initialState, { force: true });

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
    [buildWalletState, fetchWalletBalance, persistWalletData, showFeedback, walletMode],
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
        'Existe saldo disponivel nesta carteira. Transfira seus BTC para outra carteira antes de criar uma nova para evitar a perda dos fundos.',
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
          if (discovery.rateLimited) {
            showFeedback(
              'info',
              'Limite de requisicoes da API atingido durante a sincronizacao. Tentaremos novamente em instantes.',
            );
          }
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
      try {
        await fetchWalletBalance(normalized, { force: true });
      } catch (error) {
        console.error('Erro ao carregar saldo inicial', error);
      }
    } catch (error) {
      Alert.alert('Erro', 'Nao foi possivel carregar os dados da carteira.');
      console.error('Erro carregando carteira', error);
    } finally {
      setLoadingWallet(false);
    }
  }, [buildWalletState, discoverWalletUsage, fetchWalletBalance, regenerateWallet, showFeedback]);

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
    if (!canUseNetwork || !isOnline || !walletDataRef.current) {
      return;
    }

    fetchWalletBalance();

    const interval = setInterval(() => {
      fetchWalletBalance();
    }, 30000);

    return () => clearInterval(interval);
  }, [canUseNetwork, fetchWalletBalance, isOnline]);

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
            <View style={modeBadgeStyle}>
              <Text style={styles.modeBadgeText}>{WALLET_MODE_LABELS[walletMode]}</Text>
            </View>
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
              disabled={!canUseNetwork}
              style={[
                styles.headerButton,
                styles.outlineButton,
                styles.headerIconButton,
                !canUseNetwork ? styles.headerButtonDisabled : null,
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

        {modeInfoMessage ? <Text style={styles.modeInfoText}>{modeInfoMessage}</Text> : null}

        <WalletCard
          address={address}
          balance={availableBalance}
          usdValue={usdValue}
          btcPrice={btcPrice}
          isRefreshing={priceRefreshing && canRefreshPrice}
          canRefreshPrice={canRefreshPrice}
          onRefreshPrice={handleRefreshWallet}
        />

        {isOfflineProtectedMode ? (
          <View style={styles.xpubSection}>
            <Text style={styles.xpubLabel}>xpub da conta</Text>
            <View style={styles.xpubRow}>
              <Text style={styles.xpubValue} numberOfLines={1} ellipsizeMode="middle">
                {accountXpub ?? 'Indisponivel'}
              </Text>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={handleCopyXpub}
                disabled={!accountXpub}
                style={[styles.xpubCopyButton, !accountXpub ? styles.xpubCopyButtonDisabled : null]}
              >
                <Text
                  style={[
                    styles.xpubCopyButtonText,
                    !accountXpub ? styles.xpubCopyButtonTextDisabled : null,
                  ]}
                >
                  Copiar
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.xpubHint}>Use este xpub ao configurar o aplicativo online protegido.</Text>
          </View>
        ) : null}

        <View style={styles.quickActions}>
          <TouchableOpacity
            activeOpacity={0.85}
            style={[
              styles.quickActionButton,
              styles.sendButton,
              isPrimaryActionDisabled ? styles.quickActionButtonDisabled : null,
            ]}
            onPress={handlePrimaryAction}
            disabled={isPrimaryActionDisabled}
          >
            <Feather
              name="arrow-up-right"
              size={18}
              color={isPrimaryActionDisabled ? colors.mutedForeground : colors.primaryText}
              style={styles.quickActionIcon}
            />
            <Text
              style={[
                styles.quickActionText,
                isPrimaryActionDisabled ? styles.quickActionTextDisabled : null,
              ]}
            >
              {primaryActionLabel}
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
            Transacao recebida pendente (~{formatBitcoinAmount(pendingIncomingBtc)} BTC) aguardando confirmacao.
          </Text>
        ) : null}

        <TouchableOpacity
          activeOpacity={0.85}
          style={[styles.historyButton, !canUseNetwork || !isOnline ? styles.historyButtonDisabled : null]}
          onPress={canUseNetwork && isOnline ? handleOpenHistory : undefined}
          disabled={!canUseNetwork || !isOnline}
        >
          <Feather name="clock" size={20} color={colors.primaryText} style={styles.historyButtonIcon} />
          <View style={styles.historyButtonTextContainer}>
            <Text style={styles.historyButtonTitle}>Historico de transacoes</Text>
            <Text style={styles.historyButtonSubtitle}>Acompanhe entradas e saidas confirmadas</Text>
          </View>
        </TouchableOpacity>

          {addressBalances.length ? (
            <View style={styles.addressBalancesSection}>
              <Text style={styles.addressBalancesTitle}>Enderecos monitorados</Text>
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

                    {canShowSeed ? (
            <SeedPhrase words={seedPhrase} />
          ) : (
            <Text style={styles.modeInfoText}>Seed nao armazenada neste dispositivo.</Text>
          )}

        <Text style={styles.disclaimer}>
          ATENCAO: mantenha sua frase semente em seguranca. Nunca compartilhe com terceiros.
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
        visible={psbtModalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleClosePsbtModal}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <ScrollView
              style={styles.psbtModalScroll}
              contentContainerStyle={styles.psbtModalContent}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.modalTitle}>Gerar PSBT</Text>
              {isScanning && (scanMode === 'psbtRecipient' || scanMode === 'broadcast') ? (
              <>
                {CameraComponent && cameraComponentProps ? (
                  <>
                    <View style={styles.qrScannerContainer}>
                      <CameraComponent {...cameraComponentProps} />
                    </View>
                    <Text style={styles.qrScannerHint}>
                      {scanMode === 'psbtRecipient'
                        ? 'Aponte para o QR Code do destinatario'
                        : 'Aponte para o QR Code da PSBT assinada'}
                    </Text>
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
            ) : psbtDraft ? (
              <>
                {psbtStatus?.message ? (
                  <Text
                    style={
                      psbtStatus.type === 'error' ? styles.sendErrorText : styles.sendSuccessText
                    }
                  >
                    {psbtStatus.message}
                  </Text>
                ) : null}
                <View style={[styles.feeInfo, { marginTop: 12 }]}>
                  <View style={styles.feeInfoLine}>
                    <Text style={styles.feeInfoLabel}>Valor</Text>
                    <Text style={styles.feeInfoValue}>
                      {formatBitcoinAmount(psbtDraft.amountBtc)} BTC
                    </Text>
                  </View>
                  <View style={styles.feeInfoLine}>
                    <Text style={styles.feeInfoLabel}>Taxa</Text>
                    <Text style={styles.feeInfoValue}>
                      {formatBitcoinAmount(psbtFeeBtc)} BTC
                    </Text>
                  </View>
                  <Text style={styles.feeInfoMeta}>
                    {psbtFeeRatePerVbyte
                      ? `${psbtFeeRatePerVbyte.toFixed(1)} sat/vB | ${
                          psbtDraftSummary?.virtualSize ?? 0
                        } vB`
                      : 'Taxa estimada indisponivel'}
                  </Text>
                  {psbtChangeBtc > 0 ? (
                    <Text style={styles.feeInfoMeta}>
                      Troco: {formatBitcoinAmount(psbtChangeBtc)} BTC
                    </Text>
                  ) : null}
                </View>
                {psbtQrUri ? (
                  <Image
                    source={{ uri: psbtQrUri }}
                    style={[styles.receiveModalQr, { marginTop: 12 }]}
                    resizeMode="contain"
                  />
                ) : (
                  <Text style={[styles.modalHint, { marginTop: 12 }]}>
                    QR Code indisponivel. Use o botao abaixo para copiar a PSBT.
                  </Text>
                )}
                <Text style={[styles.modalHint, { marginTop: 12 }]}>
                  Escaneie este QR com o dispositivo offline protegido para assinar.
                </Text>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.modalPrimaryButton}
                  onPress={handleCopyPsbtToClipboard}
                >
                  <Text style={styles.modalPrimaryButtonText}>Copiar PSBT</Text>
                </TouchableOpacity>
                <Text style={[styles.modalDividerText, { marginTop: 16 }]}>
                  Importar PSBT assinada
                </Text>
                <View style={[styles.sendModalOptions, { marginTop: 8 }]}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={styles.modalOptionButton}
                    onPress={() => handleScanQrCode('broadcast')}
                  >
                    <Feather name="camera" size={18} color={colors.primaryText} />
                    <Text style={styles.modalOptionButtonText}>Ler QR Code</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={styles.modalOptionButton}
                    onPress={handlePasteSignedPsbt}
                  >
                    <Feather name="clipboard" size={18} color={colors.primaryText} />
                    <Text style={styles.modalOptionButtonText}>Colar</Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  value={signedPsbtInput}
                  onChangeText={(value) => {
                    setSignedPsbtInput(value);
                    setBroadcastStatus(null);
                  }}
                  placeholder="Cole a PSBT assinada aqui"
                  placeholderTextColor={colors.mutedForeground}
                  style={[styles.modalInput, { height: 120, textAlignVertical: 'top' }]}
                  autoCapitalize="none"
                  autoCorrect={false}
                  multiline
                />
                {signedPsbtInputSummary ? (
                  <View style={[styles.feeInfo, { marginTop: 12 }]}>
                    <View style={styles.feeInfoLine}>
                      <Text style={styles.feeInfoLabel}>Valor</Text>
                      <Text style={styles.feeInfoValue}>
                        {signedPsbtInputBreakdown
                          ? `${formatBitcoinAmount(signedPsbtInputBreakdown.recipientBtc)} BTC`
                          : '-'}
                      </Text>
                    </View>
                    <View style={styles.feeInfoLine}>
                      <Text style={styles.feeInfoLabel}>Taxa</Text>
                      <Text style={styles.feeInfoValue}>
                        {signedPsbtInputBreakdown
                          ? `${formatBitcoinAmount(signedPsbtInputBreakdown.feeBtc)} BTC`
                          : '-'}
                      </Text>
                    </View>
                    {signedPsbtInputBreakdown?.feeRate ? (
                      <Text style={styles.feeInfoMeta}>
                        {signedPsbtInputBreakdown.feeRate.toFixed(1)} sat/vB | {' '}
                        {signedPsbtInputBreakdown.virtualSize ?? 0} vB
                      </Text>
                    ) : null}
                    {signedPsbtInputBreakdown?.changeBtc > 0 ? (
                      <Text style={styles.feeInfoMeta}>
                        Troco: {formatBitcoinAmount(signedPsbtInputBreakdown.changeBtc)} BTC
                      </Text>
                    ) : null}
                  </View>
                ) : signedPsbtInput.trim() ? (
                  <Text style={[styles.sendErrorText, { marginTop: 12 }]}>
                    PSBT assinada invalida. Verifique o conteudo informado.
                  </Text>
                ) : (
                  <Text style={[styles.modalHint, { marginTop: 12 }]}>
                    Escaneie ou cole a PSBT assinada para validar e transmitir.
                  </Text>
                )}
                {broadcastStatus?.message ? (
                  <Text
                    style={
                      broadcastStatus.type === 'error' ? styles.sendErrorText : styles.sendSuccessText
                    }
                  >
                    {broadcastStatus.message}
                  </Text>
                ) : null}
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[
                    styles.modalPrimaryButton,
                    broadcastingPsbt || !signedPsbtInputSummary
                      ? styles.modalPrimaryButtonDisabled
                      : null,
                  ]}
                  onPress={handleBroadcastPsbt}
                  disabled={broadcastingPsbt || !signedPsbtInputSummary}
                >
                  <Text style={styles.modalPrimaryButtonText}>
                    {broadcastingPsbt ? 'Transmitindo...' : 'Importar e transmitir'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.modalClose}
                  onPress={() => {
                    setPsbtDraft(null);
                    setPsbtStatus(null);
                    setSignedPsbtInput('');
                    setBroadcastStatus(null);
                    setBroadcastingPsbt(false);
                    setPendingPsbtSat(0);
                  }}
                >
                  <Text style={styles.modalCloseText}>Gerar outra PSBT</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.modalClose}
                  onPress={handleClosePsbtModal}
                >
                  <Text style={styles.modalCloseText}>Fechar</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                {psbtStatus?.message ? (
                  <Text
                    style={
                      psbtStatus.type === 'error' ? styles.sendErrorText : styles.sendSuccessText
                    }
                  >
                    {psbtStatus.message}
                  </Text>
                ) : null}
                <View style={[styles.sendModalOptions, { marginTop: 12 }]}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={styles.modalOptionButton}
                    onPress={() => handleScanQrCode('psbtRecipient')}
                  >
                    <Feather name="camera" size={18} color={colors.primaryText} />
                    <Text style={styles.modalOptionButtonText}>Ler QR Code</Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  value={psbtAddress}
                  onChangeText={(value) => {
                    setPsbtAddress(value);
                    setPsbtStatus(null);
                  }}
                  placeholder="Endereco do destinatario"
                  placeholderTextColor={colors.mutedForeground}
                  style={styles.modalInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TextInput
                  value={psbtAmount}
                  onChangeText={(value) => {
                    setPsbtAmount(value);
                    setPsbtStatus(null);
                    setPsbtPercentage(null);
                  }}
                  placeholder="Quantidade de BTC"
                  placeholderTextColor={colors.mutedForeground}
                  style={styles.modalInput}
                  keyboardType="decimal-pad"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <View style={styles.percentageRow}>
                  {percentageOptions.map((option) => {
                    const isActive = psbtPercentage === option.value;
                    const isDisabled = !balance || balance <= 0;
                    return (
                      <TouchableOpacity
                        key={`psbt-${option.label}`}
                        activeOpacity={0.85}
                        disabled={isDisabled}
                        style={[
                          styles.percentageButton,
                          isActive ? styles.percentageButtonActive : null,
                          isDisabled ? styles.percentageButtonDisabled : null,
                        ]}
                        onPress={() => handleSelectPsbtPercentage(option.value)}
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
                <View style={styles.feeOptionsRow}>
                  {feeOptions.map((option) => {
                    const isActive = option.key === feeProfile;
                    return (
                      <TouchableOpacity
                        key={option.key}
                        activeOpacity={0.85}
                        disabled={feeUpdating}
                        style={[
                          styles.feeOptionButton,
                          isActive ? styles.feeOptionButtonActive : null,
                          feeUpdating ? styles.modalPrimaryButtonDisabled : null,
                        ]}
                        onPress={() => handleSelectFeeProfile(option.key)}
                      >
                        <Text
                          style={[
                            styles.feeOptionText,
                            isActive ? styles.feeOptionTextActive : null,
                          ]}
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
                      ? `${feeRate.toFixed(0)} sat/vB (estimativa)`
                      : 'Taxa indisponivel'}
                  </Text>
                  <View style={styles.feeInfoLine}>
                    <Text style={styles.feeInfoLabel}>Total com taxa</Text>
                    <Text style={styles.feeInfoValue}>
                      {parsedPsbtAmount > 0 || estimatedFeeBtc > 0
                        ? `${formatBitcoinAmount(psbtEstimatedTotalBtc)} BTC`
                        : '-'}
                    </Text>
                  </View>
                  {btcPriceUsd && (parsedPsbtAmount > 0 || estimatedFeeBtc > 0) ? (
                    <Text style={styles.feeInfoSecondary}>
                      ~ ${psbtEstimatedTotalUsd?.toFixed(2) ?? '0.00'} USD
                    </Text>
                  ) : null}
                </View>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[
                    styles.modalPrimaryButton,
                    creatingPsbt || feeUpdating || !feeRate ? styles.modalPrimaryButtonDisabled : null,
                  ]}
                  onPress={handleCreatePsbt}
                  disabled={creatingPsbt || feeUpdating || !feeRate}
                >
                  <Text style={styles.modalPrimaryButtonText}>
                    {creatingPsbt ? 'Gerando...' : 'Gerar PSBT'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.modalClose}
                  onPress={handleClosePsbtModal}
                >
                  <Text style={styles.modalCloseText}>Cancelar</Text>
                </TouchableOpacity>
              </>
            )}
            </ScrollView>
          </View>
        </View>
      </Modal>
      <Modal
        visible={signModalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCloseSignModal}
      >
        <View style={styles.modalBackdrop}>
          <Animated.View
            style={[styles.modalCard, { transform: signModalPosition.getTranslateTransform() }]}
          >
            <View
              style={styles.modalDragHandleContainer}
              {...signModalPanResponder.panHandlers}
            >
              <View style={styles.modalDragHandle} />
            </View>
            <ScrollView
              style={styles.signModalScroll}
              contentContainerStyle={styles.signModalContent}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.modalTitle}>Assinar PSBT</Text>
              {isScanning && scanMode === 'psbt' ? (
              <>
                {CameraComponent && cameraComponentProps ? (
                  <>
                    <View style={styles.qrScannerContainer}>
                      <CameraComponent {...cameraComponentProps} />
                    </View>
                    <Text style={styles.qrScannerHint}>Aponte para o QR Code da PSBT</Text>
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
            ) : signingPsbt ? (
              <View style={styles.signingStateContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.signingStateText}>Assinando PSBT. Aguarde alguns instantes...</Text>
              </View>
            ) : signedPsbt ? (
              <>
                {signStatus?.message ? (
                  <Text
                    style={
                      signStatus.type === 'error' ? styles.sendErrorText : styles.sendSuccessText
                    }
                  >
                    {signStatus.message}
                  </Text>
                ) : null}
                <View style={[styles.feeInfo, { marginTop: 12 }]}>
                  <View style={styles.feeInfoLine}>
                    <Text style={styles.feeInfoLabel}>Valor</Text>
                    <Text style={styles.feeInfoValue}>
                      {signedPsbtBreakdown
                        ? `${formatBitcoinAmount(signedPsbtBreakdown.recipientBtc)} BTC`
                        : '-'}
                    </Text>
                  </View>
                  <View style={styles.feeInfoLine}>
                    <Text style={styles.feeInfoLabel}>Taxa</Text>
                    <Text style={styles.feeInfoValue}>
                      {signedPsbtBreakdown
                        ? `${formatBitcoinAmount(signedPsbtBreakdown.feeBtc)} BTC`
                        : '-'}
                    </Text>
                  </View>
                  {signedPsbtBreakdown?.feeRate ? (
                    <Text style={styles.feeInfoMeta}>
                      {signedPsbtBreakdown.feeRate.toFixed(1)} sat/vB | {' '}
                      {signedPsbtBreakdown.virtualSize ?? 0} vB
                    </Text>
                  ) : null}
                  {signedPsbtBreakdown?.changeBtc > 0 ? (
                    <Text style={styles.feeInfoMeta}>
                      Troco: {formatBitcoinAmount(signedPsbtBreakdown.changeBtc)} BTC
                    </Text>
                  ) : null}
                </View>
                {signedPsbtQrUri ? (
                  <Image
                    source={{ uri: signedPsbtQrUri }}
                    style={[styles.receiveModalQr, { marginTop: 12 }]}
                    resizeMode="contain"
                  />
                ) : (
                  <Text style={[styles.modalHint, { marginTop: 12 }]}>
                    QR Code indisponivel. Copie a PSBT assinada para transferir manualmente.
                  </Text>
                )}
                <Text style={[styles.modalHint, { marginTop: 12 }]}>
                  Escaneie este QR com o dispositivo online protegido para importar a PSBT assinada.
                </Text>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.modalPrimaryButton}
                  onPress={handleCopySignedPsbt}
                >
                  <Text style={styles.modalPrimaryButtonText}>Copiar PSBT assinada</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.modalClose}
                  onPress={() => {
                    setSignedPsbt(null);
                    setSignStatus(null);
                  }}
                >
                  <Text style={styles.modalCloseText}>Assinar outra PSBT</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.modalClose}
                  onPress={handleCloseSignModal}
                >
                  <Text style={styles.modalCloseText}>Fechar</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                {signStatus?.message ? (
                  <Text
                    style={
                      signStatus.type === 'error' ? styles.sendErrorText : styles.sendSuccessText
                    }
                  >
                    {signStatus.message}
                  </Text>
                ) : null}
                <View style={styles.sendModalOptions}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={styles.modalOptionButton}
                    onPress={() => handleScanQrCode('psbt')}
                  >
                    <Feather name="camera" size={18} color={colors.primaryText} />
                    <Text style={styles.modalOptionButtonText}>Ler QR Code</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={styles.modalOptionButton}
                    onPress={handlePastePsbtFromClipboard}
                  >
                    <Feather name="clipboard" size={18} color={colors.primaryText} />
                    <Text style={styles.modalOptionButtonText}>Colar</Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  value={psbtToSign}
                  onChangeText={(value) => {
                    setPsbtToSign(value);
                    setSignStatus(null);
                    setSignedPsbt(null);
                  }}
                  placeholder="Cole a PSBT em formato Base64"
                  placeholderTextColor={colors.mutedForeground}
                  style={[styles.modalInput, { height: 120, textAlignVertical: 'top' }]}
                  autoCapitalize="none"
                  autoCorrect={false}
                  multiline
                />
                {psbtToSignSummary ? (
                  <View style={[styles.feeInfo, { marginTop: 12 }]}>
                    <View style={styles.feeInfoLine}>
                      <Text style={styles.feeInfoLabel}>Valor</Text>
                      <Text style={styles.feeInfoValue}>
                        {psbtToSignBreakdown
                          ? `${formatBitcoinAmount(psbtToSignBreakdown.recipientBtc)} BTC`
                          : '-'}
                      </Text>
                    </View>
                    <View style={styles.feeInfoLine}>
                      <Text style={styles.feeInfoLabel}>Taxa</Text>
                      <Text style={styles.feeInfoValue}>
                        {psbtToSignBreakdown
                          ? `${formatBitcoinAmount(psbtToSignBreakdown.feeBtc)} BTC`
                          : '-'}
                      </Text>
                    </View>
                    {psbtToSignBreakdown?.feeRate ? (
                      <Text style={styles.feeInfoMeta}>
                        {psbtToSignBreakdown.feeRate.toFixed(1)} sat/vB | {' '}
                        {psbtToSignBreakdown.virtualSize ?? 0} vB
                      </Text>
                    ) : null}
                    {psbtToSignBreakdown?.changeBtc > 0 ? (
                      <Text style={styles.feeInfoMeta}>
                        Troco: {formatBitcoinAmount(psbtToSignBreakdown.changeBtc)} BTC
                      </Text>
                    ) : null}
                    <Text style={styles.feeInfoMeta}>
                      Entradas: {psbtToSignSummary.inputs.length} | Saidas:{' '}
                      {psbtToSignSummary.outputs.length}
                    </Text>
                  </View>
                ) : (
                  <Text style={[styles.modalHint, { marginTop: 12 }]}>
                    Cole ou leia o QR Code da PSBT para visualizar o resumo.
                  </Text>
                )}
                {psbtToSign?.trim() && !psbtToSignSummary ? (
                  <Text style={[styles.sendErrorText, { marginTop: 12 }]}>
                    PSBT invalida. Verifique o conteudo informado.
                  </Text>
                ) : null}
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[
                    styles.modalPrimaryButton,
                    signingPsbt || !psbtToSignSummary ? styles.modalPrimaryButtonDisabled : null,
                  ]}
                  onPress={handleSignPsbt}
                  disabled={signingPsbt || !psbtToSignSummary}
                >
                  <View style={styles.modalPrimaryButtonContent}>
                    {signingPsbt ? (
                      <>
                        <ActivityIndicator size="small" color={colors.primaryText} />
                        <Text style={styles.modalPrimaryButtonText}>Assinando...</Text>
                      </>
                    ) : (
                      <Text style={styles.modalPrimaryButtonText}>Assinar PSBT</Text>
                    )}
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.modalClose}
                  onPress={handleCloseSignModal}
                >
                  <Text style={styles.modalCloseText}>Cancelar</Text>
                </TouchableOpacity>
              </>
            )}
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
      <Modal
        visible={sendModalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCloseSendModal}
      >
        <View style={styles.modalBackdrop}>
          <Animated.View
            style={[
              styles.modalCard,
              { transform: sendModalPosition.getTranslateTransform() },
            ]}
          >
            <View
              style={styles.modalDragHandleContainer}
              {...sendModalPanResponder.panHandlers}
            >
              <View style={styles.modalDragHandle} />
            </View>
            <Text style={styles.modalTitle}>Enviar BTC</Text>
            <ScrollView
              style={styles.sendModalScroll}
              contentContainerStyle={styles.sendModalContent}
              showsVerticalScrollIndicator={false}
            >
              {isScanning && scanMode === 'send' ? (
                <>
                {CameraComponent && cameraComponentProps ? (
                  <>
                    <View style={styles.qrScannerContainer}>
                      <CameraComponent {...cameraComponentProps} />
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
                    onPress={() => handleScanQrCode('send')}
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
                <Text style={styles.modalDividerText}>Quantidade de BTC</Text>
                <TextInput
                  value={sendAmount}
                  onChangeText={(value) => {
                    setSendAmount(value);
                    setSendPercentage(null);
                    setSendStatus(null);
                  }}
                  placeholder="0.0"
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
            </ScrollView>
          </Animated.View>
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








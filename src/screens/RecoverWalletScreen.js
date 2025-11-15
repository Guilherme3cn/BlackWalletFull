import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import {
  DEFAULT_ADDRESS_TYPE,
  deriveAccountKeysFromSeed,
  deriveAddressDetails,
  normalizeAccountXpubInput,
  parseSeedPhrase,
  validateSeedPhrase,
} from '../utils/crypto';
import { recoverStyles as styles } from '../styles/recoverStyles';
import { WALLET_MODE_LABELS, WALLET_MODES } from '../constants/walletModes';

const PASSWORD_KEY = 'wallet-password';
const WALLET_DATA_KEY = 'bitcoin-wallet-data';

const modeOptions = [
  {
    key: WALLET_MODES.FULL,
    description: 'Seed neste aparelho; pode montar e assinar transacoes.',
  },
  {
    key: WALLET_MODES.ONLINE_PROTECTED,
    description: 'Perfeito para o celular online: usa apenas xpub, sem armazenar a seed.',
  },
  {
    key: WALLET_MODES.OFFLINE_PROTECTED,
    description: 'Pensado para o celular offline: seed local apenas para assinaturas.',
  },
];

const sanitizeFingerprint = (value = '') => value.trim().replace(/^0x/i, '').toLowerCase();

const RecoverWalletScreen = ({ navigation }) => {
  const [mode, setMode] = useState(WALLET_MODES.FULL);
  const [seedPhraseText, setSeedPhraseText] = useState('');
  const [accountXpub, setAccountXpub] = useState('');
  const [masterFingerprint, setMasterFingerprint] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const requiresSeed = useMemo(
    () => mode === WALLET_MODES.FULL || mode === WALLET_MODES.OFFLINE_PROTECTED,
    [mode],
  );
  const requiresXpub = useMemo(() => mode === WALLET_MODES.ONLINE_PROTECTED, [mode]);

  const handleRecoverWallet = async () => {
    if (isSubmitting) {
      return;
    }

    let seedWords = [];
    if (requiresSeed) {
      seedWords = parseSeedPhrase(seedPhraseText);

      if (!seedWords.length) {
        Alert.alert('Frase semente vazia', 'Insira a frase semente completa para recuperar a carteira.');
        return;
      }

      if (!validateSeedPhrase(seedWords)) {
        Alert.alert(
          'Frase invalida',
          'A frase semente informada nao parece valida. Verifique se todas as palavras estao corretas.',
        );
        return;
      }
    }

    let normalizedXpub = '';
    if (requiresXpub) {
      try {
        normalizedXpub = normalizeAccountXpubInput(accountXpub, { type: DEFAULT_ADDRESS_TYPE });
        setAccountXpub(normalizedXpub);
      } catch (error) {
        Alert.alert('xpub invalido', error.message || 'Verifique o valor informado.');
        return;
      }

      if (!normalizedXpub) {
        Alert.alert('xpub ausente', 'Informe o xpub (ou descriptor publico) para operar no modo online protegido.');
        return;
      }
    }

    if (password.length < 8) {
      Alert.alert('Senha fraca', 'Defina uma senha com pelo menos 8 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Erro', 'As senhas informadas nao sao iguais.');
      return;
    }

    try {
      setIsSubmitting(true);
      await new Promise((resolve) => setTimeout(resolve, 0));

      let recoveredWallet = {
        mode,
        addressType: DEFAULT_ADDRESS_TYPE,
        seedPhrase: requiresSeed ? seedWords : [],
        accountXpub: undefined,
        masterFingerprint: undefined,
        accountPath: undefined,
        receivingIndex: 1,
        changeIndex: 0,
        receivingAddresses: [],
        changeAddresses: [],
        discoveryComplete: false,
      };

      if (requiresXpub) {
        const receivingDetails = deriveAddressDetails(null, {
          type: DEFAULT_ADDRESS_TYPE,
          change: false,
          index: 0,
          accountXpub: normalizedXpub,
        });

        if (!receivingDetails?.address) {
          throw new Error('Falha ao derivar endereco inicial a partir do xpub informado.');
        }

        recoveredWallet.accountXpub = normalizedXpub;
        recoveredWallet.accountPath = receivingDetails.accountPath;
        recoveredWallet.masterFingerprint = sanitizeFingerprint(masterFingerprint) || undefined;
        recoveredWallet.receivingAddresses = [
          {
            address: receivingDetails.address,
            index: 0,
            type: DEFAULT_ADDRESS_TYPE,
            change: false,
            used: false,
          },
        ];
      } else {
        const receivingDetails = deriveAddressDetails(seedWords, {
          type: DEFAULT_ADDRESS_TYPE,
          change: false,
          index: 0,
        });

        if (!receivingDetails?.address) {
          throw new Error('Falha ao derivar endereco inicial da carteira.');
        }

        const accountKeys = deriveAccountKeysFromSeed(seedWords, { type: DEFAULT_ADDRESS_TYPE });

        recoveredWallet.accountXpub = accountKeys.accountXpub;
        recoveredWallet.masterFingerprint = accountKeys.masterFingerprint;
        recoveredWallet.accountPath = accountKeys.accountPath;
        recoveredWallet.receivingAddresses = [
          {
            address: receivingDetails.address,
            index: 0,
            type: DEFAULT_ADDRESS_TYPE,
            change: false,
            used: false,
          },
        ];
      }

      await AsyncStorage.setItem(WALLET_DATA_KEY, JSON.stringify(recoveredWallet));
      await AsyncStorage.setItem(PASSWORD_KEY, password);

      Alert.alert('Carteira recuperada', 'Sua carteira foi restaurada com sucesso.');

      navigation.reset({
        index: 0,
        routes: [{ name: 'Home' }],
      });
    } catch (error) {
      console.error('Erro ao recuperar carteira', error);
      Alert.alert('Erro', 'Nao foi possivel recuperar a carteira. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'bottom', 'left']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboard}
        contentContainerStyle={styles.container}
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Recuperar carteira</Text>
            <Text style={styles.subtitle}>
              Escolha como deseja operar e informe os dados necessarios para restaurar a carteira.
            </Text>
          </View>

          <View style={styles.form}>
            <View style={styles.modeSection}>
              <Text style={styles.label}>Modo de operacao</Text>
              <View style={styles.modeButtonsRow}>
                {modeOptions.map((option) => {
                  const active = mode === option.key;
                  return (
                    <TouchableOpacity
                      key={option.key}
                      activeOpacity={0.85}
                      style={[styles.modeButton, active ? styles.modeButtonActive : null]}
                      onPress={() => setMode(option.key)}
                    >
                      <Text style={[styles.modeButtonText, active ? styles.modeButtonTextActive : null]}>
                        {WALLET_MODE_LABELS[option.key]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.modeDescription}>
                {modeOptions.find((option) => option.key === mode)?.description}
              </Text>
            </View>

            {requiresSeed ? (
              <>
                <Text style={styles.label}>Frase semente</Text>
                <TextInput
                  style={[styles.input, styles.seedInput]}
                  multiline
                  numberOfLines={4}
                  placeholder="Digite ou cole suas 12 ou 24 palavras..."
                  placeholderTextColor={colors.mutedForeground}
                  value={seedPhraseText}
                  onChangeText={setSeedPhraseText}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </>
            ) : null}

            {requiresXpub ? (
              <>
                <Text style={styles.label}>xpub (ou descriptor publico)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Informe o xpub correspondente"
                  placeholderTextColor={colors.mutedForeground}
                  value={accountXpub}
                  onChangeText={setAccountXpub}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Text style={styles.label}>Fingerprint (opcional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ex.: f23a9c1b"
                  placeholderTextColor={colors.mutedForeground}
                  value={masterFingerprint}
                  onChangeText={setMasterFingerprint}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </>
            ) : null}

            <Text style={styles.label}>Nova senha</Text>
            <TextInput
              style={styles.input}
              placeholder="Digite uma nova senha"
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />

            <Text style={styles.label}>Confirmar senha</Text>
            <TextInput
              style={styles.input}
              placeholder="Confirme sua nova senha"
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />

            <TouchableOpacity
              style={[styles.primaryButton, isSubmitting && styles.disabledButton]}
              onPress={handleRecoverWallet}
              disabled={isSubmitting}
            >
              <View style={styles.buttonContent}>
                {isSubmitting ? (
                  <>
                    <ActivityIndicator size="small" color={colors.primaryText} />
                    <Text style={styles.primaryButtonText}>Recuperando...</Text>
                  </>
                ) : (
                  <Text style={styles.primaryButtonText}>Recuperar carteira</Text>
                )}
              </View>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.8} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Voltar para login</Text>
            </TouchableOpacity>
          </View>
        </View>
        {isSubmitting ? (
          <View style={styles.loadingOverlay}>
            <View style={styles.loadingOverlayCard}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingOverlayText}>Recuperando carteira...</Text>
            </View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
};

export default RecoverWalletScreen;

import React, { useState } from 'react';
import { Alert, Text, TextInput, TouchableOpacity, View, KeyboardAvoidingView, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../theme/colors';
import { signStyles as styles } from '../../styles/signStyles';
import {
  DEFAULT_ADDRESS_TYPE,
  deriveAccountKeysFromSeed,
  deriveAddressDetails,
  generateSeedPhrase,
} from '../../utils/crypto';
import { WALLET_MODE_LABELS, WALLET_MODES } from '../../constants/walletModes';

const PASSWORD_KEY = 'wallet-password';
const WALLET_DATA_KEY = 'bitcoin-wallet-data';

const creationModes = [
  {
    key: WALLET_MODES.FULL,
    description: 'Seed e xpub permanecem neste aparelho (modo completo).',
  },
  {
    key: WALLET_MODES.OFFLINE_PROTECTED,
    description: 'Seed apenas para assinar offline; evite conectar este dispositivo.',
  },
];

const SignScreen = ({ navigation }) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [mode, setMode] = useState(WALLET_MODES.FULL);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreatePassword = async () => {
    if (isSubmitting) {
      return;
    }

    if (password.length < 8) {
      Alert.alert('Senha fraca', 'Use pelo menos 8 caracteres para proteger sua carteira.');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Erro', 'As senhas informadas nao sao iguais.');
      return;
    }

    try {
      setIsSubmitting(true);

      const seedPhrase = generateSeedPhrase();
      const receivingDetails = deriveAddressDetails(seedPhrase, {
        type: DEFAULT_ADDRESS_TYPE,
        change: false,
        index: 0,
      });

      if (!receivingDetails?.address) {
        throw new Error('Falha ao derivar endereco inicial.');
      }

      const accountKeys = deriveAccountKeysFromSeed(seedPhrase, { type: DEFAULT_ADDRESS_TYPE });

      const walletData = {
        mode,
        seedPhrase,
        accountXpub: accountKeys.accountXpub,
        masterFingerprint: accountKeys.masterFingerprint,
        accountPath: accountKeys.accountPath,
        addressType: DEFAULT_ADDRESS_TYPE,
        receivingIndex: 1,
        changeIndex: 0,
        receivingAddresses: [
          {
            address: receivingDetails.address,
            index: 0,
            type: DEFAULT_ADDRESS_TYPE,
            change: false,
            used: false,
          },
        ],
        changeAddresses: [],
        discoveryComplete: false,
      };

      await AsyncStorage.setItem(WALLET_DATA_KEY, JSON.stringify(walletData));
      await AsyncStorage.setItem(PASSWORD_KEY, password);

      Alert.alert('Tudo pronto!', 'Carteira criada com sucesso.');
      navigation.reset({
        index: 0,
        routes: [{ name: 'Home' }],
      });
    } catch (error) {
      console.error('Erro ao configurar carteira inicial', error);
      Alert.alert('Erro', 'Nao foi possivel criar a carteira. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'bottom', 'left']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboard}
        contentContainerStyle={styles.container}
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Criar Senha</Text>
            <Text style={styles.subtitle}>Defina uma senha forte para proteger sua frase semente.</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.modeSection}>
              <Text style={styles.label}>Modo de operacao</Text>
              <View style={styles.modeButtonsRow}>
                {creationModes.map((option) => {
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
                {creationModes.find((option) => option.key === mode)?.description}
              </Text>
            </View>

            <Text style={styles.label}>Senha</Text>
            <TextInput
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              placeholder="Digite sua senha"
              placeholderTextColor={colors.mutedForeground}
              style={styles.input}
            />

            <Text style={styles.label}>Confirmar senha</Text>
            <TextInput
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Confirme sua senha"
              placeholderTextColor={colors.mutedForeground}
              style={styles.input}
            />

            <TouchableOpacity
              style={[styles.primaryButton, isSubmitting && styles.disabled]}
              onPress={handleCreatePassword}
              activeOpacity={0.8}
              disabled={isSubmitting}
            >
              <Text style={styles.primaryButtonText}>{isSubmitting ? 'Criando...' : 'Criar carteira'}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={() => navigation.replace('Login')} activeOpacity={0.8}>
            <Text style={styles.link}>Ja tem senha? Fazer login</Text>
          </TouchableOpacity>

          <Text style={styles.helperText}>
            Lembre-se: a senha nao pode ser recuperada. Anote e guarde com seguranca.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default SignScreen;



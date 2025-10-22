import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { DEFAULT_ADDRESS_TYPE, deriveAddressDetails, parseSeedPhrase, validateSeedPhrase } from '../utils/crypto';
import { recoverStyles as styles } from '../styles/recoverStyles';

const PASSWORD_KEY = 'wallet-password';
const WALLET_DATA_KEY = 'bitcoin-wallet-data';

const RecoverWalletScreen = ({ navigation }) => {
  const [seedPhraseText, setSeedPhraseText] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRecoverWallet = async () => {
    if (isSubmitting) {
      return;
    }

    const words = parseSeedPhrase(seedPhraseText);

    if (!words.length) {
      Alert.alert('Frase semente vazia', 'Insira a frase semente completa para recuperar a carteira.');
      return;
    }

    if (!validateSeedPhrase(words)) {
      Alert.alert(
        'Frase inválida',
        'A frase semente informada não é válida. Verifique se todas as palavras estão corretas.',
      );
      return;
    }

    if (password.length < 8) {
      Alert.alert('Senha fraca', 'Defina uma nova senha com pelo menos 8 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Erro', 'As senhas informadas não são iguais.');
      return;
    }

    try {
      setIsSubmitting(true);

      const receivingDetails = deriveAddressDetails(words, {
        type: DEFAULT_ADDRESS_TYPE,
        change: false,
        index: 0,
      });

      if (!receivingDetails?.address) {
        throw new Error('Falha ao derivar endereco inicial da carteira.');
      }

      const recoveredWallet = {
        seedPhrase: words,
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

      await AsyncStorage.setItem(WALLET_DATA_KEY, JSON.stringify(recoveredWallet));

      await AsyncStorage.setItem(PASSWORD_KEY, password);

      Alert.alert('Carteira recuperada', 'Sua carteira foi restaurada com sucesso.');

      navigation.reset({
        index: 0,
        routes: [{ name: 'Home' }],
      });
    } catch (error) {
      console.error('Erro ao recuperar carteira', error);
      Alert.alert('Erro', 'Não foi possível recuperar a carteira. Tente novamente.');
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
            <Text style={styles.title}>Recuperar Carteira</Text>
            <Text style={styles.subtitle}>
              Informe sua frase semente e defina uma nova senha para acessar a carteira existente.
            </Text>
          </View>

          <View style={styles.form}>
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
              <Text style={styles.primaryButtonText}>
                {isSubmitting ? 'Recuperando...' : 'Recuperar carteira'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.8} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Voltar para login</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default RecoverWalletScreen;


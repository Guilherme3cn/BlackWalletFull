import React, { useEffect, useState } from 'react';
import { Alert, Image, Text, TextInput, TouchableOpacity, View, KeyboardAvoidingView, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { loginStyles as styles } from '../styles/loginStyles';

const PASSWORD_KEY = 'wallet-password';

const LoginScreen = ({ navigation }) => {
  const [password, setPassword] = useState('');
  const [storedPassword, setStoredPassword] = useState(null);
  const [hasPassword, setHasPassword] = useState(false);

  useEffect(() => {
    const loadPassword = async () => {
      const savedPassword = await AsyncStorage.getItem(PASSWORD_KEY);
      setStoredPassword(savedPassword);
      setHasPassword(Boolean(savedPassword));
    };

    loadPassword();
  }, []);

  const handleLogin = async () => {
    if (!hasPassword) {
      Alert.alert('Nenhuma senha encontrada', 'Crie uma senha ou recupere uma carteira existente.');
      return;
    }

    if (!password) {
      Alert.alert('Senha invalida', 'Por favor, digite sua senha.');
      return;
    }

    const savedPassword = storedPassword ?? (await AsyncStorage.getItem(PASSWORD_KEY));

    if (password === savedPassword) {
      await AsyncStorage.setItem(PASSWORD_KEY, password);
      Alert.alert('Bem-vindo', 'Login realizado com sucesso!');
      navigation.reset({
        index: 0,
        routes: [{ name: 'Home' }],
      });
    } else {
      Alert.alert('Senha incorreta', 'A senha informada nao confere.');
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
        <Image source={require('../../assets/images/logo.png')} style={styles.logo} />
        <View style={styles.header}>
          <Text style={styles.title}>Bitcoin Wallet</Text>
          <Text style={styles.subtitle}>Digite sua senha para acessar sua carteira fria.</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Senha</Text>
          <TextInput
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            placeholder="Digite sua senha"
            placeholderTextColor={colors.mutedForeground}
            style={styles.input}
            returnKeyType="done"
            onSubmitEditing={handleLogin}
          />

          <TouchableOpacity style={styles.primaryButton} onPress={handleLogin} activeOpacity={0.8}>
            <Text style={styles.primaryButtonText}>Acessar Carteira</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => navigation.replace('Sign')} activeOpacity={0.8}>
          <Text style={styles.link}>Ainda nao tem senha? Criar senha</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('Recover')} activeOpacity={0.8}>
          <Text style={styles.link}>Usar frase semente de uma carteira existente</Text>
        </TouchableOpacity>

        <Text style={styles.helperText}>
          {hasPassword
            ? 'Sua senha e armazenada somente neste dispositivo e protege o acesso a frase semente.'
            : 'Nenhuma senha cadastrada ainda. Crie uma nova senha ou recupere uma carteira existente.'}
        </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default LoginScreen;


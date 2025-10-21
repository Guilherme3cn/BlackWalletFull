import React, { useState } from 'react';
import { Alert, Text, TextInput, TouchableOpacity, View, KeyboardAvoidingView, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../theme/colors';
import { signStyles as styles } from '../../styles/signStyles';

const PASSWORD_KEY = 'wallet-password';

const SignScreen = ({ navigation }) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleCreatePassword = async () => {
    if (password.length < 8) {
      Alert.alert('Senha fraca', 'Use pelo menos 8 caracteres para proteger sua carteira.');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Erro', 'As senhas informadas nao sao iguais.');
      return;
    }

    await AsyncStorage.setItem(PASSWORD_KEY, password);
    Alert.alert('Tudo pronto!', 'Senha criada com sucesso. Bem-vindo a sua carteira.');
    navigation.reset({
      index: 0,
      routes: [{ name: 'Home' }],
    });
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

            <TouchableOpacity style={styles.primaryButton} onPress={handleCreatePassword} activeOpacity={0.8}>
              <Text style={styles.primaryButtonText}>Criar senha</Text>
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



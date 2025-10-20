import React, { useState } from 'react';
import { Alert, Text, TextInput, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { signUpStyles as styles } from '../styles/signUpStyles';

const PASSWORD_KEY = 'wallet-password';

const SignUpScreen = ({ navigation }) => {
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
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
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

          <TouchableOpacity style={styles.primaryButton} onPress={handleCreatePassword}>
            <Text style={styles.primaryButtonText}>Criar senha</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => navigation.navigate('Login')}>
          <Text style={styles.link}>Ja tem senha? Fazer login</Text>
        </TouchableOpacity>

        <Text style={styles.helperText}>
          Lembre-se: a senha nao pode ser recuperada. Anote e guarde com seguranca.
        </Text>
      </View>
    </SafeAreaView>
  );
};

export default SignUpScreen;

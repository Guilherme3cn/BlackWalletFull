import React, { useEffect } from 'react';
import { Image, Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { splashStyles as styles } from '../styles/splashStyles';
import { SafeAreaView } from 'react-native-safe-area-context';

const PASSWORD_KEY = 'wallet-password';

const SplashScreen = ({ navigation }) => {
  useEffect(() => {
    const bootstrap = async () => {
      try {
        const password = await AsyncStorage.getItem(PASSWORD_KEY);
        const targetRoute = password ? 'Login' : 'Login';

        // Delay to display splash for at least 5 seconds
        setTimeout(() => {
          navigation.reset({
            index: 0,
            routes: [{ name: targetRoute }],
          });
        }, 5000);
      } catch (error) {
        console.error('Erro ao iniciar aplicativo', error);
        navigation.reset({
          index: 0,
          routes: [{ name: 'Login' }],
        });
      }
    };

    bootstrap();
  }, [navigation]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'right', 'bottom', 'left']}>
      <Image source={require('../../assets/images/logo.png')} style={styles.logo} />
      <Text style={styles.title}>BlackVault Wallet</Text>
      <Text style={styles.subtitle}>Protegendo sua chave privada de forma segura e offline.</Text>
    </SafeAreaView>
  );
};

export default SplashScreen;

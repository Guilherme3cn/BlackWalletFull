import 'react-native-gesture-handler';
import 'react-native-get-random-values';
import React, { useEffect } from 'react';
import { View, Keyboard, StatusBar as RNStatusBar, Platform } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import * as NavigationBar from 'expo-navigation-bar';
import LoginScreen from './src/screens/LoginScreen';
import SignScreen from './src/screens/sign/SignScreen';
import HomeScreen from './src/screens/HomeScreen';
import RecoverWalletScreen from './src/screens/RecoverWalletScreen';
import SplashScreen from './src/screens/SplashScreen';
import { colors } from './src/theme/colors';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const Stack = createNativeStackNavigator();

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background,
    card: colors.background,
    text: colors.foreground,
    border: colors.border,
    primary: colors.primary,
  },
};

export default function App() {
  useEffect(() => {
    Keyboard.dismiss();
    RNStatusBar.setHidden(true, 'fade');
    if (Platform.OS === 'android') {
      // Mantém a barra de navegação do Android com a mesma cor de fundo do app
      NavigationBar.setBackgroundColorAsync(colors.background).catch(() => {});
      NavigationBar.setButtonStyleAsync('light').catch(() => {});
    }
  }, []);

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <NavigationContainer theme={navigationTheme}>
          <StatusBar style="light" hidden backgroundColor={colors.background} />
          <Stack.Navigator
            initialRouteName="Splash"
            screenOptions={{
              headerShown: false,
              animation: 'fade',
              animationDuration: 550,
              animationTypeForReplace: 'push',
              contentStyle: { backgroundColor: colors.background },
            }}
          >
            <Stack.Screen name="Splash" component={SplashScreen} />
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Sign" component={SignScreen} />
            <Stack.Screen name="Recover" component={RecoverWalletScreen} />
            <Stack.Screen name="Home" component={HomeScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </View>
    </SafeAreaProvider>
  );
}

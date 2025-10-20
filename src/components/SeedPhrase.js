import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Share, Alert } from 'react-native';
import { seedPhraseStyles as styles } from '../styles/seedPhraseStyles';

const HIDDEN_WORD = '********';

const SeedPhrase = ({ words = [] }) => {
  const [isVisible, setIsVisible] = useState(false);

  const handleToggleVisibility = () => {
    setIsVisible((prev) => !prev);
  };

  const handleShareSeed = async () => {
    if (!words.length) {
      return;
    }

    try {
      await Share.share({
        message: words.join(' '),
        title: 'Frase Semente',
      });
    } catch (error) {
      Alert.alert('Erro ao compartilhar', 'Nao foi possivel compartilhar a frase semente.');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Frase de Recuperacao</Text>
          <Text style={styles.subtitle}>Guarde em um local seguro e offline</Text>
        </View>
        <View style={styles.actions}>
          <TouchableOpacity onPress={handleToggleVisibility} style={styles.iconButton}>
            <Text style={styles.iconText}>{isVisible ? 'OC' : 'VER'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleShareSeed} style={styles.iconButton}>
            <Text style={styles.iconText}>TXT</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.wordsBox}>
        {words.map((word, index) => (
          <View key={word + index} style={styles.wordCard}>
            <Text style={styles.wordIndex}>{index + 1}.</Text>
            <Text style={styles.wordText}>{isVisible ? word : HIDDEN_WORD}</Text>
          </View>
        ))}
      </View>

      {!isVisible ? (
        <Text style={styles.hint}>Toque no botao VER para revelar a frase semente completa.</Text>
      ) : null}
    </View>
  );
};

export default SeedPhrase;

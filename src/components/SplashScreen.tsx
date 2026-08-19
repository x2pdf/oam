import React from 'react';
import { View, Image, StyleSheet, StatusBar } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

interface Props {
  isDark?: boolean;
}

export default function SplashScreen({ isDark = false }: Props) {
  const theme = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.colors.background}
      />
      <Image
        source={require('../../assets/splash-icon.png')}
        style={styles.logo}
        resizeMode="contain"
      />
      <Text style={[styles.sloganMain, { color: theme.colors.primary }]}>OAM</Text>
      <Text style={[styles.sloganSub, { color: theme.colors.primary }]}>Onchain Forever</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 120,
    height: 120,
    marginBottom: 24,
  },
  sloganMain: {
    fontSize: 48,
    fontWeight: '700',
    letterSpacing: 2,
  },
  sloganSub: {
    fontSize: 20,
    marginTop: 8,
  },
});

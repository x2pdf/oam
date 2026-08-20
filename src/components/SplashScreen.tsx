import React from 'react';
import { View, StyleSheet, StatusBar } from 'react-native';
import { Text } from 'react-native-paper';

const SPLASH_BG = '#1DA1F2';
const SPLASH_TITLE = '#FFFFFF';
const SPLASH_SUBTITLE = 'rgba(255, 255, 255, 0.85)';

export default function SplashScreen() {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={SPLASH_BG} />
      <Text style={styles.sloganMain}>OAM</Text>
      <Text style={styles.sloganSub}>Onchain Forever</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SPLASH_BG,
  },
  sloganMain: {
    fontSize: 48,
    fontWeight: '700',
    letterSpacing: 2,
    color: SPLASH_TITLE,
  },
  sloganSub: {
    fontSize: 16,
    marginTop: 8,
    letterSpacing: 0.4,
    textAlign: 'center',
    paddingHorizontal: 24,
    color: SPLASH_SUBTITLE,
  },
});

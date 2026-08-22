import 'react-native-get-random-values';
import { subtle } from 'react-native-quick-crypto';
if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.subtle) {
  globalThis.crypto = { subtle };
}
import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);

import { Linking } from 'react-native';

export async function openUrl(href: string): Promise<void> {
  await Linking.openURL(href);
}

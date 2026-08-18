import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  Alert,
  Platform,
} from 'react-native';
import {
  Text,
  Button,
  useTheme,
  Card,
  IconButton,
  Portal,
  Dialog,
  TextInput as PaperTextInput,
  Snackbar,
} from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import * as SecureStore from 'expo-secure-store';
import { RootStackParamList } from '../types';
import { useAppContext } from '../context/AppContext';
import { getImagePickerAdapter } from '../adapter';
import { ContentItem, createJpegItem, createPngItem, createGifItem, payloadEncode } from '../mypayload';
import { OAMPClient } from '../oamp/client';
import { BLACK_HOLE } from '../oamp/protocol';
import { DEFAULT_RPC_NODE } from '../config/rpcConfig';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

interface ImageItem {
  uri: string;
  base64: string;
  name?: string;
  type: 'image/jpeg' | 'image/png' | 'image/gif';
}

export default function SendDataScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NavProp>();
  const { t } = useTranslation();
  const { state } = useAppContext();
  const { profile } = state;

  const [text, setText] = useState('');
  const [images, setImages] = useState<ImageItem[]>([]);
  const [recipientAddress, setRecipientAddress] = useState(BLACK_HOLE);

  const isSelf = useMemo(() => {
    if (!profile?.address || !recipientAddress) return false;
    return recipientAddress.toLowerCase() === profile.address.toLowerCase();
  }, [profile?.address, recipientAddress]);

  // Dialog states
  const [confirmSendVisible, setConfirmSendVisible] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [cancelConfirmVisible, setCancelConfirmVisible] = useState(false);
  const [password, setPassword] = useState('');
  const [imageNameDialogVisible, setImageNameDialogVisible] = useState(false);
  const [currentPickingImage, setCurrentPickingImage] = useState<ImageItem | null>(null);

  const [loading, setLoading] = useState(false);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  const pickImage = async () => {
    try {
      const adapter = getImagePickerAdapter();
      const result = await adapter.pickImage();

      if (result) {
        setCurrentPickingImage({
          uri: result.uri,
          base64: result.base64,
          name: result.name,
          type: result.type,
        });
        setImageNameDialogVisible(true);
      }
    } catch (error) {
      console.error('Pick image error:', error);
      setSnackbarMessage(t('send.pickImageFailed'));
      setSnackbarVisible(true);
    }
  };

  const handleImageNameConfirm = (attach: boolean) => {
    if (currentPickingImage) {
      const newImage = { ...currentPickingImage };
      if (!attach) {
        delete newImage.name;
      }
      setImages([...images, newImage]);
    }
    setImageNameDialogVisible(false);
    setCurrentPickingImage(null);
  };

  const removeImage = (index: number) => {
    const newImages = [...images];
    newImages.splice(index, 1);
    setImages(newImages);
  };

  const handleCancel = () => {
    if (text.length > 0 || images.length > 0) {
      setCancelConfirmVisible(true);
    } else {
      navigation.goBack();
    }
  };

  const confirmCancel = () => {
    setCancelConfirmVisible(false);
    setText('');
    setImages([]);
    navigation.goBack();
  };

  const handleSend = () => {
    setConfirmSendVisible(true);
  };

  const startPasswordInput = () => {
    setConfirmSendVisible(false);
    setPasswordVisible(true);
  };

  const executeSend = async () => {
    if (!password) {
      setSnackbarMessage(t('send.passwordLabel'));
      setSnackbarVisible(true);
      return;
    }

    setLoading(true);
    try {
      // 1. 获取私钥 (假设存储在 SecureStore 中，由之前的流程保存)
      const privateKey = await SecureStore.getItemAsync('user_wallet_private_key');
      if (!privateKey) {
        throw new Error(t('send.noPrivateKey'));
      }

      // 2. 初始化 OAMP 客户端
      const client = new OAMPClient(privateKey, DEFAULT_RPC_NODE);

      // 3. 构建 Payload
      const items: ContentItem[] = [];
      if (text) {
        items.push({ type: 'text', content: text });
      }
      for (const img of images) {
        if (img.type === 'image/png') {
          items.push(createPngItem(img.base64, img.name));
        } else if (img.type === 'image/gif') {
          items.push(createGifItem(img.base64, img.name));
        } else {
          items.push(createJpegItem(img.base64, img.name));
        }
      }

      // 4. 发送
      let txHash = '';
      const target = recipientAddress.trim() || BLACK_HOLE;

      if (isSelf) {
        // 加密发送，使用 sendPersonalNote 发给自己
        txHash = await client.sendPersonalNote(items);
      } else {
        if (target.toLowerCase() === BLACK_HOLE.toLowerCase()) {
          // 公开广播
          txHash = await client.sendBroadcast(items);
        } else {
          // 发送明文消息给特定地址
          txHash = await client.sendUnencryptedMessage(target, items);
        }
      }

      setLoading(false);
      setPasswordVisible(false);
      Alert.alert(t('send.sendSuccess'), t('send.txHash', { hash: txHash }), [
        { text: t('common.ok'), onPress: () => navigation.goBack() }
      ]);

      // 清空
      setText('');
      setImages([]);
    } catch (error: any) {
      console.error('Send error:', error);
      setLoading(false);
      setSnackbarMessage(t('send.sendFailed', { error: error.message }));
      setSnackbarVisible(true);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Card style={styles.inputCard}>
          <TextInput
            style={styles.textInput}
            multiline
            placeholder={t('send.inputPlaceholder')}
            value={text}
            onChangeText={setText}
            placeholderTextColor={theme.colors.onSurfaceVariant}
          />
        </Card>

        {images.map((img, index) => (
          <Card key={index} style={styles.imageListItem}>
            <View style={styles.imageCardContent}>
              <Image source={{ uri: img.uri }} style={styles.thumbnail} />
              <View style={styles.imageInfo}>
                <Text variant="bodySmall" numberOfLines={1}>
                  {img.name ? img.name : `数据摘要: ${img.base64.substring(0, 20)}...`}
                </Text>
              </View>
              <IconButton icon="close" size={20} onPress={() => removeImage(index)} />
            </View>
          </Card>
        ))}

        <TouchableOpacity style={styles.addImageButton} onPress={pickImage}>
          <Card style={styles.addImageCard}>
            <View style={styles.addImageContent}>
              <IconButton icon="image-plus" size={24} />
              <Text>{t('send.addImage')}</Text>
            </View>
          </Card>
        </TouchableOpacity>

        <Card style={styles.optionCard}>
          <Text style={styles.optionTitle}>接收地址</Text>
          <PaperTextInput
            mode="outlined"
            placeholder="0x..."
            value={recipientAddress}
            onChangeText={setRecipientAddress}
            style={styles.addressInput}
            dense
          />
          <View style={styles.shortcutRow}>
            <Button
              mode="outlined"
              compact
              onPress={() => setRecipientAddress(BLACK_HOLE)}
              style={styles.shortcutButton}
              labelStyle={{ fontSize: 12 }}
            >
              黑洞地址
            </Button>
            {profile?.address && (
              <Button
                mode="outlined"
                compact
                onPress={() => setRecipientAddress(profile.address)}
                style={styles.shortcutButton}
                labelStyle={{ fontSize: 12 }}
              >
                自己
              </Button>
            )}
          </View>
        </Card>

        <Button
          mode="contained"
          onPress={handleSend}
          style={styles.sendButton}
          contentStyle={styles.buttonContent}
        >
          {t('send.sendButton')}
        </Button>

        <Button
          mode="outlined"
          onPress={handleCancel}
          style={styles.cancelButton}
          contentStyle={styles.buttonContent}
        >
          {t('common.cancel')}
        </Button>
      </ScrollView>

      {/* Dialogs */}
      <Portal>
        {/* 图片名称确认 */}
        <Dialog visible={imageNameDialogVisible} onDismiss={() => setImageNameDialogVisible(false)}>
          <Dialog.Title>{t('send.imageNameDialogTitle')}</Dialog.Title>
          <Dialog.Content>
            <Text>{t('send.imageNameDialogMsg')}</Text>
            {currentPickingImage?.name && (
              <Text style={{ marginTop: 8, fontWeight: 'bold' }}>{currentPickingImage.name}</Text>
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => handleImageNameConfirm(false)}>{t('send.imageNameDialogNo')}</Button>
            <Button onPress={() => handleImageNameConfirm(true)}>{t('send.imageNameDialogYes')}</Button>
          </Dialog.Actions>
        </Dialog>

        {/* 发送法律确认 */}
        <Dialog visible={confirmSendVisible} onDismiss={() => setConfirmSendVisible(false)}>
          <Dialog.Title>{t('send.safetyTipTitle')}</Dialog.Title>
          <Dialog.Content>
            <Text>{t('send.safetyTipMsg')}</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmSendVisible(false)}>{t('common.cancel')}</Button>
            <Button onPress={startPasswordInput}>{t('wallet.verifyButtonConfirm')}</Button>
          </Dialog.Actions>
        </Dialog>

        {/* 支付密码输入 */}
        <Dialog visible={passwordVisible} onDismiss={() => !loading && setPasswordVisible(false)}>
          <Dialog.Title>{t('send.passwordTitle')}</Dialog.Title>
          <Dialog.Content>
            <PaperTextInput
              label={t('send.passwordLabel')}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              autoFocus
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button disabled={loading} onPress={() => setPasswordVisible(false)}>{t('common.cancel')}</Button>
            <Button loading={loading} disabled={loading} onPress={executeSend}>{t('common.ok')}</Button>
          </Dialog.Actions>
        </Dialog>

        {/* 取消确认 */}
        <Dialog visible={cancelConfirmVisible} onDismiss={() => setCancelConfirmVisible(false)}>
          <Dialog.Title>{t('send.confirmCancelTitle')}</Dialog.Title>
          <Dialog.Content>
            <Text>{t('send.confirmCancelMsg')}</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setCancelConfirmVisible(false)}>{t('send.continueEdit')}</Button>
            <Button onPress={confirmCancel}>{t('common.ok')}</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={3000}
      >
        {snackbarMessage}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    padding: 16,
  },
  inputCard: {
    minHeight: 150,
    maxHeight: 300,
    marginBottom: 16,
    padding: 8,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    textAlignVertical: 'top',
    color: '#000',
  },
  addImageButton: {
    marginBottom: 16,
  },
  addImageCard: {
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: '#ccc',
    backgroundColor: 'transparent',
    elevation: 0,
  },
  addImageContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  imageListItem: {
    marginBottom: 8,
  },
  imageCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  thumbnail: {
    width: 40,
    height: 40,
    borderRadius: 4,
  },
  imageInfo: {
    flex: 1,
    marginLeft: 12,
  },
  optionCard: {
    padding: 16,
    marginBottom: 16,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  addressInput: {
    marginBottom: 8,
    backgroundColor: '#fff',
  },
  shortcutRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  shortcutButton: {
    marginRight: 8,
    marginTop: 4,
  },
  sendButton: {
    marginTop: 8,
    marginBottom: 12,
  },
  cancelButton: {
    marginBottom: 24,
  },
  buttonContent: {
    height: 48,
  },
});

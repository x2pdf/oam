import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { ethers } from 'ethers';
import {
  getUnlockedWallet,
  isSessionUnlocked,
  lockSession,
  subscribeSession,
  unlockSession,
} from './session';

export function isMobilePlatform(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

/** Desktop (and any non-mobile) uses the strict leave-to-lock policy. */
export function isDesktopLockPolicy(): boolean {
  return !isMobilePlatform();
}

interface WalletSessionContextType {
  unlocked: boolean;
  unlock: (password: string) => Promise<void>;
  lock: () => void;
  getWallet: () => ethers.Wallet | null;
}

const WalletSessionContext = createContext<WalletSessionContextType | undefined>(
  undefined,
);

interface Props {
  children: ReactNode;
}

export const WalletSessionProvider: React.FC<Props> = ({ children }) => {
  const [unlocked, setUnlocked] = useState(isSessionUnlocked);

  useEffect(() => {
    return subscribeSession(() => {
      setUnlocked(isSessionUnlocked());
    });
  }, []);

  useEffect(() => {
    const onChange = (next: AppStateStatus) => {
      if (next === 'background') {
        lockSession();
      }
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, []);

  const unlock = useCallback(async (password: string) => {
    await unlockSession(password);
  }, []);

  const lock = useCallback(() => {
    lockSession();
  }, []);

  const getWallet = useCallback(() => getUnlockedWallet(), []);

  const value = useMemo<WalletSessionContextType>(
    () => ({ unlocked, unlock, lock, getWallet }),
    [unlocked, unlock, lock, getWallet],
  );

  return (
    <WalletSessionContext.Provider value={value}>
      {children}
    </WalletSessionContext.Provider>
  );
};

export function useWalletSession(): WalletSessionContextType {
  const context = useContext(WalletSessionContext);
  if (!context) {
    throw new Error('useWalletSession must be used within a WalletSessionProvider');
  }
  return context;
}

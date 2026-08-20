import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Subscription, FavoriteItem, InputDataItem, normalizeSubscription } from '../types';
import { STORAGE_KEYS, API_CONFIG } from '../constants';
import { migrateLegacyStorage } from '../storage/migrate';

/* ------------------------------------------------------------------ */
/*  State                                                              */
/* ------------------------------------------------------------------ */

interface AppState {
  subscriptions: Subscription[];
  profile: Subscription | null;
  apiKey: string;
  favorites: FavoriteItem[];
  isLoading: boolean;
}

const initialState: AppState = {
  subscriptions: [],
  profile: null,
  apiKey: '',
  favorites: [],
  isLoading: true,
};

/* ------------------------------------------------------------------ */
/*  Actions                                                            */
/* ------------------------------------------------------------------ */

type Action =
  | { type: 'SET_SUBSCRIPTIONS'; payload: Subscription[] }
  | { type: 'ADD_SUBSCRIPTION'; payload: Subscription }
  | { type: 'UPDATE_SUBSCRIPTION'; payload: Subscription }
  | { type: 'DELETE_SUBSCRIPTION'; payload: string }
  | { type: 'SET_PROFILE'; payload: Subscription | null }
  | { type: 'SET_API_KEY'; payload: string }
  | { type: 'SET_FAVORITES'; payload: FavoriteItem[] }
  | { type: 'ADD_FAVORITE'; payload: FavoriteItem }
  | { type: 'REMOVE_FAVORITE'; payload: string }
  | { type: 'SET_LOADING'; payload: boolean };

function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_SUBSCRIPTIONS':
      return { ...state, subscriptions: action.payload };
    case 'ADD_SUBSCRIPTION':
      return {
        ...state,
        subscriptions: [...state.subscriptions, action.payload],
      };
    case 'UPDATE_SUBSCRIPTION':
      return {
        ...state,
        subscriptions: state.subscriptions.map((s) =>
          s.id === action.payload.id ? action.payload : s,
        ),
      };
    case 'DELETE_SUBSCRIPTION':
      return {
        ...state,
        subscriptions: state.subscriptions.filter((s) => s.id !== action.payload),
      };
    case 'SET_PROFILE':
      return { ...state, profile: action.payload };
    case 'SET_API_KEY':
      return { ...state, apiKey: action.payload };
    case 'SET_FAVORITES':
      return { ...state, favorites: action.payload };
    case 'ADD_FAVORITE':
      if (state.favorites.some((f) => f.item.id === action.payload.item.id)) {
        return state;
      }
      return {
        ...state,
        favorites: [action.payload, ...state.favorites],
      };
    case 'REMOVE_FAVORITE':
      return {
        ...state,
        favorites: state.favorites.filter((f) => f.item.id !== action.payload),
      };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    default:
      return state;
  }
}

/* ------------------------------------------------------------------ */
/*  Context shape                                                      */
/* ------------------------------------------------------------------ */

interface AppContextType {
  state: AppState;
  addSubscription: (item: Subscription) => Promise<void>;
  updateSubscription: (item: Subscription) => Promise<void>;
  deleteSubscription: (id: string) => Promise<void>;
  saveProfile: (item: Subscription) => Promise<void>;
  updateProfile: (item: Subscription) => Promise<void>;
  deleteProfile: () => Promise<void>;
  setApiKey: (key: string) => Promise<void>;
  addFavorite: (item: InputDataItem) => Promise<void>;
  removeFavorite: (id: string) => Promise<void>;
  isFavorite: (id: string) => boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */

interface Props {
  children: ReactNode;
}

export const AppProvider: React.FC<Props> = ({ children }) => {
  const [state, dispatch] = useReducer(appReducer, initialState);

  /* ---------- 启动时从 AsyncStorage 加载持久化数据 ---------- */
  useEffect(() => {
    (async () => {
      try {
        await migrateLegacyStorage();
        const results = await AsyncStorage.multiGet([
          STORAGE_KEYS.SUBSCRIPTIONS,
          STORAGE_KEYS.PROFILE,
          STORAGE_KEYS.API_KEY,
          STORAGE_KEYS.FAVORITES,
        ]);
        const subsValue = results[0]?.[1];
        const profileValue = results[1]?.[1];
        const apiKeyValue = results[2]?.[1];
        const favoritesValue = results[3]?.[1];
        if (subsValue) {
          const subs: Subscription[] = JSON.parse(subsValue);
          dispatch({
            type: 'SET_SUBSCRIPTIONS',
            payload: subs.map(normalizeSubscription),
          });
        }
        if (profileValue) {
          dispatch({
            type: 'SET_PROFILE',
            payload: normalizeSubscription(JSON.parse(profileValue)),
          });
        }
        if (apiKeyValue !== null) {
          dispatch({ type: 'SET_API_KEY', payload: apiKeyValue });
          API_CONFIG.ETHERSCAN_API_KEY = apiKeyValue;
        }
        if (favoritesValue) {
          const parsed: unknown = JSON.parse(favoritesValue);
          const favorites: FavoriteItem[] = Array.isArray(parsed)
            ? parsed.filter(
                (entry): entry is FavoriteItem =>
                  !!entry &&
                  typeof entry === 'object' &&
                  typeof (entry as FavoriteItem).favoritedAt === 'number' &&
                  !!(entry as FavoriteItem).item &&
                  typeof (entry as FavoriteItem).item.id === 'string',
              )
            : [];
          dispatch({ type: 'SET_FAVORITES', payload: favorites });
        }
      } catch (error) {
        console.warn('Failed to load persisted data:', error);
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    })();
  }, []);

  /* ---------- 订阅 CRUD ---------- */
  const addSubscription = useCallback(async (item: Subscription) => {
    dispatch({ type: 'ADD_SUBSCRIPTION', payload: item });
    // 获取最新列表需通过函数式更新，这里简化处理
  }, []);

  const updateSubscription = useCallback(async (item: Subscription) => {
    dispatch({ type: 'UPDATE_SUBSCRIPTION', payload: item });
  }, []);

  const deleteSubscription = useCallback(async (id: string) => {
    dispatch({ type: 'DELETE_SUBSCRIPTION', payload: id });
  }, []);

  /* ---------- 同步订阅列表到 AsyncStorage ---------- */
  useEffect(() => {
    if (!state.isLoading) {
      AsyncStorage.setItem(
        STORAGE_KEYS.SUBSCRIPTIONS,
        JSON.stringify(state.subscriptions),
      ).catch(console.warn);
    }
  }, [state.subscriptions, state.isLoading]);

  /* ---------- Profile CRUD ---------- */
  const saveProfile = useCallback(async (item: Subscription) => {
    dispatch({ type: 'SET_PROFILE', payload: item });
  }, []);

  const updateProfile = useCallback(async (item: Subscription) => {
    dispatch({ type: 'SET_PROFILE', payload: item });
  }, []);

  const deleteProfile = useCallback(async () => {
    dispatch({ type: 'SET_PROFILE', payload: null });
  }, []);

  /* ---------- API Key ---------- */
  const setApiKey = useCallback(async (key: string) => {
    dispatch({ type: 'SET_API_KEY', payload: key });
    API_CONFIG.ETHERSCAN_API_KEY = key;
  }, []);

  /* ---------- 本地收藏 CRUD ---------- */
  const addFavorite = useCallback(async (item: InputDataItem) => {
    dispatch({
      type: 'ADD_FAVORITE',
      payload: { item, favoritedAt: Date.now() },
    });
  }, []);

  const removeFavorite = useCallback(async (id: string) => {
    dispatch({ type: 'REMOVE_FAVORITE', payload: id });
  }, []);

  const isFavorite = useCallback(
    (id: string) => state.favorites.some((f) => f.item.id === id),
    [state.favorites],
  );

  /* ---------- 同步 Profile 到 AsyncStorage ---------- */
  useEffect(() => {
    if (state.isLoading) return;
    if (state.profile) {
      AsyncStorage.setItem(
        STORAGE_KEYS.PROFILE,
        JSON.stringify(state.profile),
      ).catch(console.warn);
    } else {
      AsyncStorage.removeItem(STORAGE_KEYS.PROFILE).catch(console.warn);
    }
  }, [state.profile, state.isLoading]);

  /* ---------- 同步 API Key 到 AsyncStorage ---------- */
  useEffect(() => {
    if (!state.isLoading && state.apiKey !== undefined) {
      AsyncStorage.setItem(
        STORAGE_KEYS.API_KEY,
        state.apiKey, // 直接存字符串，不需要 JSON.stringify
      ).catch(console.warn);
    }
  }, [state.apiKey, state.isLoading]);

  /* ---------- 同步收藏列表到 AsyncStorage ---------- */
  useEffect(() => {
    if (!state.isLoading) {
      AsyncStorage.setItem(
        STORAGE_KEYS.FAVORITES,
        JSON.stringify(state.favorites),
      ).catch(console.warn);
    }
  }, [state.favorites, state.isLoading]);

  const value = useMemo<AppContextType>(
    () => ({
      state,
      addSubscription,
      updateSubscription,
      deleteSubscription,
      saveProfile,
      updateProfile,
      deleteProfile,
      setApiKey,
      addFavorite,
      removeFavorite,
      isFavorite,
    }),
    [
      state,
      addSubscription,
      updateSubscription,
      deleteSubscription,
      saveProfile,
      updateProfile,
      deleteProfile,
      setApiKey,
      addFavorite,
      removeFavorite,
      isFavorite,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export const useAppContext = (): AppContextType => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};

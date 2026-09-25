import React, { useEffect } from 'react';
import { useWindowDimensions } from 'react-native';
import { createPortal } from 'react-dom';
import { useTheme } from 'react-native-paper';
import { isDesktopOs } from '../theme/layout';
import { getModalSurfaceColor } from '../theme';
import { AppModalContent, type AppModalAction } from './AppModalContent';

export type { AppModalAction };

const WEB_BACKDROP_LIGHT = 'rgba(0, 0, 0, 0.4)';
const WEB_BACKDROP_DARK = 'rgba(0, 0, 0, 0.6)';

type AppModalProps = {
  visible: boolean;
  title: string;
  children?: React.ReactNode;
  actions?: AppModalAction[];
  onDismiss?: () => void;
  dismissable?: boolean;
  scrollable?: boolean;
};

export function AppModal({
  visible,
  title,
  children,
  actions,
  onDismiss,
  dismissable = true,
  scrollable = false,
}: AppModalProps) {
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  const centered = isDesktopOs() && width > height;
  const modalWidth = Math.round(width * 0.4);
  const scrollMaxHeight = Math.max(height, 240) * 0.5;

  const handleActionPress = (action: AppModalAction) => {
    void action.onPress();
  };

  useEffect(() => {
    if (!visible || !dismissable) {
      return undefined;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onDismiss?.();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [visible, dismissable, onDismiss]);

  if (!visible || typeof document === 'undefined') {
    return null;
  }

  const surface = getModalSurfaceColor(theme.colors, theme.dark);
  const cardWidth = centered ? modalWidth : Math.min(width - 40, 480);

  return createPortal(
    <div
      data-oam-modal="true"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        zIndex: 2147483000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
      }}
    >
      <div
        role="presentation"
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          backgroundColor: theme.dark ? WEB_BACKDROP_DARK : WEB_BACKDROP_LIGHT,
        }}
        onClick={dismissable ? onDismiss : undefined}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          position: 'relative',
          zIndex: 1,
          width: cardWidth,
          maxWidth: '90vw',
          maxHeight: '90vh',
          overflow: 'auto',
          padding: 20,
          borderRadius: 8,
          backgroundColor: surface,
          border: theme.dark ? `1px solid ${theme.colors.outlineVariant}` : 'none',
          boxSizing: 'border-box',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <AppModalContent
          title={title}
          actions={actions}
          scrollable={scrollable}
          scrollMaxHeight={scrollMaxHeight}
          clipOverflow={false}
          onActionPress={handleActionPress}
        >
          {children}
        </AppModalContent>
      </div>
    </div>,
    document.body,
  );
}

'use client';

import React, { Component, ErrorInfo, ReactNode, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import ErrorBoundary from './ErrorBoundary';
import { ThemeProvider } from './ThemeProvider';
import { AuthProvider } from './AuthProvider';
import { AudioProvider } from '../contexts/AudioContext';

// Cách ly các Global Component nặng về Client bằng next/dynamic { ssr: false }
// Tránh tuyệt đối Hydration Mismatch trên mọi trang (Trang chủ, Chi tiết, Chia sẻ link)
const GlobalAudioPlayer = dynamic(() => import('./GlobalAudioPlayer'), {
  ssr: false,
  loading: () => null,
});

const ClientLiveChat = dynamic(() => import('./ClientLiveChat'), {
  ssr: false,
  loading: () => null,
});

interface WidgetBoundaryState {
  hasError: boolean;
}

class FloatingWidgetErrorBoundary extends Component<
  { children: ReactNode },
  WidgetBoundaryState
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): WidgetBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn('[FloatingWidgetErrorBoundary] Đã cô lập lỗi widget nổi:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

export default function ClientGlobalShell({ children }: { children: ReactNode }) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <AudioProvider>
            {children}
            {isMounted && (
              <FloatingWidgetErrorBoundary>
                <GlobalAudioPlayer />
                <ClientLiveChat />
              </FloatingWidgetErrorBoundary>
            )}
          </AudioProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

import React, { useEffect, useState } from 'react';
import type { AppProps } from 'next/app';
import dynamic from 'next/dynamic';
import ErrorBoundary from '../components/ErrorBoundary';
import { ThemeProvider } from '../components/ThemeProvider';
import { AuthProvider } from '../components/AuthProvider';
import { AudioProvider } from '../contexts/AudioContext';
import '../app/globals.css';

// Nạp Global Audio Player & Live Chat ở client-side để tránh Hydration Mismatch
// đồng thời đặt tại _app.tsx giúp thẻ <audio> A/B sống xuyên suốt khi chuyển trang
const GlobalAudioPlayer = dynamic(() => import('../components/GlobalAudioPlayer'), {
  ssr: false,
  loading: () => null,
});

const ClientLiveChat = dynamic(() => import('../components/ClientLiveChat'), {
  ssr: false,
  loading: () => null,
});

export default function MyApp({ Component, pageProps }: AppProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <AudioProvider>
            <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 antialiased selection:bg-pink-500 selection:text-white">
              <Component {...pageProps} />
            </div>

            {isMounted && (
              <>
                <GlobalAudioPlayer />
                <ClientLiveChat />
              </>
            )}
          </AudioProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { doc, enableNetwork, getDocFromServer } from 'firebase/firestore';
import { AlertTriangle, RotateCw, Wifi } from 'lucide-react';
import { db } from '../firebase/config';

interface ErrorBoundaryProps {
  children: ReactNode;
  onVisibilityRecover?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  isReconnecting: boolean;
}

/**
 * Global React Error Boundary (Mobile-First, Pink Theme)
 * - Chặn triệt để lỗi trắng màn hình khi đứt kết nối Firebase, chuyển app nền hoặc tràn bộ nhớ
 * - Tích hợp visibilitychange API tự động ping phục hồi kết nối Firestore khi mở lại app
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private lastPingAt = 0;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      isReconnecting: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[Global ErrorBoundary] Đã chặn sự cố giao diện:', error, errorInfo);
  }

  componentDidMount() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.pingFirebaseConnection);
    }
  }

  componentWillUnmount() {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.pingFirebaseConnection);
    }
  }

  private pingFirebaseConnection = async () => {
    const now = Date.now();
    if (now - this.lastPingAt < 10000) return;
    this.lastPingAt = now;

    if (this.state.hasError) {
      this.setState({ isReconnecting: true });
    }

    try {
      await enableNetwork(db).catch(() => {});
      await Promise.race([
        getDocFromServer(doc(db, 'system', 'healthcheck')).catch(() => null),
        new Promise((resolve) => setTimeout(resolve, 4000)),
      ]);
      this.props.onVisibilityRecover?.();
    } catch {
      // Bỏ qua an toàn khi offline
    } finally {
      if (this.state.hasError) {
        this.setState({ isReconnecting: false });
      }
    }
  };

  private handleVisibilityChange = () => {
    if (typeof document === 'undefined') return;
    if (document.visibilityState === 'visible') {
      this.pingFirebaseConnection();
    }
  };

  private handleReloadPage = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  private handleTryReset = () => {
    this.setState({ hasError: false, error: null, isReconnecting: false });
    this.pingFirebaseConnection();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="min-h-[100dvh] w-full flex items-center justify-center p-4 bg-gradient-to-b from-pink-50 via-white to-rose-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 text-slate-900 dark:text-slate-100"
        >
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-pink-500/15 border border-pink-200 dark:border-pink-900/60 text-center space-y-5">
            <div className="w-16 h-16 rounded-2xl bg-pink-100 dark:bg-pink-950/70 border border-pink-200 dark:border-pink-800 text-pink-600 dark:text-pink-400 flex items-center justify-center mx-auto shadow-sm">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white">
                Kết nối tạm thời bị gián đoạn
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Hệ thống Đạo Tâm đã tự động bảo vệ để tránh màn hình trắng khi chuyển ứng dụng hoặc mất mạng. Vui lòng tải lại trang để tiếp tục đọc và nghe truyện mượt mà.
              </p>
              {this.state.error?.message && (
                <div className="mt-2 px-3 py-2 rounded-xl bg-pink-50/80 dark:bg-pink-950/40 border border-pink-100 dark:border-pink-900/50 text-[11px] font-mono text-pink-700 dark:text-pink-300 break-words text-left max-h-24 overflow-y-auto">
                  {this.state.error.message}
                </div>
              )}
            </div>

            {this.state.isReconnecting && (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-pink-50 dark:bg-pink-950/60 text-pink-600 dark:text-pink-300 text-xs font-semibold">
                <Wifi className="w-3.5 h-3.5 animate-pulse" />
                <span>Đang kiểm tra lại kết nối hệ thống...</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={this.handleReloadPage}
                className="w-full sm:flex-1 py-3 px-5 rounded-xl bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-500 hover:to-rose-400 active:scale-[0.98] text-white font-bold text-sm shadow-lg shadow-pink-500/25 flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <RotateCw className="w-4 h-4" />
                <span>Tải Lại Trang</span>
              </button>

              <button
                type="button"
                onClick={this.handleTryReset}
                className="w-full sm:w-auto py-3 px-4 rounded-xl bg-pink-50 hover:bg-pink-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-pink-700 dark:text-pink-300 font-semibold text-xs border border-pink-200 dark:border-slate-700 transition cursor-pointer"
              >
                Thử khôi phục
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

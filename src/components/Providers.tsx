'use client';

// Suppress a React 19 dev-only false positive: next-themes intentionally injects
// a <script> tag (server-side only) to set the theme class before paint and avoid
// a flash of the wrong theme. React warning that it won't run on the client is
// expected here. Remove once next-themes ships a React 19 fix. Dev only.
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  const _consoleError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('Encountered a script tag while rendering React component')) return;
    _consoleError(...args);
  };
}

import { store, persistor } from '@/redux/store';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { SessionProvider } from 'next-auth/react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import { Toaster } from 'react-hot-toast';

// App-wide providers: NextAuth session, Redux store (+ persisted booking slice),
// and theme. Wraps the whole tree in src/app/layout.tsx.
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <Provider store={store}>
        <PersistGate loading={null} persistor={persistor}>
          <NextThemesProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            {children}
            <Toaster
              position="top-center"
              containerStyle={{ zIndex: 999999 }}
              toastOptions={{
                duration: 4000,
                style: { background: '#363636', color: '#fff' },
                success: { duration: 3000, iconTheme: { primary: '#4ade80', secondary: '#fff' } },
                error: { duration: 4000, iconTheme: { primary: '#ef4444', secondary: '#fff' } },
              }}
            />
          </NextThemesProvider>
        </PersistGate>
      </Provider>
    </SessionProvider>
  );
}

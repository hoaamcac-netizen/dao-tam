'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const ContinueReadingBanner = dynamic(() => import('./ContinueReadingBanner'), {
  ssr: false,
  loading: () => null,
});

export default function DynamicContinueReadingBanner() {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return null;
  }

  return <ContinueReadingBanner />;
}

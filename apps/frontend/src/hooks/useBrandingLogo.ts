'use client';

import { useEffect, useState } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { usePermissions } from '@/hooks/usePermissions';
import {
  isUnbCostCenter,
  persistUnbBranding,
  persistUnbBrandingFlag,
  readStoredUnbBranding,
  resolveBrandingLogoAlt,
  resolveBrandingLogoSrc,
} from '@/lib/unbBranding';

export function useBrandingLogo() {
  const { isDark } = useTheme();
  const { user, isUnbUser, isLoading } = usePermissions();
  const [storedUnb, setStoredUnb] = useState(() =>
    typeof window !== 'undefined' ? readStoredUnbBranding() : false
  );

  const costCenter = user?.employee?.costCenter;
  const useUnbBranding = isLoading
    ? storedUnb
    : isUnbUser ||
      (costCenter != null && costCenter !== ''
        ? isUnbCostCenter(costCenter)
        : storedUnb);

  useEffect(() => {
    if (isLoading) return;

    if (isUnbUser) {
      persistUnbBrandingFlag(true);
      setStoredUnb(true);
      return;
    }

    if (costCenter != null && costCenter !== '') {
      persistUnbBranding(costCenter);
      setStoredUnb(isUnbCostCenter(costCenter));
      return;
    }

    persistUnbBrandingFlag(false);
    setStoredUnb(false);
  }, [isLoading, isUnbUser, costCenter]);

  return {
    logoSrc: resolveBrandingLogoSrc(isDark, useUnbBranding),
    logoAlt: resolveBrandingLogoAlt(useUnbBranding),
    useUnbBranding,
  };
}

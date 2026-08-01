import { useState, useEffect } from 'react';

export type DeviceMode = 'auto' | 'mobile' | 'desktop';

export interface DeviceInfo {
  isMobile: boolean;
  isDesktop: boolean;
  isTablet: boolean;
  isTouch: boolean;
  width: number;
  height: number;
  deviceType: 'mobile' | 'desktop';
  overrideMode: DeviceMode;
}

export function getRawDeviceInfo(): Omit<DeviceInfo, 'overrideMode'> {
  if (typeof window === 'undefined') {
    return {
      isMobile: false,
      isDesktop: true,
      isTablet: false,
      isTouch: false,
      width: 1280,
      height: 800,
      deviceType: 'desktop'
    };
  }

  const ua = navigator.userAgent || navigator.vendor || (window as any).opera || '';
  const isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile/i.test(ua);
  const isTabletUA = /ipad|android(?!.*mobile)|tablet/i.test(ua);
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  
  const width = window.innerWidth;
  const height = window.innerHeight;

  const isMobileScreen = width < 768;
  const isMobile = isMobileUA || (isTouch && isMobileScreen) || isMobileScreen;
  const isTablet = isTabletUA || (isTouch && width >= 768 && width <= 1024);

  return {
    isMobile,
    isDesktop: !isMobile && !isTablet,
    isTablet,
    isTouch,
    width,
    height,
    deviceType: isMobile ? 'mobile' : 'desktop'
  };
}

export function useDeviceDetection() {
  const [overrideMode, setOverrideMode] = useState<DeviceMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('armeria_device_mode');
      if (saved === 'mobile' || saved === 'desktop') return saved;
    }
    return 'auto';
  });

  const [rawInfo, setRawInfo] = useState<Omit<DeviceInfo, 'overrideMode'>>(getRawDeviceInfo);

  useEffect(() => {
    const handleResize = () => {
      setRawInfo(getRawDeviceInfo());
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const effectiveIsMobile = overrideMode === 'mobile' ? true : overrideMode === 'desktop' ? false : rawInfo.isMobile;
  const effectiveIsDesktop = !effectiveIsMobile;

  const setDeviceMode = (mode: DeviceMode) => {
    setOverrideMode(mode);
    if (typeof window !== 'undefined') {
      if (mode === 'auto') {
        localStorage.removeItem('armeria_device_mode');
      } else {
        localStorage.setItem('armeria_device_mode', mode);
      }
    }
  };

  const deviceInfo: DeviceInfo = {
    ...rawInfo,
    isMobile: effectiveIsMobile,
    isDesktop: effectiveIsDesktop,
    deviceType: effectiveIsMobile ? 'mobile' : 'desktop',
    overrideMode
  };

  return { deviceInfo, setDeviceMode };
}

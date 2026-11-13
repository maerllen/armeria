import { useState, useEffect } from 'react';

export interface DeviceInfo {
  isMobile: boolean;
  isDesktop: boolean;
  isTablet: boolean;
  isTouch: boolean;
  isAndroid: boolean;
  isIOS: boolean;
  width: number;
  height: number;
  deviceType: 'mobile' | 'desktop';
}

export function getRawDeviceInfo(): DeviceInfo {
  if (typeof window === 'undefined') {
    return {
      isMobile: false,
      isDesktop: true,
      isTablet: false,
      isTouch: false,
      isAndroid: false,
      isIOS: false,
      width: 1280,
      height: 800,
      deviceType: 'desktop'
    };
  }

  const ua = navigator.userAgent || navigator.vendor || (window as any).opera || '';
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const isAndroid = /android/i.test(ua);
  const isIPadOS = /macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
  const isIOS = /iphone|ipad|ipod/i.test(ua) || isIPadOS;

  const isPhoneUA = /android.*mobile|iphone|ipod|blackberry|iemobile|opera mini|windows phone/i.test(ua);
  const isTabletUA = /ipad|android(?!.*mobile)|tablet/i.test(ua) || isIPadOS;

  const width = window.innerWidth;
  const height = window.innerHeight;
  const isCompactViewport = window.matchMedia
    ? window.matchMedia('(max-width: 767px)').matches
    : width < 768;

  const isMobile = isCompactViewport || isPhoneUA;
  const isTablet = !isMobile && (isTabletUA || (isTouch && width >= 768 && width <= 1024));

  return {
    isMobile,
    isDesktop: !isMobile,
    isTablet,
    isTouch,
    isAndroid,
    isIOS,
    width,
    height,
    deviceType: isMobile ? 'mobile' : 'desktop'
  };
}

export function useDeviceDetection() {
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>(getRawDeviceInfo);

  useEffect(() => {
    try {
      localStorage.removeItem('armeria_device_mode');
    } catch {
      // ignore storage access issues
    }

    const handleResize = () => {
      setDeviceInfo(getRawDeviceInfo());
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  return { deviceInfo };
}

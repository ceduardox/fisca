(async () => {
  const link = window.GHOST_LINK || {};
  const fallbackUrl = link.destinationUrl || 'https://news.google.com/';
  const clientData = await collectClientData();

  try {
    const trackRequest = fetch(`/api/track/${encodeURIComponent(link.slug)}`, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientData })
    });

    const response = await Promise.race([
      trackRequest,
      delay(650).then(() => null)
    ]);
    const data = response ? await response.json().catch(() => ({})) : {};
    window.location.replace(data.destinationUrl || fallbackUrl);
    return;
  } catch (error) {
    console.error(error);
  }

  window.location.replace(fallbackUrl);
})();

async function collectClientData() {
  const nav = navigator;
  const screenData = window.screen || {};
  const connection = nav.connection || nav.mozConnection || nav.webkitConnection || {};
  const battery = await withTimeout(readBattery(), 180, null);
  const highEntropy = await withTimeout(readHighEntropyClientHints(nav), 250, null);
  const deviceGuess = inferDevice(nav, screenData, highEntropy);

  return {
    capturedAt: new Date().toISOString(),
    platform: nav.platform || '',
    userAgentData: nav.userAgentData ? {
      mobile: nav.userAgentData.mobile,
      platform: nav.userAgentData.platform,
      brands: nav.userAgentData.brands || []
    } : null,
    highEntropy,
    language: nav.language || '',
    languages: nav.languages || [],
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    timezoneOffsetMinutes: new Date().getTimezoneOffset(),
    screen: {
      width: screenData.width || null,
      height: screenData.height || null,
      availWidth: screenData.availWidth || null,
      availHeight: screenData.availHeight || null,
      colorDepth: screenData.colorDepth || null,
      pixelDepth: screenData.pixelDepth || null,
      devicePixelRatio: window.devicePixelRatio || 1
    },
    deviceGuess,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight
    },
    hardwareConcurrency: nav.hardwareConcurrency || null,
    deviceMemory: nav.deviceMemory || null,
    maxTouchPoints: nav.maxTouchPoints || 0,
    cookieEnabled: nav.cookieEnabled,
    doNotTrack: nav.doNotTrack || '',
    online: nav.onLine,
    connection: {
      effectiveType: connection.effectiveType || '',
      downlink: connection.downlink || null,
      rtt: connection.rtt || null,
      saveData: Boolean(connection.saveData)
    },
    battery
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout(promise, ms, fallback) {
  return Promise.race([
    promise,
    delay(ms).then(() => fallback)
  ]);
}

function inferDevice(nav, screenData, highEntropy) {
  return inferAndroidDevice(nav, highEntropy) || inferAppleDevice(nav, screenData);
}

function inferAndroidDevice(nav, highEntropy) {
  const ua = nav.userAgent || '';
  const platform = (highEntropy && highEntropy.platform) || (nav.userAgentData && nav.userAgentData.platform) || nav.platform || '';
  const isAndroid = /Android/i.test(ua) || /Android/i.test(platform);
  if (!isAndroid) return null;

  const hintedModel = highEntropy && highEntropy.model ? String(highEntropy.model).trim() : '';
  if (hintedModel) {
    return {
      family: detectAndroidBrand(hintedModel),
      inferredModel: hintedModel,
      confidence: 'high',
      method: 'android-client-hints-model',
      key: hintedModel
    };
  }

  const model = extractAndroidModelFromUa(ua);
  if (model) {
    return {
      family: detectAndroidBrand(model),
      inferredModel: model,
      confidence: 'medium',
      method: 'android-user-agent-model-token',
      key: model
    };
  }

  return {
    family: 'Android',
    inferredModel: 'Android device',
    confidence: 'low',
    method: 'android-platform-signals',
    key: platform || 'Android'
  };
}

function extractAndroidModelFromUa(ua) {
  const androidBlock = ua.match(/Android[^;)]*(?:;\s*([^;)]+))*\)/i);
  if (!androidBlock) return '';

  const rawBlock = androidBlock[0]
    .replace(/^\(/, '')
    .replace(/\)$/, '');

  const tokens = rawBlock
    .split(';')
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !/^Android\b/i.test(token))
    .filter((token) => !/^Linux\b/i.test(token))
    .filter((token) => !/^U$/i.test(token))
    .filter((token) => !/^wv$/i.test(token))
    .filter((token) => !/^Mobile\b/i.test(token))
    .filter((token) => !/^Build\//i.test(token))
    .filter((token) => !/^Version\//i.test(token))
    .map((token) => token.replace(/\s+Build\/.*$/i, '').trim())
    .filter(Boolean);

  const likely = tokens.find((token) => {
    return /^(SM-|GT-|SCH-|SGH-|Pixel|Nexus|Redmi|M\d|Mi |POCO|CPH|RMX|DN|V\d|motorola|moto|XT\d|TECNO|Infinix|HUAWEI|HONOR|OnePlus|ASUS|Lenovo|ZTE|LM-|LG-|TCL|Hisense)/i.test(token);
  });

  return likely || tokens[tokens.length - 1] || '';
}

function detectAndroidBrand(model) {
  const value = String(model || '').trim();
  const upper = value.toUpperCase();
  if (/^(SM-|GT-|SCH-|SGH-)/.test(upper)) return 'Samsung';
  if (/^PIXEL/i.test(value)) return 'Google';
  if (/^(REDMI|MI |M\d|POCO)/i.test(value)) return 'Xiaomi';
  if (/^(CPH|ONEPLUS)/i.test(upper) || /^OnePlus/i.test(value)) return 'OnePlus/Oppo';
  if (/^RMX/i.test(upper)) return 'Realme';
  if (/^(V\d|VIVO)/i.test(value)) return 'Vivo';
  if (/^(MOTO|MOTOROLA|XT\d)/i.test(value)) return 'Motorola';
  if (/^(TECNO)/i.test(value)) return 'Tecno';
  if (/^(INFINIX|X\d{3,})/i.test(value)) return 'Infinix';
  if (/^(HUAWEI|HONOR)/i.test(value)) return value.split(/\s+/)[0];
  if (/^LM-|^LG-/i.test(value)) return 'LG';
  if (/^ASUS/i.test(value)) return 'ASUS';
  return 'Android';
}

function inferAppleDevice(nav, screenData) {
  const ua = nav.userAgent || '';
  const platform = nav.platform || '';
  const isAppleTouch = /iPhone|iPad|iPod/i.test(ua) ||
    ((platform === 'MacIntel' || platform === 'MacPPC') && nav.maxTouchPoints > 1);

  if (!isAppleTouch) return null;

  const width = Math.min(screenData.width || 0, screenData.height || 0);
  const height = Math.max(screenData.width || 0, screenData.height || 0);
  const dpr = Number(window.devicePixelRatio || 1);
  const key = `${width}x${height}@${dpr}`;
  const iPhoneMap = {
    '320x480@1': 'iPhone 2G, 3G, 3GS',
    '320x480@2': 'iPhone 4, 4S',
    '320x568@2': 'iPhone 5, 5C, 5S, SE 1',
    '375x667@2': 'iPhone 6, 6S, 7, 8, SE 2, SE 3',
    '414x736@3': 'iPhone 6 Plus, 6S Plus, 7 Plus, 8 Plus',
    '375x812@3': 'iPhone X, XS, 11 Pro, 12 mini, 13 mini',
    '414x896@2': 'iPhone XR, 11',
    '414x896@3': 'iPhone XS Max, 11 Pro Max',
    '390x844@3': 'iPhone 12, 12 Pro, 13, 13 Pro, 14',
    '428x926@3': 'iPhone 12 Pro Max, 13 Pro Max, 14 Plus',
    '393x852@3': 'iPhone 14 Pro, 15, 15 Pro, 16',
    '430x932@3': 'iPhone 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus',
    '402x874@3': 'iPhone 16 Pro',
    '440x956@3': 'iPhone 16 Pro Max'
  };

  const model = iPhoneMap[key];
  if (model) {
    return {
      family: 'Apple iPhone',
      inferredModel: model,
      confidence: model.includes(',') ? 'medium' : 'high',
      method: 'screen-css-size-and-device-pixel-ratio',
      key
    };
  }

  return {
    family: /iPad/i.test(ua) || (platform === 'MacIntel' && nav.maxTouchPoints > 1) ? 'Apple iPad' : 'Apple iPhone',
    inferredModel: 'Apple touch device',
    confidence: 'low',
    method: 'ios-touch-signals',
    key
  };
}

async function readHighEntropyClientHints(nav) {
  if (!nav.userAgentData || !nav.userAgentData.getHighEntropyValues) return null;
  try {
    return await nav.userAgentData.getHighEntropyValues([
      'architecture',
      'bitness',
      'fullVersionList',
      'model',
      'platform',
      'platformVersion',
      'uaFullVersion',
      'wow64'
    ]);
  } catch {
    return null;
  }
}

async function readBattery() {
  if (!navigator.getBattery) return null;
  try {
    const battery = await navigator.getBattery();
    return {
      charging: battery.charging,
      level: battery.level,
      chargingTime: battery.chargingTime,
      dischargingTime: battery.dischargingTime
    };
  } catch {
    return null;
  }
}

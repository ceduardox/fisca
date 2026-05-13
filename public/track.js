(async () => {
  const link = window.GHOST_LINK || {};
  const clientData = await collectClientData();

  try {
    const response = await fetch(`/api/track/${encodeURIComponent(link.slug)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientData })
    });
    const data = await response.json();
    if (data.destinationUrl) {
      window.location.replace(data.destinationUrl);
      return;
    }
  } catch (error) {
    console.error(error);
  }

  setTimeout(() => {
    document.querySelector('.track-shell p').textContent = 'Enlace registrado correctamente.';
  }, 500);
})();

async function collectClientData() {
  const nav = navigator;
  const screenData = window.screen || {};
  const connection = nav.connection || nav.mozConnection || nav.webkitConnection || {};
  const battery = await readBattery();

  return {
    capturedAt: new Date().toISOString(),
    platform: nav.platform || '',
    userAgentData: nav.userAgentData ? {
      mobile: nav.userAgentData.mobile,
      platform: nav.userAgentData.platform,
      brands: nav.userAgentData.brands || []
    } : null,
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

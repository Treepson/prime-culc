(function() {
  'use strict';

  const devicesData = {
    devices: [
      {
        id: 'prime-s',
        name: 'TIRAS PRIME S',
        description: 'Сучасний ППКП призначений для найменших об\'єктів, таких як магазини, аптеки, кав\'ярні тощо.',
        badge: null,
        image: 'assets/boards/prime-s.png',
        specs: 'ППКП НА 4 ЗОНИ'
      },
      {
        id: 'prime-m',
        name: 'TIRAS PRIME M',
        description: 'Сучасний ППКП призначений для невеликих об\'єктів, таких як магазини, ресторани, відділення банків та невеликі офіси.',
        badge: null,
        image: 'assets/boards/prime-m.png',
        specs: 'ППКП НА 8 ЗОН'
      },
      {
        id: 'prime-l',
        name: 'TIRAS PRIME L',
        description: 'Сучасний ППКП призначений для середніх об\'єктів, таких як офіс, приватна клініка або невеликий торговий центр.',
        badge: null,
        image: 'assets/boards/prime-l.png',
        specs: 'ППКП НА 16 ЗОН'
      },
      {
        id: 'prime-xl',
        name: 'TIRAS PRIME XL',
        description: 'Флагманський неадресний ППКП, призначений для реалізації системи пожежної безпеки на великих об’єктах - складські приміщення, торгові центри, лікарні тощо.',
        badge: 'Розширення',
        image: 'assets/boards/prime-xl.png',
        specs: 'ППКП НА 16 ЗОН З МОЖЛИВІСТЮ РОЗШИРЕННЯ ДО 128 ЗОН'
      }
    ]
  };

  function init() {
    renderDeviceCards();
  }

  function renderDeviceCards() {
    const grid = document.getElementById('devicesGrid');
    if (!grid) return;

    grid.innerHTML = devicesData.devices.map(device => `
      <div class="device-card" onclick="selectDevice('${device.id}')">
        <div class="device-icon-image">
          <img src="${device.image}" alt="${device.name}" class="device-board-preview">
          ${device.badge ? `<span class="fire-badge">${device.badge}</span>` : ''}
        </div>
        <h2 class="device-name">${device.name}</h2>
        <p class="device-specs">${device.specs}</p>
        <p class="device-description">${device.description}</p>
      </div>
    `).join('');
  }

  // Make selectDevice global
  window.selectDevice = function(deviceId) {
    window.location.href = `devices/${deviceId}.html`;
  };

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

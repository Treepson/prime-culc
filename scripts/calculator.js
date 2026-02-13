(function(){
  "use strict";

  let DEVICE_CONFIG = null;
  let COMPONENTS_DATA = null;
  let DATA = null;

  const deviceId = new URLSearchParams(window.location.search).get('device') || 
                   window.location.pathname.split('/').pop().replace('.html', '');

  async function loadConfigs() {
    try {
      const devicesResponse = await fetch('../data/devices-config.json');
      const devicesConfig = await devicesResponse.json();
      
      DEVICE_CONFIG = devicesConfig.devices.find(d => d.id === deviceId);
      
      if (!DEVICE_CONFIG) {
        throw new Error(`Device configuration not found for: ${deviceId}`);
      }

      const componentsResponse = await fetch('../data/components.json');
      COMPONENTS_DATA = await componentsResponse.json();

      DATA = {
        base: DEVICE_CONFIG.baseDevice,
        modulesInner: COMPONENTS_DATA.modulesInner,
        modulesExt: COMPONENTS_DATA.modulesExt || [],
        exmodules: COMPONENTS_DATA.exmodules,
        sensors: COMPONENTS_DATA.sensors,
        sirens: COMPONENTS_DATA.sirens,
        additional_equipment: COMPONENTS_DATA.additional_equipment
      };

      return true;
    } catch (error) {
      console.error('Error loading configurations:', error);
      document.body.innerHTML = `
        <div style="padding: 40px; text-align: center; color: #fff;">
          <h1>Помилка завантаження конфігурації</h1>
          <p>${error.message}</p>
          <a href="../index.html" style="color: #00ff66;">Повернутися на головну</a>
        </div>
      `;
      return false;
    }
  }

  const universalSlots = [null, null];
  const SLOT_LIMITS = {};
  const MODULE_CONFLICTS = {};
  const RESERVE = 0.25;
  const MAX_TOTAL_LOOPS = 128;
  const MAX_EXTENDERS = 15;
  const MAX_LOOPS_PER_EXTENDER = 8; // ВИПРАВЛЕННЯ: Максимум 8 зон на MZ-P fBox

  let cart = new Map();
  let extDevs = [];
  let slotButtons = [];
  let rowsEl, sumNormEl, sumAlarmEl, capacityEl, hoursSelect, loopsInput, deviceModeSelect;
  let deviceTabsEl, extPagesEl;

  function qs(sel, parent){ return (parent||document).querySelector(sel); }
  function qsa(sel, parent){ return (parent||document).querySelectorAll(sel); }

  function updatePageUI() {
    document.getElementById('pageTitle').textContent = DEVICE_CONFIG.title;
    document.getElementById('deviceTitle').textContent = DEVICE_CONFIG.title;
    document.getElementById('backLink').href = DEVICE_CONFIG.backLink;
    document.getElementById('boardImage').src = `../${DEVICE_CONFIG.boardImage}`;
    document.getElementById('boardImage').alt = DEVICE_CONFIG.name;

    const loopsInput = document.getElementById('loops');
    loopsInput.max = DEVICE_CONFIG.maxLoops;
    loopsInput.min = 0;
    // ВИПРАВЛЕННЯ: Блокуємо ручне введення, тільки стрілки
    loopsInput.onkeydown = function(e) { return false; };
    
    if(DEVICE_CONFIG.id === "prime-m"){
      loopsInput.value = 8;
    } else if(DEVICE_CONFIG.id === "prime-l"){
      loopsInput.value = 16;
    } else if(DEVICE_CONFIG.id === "prime-xl"){
      loopsInput.value = 16;
    } else {
      loopsInput.value = Math.min(DEVICE_CONFIG.maxLoops, 4);
    }

    const boardWrap = document.getElementById('boardWrap');
    const hotspots = DEVICE_CONFIG.hotspots;

    if (hotspots.mod1) {
      boardWrap.innerHTML += `
        <button class="hotspot hot-mod-1 free" data-type="modules" data-device="main" data-slot="0" title="Модулі" 
                style="left:${hotspots.mod1.left};top:${hotspots.mod1.top};">+</button>
      `;
    }

    if (DEVICE_CONFIG.hasModSlot2 && hotspots.mod2) {
      boardWrap.innerHTML += `
        <button class="hotspot hot-mod-2 free" data-type="modules" data-device="main" data-slot="1" title="Модулі"
                style="left:${hotspots.mod2.left};top:${hotspots.mod2.top};">+</button>
      `;
    }

    if (hotspots.moduls) {
      boardWrap.innerHTML += `
        <button class="hotspot hot-moduls" data-type="exmoduls" data-device="main" title="Розширювачі"
                style="left:${hotspots.moduls.left};top:${hotspots.moduls.top};">+</button>
      `;
    }

    if (hotspots.sens) {
      boardWrap.innerHTML += `
        <button class="hotspot hot-sens" data-type="sensors" data-device="main" title="Датчики"
                style="left:${hotspots.sens.left};top:${hotspots.sens.top};">+</button>
      `;
    }

    if (hotspots.sir) {
      boardWrap.innerHTML += `
        <button class="hotspot hot-sir" data-type="sirens" data-device="main" title="Сирени"
                style="left:${hotspots.sir.left};top:${hotspots.sir.top};">+</button>
      `;
    }

    if (hotspots.sir2) {
      boardWrap.innerHTML += `
        <button class="hotspot hot-sir2" data-type="sirens" data-device="main" title="Сирени"
                style="left:${hotspots.sir2.left};top:${hotspots.sir2.top};">+</button>
      `;
    }

    if (hotspots.additional) {
      boardWrap.innerHTML += `
        <button class="hotspot hot-additional" data-type="additional_equipment" data-device="main" title="Додаткове обладнання"
                style="left:${hotspots.additional.left};top:${hotspots.additional.top};">+</button>
      `;
    }
  }

  function initDOMReferences(){
    rowsEl = qs("#rows");
    sumNormEl = qs("#sumNorm");
    sumAlarmEl = qs("#sumAlarm");
    capacityEl = qs("#capacity");
    hoursSelect = qs("#hours");
    loopsInput = qs("#loops");
    deviceModeSelect = qs("#deviceMode");
    deviceTabsEl = qs("#deviceTabs");
    extPagesEl = qs("#extPages");

    Object.assign(SLOT_LIMITS, COMPONENTS_DATA.slotLimits || {});
    Object.assign(MODULE_CONFLICTS, COMPONENTS_DATA.moduleConflicts || {});
  }

  function initCart(){
    cart = new Map();
    const baseNormal = DEVICE_CONFIG.baseDevice.modes.normal.current;
    const baseAlarm = DEVICE_CONFIG.baseDevice.alarmCurrent;
    
    cart.set("base", {
      type: "Прилад",
      name: DATA.base.name,
      normal: baseNormal,
      alarm: baseAlarm,
      qty: 1,
      device: "main",
      key: "base"
    });
  }

  function getTotalLoops(){
    let baseLoops = parseInt(loopsInput?.value) || 0;
    let extLoops = 0;
    
    extDevs.forEach(dev=>{
      if(!dev) return;
      const loopsExtInput = qs(`#ext-loops-${dev.id}`);
      if(loopsExtInput){
        extLoops += parseInt(loopsExtInput.value) || 0;
      }
    });
    
    return baseLoops + extLoops;
  }

  function setupDeviceTabs(){
    if(!deviceTabsEl || !extPagesEl) return;
    const switchEl = qs("#device-type-switch", deviceTabsEl);
    if(!switchEl) return;

    const extCount = extDevs.filter(d=>d).length;
    switchEl.setAttribute("data-visible", extCount > 0 ? "true" : "false");
    if(extCount > 0){
      extPagesEl.style.display = "";
    } else {
      extPagesEl.style.display = "none";
    }

    qsa(".ext-page", extPagesEl).forEach(page=>{
      const did = page.dataset.deviceId;
      const found = extDevs.some(d=>d && d.id===did);
      if(!found) page.remove();
    });
  }

  function switchDeviceTab(target){
    qsa(".dev-tab-btn").forEach(btn=>btn.classList.remove("active"));
    const clicked = qs(`[data-device-tab="${target}"]`);
    if(clicked) clicked.classList.add("active");

    const mainStage = qs("main.stage");
    if(mainStage) mainStage.style.display = (target==="main") ? "" : "none";

    qsa(".ext-page", extPagesEl).forEach(page=>{
      page.classList.remove("active");
      if(page.dataset.deviceId === target) page.classList.add("active");
    });
  }

  function addExtDevice(mod){
    const extCount = extDevs.filter(d=>d).length;
    if(extCount >= MAX_EXTENDERS){
      alert(`Досягнуто максимальної кількості розширювачів (${MAX_EXTENDERS} шт)`);
      return;
    }

    const id = "ext_" + Date.now() + "_" + Math.random().toString(36).substr(2,9);
    const remaining = MAX_TOTAL_LOOPS - getTotalLoops();
    // ВИПРАВЛЕННЯ: Максимум 8 зон на розширювач
    const initialLoops = Math.min(MAX_LOOPS_PER_EXTENDER, Math.max(0, remaining));
    const dev = { id, name: mod.name, img: mod.img, addLoops: initialLoops };
    let slotIdx = extDevs.findIndex(x=>x==null);
    if(slotIdx === -1) slotIdx = extDevs.length;
    dev.slot = slotIdx;
    extDevs[slotIdx] = dev;

    const switchEl = qs("#device-type-switch", deviceTabsEl);
    if(!switchEl) return;

    const existingBtn = qs(`[data-device-tab="${id}"]`, switchEl);
    if(!existingBtn){
      const newBtn = document.createElement("button");
      newBtn.className = "dev-tab-btn";
      newBtn.dataset.deviceTab = id;
      newBtn.textContent = `${mod.name} #${slotIdx+1}`;
      newBtn.addEventListener("click", ()=>switchDeviceTab(id));
      switchEl.appendChild(newBtn);
    }

    const hotspotData = COMPONENTS_DATA.extHotspots?.[mod.name];
    if(hotspotData){
      renderExtDevicePage(dev, hotspotData, mod);
    }

    setupDeviceTabs();
    renderTable();
    renderExtTables();
    updateTotals();
    checkLoopsLimit();
  }

  function renderExtDevicePage(dev, hotspotData, modData){
    if(!extPagesEl) return;
    const existing = qs(`.ext-page[data-device-id="${dev.id}"]`, extPagesEl);
    if(existing) return;

    const page = document.createElement("div");
    page.className = "ext-page";
    page.dataset.deviceId = dev.id;

    const boardWrap = document.createElement("div");
    boardWrap.className = "ext-board-wrap";
    boardWrap.style.textAlign = "center";

    const img = document.createElement("img");
    img.className = "ext-board";
    img.src = `../${dev.img}`;
    img.alt = dev.name;
    boardWrap.appendChild(img);

    if(hotspotData){
      Object.entries(hotspotData).forEach(([key, pos])=>{
        const btn = document.createElement("button");
        btn.className = `hotspot ext free`;
        btn.dataset.type = key;
        btn.dataset.device = dev.id;
        btn.style.position = "absolute";
        btn.style.left = pos.left + "%";
        btn.style.top = pos.top + "%";
        btn.textContent = "+";
        btn.addEventListener("click", ()=>{
          openModalFor(key, dev.id, null);
        });
        boardWrap.appendChild(btn);
      });
    }

    page.appendChild(boardWrap);

    const tableWrap = document.createElement("section");
    tableWrap.className = "table-wrap ext-table";
    tableWrap.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Тип</th>
            <th>Назва</th>
            <th>Черговий режим (мА)</th>
            <th>Режим пожежі (мА)</th>
            <th>Кількість</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="ext-rows-${dev.id}"></tbody>
      </table>
    `;
    page.appendChild(tableWrap);

    // Додаємо сам модуль розширення у його власну таблицю
    const modType = modData?.type || "Модуль";
    const modNormal = typeof modData?.normal !== 'undefined' ? modData.normal : 0;
    const modAlarm = typeof modData?.alarm !== 'undefined' ? modData.alarm : 0;
    
    const extModuleKey = `${modType}|${dev.name}|${dev.id}`;
    cart.set(extModuleKey, {
      type: modType,
      name: dev.name,
      normal: modNormal,
      alarm: modAlarm,
      qty: 1,
      device: dev.id,
      key: extModuleKey,
      isExtBase: true
    });

    const capacityWrap = document.createElement("section");
    capacityWrap.className = "capacity ext-capacity";
    capacityWrap.innerHTML = `
      <div class="row">
        <label>Σ Споживання в черговому режимі:</label>
        <span><span id="ext-sumNorm-${dev.id}">—</span> мА</span>
      </div>
      <div class="row">
        <label>Σ Споживання в режимі пожежі:</label>
        <span><span id="ext-sumAlarm-${dev.id}">—</span> мА</span>
      </div>
      <div class="row">
        <label for="ext-loops-${dev.id}">Кількість ШС:</label>
        <input type="number" id="ext-loops-${dev.id}" value="${dev.addLoops}" min="0" max="${MAX_LOOPS_PER_EXTENDER}">
      </div>
      <div class="row">
        <label>Час роботи:</label>
        <select id="ext-hours-${dev.id}">
          <option value="30" selected>30 годин</option>
          <option value="72">72 години</option>
        </select>
      </div>
      <div class="row">
        <label>Коефіцієнт запасу:</label>
        <span>25%</span>
      </div>
      <div class="row">
        <label>Розрахункова ємність АКБ:</label>
        <span><span id="ext-capacity-${dev.id}">—</span> А·год</span>
      </div>
    `;
    page.appendChild(capacityWrap);

    // ВИПРАВЛЕННЯ: Додаємо кнопку "Очистити все" для розширювача
    const extTableActions = document.createElement("div");
    extTableActions.className = "table-actions";
    extTableActions.style.marginTop = "10px";
    const clearExtBtn = document.createElement("button");
    clearExtBtn.className = "btn";
    clearExtBtn.id = `clearExt-${dev.id}`;
    clearExtBtn.textContent = "Очистити все";
    extTableActions.appendChild(clearExtBtn);
    // Вставляємо перед таблицею
    const tableWrapExt = page.querySelector('.table-wrap.ext-table');
    if(tableWrapExt){
      tableWrapExt.insertBefore(extTableActions, tableWrapExt.firstChild);
    }

    const actions = document.createElement("div");
    actions.className = "ext-actions";
    const delBtn = document.createElement("button");
    delBtn.className = "btn";
    delBtn.textContent = "Видалити розширювач";
    delBtn.addEventListener("click", ()=>{
      const confirmDel = confirm(`Видалити розширювач "${dev.name} #${dev.slot+1}"?`);
      if(!confirmDel) return;
      
      Array.from(cart.keys()).forEach(k=>{
        const it = cart.get(k);
        if(it && it.device === dev.id) cart.delete(k);
      });
      
      extDevs[dev.slot] = null;
      page.remove();
      
      const btn = qs(`[data-device-tab="${dev.id}"]`);
      if(btn) btn.remove();
      
      setupDeviceTabs();
      switchDeviceTab("main");
      renderTable();
      updateTotals();
      checkLoopsLimit();
    });
    actions.appendChild(delBtn);
    page.appendChild(actions);

    extPagesEl.appendChild(page);

    const loopsExtInput = qs(`#ext-loops-${dev.id}`);
    if(loopsExtInput){
      // ВИПРАВЛЕННЯ: Блокуємо ручне введення, тільки стрілки
      loopsExtInput.onkeydown = function(e) { return false; };
      loopsExtInput.addEventListener("input", ()=>{
        checkLoopsLimit();
        updateExtDeviceCapacity(dev.id);
      });
    }

    const hoursExtSelect = qs(`#ext-hours-${dev.id}`);
    if(hoursExtSelect){
      hoursExtSelect.addEventListener("change", ()=>{
        updateExtDeviceCapacity(dev.id);
      });
    }

    // ВИПРАВЛЕННЯ: Додаємо обробник для кнопки "Очистити все" на розширювачі
    //const clearExtBtn = qs(`#clearExt-${dev.id}`);
    if(clearExtBtn){
      clearExtBtn.addEventListener("click", ()=>{
        // Видаляємо всі елементи розширювача крім самого MZ-P fBox
        Array.from(cart.keys()).forEach(k=>{
          const item = cart.get(k);
          if(item && item.device === dev.id){
            // Не видаляємо сам модуль розширення
            if(!(item.type === "Модуль" && item.name.includes("MZ-P fBox"))){
              cart.delete(k);
            }
          }
        });
        
        renderExtTables();
        updateExtHotspotsUI(dev.id);
        updateExtDeviceCapacity(dev.id);
        updateTotals();
      });
    }
  }

  function updateExtDeviceCapacity(deviceId){
    const sumNormEl = qs(`#ext-sumNorm-${deviceId}`);
    const sumAlarmEl = qs(`#ext-sumAlarm-${deviceId}`);
    const capacityEl = qs(`#ext-capacity-${deviceId}`);
    const hoursSelect = qs(`#ext-hours-${deviceId}`);

    if(!sumNormEl || !sumAlarmEl || !capacityEl) return;

    const deviceItems = Array.from(cart.values()).filter(v=>v.device === deviceId);

    let totalNormal = 0;
    let sensorsAlarm = 0;
    let modulesAlarm = 0;
    let sirensAlarm = 0;
    let emergencyAlarm = 0;

    deviceItems.forEach(item=>{
      const qty = item.qty || 1;
      const norm = item.normal || 0;
      const alarm = item.alarm || 0;

      totalNormal += norm * qty;

      if(item.type === "Датчик"){
        // Не враховуємо тут, буде через зони
      } else if(item.type === "Модуль" || item.type === "Комунікатор"){
        modulesAlarm += alarm * qty;
      } else if(item.type === "Сирена"){
        sirensAlarm += alarm * qty;
      } else if(item.name === "Аварійне освітлення"){
        emergencyAlarm += alarm * qty;
      } else {
        modulesAlarm += alarm * qty;
      }
    });

    const extLoops = parseInt(qs(`#ext-loops-${deviceId}`)?.value) || 0;
    sensorsAlarm = 15 * extLoops;

    // Для MZ-P fBox (як PRIME S/M): сирени та аварійне освітлення × 2
    const totalAlarm = sensorsAlarm + modulesAlarm + (sirensAlarm * 2) + (emergencyAlarm * 2);

    sumNormEl.textContent = totalNormal.toFixed(2);
    sumAlarmEl.textContent = totalAlarm.toFixed(2);

    const hours = parseInt(hoursSelect?.value) || 30;
    const base = (totalNormal * hours) + (totalAlarm * 0.5);
    const capacity = (base + (base * RESERVE)) / 1000;
    capacityEl.textContent = capacity.toFixed(2);
  }

  function renderExtTables(specificDeviceId = null){
    extDevs.forEach(dev=>{
      if(!dev) return;
      
      // ВИПРАВЛЕННЯ: Якщо передано конкретний deviceId, рендеримо тільки його
      if(specificDeviceId && dev.id !== specificDeviceId) return;
      
      const rowsEl = qs(`#ext-rows-${dev.id}`);
      if(!rowsEl) return;

      const deviceItems = Array.from(cart.values()).filter(v=>v.device === dev.id);

      let html = "";

      deviceItems.forEach(item=>{
        const isExtModule = item.isExtBase === true;
        // ВИПРАВЛЕННЯ: Блокуємо зміну кількості для M-OUT2R на розширювачі
        const isM_OUT2R = item.name === "M-OUT2R";
        const canRemove = !item.isExtBase;
        const qtyLocked = item.isExtBase || isM_OUT2R;

        // Додаємо відображення джерела для сирен
        let displayName = item.name;
        if(item.type === "Сирена" && item.source){
          if(item.source === "sir"){
            displayName = `${item.name} (Сирена 1)`;
          } else if(item.source === "sir2"){
            displayName = `${item.name} (Сирена 2)`;
          }
        }

        html += `
          <tr>
            <td>${item.type}</td>
            <td>${displayName}</td>
            <td>${item.normal}</td>
            <td>${item.alarm}</td>
            <td class="qty">
              <input type="number" value="${item.qty}" min="1" data-key="${item.key}" ${qtyLocked ? 'class="locked" readonly' : ''}>
            </td>
            <td>
              ${canRemove ? `<button class="btn" data-remove="${item.key}">×</button>` : ``}
            </td>
          </tr>
        `;
      });

      rowsEl.innerHTML = html;

      qsa("input[type='number']", rowsEl).forEach(inp=>{
        if(inp.classList.contains("locked")) return;
        inp.addEventListener("input", ()=>{
          const key = inp.dataset.key;
          const item = cart.get(key);
          if(!item) return;
          item.qty = parseInt(inp.value) || 1;
          // ВИПРАВЛЕННЯ: Не викликаємо renderExtTables, тільки оновлюємо розрахунки
          updateExtDeviceCapacity(dev.id);
          updateTotals();
        });
      });

      qsa("[data-remove]", rowsEl).forEach(btn=>{
        btn.addEventListener("click", ()=>{
          const key = btn.dataset.remove;
          cart.delete(key);
          // ВИПРАВЛЕННЯ: Рендеримо тільки таблицю поточного розширювача
          renderExtTables(dev.id);
          updateExtHotspotsUI(dev.id);
          updateExtDeviceCapacity(dev.id);
          updateTotals();
        });
      });

      updateExtDeviceCapacity(dev.id);
    });
  }

  function updateExtHotspotsUI(deviceId){
    const page = qs(`.ext-page[data-device-id="${deviceId}"]`);
    if(!page) return;

    const deviceItems = Array.from(cart.values()).filter(v=>v.device === deviceId);

    const hasSensors = deviceItems.some(v=>v.type === "Датчик");
    const hasSirens = deviceItems.some(v=>v.type === "Сирена");
    const hasModuls = deviceItems.some(v=>v.name === "M-OUT2R");

    const sensBtn = page.querySelector('.hotspot.ext[data-type="sens"]');
    const sirBtn = page.querySelector('.hotspot.ext[data-type="sir"]');
    const sir2Btn = page.querySelector('.hotspot.ext[data-type="sir2"]');
    const modulsBtn = page.querySelector('.hotspot.ext[data-type="moduls"]');

    // ВИПРАВЛЕННЯ: Для sens, sir, sir2 не використовуємо free/occupied
    // Вони завжди залишаються зеленими і доступними
    if(sensBtn){
      sensBtn.classList.remove("occupied");
      sensBtn.classList.add("free");
      sensBtn.title = "Датчики";
      sensBtn.textContent = "+";
    }

    if(sirBtn){
      sirBtn.classList.remove("occupied");
      sirBtn.classList.add("free");
      sirBtn.title = "Сирени";
      sirBtn.textContent = "+";
    }

    if(sir2Btn){
      sir2Btn.classList.remove("occupied");
      sir2Btn.classList.add("free");
      sir2Btn.title = "Сирени";
      sir2Btn.textContent = "+";
    }

    if(modulsBtn){
      if(hasModuls){
        modulsBtn.classList.remove("free");
        modulsBtn.classList.add("occupied");
        modulsBtn.title = "M-OUT2R (зайнято)";
        modulsBtn.textContent = "+";
      } else {
        modulsBtn.classList.remove("occupied");
        modulsBtn.classList.add("free");
        modulsBtn.title = "M-OUT2R";
        modulsBtn.textContent = "+";
      }
    }
  }

  function checkLoopsLimit(){
    const total = getTotalLoops();
    const info = qs("#loopsInfo");
    
    // ВИПРАВЛЕННЯ: Показуємо loopsInfo тільки для PRIME XL
    if(info){
      if(DEVICE_CONFIG.id === "prime-xl"){
        if(total > MAX_TOTAL_LOOPS){
          info.textContent = `⚠ Перевищено максимум ${MAX_TOTAL_LOOPS} ШС!`;
          info.style.color = "#ff3333";
        } else {
          info.textContent = `(${total}/${MAX_TOTAL_LOOPS})`;
          info.style.color = "#00ff66";
        }
      } else {
        // Для PRIME S/M/L не показуємо інформацію
        info.textContent = "";
      }
    }

    // ВИПРАВЛЕННЯ: Блокуємо можливість вводити більше максимуму для основного приладу
    if(loopsInput){
      const currentVal = parseInt(loopsInput.value) || 0;
      const maxForDevice = DEVICE_CONFIG.maxLoops || 16;
      
      if(currentVal > maxForDevice){
        loopsInput.value = maxForDevice;
        updateTotals();
      }
    }

    // Обмеження для кожного розширювача
    extDevs.forEach(dev=>{
      if(!dev) return;
      const loopsExtInput = qs(`#ext-loops-${dev.id}`);
      if(!loopsExtInput) return;
      
      const currentVal = parseInt(loopsExtInput.value) || 0;
      const otherLoops = getTotalLoops() - currentVal;
      const remainingGlobal = MAX_TOTAL_LOOPS - otherLoops;
      
      const maxAllowed = Math.min(MAX_LOOPS_PER_EXTENDER, Math.max(0, remainingGlobal));
      loopsExtInput.max = maxAllowed;
      
      if(currentVal > maxAllowed){
        loopsExtInput.value = maxAllowed;
        updateExtDeviceCapacity(dev.id);
      }
    });
  }

  function addToCart(type, name, normal, alarm, device, slotIdx, source=null){
    // ВИПРАВЛЕННЯ: При додаванні однакових елементів збільшуємо qty замість створення нової
    // Враховуємо source для розрізнення sir та sir2
    const existingItem = Array.from(cart.values()).find(item => 
      item.device === device && 
      item.name === name && 
      item.type === type &&
      item.slotIdx === null && // Тільки для не-слотових елементів
      item.source === source // Розрізняємо sir та sir2
    );

    if(existingItem && slotIdx === null){
      // Збільшуємо кількість існуючого елемента
      existingItem.qty += 1;
      
      // ВИПРАВЛЕННЯ: Викликаємо renderExtTables тільки якщо додаємо на розширювач
      if(device === "main"){
        renderTable();
        updateSlotUI();
      } else {
        renderExtTables(device); // Передаємо deviceId
        updateExtHotspotsUI(device);
      }
      
      updateTotals();
      return;
    }

    // Створюємо новий елемент
    const key = `${type}|${name}|${device}|${source || 'default'}|${Date.now()}`;
    
    if(slotIdx !== null && slotIdx !== undefined){
      if(universalSlots[slotIdx]){
        const oldKey = universalSlots[slotIdx].key;
        cart.delete(oldKey);
      }
      universalSlots[slotIdx] = { name, key };
    }

    cart.set(key, { type, name, normal, alarm, qty: 1, device, key, slotIdx, source });
    
    // ВИПРАВЛЕННЯ: Викликаємо renderExtTables тільки якщо додаємо на розширювач
    if(device === "main"){
      renderTable();
      updateSlotUI();
    } else {
      renderExtTables(device); // Передаємо deviceId
      updateExtHotspotsUI(device);
    }
    
    updateTotals();
  }

  function renderTable(){
    if(!rowsEl) return;
    const mainItems = Array.from(cart.values()).filter(v=>v.device === "main");
    
    let html = "";
    mainItems.forEach(item=>{
      const locked = (item.slotIdx !== null && item.slotIdx !== undefined);
      const isBaseDevice = item.type === "Прилад";
      const canRemove = !isBaseDevice;

      // Додаємо відображення джерела для сирен
      let displayName = item.name;
      if(item.type === "Сирена" && item.source){
        if(item.source === "sir"){
          displayName = `${item.name} (Сирена 1)`;
        } else if(item.source === "sir2"){
          displayName = `${item.name} (Сирена 2)`;
        }
      }

      html += `
        <tr>
          <td>${item.type}</td>
          <td>${displayName}</td>
          <td>${item.normal}</td>
          <td>${item.alarm}</td>
          <td class="qty">
            <input type="number" value="${item.qty}" min="1" 
                   data-key="${item.key}" ${(locked || isBaseDevice) ? 'class="locked" readonly' : ''}>
          </td>
          <td>
            ${canRemove ? `<button class="btn" data-remove="${item.key}">×</button>` : ''}
          </td>
        </tr>
      `;
    });

    rowsEl.innerHTML = html;

    qsa("input[type='number']", rowsEl).forEach(inp=>{
      if(inp.classList.contains("locked")) return;
      inp.addEventListener("input", ()=>{
        const key = inp.dataset.key;
        const item = cart.get(key);
        if(!item) return;
        item.qty = parseInt(inp.value) || 1;
        updateTotals();
      });
    });

    qsa("[data-remove]", rowsEl).forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const key = btn.dataset.remove;
        const item = cart.get(key);
        if(!item){
          cart.delete(key);
          renderTable();
          updateSlotUI();
          updateTotals();
          return;
        }

        if(item.slotIdx !== null && item.slotIdx !== undefined){
          universalSlots[item.slotIdx] = null;
        }

        cart.delete(key);
        renderTable();
        updateSlotUI();
        updateTotals();
      });
    });
  }

  function updateTotals(){
    const mainItems = Array.from(cart.values()).filter(v=>v.device === "main");

    let totalNormal = 0;
    let sensorsAlarm = 0;
    let modulesAlarm = 0;
    let sirensAlarm = 0;
    let emergencyAlarm = 0;

    mainItems.forEach(item=>{
      const qty = item.qty || 1;
      const norm = item.normal || 0;
      const alarm = item.alarm || 0;

      // ВИПРАВЛЕННЯ: Не подвоюємо базове споживання приладу
      if(item.type === "Прилад"){
        // Прилад додається окремо через режим роботи
      } else {
        totalNormal += norm * qty;
      }

      if(item.type === "Датчик"){
        // Не враховуємо тут, буде через зони
      } else if(item.type === "Модуль" || item.type === "Комунікатор"){
        modulesAlarm += alarm * qty;
      } else if(item.type === "Сирена"){
        sirensAlarm += alarm * qty;
      } else if(item.name === "Аварійне освітлення"){
        emergencyAlarm += alarm * qty;
      } else if(item.type === "Прилад"){
        modulesAlarm += alarm;
      } else {
        modulesAlarm += alarm * qty;
      }
    });

    // ВИПРАВЛЕННЯ: Додаємо базове споживання один раз через режим
    const mode = deviceModeSelect?.value || "normal";
    const baseCurr = DATA.base.modes[mode]?.current || 0;
    totalNormal += baseCurr;

    const loops = parseInt(loopsInput?.value) || 0;
    sensorsAlarm = 15 * loops;

    let totalAlarm = 0;
    if(DEVICE_CONFIG.id === "prime-s" || DEVICE_CONFIG.id === "prime-m"){
      totalAlarm = sensorsAlarm + modulesAlarm + (sirensAlarm * 2) + (emergencyAlarm * 2);
    } else {
      totalAlarm = sensorsAlarm + modulesAlarm + sirensAlarm + emergencyAlarm;
    }

    if(sumNormEl) sumNormEl.textContent = totalNormal.toFixed(2);
    if(sumAlarmEl) sumAlarmEl.textContent = totalAlarm.toFixed(2);

    const hours = parseInt(hoursSelect?.value) || 30;
    const base = (totalNormal * hours) + (totalAlarm * 0.5);
    const capacity = (base + (base * RESERVE)) / 1000;
    if(capacityEl) capacityEl.textContent = capacity.toFixed(2);
  }

  function updateSlotUI(){
    slotButtons.forEach((btn, idx)=>{
      const slot = universalSlots[idx];
      if(slot){
        btn.classList.remove("free");
        btn.classList.add("occupied");
        btn.title = slot.name;
        btn.textContent = "•";
      } else {
        btn.classList.remove("occupied");
        btn.classList.add("free");
        btn.title = "Модулі";
        btn.textContent = "+";
      }
    });
  }

  function openModalFor(section, device="main", filterName=null, clickedSlot=null){
    const modal = qs("#modal");
    if(!modal) return;

    modal.classList.add("open");
    const title = qs("#modalTitle", modal);
    const body = qs("#generic-body", modal);

    let items = [];
    let modalTitle = "Оберіть";

    if(section === "modules"){
      items = DATA.modulesInner;
      
      if((DEVICE_CONFIG.id === "prime-l" || DEVICE_CONFIG.id === "prime-xl") && clickedSlot === 0){
        items = items.filter(item => item.name === "M-2G" || item.name === "M-LTE");
        modalTitle = "Комунікатори";
      } else {
        modalTitle = "Модулі / Комунікатори";
      }
      
    } else if(section === "exmoduls"){
      items = DATA.exmodules["Розширювачі виходів"] || [];
      modalTitle = "Розширювачі виходів";
      
      if(DEVICE_CONFIG.supportsExtenders && device === "main"){
        items = [...items, ...(DATA.modulesExt || [])];
      }
    } else if(section === "sensors"){
      items = DATA.sensors;
      modalTitle = "Датчики";
    } else if(section === "sirens"){
      items = DATA.sirens;
      modalTitle = "Сирени";
    } else if(section === "additional_equipment"){
      items = DATA.additional_equipment;
      modalTitle = "Додаткове обладнання";
    } else if(section === "moduls"){
      items = DATA.modulesInner.filter(item => item.name === "M-OUT2R");
      modalTitle = "Модулі";
    } else if(section === "sens"){
      items = DATA.sensors;
      modalTitle = "Датчики";
    } else if(section === "sir"){
      items = DATA.sirens;
      modalTitle = "Сирени";
    } else if(section === "sir2"){
      items = DATA.sirens;
      modalTitle = "Сирени";
    }

    title.textContent = modalTitle;
    body.innerHTML = "";

    const grid = document.createElement("div");
    grid.className = "mod-grid";

    if(filterName){
      items = items.filter(i => i.name === filterName);
    }

    items.forEach(item=>{
      const card = document.createElement("div");
      card.className = "card";

      let disabled = false;
      let isCurrentlyInSlot = false;

      if(section === "modules" && device === "main" && clickedSlot !== null){
        const slotModule = universalSlots[clickedSlot];
        if(slotModule && slotModule.name === item.name){
          isCurrentlyInSlot = true;
        }
      }

      if(item.type === "Комунікатор"){
        if(!isCurrentlyInSlot){
          if(universalSlots.some(s => s && s.name===item.name)) disabled=true;
          if(universalSlots.some(s => s && MODULE_CONFLICTS[item.name]?.includes(s.name))) disabled=true;
        }
      }

      if(item.name === "M-OUT2R"){
        if(device === "main"){
          const count = Array.from(cart.values()).filter(v=>v.name==="M-OUT2R" && v.device==="main").length;
          const limit = SLOT_LIMITS["M-OUT2R"] || 2;
          if(count >= limit) disabled = true;
        } else {
          const hasM_OUT2R = Array.from(cart.values()).some(v=>v.name==="M-OUT2R" && v.device===device);
          if(hasM_OUT2R && section === "moduls") {
            isCurrentlyInSlot = true;
          }
        }
      }

      const TOGGLEABLE = ["M-OUT2R","M-2G","M-NET+","M-WiFi"];
      const canToggle = device !== "main" && TOGGLEABLE.includes(item.name);
      const alreadyAddedForDevice = canToggle && Array.from(cart.values()).some(v=>v.device === device && v.name === item.name);

      if(disabled && !isCurrentlyInSlot) card.classList.add("disabled");
      if(alreadyAddedForDevice || isCurrentlyInSlot) card.classList.add("selected");

      const label = item.addLoops ? `${item.name} (+${item.addLoops} ШС)` : item.name;

      card.innerHTML = `
        <img src="../${item.img}">
        <div class="card-label">${label}</div>
      `;

      card.addEventListener("click", ()=>{
        if(card.classList.contains("disabled")) return;

        if(isCurrentlyInSlot && section === "modules" && device === "main" && clickedSlot !== null){
          const slotModule = universalSlots[clickedSlot];
          if(slotModule){
            const keyToRemove = slotModule.key;
            cart.delete(keyToRemove);
            universalSlots[clickedSlot] = null;
            renderTable();
            updateSlotUI();
            updateTotals();
            modal.classList.remove("open");
            return;
          }
        }

        if(canToggle || (section === "moduls" && device !== "main")){
          const isSelected = card.classList.contains('selected');
          if(isSelected){
            Array.from(cart.keys()).forEach(k=>{
              const it = cart.get(k);
              if(it && it.device===device && it.name===item.name) cart.delete(k);
            });
            card.classList.remove('selected');
            
            // ВИПРАВЛЕННЯ: Рендеримо тільки потрібні таблиці
            if(device === "main"){
              renderTable();
              updateSlotUI();
            } else {
              renderExtTables(device); // Передаємо deviceId
              updateExtHotspotsUI(device);
              updateExtDeviceCapacity(device);
            }
            
            updateTotals();
            checkLoopsLimit();
            modal.classList.remove("open");
            return;
          } else {
              addToCart(item.type || "Модуль", item.name, item.normal, item.alarm, device, null, section);
              card.classList.add('selected');
              
              // ВИПРАВЛЕННЯ: Рендеримо тільки потрібні таблиці
              if(device === "main"){
                renderTable();
                updateSlotUI();
              } else {
                renderExtTables(device); // Передаємо deviceId
                updateExtHotspotsUI(device);
                updateExtDeviceCapacity(device);
              }
              
              updateTotals();
              checkLoopsLimit();
              if(filterName && item.name === filterName){
                modal.classList.remove('open');
              }
              modal.classList.remove("open");
              return;
          }
        }

        if(item.addLoops){
          addExtDevice(item);
        } else {
          let slotIdx = null;
          if(section === "modules" && device === "main"){
            slotIdx = clickedSlot !== null ? clickedSlot : getAvailableSlot();
          }
          addToCart(item.type || "Модуль", item.name, item.normal, item.alarm, device, slotIdx, section);
        }

        modal.classList.remove("open");
      });

      grid.appendChild(card);
    });

    body.appendChild(grid);
  }

  function getAvailableSlot(){
    for(let i=0; i<universalSlots.length; i++){
      if(!universalSlots[i]) return i;
    }
    return null;
  }

  function attachEvents(){
    slotButtons = Array.from(qsa(".hot-mod-1, .hot-mod-2"));
    
    slotButtons.forEach((btn)=>{
      btn.addEventListener("click", (e)=>{
        const slotIdx = parseInt(btn.dataset.slot);
        openModalFor("modules", "main", null, slotIdx);
      });
    });

    const hotModuls = qs(".hot-moduls");
    if(hotModuls){
      hotModuls.addEventListener("click", ()=>openModalFor("exmoduls", "main"));
    }
    
    const hotSens = qs(".hot-sens");
    if(hotSens){
      hotSens.addEventListener("click", ()=>openModalFor("sensors", "main"));
    }

    const hotSir = qs(".hot-sir");
    if(hotSir){
      hotSir.addEventListener("click", ()=>openModalFor("sir", "main"));
    }

    const hotSir2 = qs(".hot-sir2");
    if(hotSir2){
      hotSir2.addEventListener("click", ()=>openModalFor("sir2", "main"));
    }

    const hotAdditional = qs(".hot-additional");
    if(hotAdditional){
      hotAdditional.addEventListener("click", ()=>openModalFor("additional_equipment", "main"));
    }

    const clearAllBtn = qs("#clearAll");
    if(clearAllBtn){
      clearAllBtn.addEventListener("click", ()=>{
        // ВИПРАВЛЕННЯ: Очищаємо тільки основний прилад, не торкаючись розширювачів
        universalSlots.fill(null);
        
        // Видаляємо тільки елементи з device === "main"
        Array.from(cart.keys()).forEach(k=>{
          const item = cart.get(k);
          if(item && item.device === "main"){
            cart.delete(k);
          }
        });
        
        // Відновлюємо базовий прилад
    const baseNormal = DEVICE_CONFIG.baseDevice.modes.normal.current;
    const baseAlarm = DEVICE_CONFIG.baseDevice.alarmCurrent;
    
    cart.set("base", {
        type: "Прилад",
        name: DATA.base.name,
        normal: baseNormal,
        alarm: baseAlarm,
        qty: 1,
        device: "main",
        key: "base"
    });
        
        // Оновлюємо тільки UI основного пристрою
        renderTable();
        updateSlotUI();
        updateTotals();
        // Важливо! Перемальовуємо ВСІ таблиці розширювачів,
        // бо їх вміст міг бути пошкоджений логікою
        renderExtTables();           // ← без аргументу — перемалює всі
        extDevs.forEach(dev => {
        if (dev) {
            updateExtDeviceCapacity(dev.id);
            updateExtHotspotsUI(dev.id);
        }
      });
      });
    }

    const closeModalBtn = qs("#closeModal");
    if(closeModalBtn){
      closeModalBtn.addEventListener("click", ()=>{
        const modal = qs("#modal");
        if(modal) modal.classList.remove("open");
      });
    }

    if(deviceModeSelect) deviceModeSelect.addEventListener("change", updateTotals);
    if(hoursSelect) hoursSelect.addEventListener("change", updateTotals);
    if(loopsInput){
      loopsInput.addEventListener("input", ()=>{
        checkLoopsLimit();
        updateTotals();
      });
    }
    
    const mainTabBtn = qs('[data-device-tab="main"]');
    if(mainTabBtn){
      mainTabBtn.addEventListener("click", ()=>switchDeviceTab("main"));
    }
  }

  async function init(){
    const loaded = await loadConfigs();
    if (!loaded) return;

    updatePageUI();
    initDOMReferences();
    initCart();
    setupDeviceTabs();
    switchDeviceTab("main");
    renderTable();
    updateSlotUI();
    attachEvents();
    updateTotals();
  }

  document.addEventListener("DOMContentLoaded", init);

})();

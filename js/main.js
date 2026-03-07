// JeroCalendar v8.1 Main Logic - The Sync Queue Foundation
const CLIENT_ID = '538529257653-1rac4r8uedqq75pqmlrhrhlfnhkhgkn4.apps.googleusercontent.com'; 
const SCOPES = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/tasks https://www.googleapis.com/auth/calendar.readonly';
let tokenClient, gapiInited = false, gisInited = false;
let dataCache = {}; let renderedMonths = []; let observer, isFetching = false, isAuthError = false;
let selectedDateStr = "", selectedColorId = "", selectedTaskColorId = "", currentView = 'calendar';
const GOOGLE_COLORS = { "1":"#7986cb", "2":"#33b679", "3":"#8e24aa", "4":"#e67c73", "5":"#f6bf26", "6":"#f4511e", "7":"#039be5", "8":"#616161", "9":"#3f51b5", "10":"#0b8043", "11":"#d50000" };
let advancedDict = [];
const DEFAULT_ADV_DICT = [{ keys: ["誕生日", "【誕】"], icon: "🎂", bg: "#ff2d55", txt: "#ffffff" }, { keys: ["会議", "【会】"], icon: "👥", bg: "#5856d6", txt: "#ffffff" }, { keys: ["休日", "【休】"], icon: "🏖️", bg: "#ff3b30", txt: "#ffffff" }];

function initWeekdays() { const days = ['日','月','火','水','木','金','土']; const c = document.getElementById('weekdays'); if(c) c.innerHTML = days.map(d => `<div class="wd">${d}</div>`).join(''); }
function loadSettings() { 
    const th = localStorage.getItem('jero_theme')||'light'; const fs = localStorage.getItem('jero_fs')||'10'; 
    document.getElementById('st-theme').value=th; document.getElementById('st-fs').value=fs; 
    document.body.setAttribute('data-theme',th); document.documentElement.style.setProperty('--fs', fs+'px'); document.getElementById('fs-val').innerText=fs; 
    const voiceEnabled = localStorage.getItem('jero_voice_enabled') === 'true';
    const stVoice = document.getElementById('st-voice');
    if(stVoice) stVoice.checked = voiceEnabled; 
    if(typeof isVoiceEnabled !== 'undefined') isVoiceEnabled = voiceEnabled;
}
function saveAndApplySettings() { const th = document.getElementById('st-theme').value; const fs = document.getElementById('st-fs').value; localStorage.setItem('jero_theme',th); localStorage.setItem('jero_fs',fs); document.body.setAttribute('data-theme',th); document.documentElement.style.setProperty('--fs', fs+'px'); document.getElementById('fs-val').innerText=fs; }
function setProgress(p) { const pb = document.getElementById('progress-bar'); if(pb) { pb.style.width = p+'%'; if(p>=100) setTimeout(()=>pb.style.width='0%', 500); } }
function closeAllModals() { document.querySelectorAll('.bottom-modal').forEach(m => m.classList.remove('active')); document.getElementById('overlay').classList.remove('active'); }
function openSettings() { document.getElementById('overlay').classList.add('active'); document.getElementById('settings-modal').classList.add('active'); }
function closeSettings() { document.getElementById('settings-modal').classList.remove('active'); document.getElementById('overlay').classList.remove('active'); }
function switchAccount() { localStorage.removeItem('jero_token'); localStorage.removeItem('jero_token_time'); location.reload(); }
function exportSettings() { showToast('未実装だ。機能拡充を待て。'); }
function importSettings() { showToast('未実装だ。'); }
function executeEmergencyReset() { if(confirm('全キャッシュを消去するか？')) { indexedDB.deleteDatabase('JeroDB_v8'); localStorage.clear(); location.reload(); } }

function openEditor(e) { showToast('エディタは現在準備中だ'); }
function closeEditor() { document.getElementById('editor-modal').classList.remove('active'); }
function openTaskEditor(t) { showToast('タスクエディタは現在準備中だ'); }
function closeTaskEditor() { document.getElementById('task-editor-modal').classList.remove('active'); }
function confirmDeleteEvent() {} function duplicateEvent() {} function saveEvent() {} function openRecurrenceEditor() {} function closeRecurrenceEditor() { document.getElementById('recurrence-modal').classList.remove('active'); } function updateRecDisplay() {} function applyRecurrence() {} function confirmDeleteTask() {} function saveTask() {}

function showGlobalLoader(msg) { document.getElementById('loader-msg').innerText = msg; document.getElementById('global-loader').classList.add('active'); }
function hideGlobalLoader() { document.getElementById('global-loader').classList.remove('active'); }
const yieldUI = () => new Promise(r => setTimeout(r, 30));
function showToast(msg) { const toast = document.getElementById('toast'); toast.innerText = msg; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 5000); }

// --- IndexedDB & The Sync Queue Foundation ---
let idb;
function initIDB() { 
    return new Promise((resolve) => { 
        const timeout = setTimeout(() => { resolve(); }, 2000); 
        try { 
            // バージョンを上げて sync_queue を新設
            const req = indexedDB.open('JeroDB_v8', 3); 
            req.onupgradeneeded = (e) => { 
                const db = e.target.result; 
                if (!db.objectStoreNames.contains('images')) db.createObjectStore('images', { keyPath: 'id' }); 
                if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache', { keyPath: 'key' }); 
                if (!db.objectStoreNames.contains('sync_queue')) db.createObjectStore('sync_queue', { keyPath: 'id' }); 
            }; 
            req.onsuccess = (e) => { clearTimeout(timeout); idb = e.target.result; resolve(); }; 
            req.onerror = (e) => { clearTimeout(timeout); resolve(); }; 
        } catch(e) { clearTimeout(timeout); resolve(); } 
    }); 
}

// Queue操作用ユーティリティ
function saveToSyncQueue(actionPayload) {
    return new Promise((resolve) => {
        if(!idb) return resolve();
        try { const tx = idb.transaction('sync_queue', 'readwrite'); tx.objectStore('sync_queue').put({ id: generateUUID(), payload: actionPayload, timestamp: Date.now() }); tx.oncomplete = () => resolve(); } catch(e) { resolve(); }
    });
}
function getSyncQueue() {
    return new Promise((resolve) => {
        if(!idb) return resolve([]);
        try { const tx = idb.transaction('sync_queue', 'readonly'); const req = tx.objectStore('sync_queue').getAll(); req.onsuccess = () => resolve(req.result || []); } catch(e) { resolve([]); }
    });
}
function clearSyncQueueItem(id) {
    if(!idb) return;
    try { const tx = idb.transaction('sync_queue', 'readwrite'); tx.objectStore('sync_queue').delete(id); } catch(e) {}
}

function saveDataCacheToIDB(monthKey, data) { if(!idb) return; try { const tx = idb.transaction('cache', 'readwrite'); tx.objectStore('cache').put({ key: monthKey, data: data, timestamp: Date.now() }); } catch(e) {} }
function loadDataCacheFromIDB() { return new Promise((resolve) => { if(!idb) return resolve(); try { const tx = idb.transaction('cache', 'readonly'); const req = tx.objectStore('cache').getAll(); req.onsuccess = () => { if (req.result) { req.result.forEach(item => { dataCache[item.key] = item.data; }); } resolve(); }; req.onerror = () => resolve(); } catch(e) { resolve(); } }); }
function saveImageToIDB(id, dataUrl) { return new Promise((resolve, reject) => { if(!idb) return resolve(); try { const tx = idb.transaction('images', 'readwrite'); tx.oncomplete = () => resolve(); tx.onerror = (e) => reject(e); tx.objectStore('images').put({ id: id, data: dataUrl }); } catch(err) { reject(err); } }); }
function getImageFromIDB(id) { return new Promise((resolve) => { if(!idb) return resolve(null); try { const tx = idb.transaction('images', 'readonly'); const req = tx.objectStore('images').get(id); req.onsuccess = () => resolve(req.result ? req.result.data : null); req.onerror = () => resolve(null); } catch(err) { resolve(null); } }); }
function generateUUID() { return 'xxxx-xxxx-4xxx-yxxx'.replace(/[xy]/g, function(c) { var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8); return v.toString(16); }); }
function compressImage(file, maxSize = 500) { return new Promise((resolve) => { const reader = new FileReader(); reader.onload = (e) => { const img = new Image(); img.onload = () => { const canvas = document.createElement('canvas'); let width = img.width, height = img.height; if (width > height && width > maxSize) { height *= maxSize / width; width = maxSize; } else if (height > maxSize) { width *= maxSize / height; height = maxSize; } canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, width, height); resolve(canvas.toDataURL('image/jpeg', 0.6)); }; img.src = e.target.result; }; reader.readAsDataURL(file); }); }

function initColorPicker() { const picker = document.getElementById('color-picker'); if(!picker) return; picker.innerHTML = `<div class="color-opt selected" style="background:var(--accent)" onclick="selectColor(this, '')"></div>`; Object.keys(GOOGLE_COLORS).forEach(id => { picker.innerHTML += `<div class="color-opt" style="background:${GOOGLE_COLORS[id]}" onclick="selectColor(this, '${id}')"></div>`; }); }
function selectColor(el, id) { document.querySelectorAll('#color-picker .color-opt').forEach(c => c.classList.remove('selected')); el.classList.add('selected'); selectedColorId = id; }
function initTaskColorPicker() { const picker = document.getElementById('task-color-picker'); if(!picker) return; picker.innerHTML = `<div class="color-opt selected" style="background:#34c759" onclick="selectTaskColor(this, '')"></div>`; Object.keys(GOOGLE_COLORS).forEach(id => { picker.innerHTML += `<div class="color-opt" style="background:${GOOGLE_COLORS[id]}" onclick="selectTaskColor(this, '${id}')"></div>`; }); }
function selectTaskColor(el, id) { document.querySelectorAll('#task-color-picker .color-opt').forEach(c => c.classList.remove('selected')); el.classList.add('selected'); selectedTaskColorId = id; }

let currentAttachments = []; 
function renderAttachPreviews(containerId) { const container = document.getElementById(containerId); if(!container) return; container.innerHTML = ''; currentAttachments.forEach((att, idx) => { const div = document.createElement('div'); div.className = 'preview-item'; if(att.type === 'img') { div.innerHTML = `<img src="${att.dataUrl}"><div class="preview-del" onclick="removeAttach(${idx}, '${containerId}')">✕</div>`; } else { div.innerHTML = `<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:var(--accent); color:white; font-size:10px; font-weight:bold; word-break:break-all; padding:4px; box-sizing:border-box;">LINK</div><div class="preview-del" onclick="removeAttach(${idx}, '${containerId}')">✕</div>`; } container.appendChild(div); }); }
function removeAttach(idx, containerId) { currentAttachments.splice(idx, 1); renderAttachPreviews(containerId); }
async function handleImageUpload(e, containerId) { const file = e.target.files[0]; if(!file) return; showGlobalLoader('画像を最適化中...'); await yieldUI(); try { const dataUrl = await compressImage(file); currentAttachments.push({ id: generateUUID(), dataUrl: dataUrl, type: 'img' }); renderAttachPreviews(containerId); } catch(err) { showToast('画像処理に失敗しました。'); } hideGlobalLoader(); e.target.value = ''; }
function addUrlPrompt() { const url = prompt("共有リンクURLを入力:"); if(url) { currentAttachments.push({ id: url, dataUrl: url, type: 'link' }); renderAttachPreviews('edit-attach-preview'); } }
function addTaskUrlPrompt() { const url = prompt("共有リンクURLを入力:"); if(url) { currentAttachments.push({ id: url, dataUrl: url, type: 'link' }); renderAttachPreviews('task-attach-preview'); } }

function loadDict() { const saved = localStorage.getItem('jero_adv_dict'); if (saved) { try { advancedDict = JSON.parse(saved); } catch(e) { advancedDict = JSON.parse(JSON.stringify(DEFAULT_ADV_DICT)); } } else { advancedDict = JSON.parse(JSON.stringify(DEFAULT_ADV_DICT)); } renderDictUI(); }
function saveDict() { localStorage.setItem('jero_adv_dict', JSON.stringify(advancedDict)); renderDictUI(); triggerFullReRender(); }
function renderDictUI() { const container = document.getElementById('dict-list'); if(!container) return; container.innerHTML = ''; if(advancedDict.length === 0) { container.innerHTML = '<div style="color:#888; font-size:12px;">辞書は空だ。</div>'; return; } advancedDict.forEach((item, idx) => { const el = document.createElement('div'); el.className = 'dict-item'; el.innerHTML = `<div class="dict-info"><div>${item.icon} <span style="font-weight:bold;">${item.keys.join(', ')}</span></div><div><span class="dict-badge" style="background:${item.bg}; color:${item.txt};">Sample</span></div></div><div style="display:flex; flex-direction:column; gap:4px;"><button class="dict-btn-edit" onclick="openDictEditor(${idx})">編集</button><button class="dict-btn-del" onclick="removeDictItem(${idx})">削除</button></div>`; container.appendChild(el); }); }
function openDictEditor(idx = -1) { document.getElementById('dict-editor-modal').classList.add('active'); if (idx >= 0) { const item = advancedDict[idx]; document.getElementById('dict-edit-idx').value = idx; document.getElementById('dict-edit-keys').value = item.keys.join(', '); document.getElementById('dict-edit-icon').value = item.icon; document.getElementById('dict-edit-bg').value = item.bg; document.getElementById('dict-edit-txt').value = item.txt; document.getElementById('dict-editor-title').innerText = '辞書編集'; } else { document.getElementById('dict-edit-idx').value = -1; document.getElementById('dict-edit-keys').value = ''; document.getElementById('dict-edit-icon').value = ''; document.getElementById('dict-edit-bg').value = '#0a84ff'; document.getElementById('dict-edit-txt').value = '#ffffff'; document.getElementById('dict-editor-title').innerText = '新規追加'; } }
function closeDictEditor() { document.getElementById('dict-editor-modal').classList.remove('active'); }
function saveDictItem() { const idx = parseInt(document.getElementById('dict-edit-idx').value); const keysRaw = document.getElementById('dict-edit-keys').value; const icon = document.getElementById('dict-edit-icon').value.trim(); const bg = document.getElementById('dict-edit-bg').value; const txt = document.getElementById('dict-edit-txt').value; if(!keysRaw || !icon) return; const keys = keysRaw.split(',').map(k => k.trim()).filter(k => k); const newItem = { keys, icon, bg, txt }; if(idx >= 0) advancedDict[idx] = newItem; else advancedDict.push(newItem); saveDict(); closeDictEditor(); }
function removeDictItem(idx) { advancedDict.splice(idx, 1); saveDict(); }
function processSemanticText(text) { if (!text) return { text: "", style: null }; let resText = text; let matchStyle = null; for (const item of advancedDict) { let matched = false; for (const key of item.keys) { if (resText.includes(key)) { resText = resText.split(key).join(item.icon); matched = true; } } if(matched && !matchStyle) { matchStyle = { bg: item.bg, txt: item.txt }; } } return { text: resText, style: matchStyle }; }
function extractTaskData(notes) { if(!notes) return { colorId: "", recurrence: "", cleanNotes: "" }; let colorId = "", recurrence = "", cleanNotes = notes; const cMatch = cleanNotes.match(/\[c:(\d+)\]/); if (cMatch) { colorId = cMatch[1]; cleanNotes = cleanNotes.replace(/\[c:\d+\]/, ''); } const rMatch = cleanNotes.match(/\[r:([A-Z]+)\]/); if (rMatch) { recurrence = rMatch[1]; cleanNotes = cleanNotes.replace(/\[r:[A-Z]+\]/, ''); } return { colorId, recurrence, cleanNotes: cleanNotes.trim() }; }

function setupObserver() { const options = { rootMargin: '300px', threshold: 0.1 }; observer = new IntersectionObserver((entries) => { entries.forEach(e => { if(e.isIntersecting && !isFetching && localStorage.getItem('jero_token') && !isAuthError) { if(e.target.id === 'bottom-trigger' || e.target.id === 'agenda-bottom-trigger') { loadNextMonth().then(() => { if(currentView === 'agenda') renderAgendaView(); }); } if(e.target.id === 'top-trigger' || e.target.id === 'agenda-top-trigger') { loadPrevMonth().then(() => { if(currentView === 'agenda') renderAgendaView(); }); } } }); }, options); ['bottom-trigger', 'top-trigger', 'agenda-bottom-trigger', 'agenda-top-trigger'].forEach(id => { const el = document.getElementById(id); if(el) observer.observe(el); }); }
document.getElementById('scroll-container').addEventListener('scroll', updateHeaderDisplay);
function updateHeaderDisplay() { if (isAuthError) return; const wrappers = document.querySelectorAll('.month-wrapper'); wrappers.forEach(w => { const rect = w.getBoundingClientRect(); if(rect.top < window.innerHeight / 2 && rect.bottom > window.innerHeight / 2) { document.getElementById('month-display').innerText = w.querySelector('.month-title').innerText; } }); }
function scrollToToday() { const today = new Date(); const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`; const target = document.getElementById(`cell-${dateStr}`); if(target) target.scrollIntoView({ behavior: 'smooth', block: 'center' }); }

function triggerFullReRender() { if (!localStorage.getItem('jero_token')) return; document.getElementById('calendar-wrapper').innerHTML = ''; renderedMonths = []; const today = new Date(); const y = today.getFullYear(); const m = today.getMonth(); renderMonthDOM(y, m, dataCache[`${y}-${m}`], 'append'); renderMonthDOM(y, m+1, dataCache[`${y}-${m+1}`], 'append'); if(currentView === 'agenda') renderAgendaView(); }
function toggleView() { const calView = document.getElementById('calendar-view'); const agendaView = document.getElementById('agenda-view'); const btn = document.getElementById('view-toggle-btn'); if(currentView === 'calendar') { currentView = 'agenda'; calView.style.display = 'none'; agendaView.style.display = 'block'; btn.innerText = '📅'; renderAgendaView(); } else { currentView = 'calendar'; calView.style.display = 'block'; agendaView.style.display = 'none'; btn.innerText = '📝'; scrollToToday(); } }

async function renderAgendaView() { 
    const container = document.getElementById('agenda-content'); container.innerHTML = ''; const today = new Date(); today.setHours(0,0,0,0); let allItems = []; 
    for (const monthKey in dataCache) { const data = dataCache[monthKey]; if(data.events) data.events.forEach(e => { const stDate = e.start.date ? new Date(e.start.date) : new Date(e.start.dateTime); if(stDate >= today || isEventSpanning(e, today.toISOString().split('T')[0]) !== 'single') { allItems.push({ type: 'event', dateObj: stDate, data: e }); } }); if(data.tasks) data.tasks.filter(t => t.due).forEach(t => { const dDate = new Date(t.due); if(dDate >= today) allItems.push({ type: 'task', dateObj: dDate, data: t }); }); } 
    allItems.sort((a, b) => a.dateObj - b.dateObj); const grouped = {}; allItems.forEach(item => { const dStr = `${item.dateObj.getFullYear()}-${String(item.dateObj.getMonth()+1).padStart(2,'0')}-${String(item.dateObj.getDate()).padStart(2,'0')}`; if(!grouped[dStr]) grouped[dStr] = []; grouped[dStr].push(item); }); const days = ['日','月','火','水','木','金','土']; 
    if(Object.keys(grouped).length === 0) { container.innerHTML = '<div style="padding: 30px; text-align: center; color: #888;">予定はありません。</div>'; return; } 
    for (const [dStr, items] of Object.entries(grouped)) { 
        const dObj = new Date(dStr); const isToday = dObj.getTime() === today.getTime(); const dayHeader = document.createElement('div'); dayHeader.className = 'agenda-day-header'; dayHeader.innerText = `${dObj.getMonth()+1}月${dObj.getDate()}日 (${days[dObj.getDay()]}) ${isToday ? ' - 今日' : ''}`; if(isToday) dayHeader.style.color = '#ff3b30'; 
        const listCont = document.createElement('div'); listCont.className = 'agenda-list-container card-list'; 
        for(const item of items) { listCont.innerHTML += `<div style="padding:10px; background:var(--card-bg); border-radius:8px;">${item.data.summary || item.data.title || '(名称不明)'}</div>`; } 
        container.appendChild(dayHeader); container.appendChild(listCont); 
    } 
}

async function openDailyModal(dateStr, dow) {
    selectedDateStr = dateStr; const days = ['日','月','火','水','木','金','土']; const [y, m, d] = dateStr.split('-'); document.getElementById('daily-date-title').innerText = `${parseInt(m)}月${parseInt(d)}日 (${days[dow]})`;
    const list = document.getElementById('daily-list'); list.innerHTML = ''; const monthKey = `${y}-${parseInt(m)-1}`; const data = dataCache[monthKey]; let hasItems = false;
    if(data) {
        if(data.events) { const events = data.events.filter(e => { if(!e.start) return false; const td = e.start.date || e.start.dateTime; return td && td.includes(dateStr) || (e.start.date && isEventSpanning(e, dateStr) !== 'single'); }); for(const e of events) { hasItems = true; list.innerHTML += `<div style="padding:10px; border-bottom:1px solid var(--border);">${e.summary || '(無名)'}</div>`; } }
        if(data.tasks) { const tasks = data.tasks.filter(t => t.due && t.due.includes(dateStr)); for(const t of tasks) { hasItems = true; list.innerHTML += `<div style="padding:10px; border-bottom:1px solid var(--border);">☑ ${t.title || '(無名)'}</div>`; } }
    }
    if(!hasItems) list.innerHTML = `<div style="text-align:center; color:#888; padding: 30px; font-weight: 500;">予定はありません</div>`;
    document.getElementById('overlay').classList.add('active'); setTimeout(() => document.getElementById('daily-modal').classList.add('active'), 10);
}

async function initCalendar() { 
    setProgress(10); 
    try { 
        await loadDataCacheFromIDB(); 
        const today = new Date(); const y = today.getFullYear(); const m = today.getMonth(); 
        await fetchAndRenderMonth(y, m, 'append', false); 
        await fetchAndRenderMonth(y, m+1, 'append', false); 
        scrollToToday();
        if (navigator.onLine && !isAuthError) { document.getElementById('offline-badge').classList.remove('active'); fetchAndRenderMonth(y, m, 'replace', true); fetchAndRenderMonth(y, m+1, 'replace', true); } else { document.getElementById('offline-badge').classList.add('active'); }
    } finally { setProgress(100); } 
}

async function loadNextMonth() { if(renderedMonths.length === 0 || isFetching || isAuthError) return; isFetching = true; document.getElementById('bottom-trigger').classList.remove('hidden'); document.getElementById('agenda-bottom-trigger').classList.remove('hidden'); try { const last = renderedMonths[renderedMonths.length - 1]; let nextY = last.year; let nextM = last.month + 1; if(nextM > 11) { nextM = 0; nextY++; } await fetchAndRenderMonth(nextY, nextM, 'append'); } finally { isFetching = false; document.getElementById('bottom-trigger').classList.add('hidden'); document.getElementById('agenda-bottom-trigger').classList.add('hidden');} }
async function loadPrevMonth() { if(renderedMonths.length === 0 || isFetching || isAuthError) return; isFetching = true; document.getElementById('top-trigger').classList.remove('hidden'); document.getElementById('agenda-top-trigger').classList.remove('hidden'); try { const container = document.getElementById('scroll-container'); const oldHeight = container.scrollHeight; const first = renderedMonths[0]; let prevY = first.year; let prevM = first.month - 1; if(prevM < 0) { prevM = 11; prevY--; } await fetchAndRenderMonth(prevY, prevM, 'prepend'); container.scrollTop += (container.scrollHeight - oldHeight); } finally { isFetching = false; document.getElementById('top-trigger').classList.add('hidden'); document.getElementById('agenda-top-trigger').classList.add('hidden');} }
function notifyAuthError() { isAuthError = true; localStorage.removeItem('jero_token'); localStorage.removeItem('jero_token_time'); document.getElementById('auth-btn').style.display = 'block'; document.getElementById('auth-btn').classList.add('auth-pulse'); const monthDisp = document.getElementById('month-display'); monthDisp.innerText = '⚠️右上の🔑をタップ'; monthDisp.style.color = '#ff3b30'; }

async function fetchAndRenderMonth(year, month, position = 'append', forceFetch = false) {
    if (isAuthError) return; const monthKey = `${year}-${month}`; const startOfMonth = new Date(year, month, 1).toISOString(); const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59).toISOString();
    let needsRender = false;
    if (forceFetch || !dataCache[monthKey]) { 
        if (!navigator.onLine) { if (!dataCache[monthKey]) showToast('オフラインのためデータが取得できません。'); return; }
        let events = [], tasks = [], authErrorDetected = false; 
        try { const eResp = await gapi.client.calendar.events.list({ calendarId: 'primary', timeMin: startOfMonth, timeMax: endOfMonth, singleEvents: true, orderBy: 'startTime', maxResults: 1000 }); events = eResp.result.items || []; } catch(e) { const code = e.status || (e.result && e.result.error && e.result.error.code); if (code === 401 || code === 403) authErrorDetected = true; } 
        try { const tResp = await gapi.client.tasks.tasks.list({ tasklist: '@default', dueMin: startOfMonth, dueMax: endOfMonth, showHidden: true }); tasks = tResp.result.items || []; } catch(e) { const code = e.status || (e.result && e.result.error && e.result.error.code); if (code === 401 || code === 403) authErrorDetected = true; } 
        if (authErrorDetected) { notifyAuthError(); return; } 
        dataCache[monthKey] = { events, tasks }; saveDataCacheToIDB(monthKey, { events, tasks }); needsRender = true;
    } else { if (!document.getElementById(`month-${year}-${month}`)) needsRender = true; }
    if (needsRender) { const existing = document.getElementById(`month-${year}-${month}`); if(existing) existing.remove(); renderMonthDOM(year, month, dataCache[monthKey], position); if(!existing) { if (position === 'append') renderedMonths.push({year, month}); else if (position === 'prepend') renderedMonths.unshift({year, month}); } updateHeaderDisplay(); }
}

function isEventSpanning(eventObj, dateStr) { if(!eventObj.start.date || !eventObj.end.date) return 'single'; const st = new Date(eventObj.start.date); const ed = new Date(eventObj.end.date); ed.setDate(ed.getDate() - 1); const tgt = new Date(dateStr); if(st.getTime() === ed.getTime()) return 'single'; if(tgt.getTime() === st.getTime()) return 'span-start'; if(tgt.getTime() === ed.getTime()) return 'span-end'; if(tgt > st && tgt < ed) return 'span-mid'; return 'single'; }

function renderMonthDOM(year, month, data, position) {
    if(!data) return; const wrapper = document.createElement('div'); wrapper.className = 'month-wrapper'; wrapper.id = `month-${year}-${month}`; wrapper.innerHTML = `<div class="month-title">${year}年 ${month + 1}月</div><div class="calendar-grid"></div>`; const grid = wrapper.querySelector('.calendar-grid');
    const daysInMonth = new Date(year, month + 1, 0).getDate(); const firstDay = new Date(year, month, 1).getDay(); for (let i = 0; i < firstDay; i++) { const empty = document.createElement('div'); empty.className = 'day empty'; empty.style.backgroundColor = 'var(--head-bg)'; grid.appendChild(empty); }
    const sortedEvents = [...data.events].sort((a, b) => { const aAllDay = a.start.date ? 1 : 0; const bAllDay = b.start.date ? 1 : 0; if(aAllDay !== bAllDay) return bAllDay - aAllDay; return 0; });
    const today = new Date();
    for (let i = 1; i <= daysInMonth; i++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`; const dayEl = document.createElement('div'); let className = 'day'; const dow = new Date(year, month, i).getDay();
        if (dow === 0) dayEl.style.backgroundColor = 'var(--sun)'; if (dow === 6) dayEl.style.backgroundColor = 'var(--sat)'; if (year === today.getFullYear() && month === today.getMonth() && i === today.getDate()) className += ' today';
        dayEl.className = className; dayEl.id = `cell-${dateStr}`; dayEl.setAttribute('onclick', `openDailyModal('${dateStr}', ${dow})`); dayEl.innerHTML = `<div class="day-num">${i}</div>`;
        sortedEvents.filter(e => { if (!e.start) return false; const td = e.start.date || e.start.dateTime; return td && td.includes(dateStr) || (e.start.date && isEventSpanning(e, dateStr) !== 'single'); }).forEach(e => { const div = document.createElement('div'); div.className = 'event'; let timeStr = ""; if(e.start.dateTime) { const d = new Date(e.start.dateTime); timeStr = `${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')} `; } const spanType = isEventSpanning(e, dateStr); if(spanType !== 'single') div.classList.add(spanType); const recurIcon = e.recurrence ? '🔁 ' : ''; const pData = processSemanticText(e.summary); div.innerText = timeStr + recurIcon + pData.text; if(pData.style) { div.style.backgroundColor = pData.style.bg; div.style.color = pData.style.txt; } else if(e.colorId && GOOGLE_COLORS[e.colorId]) { div.style.backgroundColor = GOOGLE_COLORS[e.colorId]; } if(spanType === 'span-mid' || spanType === 'span-end') div.style.color = 'transparent'; dayEl.appendChild(div); });
        if(data.tasks) data.tasks.filter(t => t.due && t.due.includes(dateStr)).forEach(t => { const div = document.createElement('div'); div.className = `task ${t.status === 'completed' ? 'completed' : ''}`; const tData = extractTaskData(t.notes); const pData = processSemanticText(t.title); const recurIcon = tData.recurrence ? '🔁 ' : ''; div.innerHTML = `<span style="opacity:0.8;">☑</span> ${recurIcon}${pData.text}`; if(pData.style) { div.style.backgroundColor = pData.style.bg; div.style.color = pData.style.txt; } else if(tData.colorId && GOOGLE_COLORS[tData.colorId]) { div.style.backgroundColor = GOOGLE_COLORS[tData.colorId]; } dayEl.appendChild(div); });
        grid.appendChild(dayEl);
    }
    const container = document.getElementById('calendar-wrapper');
    if(position === 'append') container.appendChild(wrapper); 
    else if(position === 'prepend') container.insertBefore(wrapper, container.firstChild);
    else if(position === 'replace') { const children = Array.from(container.children); const insertIndex = children.findIndex(c => { const [_, y, m] = c.id.split('-'); return parseInt(y) > year || (parseInt(y) === year && parseInt(m) > month); }); if(insertIndex === -1) container.appendChild(wrapper); else container.insertBefore(wrapper, children[insertIndex]); }
}

// --- Online/Offline Event Listeners ---
window.addEventListener('online', async () => {
    document.getElementById('offline-badge').classList.remove('active');
    showToast('📶 電波が回復した。');
    if(typeof processSyncQueue === 'function') processSyncQueue(); // 次のフェーズでjero_core.jsに実装する
});
window.addEventListener('offline', () => {
    document.getElementById('offline-badge').classList.add('active');
    showToast('⚡️ 圏外になった。変更はポスト（キュー）に保存する。');
});

document.addEventListener('DOMContentLoaded', async () => { 
    try { 
        await initIDB(); 
        loadSettings(); 
        loadDict(); 
        initColorPicker(); 
        initTaskColorPicker(); 
        if(typeof initSpeech === 'function') initSpeech();
        if(typeof initNotification === 'function') initNotification();
    } catch (err) { showToast("初期化エラー: " + err.message); }
});

function gapiLoaded() { gapi.load('client', initializeGapiClient); }
async function initializeGapiClient() { await gapi.client.init({ discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest", "https://www.googleapis.com/discovery/v1/apis/tasks/v1/rest"]}); gapiInited = true; initWeekdays(); setupObserver(); checkAutoLogin(); }
function gisLoaded() { tokenClient = google.accounts.oauth2.initTokenClient({ client_id: CLIENT_ID, scope: SCOPES, callback: '', }); gisInited = true; }
function checkAutoLogin() { const savedToken = localStorage.getItem('jero_token'); const savedTime = localStorage.getItem('jero_token_time'); if (savedToken && savedTime && (Date.now() - savedTime < 3500000)) { gapi.client.setToken({access_token: savedToken}); document.getElementById('auth-btn').style.display = 'none'; initCalendar(); } else { notifyAuthError(); } }
async function handleAuthClick() { if (!gisInited || !gapiInited) return; tokenClient.callback = async (resp) => { if (resp.error !== undefined) throw (resp); gapi.client.setToken({access_token: resp.access_token}); localStorage.setItem('jero_token', resp.access_token); localStorage.setItem('jero_token_time', Date.now()); isAuthError = false; document.getElementById('auth-btn').style.display = 'none'; document.getElementById('auth-btn').classList.remove('auth-pulse'); document.getElementById('month-display').style.color = 'var(--txt)'; showToast('✅ 認証成功。'); document.getElementById('calendar-wrapper').innerHTML = ''; renderedMonths = []; dataCache = {}; initCalendar(); }; tokenClient.requestAccessToken({prompt: 'consent'}); }

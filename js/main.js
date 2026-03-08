// JeroCalendar v8.3 Main Logic - The Alchemical Converter
const CLIENT_ID = '538529257653-1rac4r8uedqq75pqmlrhrhlfnhkhgkn4.apps.googleusercontent.com'; 
const SCOPES = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/tasks https://www.googleapis.com/auth/calendar.readonly';
let tokenClient, gapiInited = false, gisInited = false;
let dataCache = {}; let renderedMonths = []; let observer, isFetching = false, isAuthError = false;
let selectedDateStr = "", selectedColorId = "", selectedTaskColorId = "", currentView = 'calendar';
const GOOGLE_COLORS = { "1":"#7986cb", "2":"#33b679", "3":"#8e24aa", "4":"#e67c73", "5":"#f6bf26", "6":"#f4511e", "7":"#039be5", "8":"#616161", "9":"#3f51b5", "10":"#0b8043", "11":"#d50000" };
let advancedDict = [];
const DEFAULT_ADV_DICT = [{ keys: ["誕生日", "【誕】"], icon: "🎂", bg: "#ff2d55", txt: "#ffffff" }, { keys: ["会議", "【会】"], icon: "👥", bg: "#5856d6", txt: "#ffffff" }, { keys: ["休日", "【休】"], icon: "🏖️", bg: "#ff3b30", txt: "#ffffff" }];

// --- UI Base Functions ---
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

function saveToSyncQueue(actionPayload) { return new Promise((resolve) => { if(!idb) return resolve(); try { const tx = idb.transaction('sync_queue', 'readwrite'); tx.objectStore('sync_queue').put({ id: generateUUID(), payload: actionPayload, timestamp: Date.now() }); tx.oncomplete = () => resolve(); } catch(e) { resolve(); } }); }
function getSyncQueue() { return new Promise((resolve) => { if(!idb) return resolve([]); try { const tx = idb.transaction('sync_queue', 'readonly'); const req = tx.objectStore('sync_queue').getAll(); req.onsuccess = () => resolve(req.result || []); } catch(e) { resolve([]); } }); }
function clearSyncQueueItem(id) { if(!idb) return; try { const tx = idb.transaction('sync_queue', 'readwrite'); tx.objectStore('sync_queue').delete(id); } catch(e) {} }

function saveDataCacheToIDB(monthKey, data) { if(!idb) return; try { const tx = idb.transaction('cache', 'readwrite'); tx.objectStore('cache').put({ key: monthKey, data: data, timestamp: Date.now() }); } catch(e) {} }
function loadDataCacheFromIDB() { return new Promise((resolve) => { if(!idb) return resolve(); try { const tx = idb.transaction('cache', 'readonly'); const req = tx.objectStore('cache').getAll(); req.onsuccess = () => { if (req.result) { req.result.forEach(item => { dataCache[item.key] = item.data; }); } resolve(); }; req.onerror = () => resolve(); } catch(e) { resolve(); } }); }
function generateUUID() { return 'xxxx-xxxx-4xxx-yxxx'.replace(/[xy]/g, function(c) { var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8); return v.toString(16); }); }

// --- Utils & Dictionaries ---
function loadDict() { const saved = localStorage.getItem('jero_adv_dict'); if (saved) { try { advancedDict = JSON.parse(saved); } catch(e) { advancedDict = JSON.parse(JSON.stringify(DEFAULT_ADV_DICT)); } } else { advancedDict = JSON.parse(JSON.stringify(DEFAULT_ADV_DICT)); } renderDictUI(); }
function saveDict() { localStorage.setItem('jero_adv_dict', JSON.stringify(advancedDict)); renderDictUI(); triggerFullReRender(); }
function renderDictUI() { const container = document.getElementById('dict-list'); if(!container) return; container.innerHTML = ''; if(advancedDict.length === 0) { container.innerHTML = '<div style="color:#888; font-size:12px;">辞書は空だ。</div>'; return; } advancedDict.forEach((item, idx) => { const el = document.createElement('div'); el.className = 'dict-item'; el.innerHTML = `<div class="dict-info"><div>${item.icon} <span style="font-weight:bold;">${item.keys.join(', ')}</span></div><div><span class="dict-badge" style="background:${item.bg}; color:${item.txt};">Sample</span></div></div><div style="display:flex; flex-direction:column; gap:4px;"><button class="dict-btn-edit" onclick="openDictEditor(${idx})">編集</button><button class="dict-btn-del" onclick="removeDictItem(${idx})">削除</button></div>`; container.appendChild(el); }); }
function openDictEditor(idx = -1) { document.getElementById('dict-editor-modal').classList.add('active'); if (idx >= 0) { const item = advancedDict[idx]; document.getElementById('dict-edit-idx').value = idx; document.getElementById('dict-edit-keys').value = item.keys.join(', '); document.getElementById('dict-edit-icon').value = item.icon; document.getElementById('dict-edit-bg').value = item.bg; document.getElementById('dict-edit-txt').value = item.txt; document.getElementById('dict-editor-title').innerText = '辞書編集'; } else { document.getElementById('dict-edit-idx').value = -1; document.getElementById('dict-edit-keys').value = ''; document.getElementById('dict-edit-icon').value = ''; document.getElementById('dict-edit-bg').value = '#0a84ff'; document.getElementById('dict-edit-txt').value = '#ffffff'; document.getElementById('dict-editor-title').innerText = '新規追加'; } }
function closeDictEditor() { document.getElementById('dict-editor-modal').classList.remove('active'); }
function saveDictItem() { const idx = parseInt(document.getElementById('dict-edit-idx').value); const keysRaw = document.getElementById('dict-edit-keys').value; const icon = document.getElementById('dict-edit-icon').value.trim(); const bg = document.getElementById('dict-edit-bg').value; const txt = document.getElementById('dict-edit-txt').value; if(!keysRaw || !icon) return; const keys = keysRaw.split(',').map(k => k.trim()).filter(k => k); const newItem = { keys, icon, bg, txt }; if(idx >= 0) advancedDict[idx] = newItem; else advancedDict.push(newItem); saveDict(); closeDictEditor(); }
function removeDictItem(idx) { advancedDict.splice(idx, 1); saveDict(); }
function processSemanticText(text) { if (!text) return { text: "", style: null }; let resText = text; let matchStyle = null; for (const item of advancedDict) { let matched = false; for (const key of item.keys) { if (resText.includes(key)) { resText = resText.split(key).join(item.icon); matched = true; } } if(matched && !matchStyle) { matchStyle = { bg: item.bg, txt: item.txt }; } } return { text: resText, style: matchStyle }; }
function extractTaskData(notes) { if(!notes) return { colorId: "", recurrence: "", cleanNotes: "" }; let colorId = "", recurrence = "", cleanNotes = notes; const cMatch = cleanNotes.match(/\[c:(\d+)\]/); if (cMatch) { colorId = cMatch[1]; cleanNotes = cleanNotes.replace(/\[c:\d+\]/, ''); } const rMatch = cleanNotes.match(/\[r:([A-Z]+)\]/); if (rMatch) { recurrence = rMatch[1]; cleanNotes = cleanNotes.replace(/\[r:[A-Z]+\]/, ''); } return { colorId, recurrence, cleanNotes: cleanNotes.trim() }; }

function initColorPicker() { const picker = document.getElementById('color-picker'); if(!picker) return; picker.innerHTML = `<div class="color-opt selected" style="background:var(--accent)" onclick="selectColor(this, '')"></div>`; Object.keys(GOOGLE_COLORS).forEach(id => { picker.innerHTML += `<div class="color-opt" style="background:${GOOGLE_COLORS[id]}" onclick="selectColor(this, '${id}')"></div>`; }); }
function selectColor(el, id) { document.querySelectorAll('#color-picker .color-opt').forEach(c => c.classList.remove('selected')); if(el) { el.classList.add('selected'); } else { document.querySelectorAll('#color-picker .color-opt').forEach(c => { if((id === '' && c.style.background === 'var(--accent)') || c.getAttribute('onclick').includes(`'${id}'`)) c.classList.add('selected'); }); } selectedColorId = id; }

function initTaskColorPicker() { const picker = document.getElementById('task-color-picker'); if(!picker) return; picker.innerHTML = `<div class="color-opt selected" style="background:#34c759" onclick="selectTaskColor(this, '')"></div>`; Object.keys(GOOGLE_COLORS).forEach(id => { picker.innerHTML += `<div class="color-opt" style="background:${GOOGLE_COLORS[id]}" onclick="selectTaskColor(this, '${id}')"></div>`; }); }
function selectTaskColor(el, id) { document.querySelectorAll('#task-color-picker .color-opt').forEach(c => c.classList.remove('selected')); if(el) { el.classList.add('selected'); } else { document.querySelectorAll('#task-color-picker .color-opt').forEach(c => { if((id === '' && c.style.background === 'rgb(52, 199, 89)') || c.getAttribute('onclick').includes(`'${id}'`)) c.classList.add('selected'); }); } selectedTaskColorId = id; }


// --- Calendar Rendering & Logic ---
function setupObserver() { const options = { rootMargin: '300px', threshold: 0.1 }; observer = new IntersectionObserver((entries) => { entries.forEach(e => { if(e.isIntersecting && !isFetching && localStorage.getItem('jero_token') && !isAuthError) { if(e.target.id === 'bottom-trigger' || e.target.id === 'agenda-bottom-trigger') { loadNextMonth().then(() => { if(currentView === 'agenda') renderAgendaView(); }); } if(e.target.id === 'top-trigger' || e.target.id === 'agenda-top-trigger') { loadPrevMonth().then(() => { if(currentView === 'agenda') renderAgendaView(); }); } } }); }, options); ['bottom-trigger', 'top-trigger', 'agenda-bottom-trigger', 'agenda-top-trigger'].forEach(id => { const el = document.getElementById(id); if(el) observer.observe(el); }); }
document.getElementById('scroll-container').addEventListener('scroll', updateHeaderDisplay);
function updateHeaderDisplay() { if (isAuthError) return; const wrappers = document.querySelectorAll('.month-wrapper'); wrappers.forEach(w => { const rect = w.getBoundingClientRect(); if(rect.top < window.innerHeight / 2 && rect.bottom > window.innerHeight / 2) { document.getElementById('month-display').innerText = w.querySelector('.month-title').innerText; } }); }
function scrollToToday() { const today = new Date(); const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`; const target = document.getElementById(`cell-${dateStr}`); if(target) target.scrollIntoView({ behavior: 'smooth', block: 'center' }); }

function triggerFullReRender() { if (!localStorage.getItem('jero_token')) return; document.getElementById('calendar-wrapper').innerHTML = ''; renderedMonths = []; const today = new Date(); const y = today.getFullYear(); const m = today.getMonth(); renderMonthDOM(y, m, dataCache[`${y}-${m}`], 'append'); renderMonthDOM(y, m+1, dataCache[`${y}-${m+1}`], 'append'); if(currentView === 'agenda') renderAgendaView(); }
function toggleView() { const calView = document.getElementById('calendar-view'); const agendaView = document.getElementById('agenda-view'); const btn = document.getElementById('view-toggle-btn'); if(currentView === 'calendar') { currentView = 'agenda'; calView.style.display = 'none'; agendaView.style.display = 'block'; btn.innerText = '📅'; renderAgendaView(); } else { currentView = 'calendar'; calView.style.display = 'block'; agendaView.style.display = 'none'; btn.innerText = '📝'; scrollToToday(); } }
function isEventSpanning(eventObj, dateStr) { if(!eventObj.start.date || !eventObj.end.date) return 'single'; const st = new Date(eventObj.start.date); const ed = new Date(eventObj.end.date); ed.setDate(ed.getDate() - 1); const tgt = new Date(dateStr); if(st.getTime() === ed.getTime()) return 'single'; if(tgt.getTime() === st.getTime()) return 'span-start'; if(tgt.getTime() === ed.getTime()) return 'span-end'; if(tgt > st && tgt < ed) return 'span-mid'; return 'single'; }

function getCardHtml(type, item) {
    const isEvent = type === 'event';
    const colorId = isEvent ? item.colorId : extractTaskData(item.notes).colorId;
    const color = isEvent ? (colorId ? GOOGLE_COLORS[colorId] : 'var(--accent)') : (colorId ? GOOGLE_COLORS[colorId] : '#34c759');
    const title = isEvent ? (item.summary || '(無名予定)') : (item.title || '(無名タスク)');
    const safeData = encodeURIComponent(JSON.stringify(item));
    const clickFn = isEvent ? `openEditor(JSON.parse(decodeURIComponent('${safeData}')))` : `openTaskEditor(JSON.parse(decodeURIComponent('${safeData}')))`;
    
    let timeStr = "";
    if(isEvent && item.start && item.start.dateTime) {
        const d = new Date(item.start.dateTime); timeStr = `${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
    } else if (!isEvent && item.due) {
        timeStr = new Date(item.due).toLocaleDateString('ja-JP');
    } else {
        timeStr = isEvent ? '終日' : '期限なし';
    }

    const iconHtml = isEvent ? '📅' : `<span style="font-size:16px; margin-right:4px;" onclick="event.stopPropagation(); toggleTaskCompletion('${item.id}', '${item.status === 'completed' ? 'needsAction' : 'completed'}')">${item.status === 'completed' ? '✅' : '⬜️'}</span>`;
    const titleStyle = (!isEvent && item.status === 'completed') ? 'text-decoration: line-through; opacity: 0.6;' : '';

    return `<div class="item-card" onclick="${clickFn}">
        <div class="card-color-bar" style="background-color: ${color};"></div>
        <div class="card-content" style="${titleStyle}">
            <div class="card-title">${title}</div>
            <div class="card-meta"><span style="display:flex; align-items:center;">${iconHtml} ${timeStr}</span></div>
        </div>
    </div>`;
}

// --- 修正箇所：renderAgendaView（完了済みタスクを後ろへ追いやる） ---
async function renderAgendaView() { 
    const container = document.getElementById('agenda-content'); container.innerHTML = ''; const today = new Date(); today.setHours(0,0,0,0); let allItems = []; 
    for (const monthKey in dataCache) { 
        const data = dataCache[monthKey]; 
        if(data.events) data.events.forEach(e => { const stDate = e.start.date ? new Date(e.start.date) : new Date(e.start.dateTime); if(stDate >= today || isEventSpanning(e, today.toISOString().split('T')[0]) !== 'single') { allItems.push({ type: 'event', dateObj: stDate, data: e }); } }); 
        if(data.tasks) data.tasks.filter(t => t.due).forEach(t => { const dDate = new Date(t.due); if(dDate >= today) allItems.push({ type: 'task', dateObj: dDate, data: t }); }); 
    } 
    
    // 日付順にソート
    allItems.sort((a, b) => a.dateObj - b.dateObj); 
    const grouped = {}; 
    allItems.forEach(item => { const dStr = `${item.dateObj.getFullYear()}-${String(item.dateObj.getMonth()+1).padStart(2,'0')}-${String(item.dateObj.getDate()).padStart(2,'0')}`; if(!grouped[dStr]) grouped[dStr] = []; grouped[dStr].push(item); }); 
    const days = ['日','月','火','水','木','金','土']; 
    
    if(Object.keys(grouped).length === 0) { container.innerHTML = '<div style="padding: 30px; text-align: center; color: #888;">予定はありません。</div>'; return; } 
    
    for (const [dStr, items] of Object.entries(grouped)) { 
        const dObj = new Date(dStr); const isToday = dObj.getTime() === today.getTime(); const dayHeader = document.createElement('div'); dayHeader.className = 'agenda-day-header'; dayHeader.innerText = `${dObj.getMonth()+1}月${dObj.getDate()}日 (${days[dObj.getDay()]}) ${isToday ? ' - 今日' : ''}`; if(isToday) dayHeader.style.color = '#ff3b30'; 
        const listCont = document.createElement('div'); listCont.className = 'agenda-list-container card-list'; 
        
        // ★ユーザー目線の修正：未完了を上に、完了済みを下にするソート処理
        items.sort((a, b) => {
            const aIsCompleted = a.type === 'task' && a.data.status === 'completed' ? 1 : 0;
            const bIsCompleted = b.type === 'task' && b.data.status === 'completed' ? 1 : 0;
            return aIsCompleted - bIsCompleted;
        });

        for(const item of items) { listCont.innerHTML += getCardHtml(item.type, item.data); } 
        container.appendChild(dayHeader); container.appendChild(listCont); 
    } 
}

// --- 修正箇所：openDailyModal（完了済みタスクを後ろへ追いやる） ---
async function openDailyModal(dateStr, dow) {
    selectedDateStr = dateStr; const days = ['日','月','火','水','木','金','土']; const [y, m, d] = dateStr.split('-'); document.getElementById('daily-date-title').innerText = `${parseInt(m)}月${parseInt(d)}日 (${days[dow]})`;
    const list = document.getElementById('daily-list'); list.innerHTML = ''; const monthKey = `${y}-${parseInt(m)-1}`; const data = dataCache[monthKey]; let hasItems = false;
    
    let modalItems = [];
    if(data) {
        if(data.events) { 
            const events = data.events.filter(e => { if(!e.start) return false; const td = e.start.date || e.start.dateTime; return td && td.includes(dateStr) || (e.start.date && isEventSpanning(e, dateStr) !== 'single'); }); 
            events.forEach(e => modalItems.push({type: 'event', data: e})); 
        }
        if(data.tasks) { 
            const tasks = data.tasks.filter(t => t.due && t.due.includes(dateStr)); 
            tasks.forEach(t => modalItems.push({type: 'task', data: t})); 
        }
    }

    // ★ユーザー目線の修正：未完了を上に、完了済みを下にするソート処理
    modalItems.sort((a, b) => {
        const aIsCompleted = a.type === 'task' && a.data.status === 'completed' ? 1 : 0;
        const bIsCompleted = b.type === 'task' && b.data.status === 'completed' ? 1 : 0;
        return aIsCompleted - bIsCompleted;
    });

    if(modalItems.length > 0) {
        hasItems = true;
        modalItems.forEach(item => { list.innerHTML += getCardHtml(item.type, item.data); });
    }

    if(!hasItems) list.innerHTML = `<div style="text-align:center; color:#888; padding: 30px; font-weight: 500;">予定はありません</div>`;
    document.getElementById('overlay').classList.add('active'); setTimeout(() => document.getElementById('daily-modal').classList.add('active'), 10);
}

function renderMonthDOM(year, month, data, position) {
    if(!data) return; const wrapper = document.createElement('div'); wrapper.className = 'month-wrapper'; wrapper.id = `month-${year}-${month}`; wrapper.innerHTML = `<div class="month-title">${year}年 ${month + 1}月</div><div class="calendar-grid"></div>`; const grid = wrapper.querySelector('.calendar-grid');
    const daysInMonth = new Date(year, month + 1, 0).getDate(); const firstDay = new Date(year, month, 1).getDay(); for (let i = 0; i < firstDay; i++) { const empty = document.createElement('div'); empty.className = 'day empty'; empty.style.backgroundColor = 'var(--head-bg)'; grid.appendChild(empty); }
    const sortedEvents = [...data.events].sort((a, b) => { const aAllDay = a.start.date ? 1 : 0; const bAllDay = b.start.date ? 1 : 0; if(aAllDay !== bAllDay) return bAllDay - aAllDay; return 0; });
    const today = new Date();
    for (let i = 1; i <= daysInMonth; i++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`; const dayEl = document.createElement('div'); let className = 'day'; const dow = new Date(year, month, i).getDay();
        if (dow === 0) dayEl.style.backgroundColor = 'var(--sun)'; if (dow === 6) dayEl.style.backgroundColor = 'var(--sat)'; if (year === today.getFullYear() && month === today.getMonth() && i === today.getDate()) className += ' today';
        dayEl.className = className; dayEl.id = `cell-${dateStr}`; dayEl.setAttribute('onclick', `openDailyModal('${dateStr}', ${dow})`); dayEl.innerHTML = `<div class="day-num">${i}</div>`;
        sortedEvents.filter(e => { if (!e.start) return false; const td = e.start.date || e.start.dateTime; return td && td.includes(dateStr) || (e.start.date && isEventSpanning(e, dateStr) !== 'single'); }).forEach(e => { const div = document.createElement('div'); div.className = 'event'; let timeStr = ""; if(e.start.dateTime) { const d = new Date(e.start.dateTime); timeStr = `${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`; } const spanType = isEventSpanning(e, dateStr); if(spanType !== 'single') div.classList.add(spanType); const recurIcon = e.recurrence ? '🔁 ' : ''; const pData = processSemanticText(e.summary); div.innerText = recurIcon + pData.text + (timeStr ? ` (${timeStr})` : ''); if(pData.style) { div.style.backgroundColor = pData.style.bg; div.style.color = pData.style.txt; } else if(e.colorId && GOOGLE_COLORS[e.colorId]) { div.style.backgroundColor = GOOGLE_COLORS[e.colorId]; } if(spanType === 'span-mid' || spanType === 'span-end') div.style.color = 'transparent'; dayEl.appendChild(div); });
        if(data.tasks) data.tasks.filter(t => t.due && t.due.includes(dateStr)).forEach(t => { const div = document.createElement('div'); div.className = `task ${t.status === 'completed' ? 'completed' : ''}`; const tData = extractTaskData(t.notes); const pData = processSemanticText(t.title); const recurIcon = tData.recurrence ? '🔁 ' : ''; div.innerHTML = `<span style="opacity:0.8;">☑</span> ${recurIcon}${pData.text}`; if(pData.style) { div.style.backgroundColor = pData.style.bg; div.style.color = pData.style.txt; } else if(tData.colorId && GOOGLE_COLORS[tData.colorId]) { div.style.backgroundColor = GOOGLE_COLORS[tData.colorId]; } dayEl.appendChild(div); });
        grid.appendChild(dayEl);
    }
    const container = document.getElementById('calendar-wrapper');
    if(position === 'append') container.appendChild(wrapper); 
    else if(position === 'prepend') container.insertBefore(wrapper, container.firstChild);
    else if(position === 'replace') { const children = Array.from(container.children); const insertIndex = children.findIndex(c => { const [_, y, m] = c.id.split('-'); return parseInt(y) > year || (parseInt(y) === year && parseInt(m) > month); }); if(insertIndex === -1) container.appendChild(wrapper); else container.insertBefore(wrapper, children[insertIndex]); }
}

async function initCalendar() { setProgress(10); try { await loadDataCacheFromIDB(); const today = new Date(); const y = today.getFullYear(); const m = today.getMonth(); await fetchAndRenderMonth(y, m, 'append', false); await fetchAndRenderMonth(y, m+1, 'append', false); scrollToToday(); if (navigator.onLine && !isAuthError) { document.getElementById('offline-badge').classList.remove('active'); fetchAndRenderMonth(y, m, 'replace', true); fetchAndRenderMonth(y, m+1, 'replace', true); } else { document.getElementById('offline-badge').classList.add('active'); } } finally { setProgress(100); } }
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


// --- The Manual Override (手動エディタ＆同期ブリッジ) ---

function openEditor(e = null) {
    document.getElementById('overlay').classList.add('active');
    document.getElementById('editor-modal').classList.add('active');
    document.getElementById('edit-id').value = e ? e.id : '';
    document.getElementById('edit-title').value = e ? e.summary || '' : '';
    document.getElementById('edit-loc').value = e ? e.location || '' : '';
    document.getElementById('edit-desc').value = e ? e.description || '' : '';
    
    selectColor(null, e && e.colorId ? e.colorId : '');

    const isAllDay = e && e.start && e.start.date;
    const alldayToggle = document.getElementById('edit-allday');
    alldayToggle.checked = isAllDay;
    
    const startInput = document.getElementById('edit-start');
    const endInput = document.getElementById('edit-end');
    
    let st = new Date(); let ed = new Date(st.getTime() + 60*60*1000);
    if(selectedDateStr && !e) { st = new Date(selectedDateStr + 'T12:00'); ed = new Date(selectedDateStr + 'T13:00'); }
    
    if (e && e.start) {
        st = new Date(e.start.dateTime || e.start.date);
        ed = new Date(e.end.dateTime || e.end.date);
        if(isAllDay) ed.setDate(ed.getDate() - 1); 
    }
    
    startInput.type = isAllDay ? 'date' : 'datetime-local';
    endInput.type = isAllDay ? 'date' : 'datetime-local';
    
    if (isAllDay) {
        startInput.value = st.toISOString().split('T')[0];
        endInput.value = ed.toISOString().split('T')[0];
    } else {
        const tzOffset = st.getTimezoneOffset() * 60000;
        startInput.value = new Date(st.getTime() - tzOffset).toISOString().slice(0, 16);
        endInput.value = new Date(ed.getTime() - tzOffset).toISOString().slice(0, 16);
    }

    document.getElementById('editor-title').innerText = e ? '予定の編集' : '新規予定';
    document.getElementById('btn-delete').style.display = e ? 'block' : 'none';
    document.getElementById('btn-duplicate').style.display = e ? 'block' : 'none';
    
    // ★新設：タスクへ変換ボタンの表示制御
    const convertBtn = document.getElementById('btn-convert-task');
    if(convertBtn) convertBtn.style.display = e ? 'block' : 'none';
}

function closeEditor() {
    document.getElementById('editor-modal').classList.remove('active');
    if(currentView === 'calendar' && !document.getElementById('daily-modal').classList.contains('active')) {
        document.getElementById('overlay').classList.remove('active');
    }
}

function toggleTimeInputs() {
    const isAllDay = document.getElementById('edit-allday').checked;
    const startInput = document.getElementById('edit-start');
    const endInput = document.getElementById('edit-end');
    
    let startVal = startInput.value;
    let endVal = endInput.value;
    
    startInput.type = isAllDay ? 'date' : 'datetime-local';
    endInput.type = isAllDay ? 'date' : 'datetime-local';
    
    if (startVal) startInput.value = isAllDay ? startVal.split('T')[0] : (startVal.includes('T') ? startVal : startVal + 'T12:00');
    if (endVal) endInput.value = isAllDay ? endVal.split('T')[0] : (endVal.includes('T') ? endVal : endVal + 'T13:00');
}

async function saveEvent() {
    const id = document.getElementById('edit-id').value;
    const title = document.getElementById('edit-title').value.trim();
    if (!title) { showToast('タイトルを入力してくれ'); return; }
    
    const isAllDay = document.getElementById('edit-allday').checked;
    let startVal = document.getElementById('edit-start').value;
    let endVal = document.getElementById('edit-end').value;
    if(!startVal) { showToast('開始日時が不正だ'); return; }
    if(!endVal) endVal = startVal;
    
    const action = {
        type: 'event', method: id ? 'update' : 'insert',
        id: id, title: title,
        location: document.getElementById('edit-loc').value,
        description: document.getElementById('edit-desc').value,
        colorId: selectedColorId 
    };

    try {
        if (isAllDay) {
            action.start = startVal;
            let parts = endVal.split('-');
            const ed = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
            ed.setDate(ed.getDate() + 1);
            action.end = `${ed.getFullYear()}-${String(ed.getMonth()+1).padStart(2,'0')}-${String(ed.getDate()).padStart(2,'0')}`;
        } else {
            action.start = new Date(startVal).toISOString();
            action.end = new Date(endVal).toISOString();
        }
    } catch (err) {
        showToast('日時の処理でエラーが起きた。もう一度頼む。');
        return;
    }

    closeEditor(); closeAllModals();
    await dispatchManualAction(action);
}

async function confirmDeleteEvent() {
    const id = document.getElementById('edit-id').value;
    if(!id || !confirm('この予定を完全に消し去るか？')) return;
    const action = { type: 'event', method: 'delete', id: id };
    closeEditor(); closeAllModals();
    await dispatchManualAction(action);
}

function duplicateEvent() {
    document.getElementById('edit-id').value = '';
    document.getElementById('editor-title').innerText = '新規予定 (複製)';
    document.getElementById('btn-delete').style.display = 'none';
    document.getElementById('btn-duplicate').style.display = 'none';
    const convertBtn = document.getElementById('btn-convert-task');
    if(convertBtn) convertBtn.style.display = 'none';
    showToast('複製モードだ。日時を変えて保存を押せ。');
}

// --- Task Editor ---
function openTaskEditor(t = null) {
    document.getElementById('overlay').classList.add('active');
    document.getElementById('task-editor-modal').classList.add('active');
    document.getElementById('task-edit-id').value = t ? t.id : '';
    document.getElementById('task-edit-title').value = t ? t.title || '' : '';
    
    let cleanNotes = "";
    if (t && t.notes) {
        const extracted = extractTaskData(t.notes);
        cleanNotes = extracted.cleanNotes;
        selectTaskColor(null, extracted.colorId);
    } else {
        selectTaskColor(null, '');
    }
    document.getElementById('task-edit-notes').value = cleanNotes;
    
    const dueInput = document.getElementById('task-edit-due');
    if (t && t.due) {
        dueInput.value = new Date(t.due).toISOString().split('T')[0];
    } else {
        dueInput.value = selectedDateStr || new Date().toISOString().split('T')[0];
    }
    
    document.getElementById('task-editor-title').innerText = t ? 'タスクの編集' : '新規タスク';
    document.getElementById('task-btn-delete').style.display = t ? 'block' : 'none';
    
    // ★新設：予定へ変換ボタンの表示制御
    const convertBtn = document.getElementById('btn-convert-event');
    if(convertBtn) convertBtn.style.display = t ? 'block' : 'none';
}

function closeTaskEditor() {
    document.getElementById('task-editor-modal').classList.remove('active');
    if(currentView === 'calendar' && !document.getElementById('daily-modal').classList.contains('active')) {
        document.getElementById('overlay').classList.remove('active');
    }
}

async function toggleTaskCompletion(taskId, newStatus) {
    let targetTask = null;
    for (const key in dataCache) {
        if (dataCache[key].tasks) {
            targetTask = dataCache[key].tasks.find(t => t.id === taskId);
            if (targetTask) break;
        }
    }
    if (!targetTask) return;

    const patchBody = { status: newStatus };
    if (newStatus === 'completed') { patchBody.completed = new Date().toISOString(); } 
    else { patchBody.completed = null; }

    showGlobalLoader('タスク状態を更新中...');
    try {
        if (navigator.onLine && typeof gapi !== 'undefined') {
            await gapi.client.tasks.tasks.patch({ tasklist: '@default', task: taskId, resource: patchBody });
            showToast(newStatus === 'completed' ? '✅ タスクを完了にした' : '🔄 タスクを未完了に戻した');
        } else {
            showToast('圏外ではタスクの完了操作はできない。電波を探せ。');
        }
        
        targetTask.status = newStatus;
        const td = targetTask.due ? new Date(targetTask.due) : new Date();
        await fetchAndRenderMonth(td.getFullYear(), td.getMonth(), 'replace', navigator.onLine);
        
        if (document.getElementById('daily-modal').classList.contains('active') && selectedDateStr) {
            const dow = new Date(selectedDateStr).getDay();
            openDailyModal(selectedDateStr, dow);
        } else if (currentView === 'agenda') {
            renderAgendaView();
        }
    } catch(e) {
        showToast('❌ エラー: ' + e.message);
    } finally {
        hideGlobalLoader();
    }
}

async function saveTask() {
    const id = document.getElementById('task-edit-id').value;
    const title = document.getElementById('task-edit-title').value.trim();
    if (!title) { showToast('タスク名を入力してくれ'); return; }
    
    let rawNotes = document.getElementById('task-edit-notes').value.trim();
    if (selectedTaskColorId) {
        rawNotes += (rawNotes ? '\n' : '') + `[c:${selectedTaskColorId}]`;
    }

    const action = {
        type: 'task', method: id ? 'update' : 'insert',
        id: id, title: title,
        description: rawNotes, 
    };

    const dueVal = document.getElementById('task-edit-due').value;
    if (dueVal) {
        // ★ユーザー目線の修正：タイムゾーンのズレ（9時間マイナスで前日になる現象）を完全に防ぐ
        // 日付文字列（YYYY-MM-DD）に強制的にUTCの0時を結合してGoogleへ送る
        action.due = dueVal + 'T00:00:00.000Z';
    }

    closeTaskEditor(); closeAllModals();
    await dispatchManualAction(action);
}

async function confirmDeleteTask() {
    const id = document.getElementById('task-edit-id').value;
    if(!id || !confirm('このタスクを完全に消し去るか？')) return;
    const action = { type: 'task', method: 'delete', id: id };
    closeTaskEditor(); closeAllModals();
    await dispatchManualAction(action);
}

// ★The Alchemical Converter (錬金術的変換機構)
async function executeConversion(fromType) {
    if (!confirm(`この${fromType === 'event' ? '予定をタスク' : 'タスクを予定'}に変換して良いか？\n元のデータは消去されるぞ。`)) return;

    let deleteAction = null;
    let insertAction = null;
    let redrawDate = new Date();

    if (fromType === 'event') {
        const id = document.getElementById('edit-id').value;
        const title = document.getElementById('edit-title').value.trim() || '無名タスク';
        const startVal = document.getElementById('edit-start').value;
        const notes = document.getElementById('edit-desc').value;
        const colorId = selectedColorId;

        if (id) deleteAction = { type: 'event', method: 'delete', id: id };

        let rawNotes = notes;
        if (colorId) rawNotes += (rawNotes ? '\n' : '') + `[c:${colorId}]`;
        
        let dueIso = '';
        if (startVal) {
            let dStr = startVal.includes('T') ? startVal.split('T')[0] : startVal;
            let parts = dStr.split('-');
            redrawDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
            // ★ユーザー目線の修正：変換元と「全く同じ日」を確実にGoogleに認識させる
            dueIso = dStr + 'T00:00:00.000Z';
        }

        insertAction = { type: 'task', method: 'insert', title: title, description: rawNotes, due: dueIso };
    } else {
        const id = document.getElementById('task-edit-id').value;
        const title = document.getElementById('task-edit-title').value.trim() || '無名予定';
        const dueVal = document.getElementById('task-edit-due').value;
        const notesVal = document.getElementById('task-edit-notes').value;
        const colorId = selectedTaskColorId;

        if (id) deleteAction = { type: 'task', method: 'delete', id: id };

        insertAction = { type: 'event', method: 'insert', title: title, description: notesVal, colorId: colorId };
        if (dueVal) {
            let parts = dueVal.split('-');
            redrawDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
            insertAction.start = dueVal;
            const ed = new Date(redrawDate); ed.setDate(ed.getDate() + 1);
            insertAction.end = `${ed.getFullYear()}-${String(ed.getMonth()+1).padStart(2,'0')}-${String(ed.getDate()).padStart(2,'0')}`;
        } else {
            insertAction.start = new Date().toISOString().split('T')[0];
            const tmrw = new Date(); tmrw.setDate(tmrw.getDate()+1);
            insertAction.end = tmrw.toISOString().split('T')[0];
        }
    }

    showGlobalLoader('変換中...');
    try {
        if (navigator.onLine) {
            if (deleteAction) await executeApiAction(deleteAction);
            await executeApiAction(insertAction);
            showToast('✅ 変換を完了した');
        } else {
            if (deleteAction) await saveToSyncQueue(deleteAction);
            await saveToSyncQueue(insertAction);
            showToast('📦 圏外のためポストに保管した。電波回復時に変換する');
        }

        if (typeof dataCache !== 'undefined' && deleteAction) {
            for (let key in dataCache) {
                if (deleteAction.type === 'event' && dataCache[key].events) {
                    dataCache[key].events = dataCache[key].events.filter(e => e.id !== deleteAction.id);
                }
                if (deleteAction.type === 'task' && dataCache[key].tasks) {
                    dataCache[key].tasks = dataCache[key].tasks.filter(t => t.id !== deleteAction.id);
                }
            }
        }

        closeEditor(); closeTaskEditor(); closeAllModals();
        await fetchAndRenderMonth(redrawDate.getFullYear(), redrawDate.getMonth(), 'replace', navigator.onLine);
    } catch (e) {
        showToast('❌ 変換エラー: ' + e.message);
    } finally {
        hideGlobalLoader();
    }
}

async function dispatchManualAction(action) {
    showGlobalLoader('処理中...');
    
    let msgAction = '保存';
    if(action.method === 'insert') msgAction = '追加';
    if(action.method === 'update') msgAction = '更新';
    if(action.method === 'delete') msgAction = '削除';
    const msgType = action.type === 'event' ? '予定' : 'タスク';
    const successMsg = `✅ ${msgType}を${msgAction}した`;
    const queueMsg = `📦 圏外のためポストに保管した。電波回復時に${msgAction}する`;

    try {
        if (navigator.onLine) {
            if(typeof executeApiAction === 'function') {
                await executeApiAction(action);
                showToast(successMsg); 
            } else {
                throw new Error('API通信関数が見つからない。');
            }
        } else {
            await saveToSyncQueue(action);
            showToast(queueMsg);
        }
        
        if(typeof dataCache !== 'undefined') {
            for(let key in dataCache) { 
                if(action.method === 'delete') {
                    if(action.type === 'event') dataCache[key].events = dataCache[key].events.filter(e => e.id !== action.id);
                    if(action.type === 'task') dataCache[key].tasks = dataCache[key].tasks.filter(t => t.id !== action.id);
                }
            }
        }
        
        const tdStr = action.start || action.due;
        let td = new Date();
        if (tdStr) {
            if (tdStr.includes('T')) { td = new Date(tdStr); } 
            else { const p = tdStr.split('-'); td = new Date(parseInt(p[0]), parseInt(p[1])-1, parseInt(p[2])); }
        }
        await fetchAndRenderMonth(td.getFullYear(), td.getMonth(), 'replace', navigator.onLine);
    } catch (e) {
        showToast('❌ エラー: ' + e.message);
    } finally {
        hideGlobalLoader();
    }
}

// --- Online/Offline Event Listeners ---
window.addEventListener('online', async () => {
    document.getElementById('offline-badge').classList.remove('active');
    showToast('📶 電波が回復した。');
    if(typeof processSyncQueue === 'function') processSyncQueue(); 
});
window.addEventListener('offline', () => {
    document.getElementById('offline-badge').classList.add('active');
    showToast('⚡️ 圏外になった。変更はポスト（キュー）に保存する。');
});

// --- Boot & GAPI Init ---
document.addEventListener('DOMContentLoaded', async () => { 
    try { 
        await initIDB(); 
        loadSettings(); 
        loadDict(); 
        initColorPicker(); 
        initTaskColorPicker(); 
        if(typeof initSpeech === 'function') initSpeech();
        if(typeof initNotification === 'function') initNotification();
        
        // ★新設：DOMロード時に変換ボタンをハッキング的に仕込む
        const eventActionBar = document.querySelector('#editor-modal .action-bar');
        if (eventActionBar && !document.getElementById('btn-convert-task')) {
            const btn = document.createElement('button');
            btn.id = 'btn-convert-task';
            btn.className = 'btn btn-gray';
            btn.style.display = 'none';
            btn.innerText = '🔄 タスクへ';
            btn.onclick = () => executeConversion('event');
            eventActionBar.insertBefore(btn, document.getElementById('btn-duplicate'));
        }

        const taskActionBar = document.querySelector('#task-editor-modal .action-bar');
        if (taskActionBar && !document.getElementById('btn-convert-event')) {
            const btn = document.createElement('button');
            btn.id = 'btn-convert-event';
            btn.className = 'btn btn-gray';
            btn.style.display = 'none';
            btn.innerText = '🔄 予定へ';
            btn.onclick = () => executeConversion('task');
            taskActionBar.insertBefore(btn, document.getElementById('task-btn-delete'));
        }
    } catch (err) { showToast("初期化エラー: " + err.message); }
});

function gapiLoaded() { gapi.load('client', initializeGapiClient); }
async function initializeGapiClient() { await gapi.client.init({ discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest", "https://www.googleapis.com/discovery/v1/apis/tasks/v1/rest"]}); gapiInited = true; initWeekdays(); setupObserver(); checkAutoLogin(); }
function gisLoaded() { tokenClient = google.accounts.oauth2.initTokenClient({ client_id: CLIENT_ID, scope: SCOPES, callback: '', }); gisInited = true; }
function checkAutoLogin() { const savedToken = localStorage.getItem('jero_token'); const savedTime = localStorage.getItem('jero_token_time'); if (savedToken && savedTime && (Date.now() - savedTime < 3500000)) { gapi.client.setToken({access_token: savedToken}); document.getElementById('auth-btn').style.display = 'none'; initCalendar(); } else { notifyAuthError(); } }
async function handleAuthClick() { if (!gisInited || !gapiInited) return; tokenClient.callback = async (resp) => { if (resp.error !== undefined) throw (resp); gapi.client.setToken({access_token: resp.access_token}); localStorage.setItem('jero_token', resp.access_token); localStorage.setItem('jero_token_time', Date.now()); isAuthError = false; document.getElementById('auth-btn').style.display = 'none'; document.getElementById('auth-btn').classList.remove('auth-pulse'); document.getElementById('month-display').style.color = 'var(--txt)'; showToast('✅ 認証成功。'); document.getElementById('calendar-wrapper').innerHTML = ''; renderedMonths = []; dataCache = {}; initCalendar(); }; tokenClient.requestAccessToken({prompt: 'consent'}); }
// --- The Visionary Interface: PDF to Image Test ---
async function testPDFToImage(e) {
    const file = e.target.files[0];
    if (!file || file.type !== 'application/pdf') {
        showToast('PDFファイルを選択してくれ。');
        return;
    }

    // 既存のローダーを流用して視覚的フィードバックを提供
    showGlobalLoader('PDFを画像化中...');
    
    try {
        // PDF.jsのWorkerパスを指定（相対パスでローカルを参照）
        pdfjsLib.GlobalWorkerOptions.workerSrc = './assets/lib/pdfjs/pdf.worker.min.js';

        // iOSのメモリ制限を回避するためArrayBufferで読み込む
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        
        // 結合テストとして、まずは1ページ目のみを取得
        const page = await pdf.getPage(1);
        
        // 【重要】解像度の設定（1.5倍）。文字が潰れる場合は2.0等へ引き上げる
        const scale = 1.5; 
        const viewport = page.getViewport({ scale: scale });

        // DOMには追加せず、メモリ上だけでCanvasを展開
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        // Canvasへ描画
        await page.render({
            canvasContext: ctx,
            viewport: viewport
        }).promise;

        // 軽量なJPEG形式（品質0.8）でBase64化
        const base64String = canvas.toDataURL('image/jpeg', 0.8);
        
        // 既存の画像ビューア機構を再利用して結果を大写しにする
        const viewerSrc = document.getElementById('img-viewer-src');
        const viewer = document.getElementById('img-viewer');
        
        if (viewerSrc && viewer) {
            viewerSrc.src = base64String;
            viewer.classList.add('active');
        }
        
        showToast('✅ 画像化成功。ピンチアウトで文字が読めるか確認してくれ。');

    } catch (error) {
        console.error('PDF解析エラー:', error);
        alert('【ジェロへの報告用データ】\n' + error.name + '\n' + error.message);
        showToast('❌ エラーが発生した。');
    } finally {
        hideGlobalLoader();
        // 同じファイルを再度選べるようにinputをリセット
        e.target.value = ''; 
    }
}

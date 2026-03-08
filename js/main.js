// JeroCalendar v8.5 Main Logic - Immortal Data & Ultra Morimori Palette
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

// ★ The Immortal Data Protocol (設定の書き出しと読み込み)
function exportSettings() { 
    const data = {
        theme: localStorage.getItem('jero_theme'),
        fs: localStorage.getItem('jero_fs'),
        voice: localStorage.getItem('jero_voice_enabled'),
        gemini_key: localStorage.getItem('jero_gemini_key'),
        gemini_prompt: localStorage.getItem('jero_gemini_prompt'),
        dict: localStorage.getItem('jero_adv_dict')
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `JeroCalendar_Backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('✅ 辞書と設定データを書き出した。「ファイル」アプリ等に保存しろ。'); 
}
function importSettings() { 
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const data = JSON.parse(evt.target.result);
                if(data.theme) localStorage.setItem('jero_theme', data.theme);
                if(data.fs) localStorage.setItem('jero_fs', data.fs);
                if(data.voice) localStorage.setItem('jero_voice_enabled', data.voice);
                if(data.gemini_key) localStorage.setItem('jero_gemini_key', data.gemini_key);
                if(data.gemini_prompt) localStorage.setItem('jero_gemini_prompt', data.gemini_prompt);
                if(data.dict) {
                    localStorage.setItem('jero_adv_dict', data.dict);
                    advancedDict = JSON.parse(data.dict);
                }
                showToast('✅ 過去の記憶（データ）を完全に復元した。再起動するぞ。');
                setTimeout(() => location.reload(), 1500);
            } catch (err) {
                showToast('❌ ファイルが壊れているか、形式が違うぞ。');
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

function executeEmergencyReset() { if(confirm('全キャッシュを消去するか？（事前に「データ書出」をしておくことを強く勧めるぞ）')) { indexedDB.deleteDatabase('JeroDB_v8'); localStorage.clear(); location.reload(); } }

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

// --- ★ The Ultra Morimori Palette (極盛絵文字リスト・約270種) ---
const EMOJI_LIST = [
    { cat: "顔・感情", icons: ["😀","😂","🥰","😎","🤔","😭","😡","😴","🤯","😇","😈","👻","👽","🤖","💩","💡","😆","😅","😊","😉","😍","😘","😋","😜","🤪","🤫","🤭","🤮","🤧","😷"] },
    { cat: "仕事・学校", icons: ["💻","📱","📞","🔋","📅","📈","📂","✏️","✂️","🗑️","🚩","⚠️","✅","❌","🏫","🎓","💼","📌","📎","📏","📖","📚","📝","✉️","📧","🔍","🔑","🔒","🔓","🛠️"] },
    { cat: "生活・家事", icons: ["🏠","🛒","🧹","👕","🍽️","🍳","🍱","🍙","☕","🍺","🍷","💊","🏥","🛀","🛌","💰","💳","🛍️","🛋️","🧴","🧻","🪥","🧽","🗑️","🧺","🧷","🧵","🧶","🪴","✂️"] },
    { cat: "動物・自然", icons: ["🐈","🐕","🐇","🐻","🐤","🐟","🌲","🌸","🌻","🍁","🍄","🌍","☀️","🌙","⭐","🔥","🐭","🐹","🦊","🐼","🦁","🐯","🐮","🐷","🐸","🐵","🐧","🦉","🦋","🐾"] },
    { cat: "建物・場所", icons: ["🏢","⛩️","🎡","♨️","📍","🏦","🏤","🏥","🏫","🏪","🏰","🗼","🗽","⛪","🕌","🛕","🏟️","🏕️","🏖️","🗻","🏝️","🏞️","🏘️","🏚️","🏗️","🏭","🏠","🏡","⛺","🚥"] },
    { cat: "乗り物・旅行", icons: ["🚗","🚕","🚙","🚌","🚎","🏎️","🚓","🚑","🚒","🚐","🛻","🚚","🚜","🛴","🚲","🛵","🏍️","🛺","🚨","🚃","🚄","🚅","🚆","🚇","🚈","🚉","✈️","🛫","🛬","🛳️"] },
    { cat: "食事・飲み物", icons: ["🍏","🍎","🍐","🍊","🍋","🍌","🍉","🍇","🍓","🍈","🍒","🍑","🥭","🍍","🥥","🥝","🍅","🍆","🥑","🥦","🥬","🥒","🌶️","🌽","🥕","🧄","🧅","🥔","🍠","🥐"] },
    { cat: "娯楽・スポーツ", icons: ["🎮","🎬","🎵","🎨","⚽","⚾","🎾","🏊","🚴","🏆","🎉","🎂","🎁","🎈","🎫","🎳","⛳","⛸️","🎣","🎿","🏂","🏋️","🤸","⛹️","🤾","🎟️","🎭","🎪","🎰","🧩"] },
    { cat: "記号・マーク", icons: ["❤️","💛","💚","💙","💜","🖤","🤍","💯","💢","💬","💭","💤","🎶","💲","🔴","🟠","🟡","🟢","🔵","🟣","⚫","⚪","🟤","🟥","🟧","🟨","🟩","🟦","🟪"] }
];

function loadDict() { const saved = localStorage.getItem('jero_adv_dict'); if (saved) { try { advancedDict = JSON.parse(saved); } catch(e) { advancedDict = JSON.parse(JSON.stringify(DEFAULT_ADV_DICT)); } } else { advancedDict = JSON.parse(JSON.stringify(DEFAULT_ADV_DICT)); } renderDictUI(); }
function saveDict() { localStorage.setItem('jero_adv_dict', JSON.stringify(advancedDict)); renderDictUI(); triggerFullReRender(); }

function renderDictUI() { 
    const container = document.getElementById('dict-list'); if(!container) return; container.innerHTML = ''; 
    if(advancedDict.length === 0) { container.innerHTML = '<div style="color:#888; font-size:12px;">辞書は空だ。</div>'; return; } 
    advancedDict.forEach((item, idx) => { 
        const primary = item.keys[0] || "(接頭辞なし)";
        const el = document.createElement('div'); el.className = 'dict-item'; 
        el.innerHTML = `<div class="dict-info"><div>${item.icon} <span style="font-weight:bold;">${primary}</span></div><div><span class="dict-badge" style="background:${item.bg}; color:${item.txt};">Sample</span></div></div><div style="display:flex; flex-direction:column; gap:4px;"><button class="dict-btn-edit" onclick="openDictEditor(${idx})">編集</button><button class="dict-btn-del" onclick="removeDictItem(${idx})">削除</button></div>`; 
        container.appendChild(el); 
    }); 
}

function openDictEditor(idx = -1) { 
    document.getElementById('dict-editor-modal').classList.add('active'); 
    if (idx >= 0) { 
        const item = advancedDict[idx]; 
        document.getElementById('dict-edit-idx').value = idx; 
        document.getElementById('dict-edit-prefix').value = item.keys[0] || ''; 
        document.getElementById('dict-edit-aliases').value = item.keys.slice(1).join(', '); 
        document.getElementById('dict-edit-icon').innerText = item.icon || '➕ 選択'; 
        document.getElementById('dict-edit-bg').value = item.bg; 
        document.getElementById('dict-edit-txt').value = item.txt; 
        document.getElementById('dict-editor-title').innerText = '辞書編集'; 
    } else { 
        document.getElementById('dict-edit-idx').value = -1; 
        document.getElementById('dict-edit-prefix').value = ''; 
        document.getElementById('dict-edit-aliases').value = ''; 
        document.getElementById('dict-edit-icon').innerText = '➕ 選択'; 
        document.getElementById('dict-edit-bg').value = '#0a84ff'; 
        document.getElementById('dict-edit-txt').value = '#ffffff'; 
        document.getElementById('dict-editor-title').innerText = '新規追加'; 
    } 
}
function closeDictEditor() { document.getElementById('dict-editor-modal').classList.remove('active'); }

function saveDictItem() { 
    const idx = parseInt(document.getElementById('dict-edit-idx').value); 
    const prefix = document.getElementById('dict-edit-prefix').value.trim(); 
    const aliasesRaw = document.getElementById('dict-edit-aliases').value; 
    const iconRaw = document.getElementById('dict-edit-icon').innerText; 
    const icon = iconRaw === '➕ 選択' ? '' : iconRaw.trim();
    const bg = document.getElementById('dict-edit-bg').value; 
    const txt = document.getElementById('dict-edit-txt').value; 
    if(!prefix || !icon) { showToast('接頭辞とアイコンは必須だ。'); return; } 
    let keys = [prefix];
    if (aliasesRaw) { const aliases = aliasesRaw.split(',').map(k => k.trim()).filter(k => k); keys = keys.concat(aliases); }
    const newItem = { keys, icon, bg, txt }; 
    if(idx >= 0) advancedDict[idx] = newItem; else advancedDict.push(newItem); 
    saveDict(); closeDictEditor(); 
}
function removeDictItem(idx) { advancedDict.splice(idx, 1); saveDict(); }

function openEmojiPicker() {
    document.getElementById('emoji-picker-modal').classList.add('active');
    const container = document.getElementById('emoji-list-container');
    if (container.innerHTML !== '') return; 
    let html = '';
    EMOJI_LIST.forEach(group => {
        html += `<div style="font-size:12px; font-weight:bold; color:#888; margin-top:10px; margin-bottom:5px;">${group.cat}</div><div style="display:flex; flex-wrap:wrap; gap:8px;">`;
        group.icons.forEach(icon => { html += `<div style="font-size:26px; padding:10px; background:var(--head-bg); border:1px solid var(--border); border-radius:8px; cursor:pointer;" onclick="selectEmoji('${icon}')">${icon}</div>`; });
        html += `</div>`;
    });
    html += `<div style="margin-top:20px; text-align:center;"><button class="btn-gray" style="padding:10px 20px; border-radius:20px; border:none; color:white; font-weight:bold; cursor:pointer;" onclick="document.getElementById('dict-edit-icon').innerText = '➕ 選択'; closeEmojiPicker(); showToast('一覧にない場合は、OSの絵文字キーボードを使って手入力してくれ。');">その他の絵文字を使う</button></div>`;
    container.innerHTML = html;
}
function closeEmojiPicker() { document.getElementById('emoji-picker-modal').classList.remove('active'); }
function selectEmoji(icon) { document.getElementById('dict-edit-icon').innerText = icon; closeEmojiPicker(); }

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
    if(isEvent && item.start && item.start.dateTime) { const d = new Date(item.start.dateTime); timeStr = `${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`; } 
    else if (!isEvent && item.due) { timeStr = new Date(item.due).toLocaleDateString('ja-JP'); } 
    else { timeStr = isEvent ? '終日' : '期限なし'; }
    const iconHtml = isEvent ? '📅' : `<span style="font-size:16px; margin-right:4px;" onclick="event.stopPropagation(); toggleTaskCompletion('${item.id}', '${item.status === 'completed' ? 'needsAction' : 'completed'}')">${item.status === 'completed' ? '✅' : '⬜️'}</span>`;
    const titleStyle = (!isEvent && item.status === 'completed') ? 'text-decoration: line-through; opacity: 0.6;' : '';
    return `<div class="item-card" onclick="${clickFn}"><div class="card-color-bar" style="background-color: ${color};"></div><div class="card-content" style="${titleStyle}"><div class="card-title">${title}</div><div class="card-meta"><span style="display:flex; align-items:center;">${iconHtml} ${timeStr}</span></div></div></div>`;
}

async function renderAgendaView() { 
    const container = document.getElementById('agenda-content'); container.innerHTML = ''; const today = new Date(); today.setHours(0,0,0,0); let allItems = []; 
    for (const monthKey in dataCache) { 
        const data = dataCache[monthKey]; 
        if(data.events) data.events.forEach(e => { const stDate = e.start.date ? new Date(e.start.date) : new Date(e.start.dateTime); if(stDate >= today || isEventSpanning(e, today.toISOString().split('T')[0]) !== 'single') { allItems.push({ type: 'event', dateObj: stDate, data: e }); } }); 
        if(data.tasks) data.tasks.filter(t => t.due).forEach(t => { const dDate = new Date(t.due); if(dDate >= today) allItems.push({ type: 'task', dateObj: dDate, data: t }); }); 
    } 
    allItems.sort((a, b) => a.dateObj - b.dateObj); 
    const grouped = {}; 
    allItems.forEach(item => { const dStr = `${item.dateObj.getFullYear()}-${String(item.dateObj.getMonth()+1).padStart(2,'0')}-${String(item.dateObj.getDate()).padStart(2,'0')}`; if(!grouped[dStr]) grouped[dStr] = []; grouped[dStr].push(item); }); 
    const days = ['日','月','火','水','木','金','土']; 
    if(Object.keys(grouped).length === 0) { container.innerHTML = '<div style="padding: 30px; text-align: center; color: #888;">予定はありません。</div>'; return; } 
    for (const [dStr, items] of Object.entries(grouped)) { 
        const dObj = new Date(dStr); const isToday = dObj.getTime() === today.getTime(); const dayHeader = document.createElement('div'); dayHeader.className = 'agenda-day-header'; dayHeader.innerText = `${dObj.getMonth()+1}月${dObj.getDate()}日 (${days[dObj.getDay()]}) ${isToday ? ' - 今日' : ''}`; if(isToday) dayHeader.style.color = '#ff3b30'; 
        const listCont = document.createElement('div'); listCont.className = 'agenda-list-container card-list'; 
        items.sort((a, b) => { const aIsCompleted = a.type === 'task' && a.data.status === 'completed' ? 1 : 0; const bIsCompleted = b.type === 'task' && b.data.status === 'completed' ? 1 : 0; return aIsCompleted - bIsCompleted; });
        for(const item of items) { listCont.innerHTML += getCardHtml(item.type, item.data); } 
        container.appendChild(dayHeader); container.appendChild(listCont); 
    } 
}

async function openDailyModal(dateStr, dow) {
    selectedDateStr = dateStr; const days = ['日','月','火','水','木','金','土']; const [y, m, d] = dateStr.split('-'); document.getElementById('daily-date-title').innerText = `${parseInt(m)}月${parseInt(d)}日 (${days[dow]})`;
    const list = document.getElementById('daily-list'); list.innerHTML = ''; const monthKey = `${y}-${parseInt(m)-1}`; const data = dataCache[monthKey]; let hasItems = false;
    let modalItems = [];
    if(data) {
        if(data.events) { const events = data.events.filter(e => { if(!e.start) return false; const td = e.start.date || e.start.dateTime; return td && td.includes(dateStr) || (e.start.date && isEventSpanning(e, dateStr) !== 'single'); }); events.forEach(e => modalItems.push({type: 'event', data: e})); }
        if(data.tasks) { const tasks = data.tasks.filter(t => t.due && t.due.includes(dateStr)); tasks.forEach(t => modalItems.push({type: 'task', data: t})); }
    }
    modalItems.sort((a, b) => { const aIsCompleted = a.type === 'task' && a.data.status === 'completed' ? 1 : 0; const bIsCompleted = b.type === 'task' && b.data.status === 'completed' ? 1 : 0; return aIsCompleted - bIsCompleted; });
    if(modalItems.length > 0) { hasItems = true; modalItems.forEach(item => { list.innerHTML += getCardHtml(item.type, item.data); }); }
    if(!hasItems) list.innerHTML = `<div style="text-align:center; color:#888; padding: 30px; font-weight: 500;">予定はありません</div>`;
    document.getElementById('overlay').classList.add('active'); setTimeout(() => document.getElementById('daily-modal').classList.add('active'), 10);
}

function renderMonthDOM(year, month, data, position) {
    if(!data) return; const wrapper = document.createElement('div'); wrapper.className = 'month-wrapper'; wrapper.id = `month-${year}-${month}`; wrapper.innerHTML = `<div class="month-title">${year}年 ${month + 1}月</div><div class="calendar-grid"></div>`; const grid = wrapper.querySelector('.calendar-grid');
    const daysInMonth = new Date(year, month + 1, 0).getDate(); const firstDay = new Date(year, month, 1).getDay(); for (let i = 0; i < firstDay; i++) { const empty = document.createElement('div'); empty.className = 'day empty'; empty.style.backgroundColor = 'var(--head-bg)'; grid.appendChild(empty); }
    const sortedEvents = [...data.events].sort((a, b) => { const aAllDay = a.start.date ? 1 : 0; const bAllDay = b.start.date ? 1 : 0; if(aAllDay !== bAllDay) return bAllDay - aAllDay; return 0; });
    const today = new Date();
    for (let i = 1; i <= daysInMonth; i++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(

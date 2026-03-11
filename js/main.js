// JeroCalendar v8.9.1 Main Logic - Offline First & Auto-Sync
const CLIENT_ID = '538529257653-1rac4r8uedqq75pqmlrhrhlfnhkhgkn4.apps.googleusercontent.com'; 
const SCOPES = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/tasks https://www.googleapis.com/auth/calendar.readonly';
let tokenClient, gapiInited = false, gisInited = false;
let dataCache = {}; let renderedMonths = []; let observer, isFetching = false, isAuthError = false;
let selectedDateStr = "", selectedColorId = "", selectedTaskColorId = "", currentView = 'calendar';
const GOOGLE_COLORS = { "1":"#7986cb", "2":"#33b679", "3":"#8e24aa", "4":"#e67c73", "5":"#f6bf26", "6":"#f4511e", "7":"#039be5", "8":"#616161", "9":"#3f51b5", "10":"#0b8043", "11":"#d50000" };
let advancedDict = [];
const DEFAULT_ADV_DICT = [{ keys: ["誕生日", "【誕】"], icon: "🎂", bg: "#ff2d55", txt: "#ffffff" }, { keys: ["会議", "【会】"], icon: "👥", bg: "#5856d6", txt: "#ffffff" }, { keys: ["休日", "【休】"], icon: "🏖️", bg: "#ff3b30", txt: "#ffffff" }];

// ==========================================
// 1. ユーティリティ & UI操作群 (既存機能を維持)
// ==========================================
function getContrastYIQ(hexcolor){
    if(!hexcolor) return '#ffffff';
    hexcolor = hexcolor.replace("#", "");
    if(hexcolor.length === 3) hexcolor = hexcolor.split('').map(c => c+c).join('');
    var r = parseInt(hexcolor.substr(0,2),16);
    var g = parseInt(hexcolor.substr(2,2),16);
    var b = parseInt(hexcolor.substr(4,2),16);
    var yiq = ((r*299)+(g*587)+(b*114))/1000;
    return (yiq >= 128) ? '#000000' : '#ffffff';
}

function initWeekdays() { const days = ['日','月','火','水','木','金','土']; const c = document.getElementById('weekdays'); if(c) c.innerHTML = days.map(d => `<div class="wd">${d}</div>`).join(''); }
function loadSettings() { const th = localStorage.getItem('jero_theme')||'light'; const fs = localStorage.getItem('jero_fs')||'10'; document.getElementById('st-theme').value=th; document.getElementById('st-fs').value=fs; document.body.setAttribute('data-theme',th); document.documentElement.style.setProperty('--fs', fs+'px'); document.getElementById('fs-val').innerText=fs; const voiceEnabled = localStorage.getItem('jero_voice_enabled') === 'true'; const stVoice = document.getElementById('st-voice'); if(stVoice) stVoice.checked = voiceEnabled; if(typeof isVoiceEnabled !== 'undefined') isVoiceEnabled = voiceEnabled; }
function saveAndApplySettings() { const th = document.getElementById('st-theme').value; const fs = document.getElementById('st-fs').value; localStorage.setItem('jero_theme',th); localStorage.setItem('jero_fs',fs); document.body.setAttribute('data-theme',th); document.documentElement.style.setProperty('--fs', fs+'px'); document.getElementById('fs-val').innerText=fs; }
function setProgress(p) { const pb = document.getElementById('progress-bar'); if(pb) { pb.style.width = p+'%'; if(p>=100) setTimeout(()=>pb.style.width='0%', 500); } }
function closeAllModals() { document.querySelectorAll('.bottom-modal').forEach(m => m.classList.remove('active')); document.getElementById('overlay').classList.remove('active'); }
function openSettings() { document.getElementById('overlay').classList.add('active'); document.getElementById('settings-modal').classList.add('active'); }
function closeSettings() { document.getElementById('settings-modal').classList.remove('active'); document.getElementById('overlay').classList.remove('active'); }
function switchAccount() { localStorage.removeItem('jero_token'); localStorage.removeItem('jero_token_time'); location.reload(); }
function exportSettings() { const data = { theme: localStorage.getItem('jero_theme'), fs: localStorage.getItem('jero_fs'), voice: localStorage.getItem('jero_voice_enabled'), gemini_key: localStorage.getItem('jero_gemini_key'), gemini_prompt: localStorage.getItem('jero_gemini_prompt'), dict: localStorage.getItem('jero_adv_dict') }; const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `JeroCalendar_Backup_${new Date().toISOString().split('T')[0]}.json`; a.click(); URL.revokeObjectURL(url); showToast('✅ 辞書と設定データを書き出した。「ファイル」アプリ等に保存しろ。'); }
function importSettings() { const input = document.createElement('input'); input.type = 'file'; input.accept = 'application/json'; input.onchange = (e) => { const file = e.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = (evt) => { try { const data = JSON.parse(evt.target.result); if(data.theme) localStorage.setItem('jero_theme', data.theme); if(data.fs) localStorage.setItem('jero_fs', data.fs); if(data.voice) localStorage.setItem('jero_voice_enabled', data.voice); if(data.gemini_key) localStorage.setItem('jero_gemini_key', data.gemini_key); if(data.gemini_prompt) localStorage.setItem('jero_gemini_prompt', data.gemini_prompt); if(data.dict) { localStorage.setItem('jero_adv_dict', data.dict); advancedDict = JSON.parse(data.dict); } showToast('✅ 過去の記憶（データ）を完全に復元した。再起動するぞ。'); setTimeout(() => location.reload(), 1500); } catch (err) { showToast('❌ ファイルが壊れているか、形式が違うぞ。'); } }; reader.readAsText(file); }; input.click(); }
function executeEmergencyReset() { if(confirm('全キャッシュを消去するか？（事前に「データ書出」をしておくことを強く勧めるぞ）')) { indexedDB.deleteDatabase('JeroDB_v8'); localStorage.clear(); location.reload(); } }
function showGlobalLoader(msg) { document.getElementById('loader-msg').innerText = msg; document.getElementById('global-loader').classList.add('active'); }
function hideGlobalLoader() { document.getElementById('global-loader').classList.remove('active'); }
const yieldUI = () => new Promise(r => setTimeout(r, 30));
function showToast(msg) { const toast = document.getElementById('toast'); toast.innerText = msg; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 5000); }

// ==========================================
// 2. データベース & オフラインキュー (野戦倉庫)
// ==========================================
let idb;
function initIDB() { return new Promise((resolve) => { const timeout = setTimeout(() => { resolve(); }, 2000); try { const req = indexedDB.open('JeroDB_v8', 3); req.onupgradeneeded = (e) => { const db = e.target.result; if (!db.objectStoreNames.contains('images')) db.createObjectStore('images', { keyPath: 'id' }); if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache', { keyPath: 'key' }); if (!db.objectStoreNames.contains('sync_queue')) db.createObjectStore('sync_queue', { keyPath: 'id' }); }; req.onsuccess = (e) => { clearTimeout(timeout); idb = e.target.result; resolve(); }; req.onerror = (e) => { clearTimeout(timeout); resolve(); }; } catch(e) { clearTimeout(timeout); resolve(); } }); }
function generateUUID() { return 'xxxx-xxxx-4xxx-yxxx'.replace(/[xy]/g, function(c) { var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8); return v.toString(16); }); }

// ★改修：ローカルキュー（待合室）への保存関数
function saveToSyncQueue(actionPayload) { 
    return new Promise((resolve) => { 
        if(!idb) return resolve(); 
        try { 
            const tx = idb.transaction('sync_queue', 'readwrite'); 
            const id = generateUUID();
            // 仮のIDを付与して保存（UI上で後から識別するため）
            const payloadWithLocalId = { ...actionPayload, _localId: id };
            tx.objectStore('sync_queue').put({ id: id, payload: payloadWithLocalId, timestamp: Date.now() }); 
            tx.oncomplete = () => {
                console.log("⚠️ 通信断絶または認証エラー: データを野戦倉庫（キュー）に退避した。", payloadWithLocalId);
                resolve(id);
            };
        } catch(e) { resolve(null); } 
    }); 
}
function getSyncQueue() { return new Promise((resolve) => { if(!idb) return resolve([]); try { const tx = idb.transaction('sync_queue', 'readonly'); const req = tx.objectStore('sync_queue').getAll(); req.onsuccess = () => resolve(req.result || []); } catch(e) { resolve([]); } }); }
function clearSyncQueueItem(id) { if(!idb) return; try { const tx = idb.transaction('sync_queue', 'readwrite'); tx.objectStore('sync_queue').delete(id); } catch(e) {} }
function saveDataCacheToIDB(monthKey, data) { if(!idb) return; try { const tx = idb.transaction('cache', 'readwrite'); tx.objectStore('cache').put({ key: monthKey, data: data, timestamp: Date.now() }); } catch(e) {} }
function loadDataCacheFromIDB() { return new Promise((resolve) => { if(!idb) return resolve(); try { const tx = idb.transaction('cache', 'readonly'); const req = tx.objectStore('cache').getAll(); req.onsuccess = () => { if (req.result) { req.result.forEach(item => { dataCache[item.key] = item.data; }); } resolve(); }; req.onerror = () => resolve(); } catch(e) { resolve(); } }); }

// ==========================================
// 3. 自動同期エンジン (補給部隊) - JeroCore v8.9.2 高度化版
// ==========================================

// 意図的な待機（クールダウン）を生み出す関数
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function processSyncQueue() {
    if (!navigator.onLine) return; 
    const queue = await getSyncQueue();
    if (queue.length === 0) {
        document.getElementById('offline-badge').classList.remove('active');
        return; 
    }

    console.log(`🔄 自動補給部隊起動：${queue.length}件の未送信データを処理する。`);
    showGlobalLoader(`同期中... 残り${queue.length}件`);
    
    const validToken = await attemptSilentRefresh();
    if (!validToken) {
        console.warn("トークンの再取得に失敗。同期を延期する。");
        hideGlobalLoader();
        updatePendingBadge(queue.length); // バッジを手動ボタン化
        return;
    }

    let successCount = 0;
    for (let item of queue) {
        let retries = 3; // 1アイテムにつき最大3回までその場でリトライする
        let itemSuccess = false;

        while (retries > 0 && !itemSuccess) {
            try {
                await executeApiAction(item.payload, true); 
                clearSyncQueueItem(item.id);
                successCount++;
                itemSuccess = true;
                
                // Googleのレート制限を回避するため、意図的に500ミリ秒待機する（第一原理）
                await sleep(500); 

            } catch (error) {
                retries--;
                console.warn(`同期失敗 (ID: ${item.id}) - 残りリトライ: ${retries}回`, error);
                if (retries > 0) {
                    await sleep(1500); // 失敗時は少し長めに待ってから再アタック
                } else {
                    console.error("3回のリトライに失敗。野戦倉庫に残置する。");
                    // 400系(Bad Request)など、再送しても無意味な致命的エラーの場合はキューから消す判断もここで行えるが、今回は安全のため残す。
                }
            }
        }
    }
    
    hideGlobalLoader();
    const remainingQueue = await getSyncQueue();

    if (successCount > 0) {
        showToast(`✅ ${successCount}件の同期を完了した。`);
        const today = new Date();
        await fetchAndRenderMonth(today.getFullYear(), today.getMonth(), 'replace', true);
    }

    // 処理後、まだ残っていれば手動ボタンを出し、ゼロになれば消す
    updatePendingBadge(remainingQueue.length);
}

// バッジを手動同期ボタンとして活用する関数
function updatePendingBadge(count) {
    const badge = document.getElementById('offline-badge');
    if (count > 0 && navigator.onLine) {
        badge.innerText = `🔄 未送信データが ${count} 件あるぞ (タップで同期)`;
        badge.style.background = 'var(--accent)'; // 青色にしてタップ可能をアピール
        badge.classList.add('active');
        badge.onclick = () => {
            showToast('手動で補給部隊に出撃命令を出した。');
            processSyncQueue();
        };
    } else if (!navigator.onLine) {
        badge.innerText = '⚡️ オフライン (キャッシュ表示中・AI使用不可)';
        badge.style.background = '#ff9500'; // オレンジに戻す
        badge.classList.add('active');
        badge.onclick = null;
    } else {
        badge.classList.remove('active');
        badge.onclick = null;
    }
}

// ==========================================
// 4. 絵文字辞書関連 (The Visionary Mapping への布石)
// ==========================================
const EMOJI_LIST = [ /* 省略：既存コードママ */ { cat: "顔・感情", icons: ["😀","😂","🥰","😎","🤔","😭","😡","😴","🤯","😇","😈","👻","👽","🤖","💩","💡","😆","😅","😊","😉","😍","😘","😋","😜","🤪","🤫","🤭","🤮","🤧","😷"] }, { cat: "仕事・学校", icons: ["💻","📱","📞","🔋","📅","📈","📂","✏️","✂️","🗑️","🚩","⚠️","✅","❌","🏫","🎓","💼","📌","📎","📏","📖","📚","📝","✉️","📧","🔍","🔑","🔒","🔓","🛠️"] }, { cat: "生活・家事", icons: ["🏠","🛒","🧹","👕","🍽️","🍳","🍱","🍙","☕","🍺","🍷","💊","🏥","🛀","🛌","💰","💳","🛍️","🛋️","🧴","🧻","🪥","🧽","🗑️","🧺","🧷","🧵","🧶","🪴","✂️"] }, { cat: "動物・自然", icons: ["🐈","🐕","🐇","🐻","🐤","🐟","🌲","🌸","🌻","🍁","🍄","🌍","☀️","🌙","⭐","🔥","🐭","🐹","🦊","🐼","🦁","🐯","🐮","🐷","🐸","🐵","🐧","🦉","🦋","🐾"] }, { cat: "建物・場所", icons: ["🏢","⛩️","🎡","♨️","📍","🏦","🏤","🏥","🏫","🏪","🏰","🗼","🗽","⛪","🕌","🛕","🏟️","🏕️","🏖️","🗻","🏝️","🏞️","🏘️","🏚️","🏗️","🏭","🏠","🏡","⛺","🚥"] }, { cat: "乗り物・旅行", icons: ["🚗","🚕","🚙","🚌","🚎","🏎️","🚓","🚑","🚒","🚐","🛻","🚚","🚜","🛴","🚲","🛵","🏍️","🛺","🚨","🚃","🚄","🚅","🚆","🚇","🚈","🚉","✈️","🛫","🛬","🛳️"] }, { cat: "食事・飲み物", icons: ["🍏","🍎","🍐","🍊","🍋","🍌","🍉","🍇","🍓","🍈","🍒","🍑","🥭","🍍","🥥","🥝","🍅","🍆","🥑","🥦","🥬","🥒","🌶️","🌽","🥕","🧄","🧅","🥔","🍠","🥐"] }, { cat: "娯楽・スポーツ", icons: ["🎮","🎬","🎵","🎨","⚽","⚾","🎾","🏊","🚴","🏆","🎉","🎂","🎁","🎈","🎫","🎳","⛳","⛸️","🎣","🎿","🏂","🏋️","🤸","⛹️","🤾","🎟️","🎭","🎪","🎰","🧩"] }, { cat: "記号・マーク", icons: ["❤️","💛","💚","💙","💜","🖤","🤍","💯","💢","💬","💭","💤","🎶","💲","🔴","🟠","🟡","🟢","🔵","🟣","⚫","⚪","🟤","🟥","🟧","🟨","🟩","🟦","🟪"] } ];
function loadDict() { const saved = localStorage.getItem('jero_adv_dict'); if (saved) { try { advancedDict = JSON.parse(saved); } catch(e) { advancedDict = JSON.parse(JSON.stringify(DEFAULT_ADV_DICT)); } } else { advancedDict = JSON.parse(JSON.stringify(DEFAULT_ADV_DICT)); } renderDictUI(); }
function saveDict() { localStorage.setItem('jero_adv_dict', JSON.stringify(advancedDict)); renderDictUI(); triggerFullReRender(); }
function renderDictUI() { const container = document.getElementById('dict-list'); if(!container) return; container.innerHTML = ''; if(advancedDict.length === 0) { container.innerHTML = '<div style="color:#888; font-size:12px;">辞書は空だ。</div>'; return; } advancedDict.forEach((item, idx) => { const primary = item.keys[0] || "(接頭辞なし)"; const el = document.createElement('div'); el.className = 'dict-item'; el.innerHTML = `<div class="dict-info"><div>${item.icon} <span style="font-weight:bold;">${primary}</span></div><div><span class="dict-badge" style="background:${item.bg}; color:${item.txt};">Sample</span></div></div><div style="display:flex; flex-direction:column; gap:4px;"><button class="dict-btn-edit" onclick="openDictEditor(${idx})">編集</button><button class="dict-btn-del" onclick="removeDictItem(${idx})">削除</button></div>`; container.appendChild(el); }); }
function openDictEditor(idx = -1) { document.getElementById('dict-editor-modal').classList.add('active'); if (idx >= 0) { const item = advancedDict[idx]; document.getElementById('dict-edit-idx').value = idx; document.getElementById('dict-edit-prefix').value = item.keys[0] || ''; document.getElementById('dict-edit-aliases').value = item.keys.slice(1).join(', '); document.getElementById('dict-edit-icon').innerText = item.icon || '➕ 選択'; document.getElementById('dict-edit-bg').value = item.bg; document.getElementById('dict-edit-txt').value = item.txt; document.getElementById('dict-editor-title').innerText = '辞書編集'; } else { document.getElementById('dict-edit-idx').value = -1; document.getElementById('dict-edit-prefix').value = ''; document.getElementById('dict-edit-aliases').value = ''; document.getElementById('dict-edit-icon').innerText = '➕ 選択'; document.getElementById('dict-edit-bg').value = '#0a84ff'; document.getElementById('dict-edit-txt').value = '#ffffff'; document.getElementById('dict-editor-title').innerText = '新規追加'; } }
function closeDictEditor() { document.getElementById('dict-editor-modal').classList.remove('active'); }
function saveDictItem() { const idx = parseInt(document.getElementById('dict-edit-idx').value); const prefix = document.getElementById('dict-edit-prefix').value.trim(); const aliasesRaw = document.getElementById('dict-edit-aliases').value; const iconRaw = document.getElementById('dict-edit-icon').innerText; const icon = iconRaw === '➕ 選択' ? '' : iconRaw.trim(); const bg = document.getElementById('dict-edit-bg').value; const txt = document.getElementById('dict-edit-txt').value; if(!prefix || !icon) { showToast('接頭辞とアイコンは必須だ。'); return; } let keys = [prefix]; if (aliasesRaw) { const aliases = aliasesRaw.split(',').map(k => k.trim()).filter(k => k); keys = keys.concat(aliases); } const newItem = { keys, icon, bg, txt }; if(idx >= 0) advancedDict[idx] = newItem; else advancedDict.push(newItem); saveDict(); closeDictEditor(); }
function removeDictItem(idx) { advancedDict.splice(idx, 1); saveDict(); }
function openEmojiPicker() { document.getElementById('emoji-picker-modal').classList.add('active'); const container = document.getElementById('emoji-list-container'); if (container.innerHTML !== '') return; let html = ''; EMOJI_LIST.forEach(group => { html += `<div style="font-size:12px; font-weight:bold; color:#888; margin-top:10px; margin-bottom:5px;">${group.cat}</div><div style="display:flex; flex-wrap:wrap; gap:8px;">`; group.icons.forEach(icon => { html += `<div style="font-size:26px; padding:10px; background:var(--head-bg); border:1px solid var(--border); border-radius:8px; cursor:pointer;" onclick="selectEmoji('${icon}')">${icon}</div>`; }); html += `</div>`; }); html += `<div style="margin-top:20px; text-align:center;"><button class="btn-gray" style="padding:10px 20px; border-radius:20px; border:none; color:white; font-weight:bold; cursor:pointer;" onclick="document.getElementById('dict-edit-icon').innerText = '➕ 選択'; closeEmojiPicker(); showToast('一覧にない場合は、OSの絵文字キーボードを使って手入力してくれ。');">その他の絵文字を使う</button></div>`; container.innerHTML = html; }
function closeEmojiPicker() { document.getElementById('emoji-picker-modal').classList.remove('active'); }
function selectEmoji(icon) { document.getElementById('dict-edit-icon').innerText = icon; closeEmojiPicker(); }

function processSemanticText(text) { if (!text) return { text: "", style: null }; let resText = text; let matchStyle = null; for (const item of advancedDict) { let matched = false; for (const key of item.keys) { if (resText.includes(key)) { resText = resText.split(key).join(item.icon); matched = true; } } if(matched && !matchStyle) { matchStyle = { bg: item.bg, txt: item.txt }; } } return { text: resText, style: matchStyle }; }
function extractTaskData(notes) { if(!notes) return { colorId: "", recurrence: "", cleanNotes: "" }; let colorId = "", recurrence = "", cleanNotes = notes; const cMatch = cleanNotes.match(/\[c:(\d+)\]/); if (cMatch) { colorId = cMatch[1]; cleanNotes = cleanNotes.replace(/\[c:\d+\]/, ''); } const rMatch = cleanNotes.match(/\[r:([A-Z]+)\]/); if (rMatch) { recurrence = rMatch[1]; cleanNotes = cleanNotes.replace(/\[r:[A-Z]+\]/, ''); } return { colorId, recurrence, cleanNotes: cleanNotes.trim() }; }

// ==========================================
// 5. カレンダーコアロジック
// ==========================================
function initColorPicker() { const picker = document.getElementById('color-picker'); if(!picker) return; picker.innerHTML = `<div class="color-opt selected" style="background:var(--accent)" onclick="selectColor(this, '')"></div>`; Object.keys(GOOGLE_COLORS).forEach(id => { picker.innerHTML += `<div class="color-opt" style="background:${GOOGLE_COLORS[id]}" onclick="selectColor(this, '${id}')"></div>`; }); }
function selectColor(el, id) { document.querySelectorAll('#color-picker .color-opt').forEach(c => c.classList.remove('selected')); if(el) { el.classList.add('selected'); } else { document.querySelectorAll('#color-picker .color-opt').forEach(c => { if((id === '' && c.style.background === 'var(--accent)') || c.getAttribute('onclick').includes(`'${id}'`)) c.classList.add('selected'); }); } selectedColorId = id; }
function initTaskColorPicker() { const picker = document.getElementById('task-color-picker'); if(!picker) return; picker.innerHTML = `<div class="color-opt selected" style="background:#34c759" onclick="selectTaskColor(this, '')"></div>`; Object.keys(GOOGLE_COLORS).forEach(id => { picker.innerHTML += `<div class="color-opt" style="background:${GOOGLE_COLORS[id]}" onclick="selectTaskColor(this, '${id}')"></div>`; }); }
function selectTaskColor(el, id) { document.querySelectorAll('#task-color-picker .color-opt').forEach(c => c.classList.remove('selected')); if(el) { el.classList.add('selected'); } else { document.querySelectorAll('#task-color-picker .color-opt').forEach(c => { if((id === '' && c.style.background === 'rgb(52, 199, 89)') || c.getAttribute('onclick').includes(`'${id}'`)) c.classList.add('selected'); }); } selectedTaskColorId = id; }

function setupObserver() { const options = { rootMargin: '300px', threshold: 0.1 }; observer = new IntersectionObserver((entries) => { entries.forEach(e => { if(e.isIntersecting && !isFetching && localStorage.getItem('jero_token') && !isAuthError) { if(e.target.id === 'bottom-trigger') { loadNextMonth(); } if(e.target.id === 'top-trigger') { loadPrevMonth(); } } }); }, options); ['bottom-trigger', 'top-trigger'].forEach(id => { const el = document.getElementById(id); if(el) observer.observe(el); }); }
document.getElementById('scroll-container').addEventListener('scroll', updateHeaderDisplay);
function updateHeaderDisplay() { if (isAuthError) return; const wrappers = document.querySelectorAll('.month-wrapper'); wrappers.forEach(w => { const rect = w.getBoundingClientRect(); if(rect.top < window.innerHeight / 2 && rect.bottom > window.innerHeight / 2) { document.getElementById('month-display').innerText = w.querySelector('.month-title').innerText; } }); }
function scrollToToday() { const today = new Date(); const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`; const target = document.getElementById(`cell-${dateStr}`); if(target) target.scrollIntoView({ behavior: 'smooth', block: 'center' }); }

function triggerFullReRender() { if (!localStorage.getItem('jero_token')) return; document.getElementById('calendar-wrapper').innerHTML = ''; renderedMonths = []; const today = new Date(); const y = today.getFullYear(); const m = today.getMonth(); renderMonthDOM(y, m, dataCache[`${y}-${m}`], 'append'); renderMonthDOM(y, m+1, dataCache[`${y}-${m+1}`], 'append');  }

function isEventSpanning(eventObj, dateStr) { if(!eventObj.start.date || !eventObj.end.date) return 'single'; const st = new Date(eventObj.start.date); const ed = new Date(eventObj.end.date); ed.setDate(ed.getDate() - 1); const tgt = new Date(dateStr); if(st.getTime() === ed.getTime()) return 'single'; if(tgt.getTime() === st.getTime()) return 'span-start'; if(tgt.getTime() === ed.getTime()) return 'span-end'; if(tgt > st && tgt < ed) return 'span-mid'; return 'single'; }

function getCardHtml(type, item) {
    const isEvent = type === 'event';
    const colorId = isEvent ? item.colorId : extractTaskData(item.notes).colorId;
    const color = isEvent ? (colorId ? GOOGLE_COLORS[colorId] : 'var(--accent)') : (colorId ? GOOGLE_COLORS[colorId] : '#34c759');
    
    // ★改修：ローカル待機中の予定を判定
    const isPending = item._localId ? true : false;
    const title = (isEvent ? (item.summary || '(無名予定)') : (item.title || '(無名タスク)')) + (isPending ? ' 🔄' : '');
    
    const safeData = encodeURIComponent(JSON.stringify(item));
    const clickFn = isEvent ? `openEditor(JSON.parse(decodeURIComponent('${safeData}')))` : `openTaskEditor(JSON.parse(decodeURIComponent('${safeData}')))`;
    
    let timeHtml = "";
    if (isEvent) {
        if (item.start && item.start.dateTime) {
            const d = new Date(item.start.dateTime);
            const timeStr = `${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
            let endTimeStr = "";
            if (item.end && item.end.dateTime) {
                const ed = new Date(item.end.dateTime);
                endTimeStr = `${ed.getHours()}:${String(ed.getMinutes()).padStart(2,'0')}`;
            }
            const fullTimeStr = endTimeStr ? `${timeStr} 〜 ${endTimeStr}` : timeStr;
            timeHtml = `<span class="time-text" onclick="event.stopPropagation(); showTimePopup(this, '${fullTimeStr}', '${color}')">${timeStr}</span>`;
        }
    } else {
        const checkIcon = item.status === 'completed' ? '✅' : '⬜️';
        timeHtml = `<span style="font-size:16px; margin-right:4px; cursor:pointer;" onclick="event.stopPropagation(); toggleTaskCompletion('${item.id}', '${item.status === 'completed' ? 'needsAction' : 'completed'}')">${checkIcon}</span>`;
    }
    
    const titleStyle = (!isEvent && item.status === 'completed') ? 'text-decoration: line-through; opacity: 0.6;' : '';
    // 未同期アイテムのスタイル
    const cardStyle = isPending ? 'opacity: 0.7; border: 1px dashed #ccc;' : '';

    return `<div class="item-card" onclick="${clickFn}" style="${cardStyle}"><div class="card-color-bar" style="background-color: ${color};"></div><div class="card-content" style="${titleStyle}">${timeHtml}<div class="card-title">${title}</div></div></div>`;
}

function showTimePopup(el, text, colorCode) {
    document.querySelectorAll('.time-popup').forEach(p => p.remove());
    const popup = document.createElement('div');
    popup.className = 'time-popup';
    popup.style.backgroundColor = colorCode;
    popup.innerHTML = `${text}<span style="position:absolute; bottom:-4px; left:14px; width:0; height:0; border-left:5px solid transparent; border-right:5px solid transparent; border-top:5px solid ${colorCode};"></span>`;
    const rect = el.getBoundingClientRect();
    popup.style.top = (rect.top - 32) + 'px';
    popup.style.left = (rect.left - 4) + 'px';
    document.body.appendChild(popup);
    setTimeout(() => popup.classList.add('show'), 10);
    setTimeout(() => { popup.classList.remove('show'); setTimeout(() => popup.remove(), 200); }, 2000);
}

async function openDailyModal(dateStr, dow) {
    selectedDateStr = dateStr; const days = ['日','月','火','水','木','金','土']; const [y, m, d] = dateStr.split('-'); 
    document.querySelectorAll('.day').forEach(el => el.classList.remove('selected'));
    const selectedCell = document.getElementById(`cell-${dateStr}`);
    if (selectedCell) selectedCell.classList.add('selected');
    document.getElementById('bottom-detail-date').innerHTML = `<span style="font-size:24px; font-weight:300;">${parseInt(d)}</span> <span style="font-size:12px; color:#888;">${days[dow]}</span>`;
    const list = document.getElementById('bottom-detail-list'); list.innerHTML = ''; 
    const monthKey = `${y}-${parseInt(m)-1}`; const data = dataCache[monthKey]; let hasItems = false;
    let modalItems = [];
    if(data) {
        if(data.events) { const events = data.events.filter(e => { if(!e.start) return false; const td = e.start.date || e.start.dateTime; return td && td.includes(dateStr) || (e.start.date && isEventSpanning(e, dateStr) !== 'single'); }); events.forEach(e => modalItems.push({type: 'event', data: e})); }
        if(data.tasks) { const tasks = data.tasks.filter(t => t.due && t.due.includes(dateStr)); tasks.forEach(t => modalItems.push({type: 'task', data: t})); }
    }
    modalItems.sort((a, b) => { const aIsCompleted = a.type === 'task' && a.data.status === 'completed' ? 1 : 0; const bIsCompleted = b.type === 'task' && b.data.status === 'completed' ? 1 : 0; return aIsCompleted - bIsCompleted; });
    
    if(modalItems.length > 0) { hasItems = true; modalItems.forEach(item => { list.innerHTML += getCardHtml(item.type, item.data); }); }
    if(!hasItems) list.innerHTML = `<div style="text-align:center; color:#888; padding: 30px; font-weight: 500;">予定はありません</div>`;
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
        
        sortedEvents.filter(e => { if (!e.start) return false; const td = e.start.date || e.start.dateTime; return td && td.includes(dateStr) || (e.start.date && isEventSpanning(e, dateStr) !== 'single'); }).forEach(e => { 
            const div = document.createElement('div'); div.className = 'event'; 
            let timeStr = ""; if(e.start.dateTime) { const d = new Date(e.start.dateTime); timeStr = `${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`; } 
            const spanType = isEventSpanning(e, dateStr); 
            if(spanType !== 'single') div.classList.add(spanType); 
            const recurIcon = e.recurrence ? '🔁 ' : ''; 
            const pData = processSemanticText(e.summary); 
            
            // ★改修：未同期アイコン
            const pendingIcon = e._localId ? '🔄 ' : '';
            div.innerText = pendingIcon + recurIcon + pData.text + (timeStr ? ` (${timeStr})` : ''); 
            
            let bgColor = 'var(--accent)'; let txtColor = '#ffffff';
            if(pData.style) { bgColor = pData.style.bg; txtColor = pData.style.txt; } 
            else if(e.colorId && GOOGLE_COLORS[e.colorId]) { 
                bgColor = GOOGLE_COLORS[e.colorId]; 
                txtColor = getContrastYIQ(bgColor); 
            }
            
            if (spanType !== 'single') {
                div.classList.add('continuous');
                div.style.borderTop = `3px solid ${bgColor}`;
                div.style.backgroundColor = 'transparent';
                div.style.color = bgColor; 
                if(spanType === 'span-mid' || spanType === 'span-end') div.style.color = 'transparent'; 
            } else {
                div.classList.add('single');
                div.style.backgroundColor = bgColor;
                div.style.color = txtColor;
            }
            if (e._localId) div.style.opacity = '0.7'; // 未同期は半透明
            dayEl.appendChild(div); 
        });
        
        if(data.tasks) data.tasks.filter(t => t.due && t.due.includes(dateStr)).forEach(t => { 
            const div = document.createElement('div'); div.className = `task ${t.status === 'completed' ? 'completed' : ''}`; 
            const tData = extractTaskData(t.notes); const pData = processSemanticText(t.title); const recurIcon = tData.recurrence ? '🔁 ' : ''; 
            const pendingIcon = t._localId ? '🔄 ' : '';
            div.innerHTML = `<span style="opacity:0.8;">☑</span> ${pendingIcon}${recurIcon}${pData.text}`; 
            if(pData.style) { div.style.backgroundColor = pData.style.bg; div.style.color = pData.style.txt; } 
            else if(tData.colorId && GOOGLE_COLORS[tData.colorId]) { div.style.backgroundColor = GOOGLE_COLORS[tData.colorId]; div.style.color = getContrastYIQ(GOOGLE_COLORS[tData.colorId]); } 
            if (t._localId) div.style.opacity = '0.7'; // 未同期は半透明
            dayEl.appendChild(div); 
        });
        grid.appendChild(dayEl);
    }
    const container = document.getElementById('calendar-wrapper');
    if(position === 'append') container.appendChild(wrapper); 
    else if(position === 'prepend') container.insertBefore(wrapper, container.firstChild);
    else if(position === 'replace') { const children = Array.from(container.children); const insertIndex = children.findIndex(c => { const [_, y, m] = c.id.split('-'); return parseInt(y) > year || (parseInt(y) === year && parseInt(m) > month); }); if(insertIndex === -1) container.appendChild(wrapper); else container.insertBefore(wrapper, children[insertIndex]); }
}

async function initCalendar() { setProgress(10); try { await loadDataCacheFromIDB(); const today = new Date(); const y = today.getFullYear(); const m = today.getMonth(); await fetchAndRenderMonth(y, m, 'append', false); await fetchAndRenderMonth(y, m+1, 'append', false); scrollToToday(); if (navigator.onLine && !isAuthError) { document.getElementById('offline-badge').classList.remove('active'); fetchAndRenderMonth(y, m, 'replace', true); fetchAndRenderMonth(y, m+1, 'replace', true); } else { document.getElementById('offline-badge').classList.add('active'); } } finally { setProgress(100); } }
async function loadNextMonth() { if(renderedMonths.length === 0 || isFetching || isAuthError) return; isFetching = true; document.getElementById('bottom-trigger').classList.remove('hidden'); try { const last = renderedMonths[renderedMonths.length - 1]; let nextY = last.year; let nextM = last.month + 1; if(nextM > 11) { nextM = 0; nextY++; } await fetchAndRenderMonth(nextY, nextM, 'append'); } finally { isFetching = false; document.getElementById('bottom-trigger').classList.add('hidden'); } }
async function loadPrevMonth() { if(renderedMonths.length === 0 || isFetching || isAuthError) return; isFetching = true; document.getElementById('top-trigger').classList.remove('hidden'); try { const container = document.getElementById('scroll-container'); const oldHeight = container.scrollHeight; const first = renderedMonths[0]; let prevY = first.year; let prevM = first.month - 1; if(prevM < 0) { prevM = 11; prevY--; } await fetchAndRenderMonth(prevY, prevM, 'prepend'); container.scrollTop += (container.scrollHeight - oldHeight); } finally { isFetching = false; document.getElementById('top-trigger').classList.add('hidden'); } }
function notifyAuthError() { isAuthError = true; localStorage.removeItem('jero_token'); localStorage.removeItem('jero_token_time'); document.getElementById('auth-btn').style.display = 'block'; document.getElementById('auth-btn').classList.add('auth-pulse'); const monthDisp = document.getElementById('month-display'); monthDisp.innerText = '⚠️右上の🔑をタップ'; monthDisp.style.color = '#ff3b30'; }

async function fetchAndRenderMonth(year, month, position = 'append', forceFetch = false) {
    if (isAuthError) return; const monthKey = `${year}-${month}`; const startOfMonth = new Date(year, month, 1).toISOString(); const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59).toISOString();
    let needsRender = false;
    if (forceFetch || !dataCache[monthKey]) { 
        if (!navigator.onLine) { if (!dataCache[monthKey]) showToast('オフラインのためデータが取得できません。'); return; }
        let events = [], tasks = [], authErrorDetected = false; 
        try { const eResp = await gapi.client.calendar.events.list({ calendarId: 'primary', timeMin: startOfMonth, timeMax: endOfMonth, singleEvents: true, orderBy: 'startTime', maxResults: 1000 }); events = eResp.result.items || []; } catch(e) { const code = e.status || (e.result && e.result.error && e.result.error.code); if (code === 401 || code === 403) authErrorDetected = true; } 
        try { const tResp = await gapi.client.tasks.tasks.list({ tasklist: '@default', dueMin: startOfMonth, dueMax: endOfMonth, showHidden: true }); tasks = tResp.result.items || []; } catch(e) { const code = e.status || (e.result && e.result.error && e.result.error.code); if (code === 401 || code === 403) authErrorDetected = true; } 
        
        if (authErrorDetected) { 
            const recovered = await attemptSilentRefresh();
            if (recovered) {
                try { 
                    const eResp = await gapi.client.calendar.events.list({ calendarId: 'primary', timeMin: startOfMonth, timeMax: endOfMonth, singleEvents: true, orderBy: 'startTime', maxResults: 1000 }); events = eResp.result.items || []; 
                    const tResp = await gapi.client.tasks.tasks.list({ tasklist: '@default', dueMin: startOfMonth, dueMax: endOfMonth, showHidden: true }); tasks = tResp.result.items || []; 
                    authErrorDetected = false;
                } catch(e) { authErrorDetected = true; }
            }
            if (authErrorDetected) { notifyAuthError(); return; } 
        } 
        dataCache[monthKey] = { events, tasks }; saveDataCacheToIDB(monthKey, { events, tasks }); needsRender = true;
    } else { if (!document.getElementById(`month-${year}-${month}`)) needsRender = true; }
    if (needsRender) { const existing = document.getElementById(`month-${year}-${month}`); if(existing) existing.remove(); renderMonthDOM(year, month, dataCache[monthKey], position); if(!existing) { if (position === 'append') renderedMonths.push({year, month}); else if (position === 'prepend') renderedMonths.unshift({year, month}); } updateHeaderDisplay(); }
}

// ==========================================
// 6. エディタ UI
// ==========================================
function renderIconPalette(targetId, inputId) {
    const palette = document.getElementById(targetId);
    if (!palette) return;
    palette.innerHTML = '';
    advancedDict.forEach(item => {
        if (!item.icon || !item.keys || item.keys.length === 0) return;
        const prefix = item.keys[0]; 
        const btn = document.createElement('div');
        btn.innerHTML = `<span style="font-size:18px;">${item.icon}</span><span style="font-size:10px; color:#666; margin-left:4px; font-weight:bold;">${prefix}</span>`;
        btn.style.cssText = `display:flex; align-items:center; cursor: pointer; padding: 4px 8px; background: var(--head-bg); border: 1px solid var(--border); border-radius: 8px; flex-shrink: 0;`;
        btn.onclick = () => {
            const inputEl = document.getElementById(inputId);
            if (!inputEl.value.startsWith(prefix)) { inputEl.value = prefix + " " + inputEl.value; }
        };
        palette.appendChild(btn);
    });
}

function openEditor(e = null) {
    // もし未同期（ローカルキュー）のアイテムだったら編集させず警告を出す
    if (e && e._localId) {
        showToast('🔄 この予定はまだGoogleに同期されていないため、現在編集できない。電波回復を待て。');
        return;
    }

    document.getElementById('overlay').classList.add('active');
    document.getElementById('editor-modal').classList.add('active');
    document.getElementById('edit-id').value = e ? e.id : '';
    document.getElementById('edit-title').value = e ? e.summary || '' : '';
    document.getElementById('edit-loc').value = e ? e.location || '' : '';
    document.getElementById('edit-desc').value = e ? e.description || '' : '';
    selectColor(null, e && e.colorId ? e.colorId : '');
    const isAllDay = e && e.start && e.start.date;
    const alldayToggle = document.getElementById('edit-allday');
    alldayToggle.checked = !!isAllDay;
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
    } 
    else { 
        const tzOffset = st.getTimezoneOffset() * 60000; 
        startInput.value = new Date(st.getTime() - tzOffset).toISOString().slice(0, 16); 
        endInput.value = new Date(ed.getTime() - tzOffset).toISOString().slice(0, 16); 
    }
    document.getElementById('editor-title').innerText = e ? '予定の編集' : '新規予定';
    document.getElementById('btn-delete').style.display = e ? 'block' : 'none';
    document.getElementById('btn-duplicate').style.display = e ? 'block' : 'none';
    const convertBtn = document.getElementById('btn-convert-task');
    if(convertBtn) convertBtn.style.display = e ? 'block' : 'none';
    renderIconPalette('event-icon-palette', 'edit-title');
}

function closeEditor() { document.getElementById('editor-modal').classList.remove('active'); if(!document.getElementById('daily-modal').classList.contains('active')) { document.getElementById('overlay').classList.remove('active'); } }

function toggleTimeInputs() {
    const isAllDay = document.getElementById('edit-allday').checked;
    const startInput = document.getElementById('edit-start'); const endInput = document.getElementById('edit-end');
    let startVal = startInput.value; let endVal = endInput.value;
    startInput.type = isAllDay ? 'date' : 'datetime-local'; endInput.type = isAllDay ? 'date' : 'datetime-local';
    if (startVal) startInput.value = isAllDay ? startVal.split('T')[0] : (startVal.includes('T') ? startVal : startVal + 'T12:00');
    if (endVal) endInput.value = isAllDay ? endVal.split('T')[0] : (endVal.includes('T') ? endVal : endVal + 'T13:00');
}

// ★改修：dispatchManualActionへ処理を投げる
async function saveEvent() {
    const id = document.getElementById('edit-id').value; const title = document.getElementById('edit-title').value.trim();
    if (!title) { showToast('タイトルを入力してくれ'); return; }
    const isAllDay = document.getElementById('edit-allday').checked; let startVal = document.getElementById('edit-start').value; let endVal = document.getElementById('edit-end').value;
    if(!startVal) { showToast('開始日時が不正だ'); return; } if(!endVal) endVal = startVal;
    
    // APIへ送るためのペイロード構築
    const action = { type: 'event', method: id ? 'update' : 'insert', id: id, title: title, location: document.getElementById('edit-loc').value, description: document.getElementById('edit-desc').value, colorId: selectedColorId };
    try {
        if (isAllDay) { 
            action.start = startVal; 
            let parts = endVal.split('-'); 
            const ed = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])); 
            ed.setDate(ed.getDate() + 1); 
            action.end = `${ed.getFullYear()}-${String(ed.getMonth()+1).padStart(2,'0')}-${String(ed.getDate()).padStart(2,'0')}`; 
        } 
        else { action.start = new Date(startVal).toISOString(); action.end = new Date(endVal).toISOString(); }
    } catch (err) { showToast('日時の処理でエラーが起きた。もう一度頼む。'); return; }
    closeEditor(); closeAllModals(); await dispatchManualAction(action);
}

async function confirmDeleteEvent() { const id = document.getElementById('edit-id').value; if(!id || !confirm('この予定を完全に消し去るか？')) return; const action = { type: 'event', method: 'delete', id: id }; closeEditor(); closeAllModals(); await dispatchManualAction(action); }

function duplicateEvent() { document.getElementById('edit-id').value = ''; document.getElementById('editor-title').innerText = '新規予定 (複製)'; document.getElementById('btn-delete').style.display = 'none'; document.getElementById('btn-duplicate').style.display = 'none'; const convertBtn = document.getElementById('btn-convert-task'); if(convertBtn) convertBtn.style.display = 'none'; showToast('複製モードだ。日時を変えて保存を押せ。'); }

function openTaskEditor(t = null) {
    if (t && t._localId) { showToast('🔄 このタスクはまだGoogleに同期されていないため、現在編集できない。'); return; }
    document.getElementById('overlay').classList.add('active'); document.getElementById('task-editor-modal').classList.add('active');
    document.getElementById('task-edit-id').value = t ? t.id : ''; document.getElementById('task-edit-title').value = t ? t.title || '' : '';
    let cleanNotes = "";
    if (t && t.notes) { const extracted = extractTaskData(t.notes); cleanNotes = extracted.cleanNotes; selectTaskColor(null, extracted.colorId); } else { selectTaskColor(null, ''); }
    document.getElementById('task-edit-notes').value = cleanNotes;
    const dueInput = document.getElementById('task-edit-due');
    if (t && t.due) { dueInput.value = new Date(t.due).toISOString().split('T')[0]; } else { dueInput.value = selectedDateStr || new Date().toISOString().split('T')[0]; }
    document.getElementById('task-editor-title').innerText = t ? 'タスクの編集' : '新規タスク'; document.getElementById('task-btn-delete').style.display = t ? 'block' : 'none';
    const convertBtn = document.getElementById('btn-convert-event'); if(convertBtn) convertBtn.style.display = t ? 'block' : 'none';
    renderIconPalette('task-icon-palette', 'task-edit-title');
}

function closeTaskEditor() { document.getElementById('task-editor-modal').classList.remove('active'); if(!document.getElementById('daily-modal').classList.contains('active')) { document.getElementById('overlay').classList.remove('active'); } }

async function toggleTaskCompletion(taskId, newStatus) {
    // 省略：タスク完了状態のトグル（API直叩きのため、今回はここは簡易にエラーハンドリングのみ）
    let targetTask = null; 
    for (const key in dataCache) { if (dataCache[key].tasks) { targetTask = dataCache[key].tasks.find(t => t.id === taskId); if (targetTask) break; } }
    if (!targetTask) return;
    
    if (targetTask._localId) { showToast('🔄 未同期タスクの完了はできない。'); return; }

    targetTask.status = newStatus; 
    const td = targetTask.due ? new Date(targetTask.due) : new Date(); 
    
    await fetchAndRenderMonth(td.getFullYear(), td.getMonth(), 'replace', false);
    if (selectedDateStr) { const dow = new Date(selectedDateStr).getDay(); openDailyModal(selectedDateStr, dow); } 

    const patchBody = { status: newStatus }; if (newStatus === 'completed') { patchBody.completed = new Date().toISOString(); } else { patchBody.completed = null; }
    try {
        if (navigator.onLine && typeof gapi !== 'undefined') { 
            await gapi.client.tasks.tasks.patch({ tasklist: '@default', task: taskId, resource: patchBody }); 
        } else { 
            showToast('圏外ではタスクの完了操作はできない。'); 
            // 状態を元に戻す
            targetTask.status = newStatus === 'completed' ? 'needsAction' : 'completed';
            await fetchAndRenderMonth(td.getFullYear(), td.getMonth(), 'replace', false);
        }
    } catch(e) { console.error('裏側での同期エラー:', e.message); }
}

async function saveTask() {
    const id = document.getElementById('task-edit-id').value; const title = document.getElementById('task-edit-title').value.trim();
    if (!title) { showToast('タスク名を入力してくれ'); return; }
    let rawNotes = document.getElementById('task-edit-notes').value.trim(); if (selectedTaskColorId) { rawNotes += (rawNotes ? '\n' : '') + `[c:${selectedTaskColorId}]`; }
    const action = { type: 'task', method: id ? 'update' : 'insert', id: id, title: title, description: rawNotes };
    const dueVal = document.getElementById('task-edit-due').value; if (dueVal) { action.due = dueVal + 'T00:00:00.000Z'; }
    closeTaskEditor(); closeAllModals(); await dispatchManualAction(action);
}

async function confirmDeleteTask() { const id = document.getElementById('task-edit-id').value; if(!id || !confirm('このタスクを完全に消し去るか？')) return; const action = { type: 'task', method: 'delete', id: id }; closeTaskEditor(); closeAllModals(); await dispatchManualAction(action); }

async function executeConversion(fromType) {
     // 省略：タスクと予定の変換機能
    if (!confirm(`この${fromType === 'event' ? '予定をタスク' : 'タスクを予定'}に変換して良いか？\n元のデータは消去されるぞ。`)) return;
    let deleteAction = null; let insertAction = null; let redrawDate = new Date();
    if (fromType === 'event') {
        const id = document.getElementById('edit-id').value; const title = document.getElementById('edit-title').value.trim() || '無名タスク'; const startVal = document.getElementById('edit-start').value; const notes = document.getElementById('edit-desc').value; const colorId = selectedColorId;
        if (id) deleteAction = { type: 'event', method: 'delete', id: id };
        let rawNotes = notes; if (colorId) rawNotes += (rawNotes ? '\n' : '') + `[c:${colorId}]`;
        let dueIso = ''; if (startVal) { let dStr = startVal.includes('T') ? startVal.split('T')[0] : startVal; let parts = dStr.split('-'); redrawDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])); dueIso = dStr + 'T00:00:00.000Z'; }
        insertAction = { type: 'task', method: 'insert', title: title, description: rawNotes, due: dueIso };
    } else {
        const id = document.getElementById('task-edit-id').value; const title = document.getElementById('task-edit-title').value.trim() || '無名予定'; const dueVal = document.getElementById('task-edit-due').value; const notesVal = document.getElementById('task-edit-notes').value; const colorId = selectedTaskColorId;
        if (id) deleteAction = { type: 'task', method: 'delete', id: id };
        insertAction = { type: 'event', method: 'insert', title: title, description: notesVal, colorId: colorId };
        if (dueVal) { let parts = dueVal.split('-'); redrawDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])); insertAction.start = dueVal; const ed = new Date(redrawDate); ed.setDate(ed.getDate() + 1); insertAction.end = `${ed.getFullYear()}-${String(ed.getMonth()+1).padStart(2,'0')}-${String(ed.getDate()).padStart(2,'0')}`; } 
        else { insertAction.start = new Date().toISOString().split('T')[0]; const tmrw = new Date(); tmrw.setDate(tmrw.getDate()+1); insertAction.end = tmrw.toISOString().split('T')[0]; }
    }
    showGlobalLoader('変換中...');
    try {
        if (navigator.onLine) { if (deleteAction) await executeApiAction(deleteAction); await executeApiAction(insertAction); showToast('✅ 変換を完了した'); } 
        else { if (deleteAction) await saveToSyncQueue(deleteAction); await saveToSyncQueue(insertAction); showToast('📦 圏外のため野戦倉庫に保管した。電波回復時に変換する'); }
        if (typeof dataCache !== 'undefined' && deleteAction) { for (let key in dataCache) { if (deleteAction.type === 'event' && dataCache[key].events) { dataCache[key].events = dataCache[key].events.filter(e => e.id !== deleteAction.id); } if (deleteAction.type === 'task' && dataCache[key].tasks) { dataCache[key].tasks = dataCache[key].tasks.filter(t => t.id !== deleteAction.id); } } }
        closeEditor(); closeTaskEditor(); closeAllModals(); await fetchAndRenderMonth(redrawDate.getFullYear(), redrawDate.getMonth(), 'replace', navigator.onLine);
    } catch (e) { showToast('❌ 変換エラー: ' + e.message); } finally { hideGlobalLoader(); }
}

// ==========================================
// 7. アクション司令塔 (迎撃システムの中核)
// ==========================================
// ★改修：API通信をここで一元管理し、エラーを迎撃する
async function dispatchManualAction(action) {
    showGlobalLoader('処理中...'); 
    let msgAction = '保存'; if(action.method === 'insert') msgAction = '追加'; if(action.method === 'update') msgAction = '更新'; if(action.method === 'delete') msgAction = '削除'; const msgType = action.type === 'event' ? '予定' : 'タスク';
    
    let isSuccess = false;

    // オフラインなら即座にキューへ
    if (!navigator.onLine) {
        const localId = await saveToSyncQueue(action);
        if (localId) insertOptimisticData(action, localId); // ローカルキャッシュに仮想データとして挿入
        showToast(`📦 圏外だ。「${msgType}」の${msgAction}を野戦倉庫（キュー）に保管した。`);
        isSuccess = true;
    } else {
        try {
            await executeApiAction(action);
            showToast(`✅ ${msgType}を${msgAction}した`);
            isSuccess = true;
        } catch (e) {
            console.error("API送信エラー:", e);
            const isAuthError = e.status === 401 || (e.result && e.result.error && e.result.error.message.includes('credentials'));
            const isNetworkError = e.name === 'TypeError' || e.status === 0;

            if (isAuthError || isNetworkError) {
                // 401やネットワークエラーを迎撃してキューに入れる
                const localId = await saveToSyncQueue(action);
                if (localId) insertOptimisticData(action, localId);
                showToast(`📦 通信不良または認証エラーだ。野戦倉庫に退避し、UIは更新した。`);
                if (isAuthError) {
                    console.warn("バックグラウンドでサイレントリフレッシュを試みる...");
                    attemptSilentRefresh();
                }
                isSuccess = true;
            } else {
                const errMsg = e.result && e.result.error ? e.result.error.message : (e.message || "未知のエラー");
                showToast('❌ 致命的エラー: ' + errMsg); 
            }
        }
    }

    // 成功またはキューへの退避が完了した場合、画面を描画し直す
    if (isSuccess) {
        if(typeof dataCache !== 'undefined') { 
            for(let key in dataCache) { 
                if(action.method === 'delete') { 
                    if(action.type === 'event') dataCache[key].events = dataCache[key].events.filter(e => e.id !== action.id); 
                    if(action.type === 'task') dataCache[key].tasks = dataCache[key].tasks.filter(t => t.id !== action.id); 
                } 
            } 
        }
        
        const tdStr = action.start || action.due; let td = new Date(); if (tdStr) { if (tdStr.includes('T')) { td = new Date(tdStr); } else { const p = tdStr.split('-'); td = new Date(parseInt(p[0]), parseInt(p[1])-1, parseInt(p[2])); } }
        await fetchAndRenderMonth(td.getFullYear(), td.getMonth(), 'replace', false); // APIを叩かずキャッシュから再描画
        
        if (selectedDateStr) {
            const dow = new Date(selectedDateStr).getDay();
            openDailyModal(selectedDateStr, dow);
        }
    }
    hideGlobalLoader();
}

// 仮想データをローカルキャッシュに挿入する（楽観的UIのため）
function insertOptimisticData(action, localId) {
    const tdStr = action.start || action.due;
    let td = new Date();
    if (tdStr) {
        if (tdStr.includes('T')) td = new Date(tdStr);
        else { const p = tdStr.split('-'); td = new Date(parseInt(p[0]), parseInt(p[1])-1, parseInt(p[2])); }
    }
    const monthKey = `${td.getFullYear()}-${td.getMonth()}`;
    if (!dataCache[monthKey]) dataCache[monthKey] = { events: [], tasks: [] };

    if (action.type === 'event' && action.method === 'insert') {
        const dummyEvent = {
            id: 'dummy_' + localId,
            summary: action.title,
            start: action.start.includes('T') ? { dateTime: action.start } : { date: action.start },
            end: action.end ? (action.end.includes('T') ? { dateTime: action.end } : { date: action.end }) : null,
            colorId: action.colorId,
            _localId: localId // 未同期フラグ
        };
        dataCache[monthKey].events.push(dummyEvent);
    } else if (action.type === 'task' && action.method === 'insert') {
         const dummyTask = {
            id: 'dummy_' + localId,
            title: action.title,
            notes: action.description,
            due: action.due,
            status: 'needsAction',
            _localId: localId // 未同期フラグ
        };
        dataCache[monthKey].tasks.push(dummyTask);
    }
}

// 実際のAPI叩き部分
async function executeApiAction(action, isRetry = false) {
    if (!navigator.onLine) throw new Error("Offline");

    if (action.type === 'event') {
        if (action.method === 'insert') {
            const body = { summary: action.title, location: action.location, description: action.description, colorId: action.colorId };
            if (action.start.includes('T')) { body.start = { dateTime: action.start }; body.end = { dateTime: action.end }; } 
            else { body.start = { date: action.start }; body.end = { date: action.end }; }
            await gapi.client.calendar.events.insert({ calendarId: 'primary', resource: body });
        } else if (action.method === 'update') {
            const body = { summary: action.title, location: action.location, description: action.description, colorId: action.colorId };
            if (action.start.includes('T')) { body.start = { dateTime: action.start }; body.end = { dateTime: action.end }; } 
            else { body.start = { date: action.start }; body.end = { date: action.end }; }
            await gapi.client.calendar.events.patch({ calendarId: 'primary', eventId: action.id, resource: body });
        } else if (action.method === 'delete') {
            await gapi.client.calendar.events.delete({ calendarId: 'primary', eventId: action.id });
        }
    } else if (action.type === 'task') {
        if (action.method === 'insert') {
            const body = { title: action.title, notes: action.description };
            if (action.due) body.due = action.due;
            await gapi.client.tasks.tasks.insert({ tasklist: '@default', resource: body });
        } else if (action.method === 'update') {
            const body = { title: action.title, notes: action.description };
            if (action.due) body.due = action.due;
            await gapi.client.tasks.tasks.patch({ tasklist: '@default', task: action.id, resource: body });
        } else if (action.method === 'delete') {
            await gapi.client.tasks.tasks.delete({ tasklist: '@default', task: action.id });
        }
    }
}

// ==========================================
// 8. その他初期化プロセス等
// ==========================================
async function processPDFFile(file) {
    showGlobalLoader('PDFを読み込み中...');
    try {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
        const arrayBuffer = await file.arrayBuffer(); const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer }); const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1); const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d'); canvas.width = viewport.width; canvas.height = viewport.height;
        await page.render({ canvasContext: ctx, viewport: viewport }).promise;
        const base64String = canvas.toDataURL('image/jpeg', 0.8).split(',')[1]; 
        chatFileBase64 = base64String; chatFileMime = 'image/jpeg';
        document.getElementById('chat-file-name').innerText = file.name + ' (画像化済)'; document.getElementById('chat-attach-box').style.display = 'flex';
        openJeroChat(); document.getElementById('chat-input').value = "この画像を解析し、含まれる予定をすべて抽出してくれ。"; unlockAudioAndSend();
    } catch (error) { console.error('PDF処理エラー:', error); showToast('❌ PDFの読み込みに失敗した。'); } finally { hideGlobalLoader(); }
}

window.addEventListener('online', async () => { 
    // 単純にバッジを消すのではなく、未送信キューがあるか確認してから処理する
    showToast('📶 電波が回復した。野戦倉庫の物資（未同期データ）を転送する。'); 
    processSyncQueue(); 
});

window.addEventListener('offline', async () => { 
    updatePendingBadge(0); // オフライン表示に切り替え
    showToast('⚡️ 圏外になった。変更は野戦倉庫に退避する。'); 
});

// アプリがバックグラウンドからアクティブになった時の処理（iOS PWAで重要）
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        processSyncQueue();
    }
});

document.addEventListener('DOMContentLoaded', async () => { 
    try { 
        await initIDB(); loadSettings(); loadDict(); initColorPicker(); initTaskColorPicker(); 
        if(typeof initSpeech === 'function') initSpeech(); if(typeof initNotification === 'function') initNotification();
        const eventActionBar = document.querySelector('#editor-modal .action-bar');
        if (eventActionBar && !document.getElementById('btn-convert-task')) { const btn = document.createElement('button'); btn.id = 'btn-convert-task'; btn.className = 'btn btn-gray'; btn.style.display = 'none'; btn.innerText = '🔄 タスクへ'; btn.onclick = () => executeConversion('event'); eventActionBar.insertBefore(btn, document.getElementById('btn-duplicate')); }
        const taskActionBar = document.querySelector('#task-editor-modal .action-bar');
        if (taskActionBar && !document.getElementById('btn-convert-event')) { const btn = document.createElement('button'); btn.id = 'btn-convert-event'; btn.className = 'btn btn-gray'; btn.style.display = 'none'; btn.innerText = '🔄 予定へ'; btn.onclick = () => executeConversion('task'); taskActionBar.insertBefore(btn, document.getElementById('task-btn-delete')); }
    } catch (err) { showToast("初期化エラー: " + err.message); }
});

function gapiLoaded() { gapi.load('client', initializeGapiClient); }
async function initializeGapiClient() { await gapi.client.init({ discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest", "https://www.googleapis.com/discovery/v1/apis/tasks/v1/rest"]}); gapiInited = true; initWeekdays(); setupObserver(); checkAutoLogin(); }
function gisLoaded() { tokenClient = google.accounts.oauth2.initTokenClient({ client_id: CLIENT_ID, scope: SCOPES, callback: '', }); gisInited = true; }
function checkAutoLogin() { 
    const savedToken = localStorage.getItem('jero_token'); 
    if (savedToken) { 
        gapi.client.setToken({access_token: savedToken}); 
        document.getElementById('auth-btn').style.display = 'none'; 
        initCalendar(); 
        // 起動時に未送信キューがあれば処理
        processSyncQueue();
    } else { 
        notifyAuthError(); 
    } 
}

async function attemptSilentRefresh() {
    return new Promise((resolve) => {
        if (!gisInited || !tokenClient) { resolve(false); return; }
        tokenClient.callback = (resp) => {
            if (resp.error) { resolve(false); } 
            else { 
                gapi.client.setToken({access_token: resp.access_token}); 
                localStorage.setItem('jero_token', resp.access_token); 
                localStorage.setItem('jero_token_time', Date.now()); 
                isAuthError = false;
                document.getElementById('auth-btn').style.display = 'none'; 
                document.getElementById('auth-btn').classList.remove('auth-pulse');
                resolve(true); 
            }
        };
        // プロンプトを出さずにトークンのみ要求
        tokenClient.requestAccessToken({prompt: ''}); 
    });
}

async function handleAuthClick() { if (!gisInited || !gapiInited) return; tokenClient.callback = async (resp) => { if (resp.error !== undefined) throw (resp); gapi.client.setToken({access_token: resp.access_token}); localStorage.setItem('jero_token', resp.access_token); localStorage.setItem('jero_token_time', Date.now()); isAuthError = false; document.getElementById('auth-btn').style.display = 'none'; document.getElementById('auth-btn').classList.remove('auth-pulse'); document.getElementById('month-display').style.color = 'var(--txt)'; showToast('✅ 認証成功。野戦倉庫のチェックを行う。'); processSyncQueue(); document.getElementById('calendar-wrapper').innerHTML = ''; renderedMonths = []; dataCache = {}; initCalendar(); }; tokenClient.requestAccessToken({prompt: 'consent'}); }

document.addEventListener('DOMContentLoaded', () => {
    const resizer = document.getElementById('resizer');
    const bottomView = document.getElementById('bottom-detail-view');
    let startY = 0;
    let startHeight = 0;

    if(resizer && bottomView) {
        resizer.addEventListener('touchstart', (e) => {
            startY = e.touches[0].clientY;
            startHeight = bottomView.getBoundingClientRect().height;
            document.body.style.userSelect = 'none';
        }, { passive: true });

        document.addEventListener('touchmove', (e) => {
            if (startY === 0) return;
            const deltaY = startY - e.touches[0].clientY;
            let newHeight = startHeight + deltaY;
            
            const minH = window.innerHeight * 0.1;
            const maxH = window.innerHeight * 0.7;
            if (newHeight < minH) newHeight = minH;
            if (newHeight > maxH) newHeight = maxH;
            
            bottomView.style.height = `${newHeight}px`;
        }, { passive: true });

        document.addEventListener('touchend', () => {
            startY = 0;
            document.body.style.userSelect = '';
        });
    }
});
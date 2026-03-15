// JeroCalendar v9.1 Main Logic - GAS Proxy & Secure Edition
function getGasUrl() {
    const url = localStorage.getItem('jero_gas_url');
    if (!url) { showToast('⚠️ 設定画面(⚙️)から「サーバー接続キー」を入力してくれ。'); throw new Error('GAS URL missing'); }
    return url;
}
let dataCache = {}; let renderedMonths = []; let observer, isFetching = false, isAuthError = false;
let selectedDateStr = "", selectedColorId = "", selectedTaskColorId = "", currentView = 'calendar';
let isCalendarInited = false; // ★追加：二重起動防止フラグ
const GOOGLE_COLORS = { "1": "#7986cb", "2": "#33b679", "3": "#8e24aa", "4": "#e67c73", "5": "#f6bf26", "6": "#f4511e", "7": "#039be5", "8": "#616161", "9": "#3f51b5", "10": "#0b8043", "11": "#d50000" };
let advancedDict = [];
const DEFAULT_ADV_DICT = [{ keys: ["誕生日", "【誕】"], icon: "🎂", bg: "#ff2d55", txt: "#ffffff" }, { keys: ["会議", "【会】"], icon: "👥", bg: "#5856d6", txt: "#ffffff" }, { keys: ["休日", "【休】"], icon: "🏖️", bg: "#ff3b30", txt: "#ffffff" }];

// ==========================================
// 1. ユーティリティ & UI操作群
// ==========================================
function getContrastYIQ(hexcolor) {
    if (!hexcolor) return '#ffffff';
    hexcolor = hexcolor.replace("#", "");
    if (hexcolor.length === 3) hexcolor = hexcolor.split('').map(c => c + c).join('');
    var r = parseInt(hexcolor.substr(0, 2), 16);
    var g = parseInt(hexcolor.substr(2, 2), 16);
    var b = parseInt(hexcolor.substr(4, 2), 16);
    var yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return (yiq >= 128) ? '#000000' : '#ffffff';
}

function initWeekdays() { const days = ['日', '月', '火', '水', '木', '金', '土']; const c = document.getElementById('weekdays'); if (c) c.innerHTML = days.map(d => `<div class="wd">${d}</div>`).join(''); }
function loadSettings() { 
    const th = localStorage.getItem('jero_theme') || 'light'; const fs = localStorage.getItem('jero_fs') || '10'; document.getElementById('st-theme').value = th; document.getElementById('st-fs').value = fs; document.body.setAttribute('data-theme', th); document.documentElement.style.setProperty('--fs', fs + 'px'); document.getElementById('fs-val').innerText = fs; const voiceEnabled = localStorage.getItem('jero_voice_enabled') === 'true'; const stVoice = document.getElementById('st-voice'); if (stVoice) stVoice.checked = voiceEnabled; if (typeof isVoiceEnabled !== 'undefined') isVoiceEnabled = voiceEnabled; 
    const gasUrl = localStorage.getItem('jero_gas_url') || '';
    const gasUrlInput = document.getElementById('st-gas-url'); if (gasUrlInput) gasUrlInput.value = gasUrl; 
    
    // ★旧「アカウント確認中」のUIを、GASサーバー接続ステータス表示に書き換える
    const accInfo = document.getElementById('account-info');
    if (accInfo) {
        if (gasUrl) { accInfo.innerText = "連携サーバー(GAS) 接続済"; accInfo.style.color = '#34c759'; }
        else { accInfo.innerText = "連携サーバー 未設定"; accInfo.style.color = '#ff3b30'; }
    }
}
function saveGasUrl() { localStorage.setItem('jero_gas_url', document.getElementById('st-gas-url').value.trim()); showToast('✅ サーバー接続キーを保存した。'); triggerFullReRender(); }
function saveAndApplySettings() { const th = document.getElementById('st-theme').value; const fs = document.getElementById('st-fs').value; localStorage.setItem('jero_theme', th); localStorage.setItem('jero_fs', fs); document.body.setAttribute('data-theme', th); document.documentElement.style.setProperty('--fs', fs + 'px'); document.getElementById('fs-val').innerText = fs; }
function setProgress(p) { const pb = document.getElementById('progress-bar'); if (pb) { pb.style.width = p + '%'; if (p >= 100) setTimeout(() => pb.style.width = '0%', 500); } }
function closeAllModals() { document.querySelectorAll('.bottom-modal').forEach(m => m.classList.remove('active')); document.getElementById('overlay').classList.remove('active'); }
function openSettings() { 
    document.getElementById('overlay').classList.add('active'); 
    document.getElementById('settings-modal').classList.add('active'); 
    if (typeof checkNotificationStatus === 'function') checkNotificationStatus(); // ★開いた瞬間に通知ステータスを最新化
}
function closeSettings() { document.getElementById('settings-modal').classList.remove('active'); document.getElementById('overlay').classList.remove('active'); }

// ★旧Google認証の残骸を破壊し、GASサーバーの接続リセット機能に生まれ変わらせる
function switchAccount() { 
    if (confirm("サーバー接続設定(GAS URL)をリセットして初期状態に戻すか？")) {
        localStorage.removeItem('jero_gas_url'); 
        location.reload(); 
    }
}
function exportSettings() { const data = { theme: localStorage.getItem('jero_theme'), fs: localStorage.getItem('jero_fs'), voice: localStorage.getItem('jero_voice_enabled'), gemini_key: localStorage.getItem('jero_gemini_key'), gemini_prompt: localStorage.getItem('jero_gemini_prompt'), dict: localStorage.getItem('jero_adv_dict'), gas_url: localStorage.getItem('jero_gas_url') }; const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `JeroCalendar_Backup_${new Date().toISOString().split('T')[0]}.json`; a.click(); URL.revokeObjectURL(url); showToast('✅ 辞書と設定データを書き出した。「ファイル」アプリ等に保存しろ。'); }
function importSettings() { const input = document.createElement('input'); input.type = 'file'; input.accept = 'application/json'; input.onchange = (e) => { const file = e.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = (evt) => { try { const data = JSON.parse(evt.target.result); if (data.theme) localStorage.setItem('jero_theme', data.theme); if (data.fs) localStorage.setItem('jero_fs', data.fs); if (data.voice) localStorage.setItem('jero_voice_enabled', data.voice); if (data.gemini_key) localStorage.setItem('jero_gemini_key', data.gemini_key); if (data.gemini_prompt) localStorage.setItem('jero_gemini_prompt', data.gemini_prompt); if (data.gas_url) localStorage.setItem('jero_gas_url', data.gas_url); if (data.dict) { localStorage.setItem('jero_adv_dict', data.dict); advancedDict = JSON.parse(data.dict); } showToast('✅ 過去の記憶（データ）を完全に復元した。再起動するぞ。'); setTimeout(() => location.reload(), 1500); } catch (err) { showToast('❌ ファイルが壊れているか、形式が違うぞ。'); } }; reader.readAsText(file); }; input.click(); }
function executeEmergencyReset() { 
    if (confirm('全キャッシュとシステム(ServiceWorker)を消去・再起動するか？（事前に「データ書出」推奨）')) { 
        indexedDB.deleteDatabase('JeroDB_v8'); 
        localStorage.clear(); 
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(function(registrations) {
                for(let registration of registrations) { registration.unregister(); }
                location.reload(true);
            });
        } else {
            location.reload(true);
        }
    } 
}
function showGlobalLoader(msg) { document.getElementById('loader-msg').innerText = msg; document.getElementById('global-loader').classList.add('active'); }
function hideGlobalLoader() { document.getElementById('global-loader').classList.remove('active'); }
const yieldUI = () => new Promise(r => setTimeout(r, 30));
function showToast(msg) { const toast = document.getElementById('toast'); toast.innerText = msg; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 5000); }

// ==========================================
// 2. データベース & ローカル控え室 (オフラインキュー)
// ==========================================
let idb;
function initIDB() { return new Promise((resolve) => { const timeout = setTimeout(() => { resolve(); }, 2000); try { const req = indexedDB.open('JeroDB_v8', 3); req.onupgradeneeded = (e) => { const db = e.target.result; if (!db.objectStoreNames.contains('images')) db.createObjectStore('images', { keyPath: 'id' }); if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache', { keyPath: 'key' }); if (!db.objectStoreNames.contains('sync_queue')) db.createObjectStore('sync_queue', { keyPath: 'id' }); }; req.onsuccess = (e) => { clearTimeout(timeout); idb = e.target.result; resolve(); }; req.onerror = (e) => { clearTimeout(timeout); resolve(); }; } catch (e) { clearTimeout(timeout); resolve(); } }); }
function generateUUID() { return 'xxxx-xxxx-4xxx-yxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8); return v.toString(16); }); }

async function saveToSyncQueue(actionPayload) {
    if (!idb) return null;
    const queue = await getSyncQueue();

    // ★自己浄化：未送信データに対する編集・削除は、元のキューを直接書き換える
    if (actionPayload.method === 'update' || actionPayload.method === 'delete') {
        const targetDummyId = actionPayload.id;
        if (targetDummyId && targetDummyId.startsWith('dummy_')) {
            const targetLocalId = targetDummyId.replace('dummy_', '');
            const existingItem = queue.find(q => q.id === targetLocalId);
            if (existingItem) {
                if (actionPayload.method === 'delete') {
                    await clearSyncQueueItem(targetLocalId);
                    console.log("⚠️ 未送信データを送信前に削除したため、キューごと消去した。");
                    return targetLocalId;
                } else if (actionPayload.method === 'update') {
                    const mergedPayload = { ...existingItem.payload, ...actionPayload, method: 'insert', id: '' };
                    return new Promise((resolve) => {
                        try {
                            const tx = idb.transaction('sync_queue', 'readwrite');
                            tx.objectStore('sync_queue').put({ id: targetLocalId, payload: mergedPayload, timestamp: Date.now() });
                            tx.oncomplete = () => resolve(targetLocalId);
                        } catch (e) { resolve(null); }
                    });
                }
            }
        }
    }

    // 通常の追加、または同期済データの更新・削除
    return new Promise((resolve) => {
        try {
            const tx = idb.transaction('sync_queue', 'readwrite');
            const id = generateUUID();
            const payloadWithLocalId = { ...actionPayload, _localId: id };
            tx.objectStore('sync_queue').put({ id: id, payload: payloadWithLocalId, timestamp: Date.now() });
            tx.oncomplete = () => {
                console.log("⚠️ データをローカルの控え室に退避した。", payloadWithLocalId);
                resolve(id);
            };
        } catch (e) { resolve(null); }
    });
}

function getSyncQueue() { return new Promise((resolve) => { if (!idb) return resolve([]); try { const tx = idb.transaction('sync_queue', 'readonly'); const req = tx.objectStore('sync_queue').getAll(); req.onsuccess = () => resolve(req.result || []); } catch (e) { resolve([]); } }); }
function clearSyncQueueItem(id) { return new Promise((resolve) => { if (!idb) return resolve(); try { const tx = idb.transaction('sync_queue', 'readwrite'); tx.objectStore('sync_queue').delete(id); tx.oncomplete = () => resolve(); tx.onerror = () => resolve(); } catch (e) { resolve(); } }); }
function saveDataCacheToIDB(monthKey, data) { if (!idb) return; try { const tx = idb.transaction('cache', 'readwrite'); tx.objectStore('cache').put({ key: monthKey, data: data, timestamp: Date.now() }); } catch (e) { } }
function loadDataCacheFromIDB() { return new Promise((resolve) => { if (!idb) return resolve(); try { const tx = idb.transaction('cache', 'readonly'); const req = tx.objectStore('cache').getAll(); req.onsuccess = () => { if (req.result) { req.result.forEach(item => { dataCache[item.key] = item.data; }); } resolve(); }; req.onerror = () => resolve(); } catch (e) { resolve(); } }); }

// ==========================================
// 3. 同期状況バッジの完全制御
// ==========================================
async function updateSyncBadge() {
    const badge = document.getElementById('offline-badge');
    if (!idb) return;

    const queue = await getSyncQueue();
    const count = queue.length;

    if (!navigator.onLine) {
        badge.innerText = count > 0 ? `⚡️ 圏外 (未送信: ${count}件退避中)` : '⚡️ 完全自律モード (キャッシュ起動)';
        badge.style.background = '#ff9500';
        badge.classList.add('active');
        badge.onclick = null;
    } else {
        if (count > 0) {
            badge.innerText = `🔄 未送信データが ${count} 件あるぞ (タップで同期)`;
            badge.style.background = 'var(--accent)';
            badge.classList.add('active');
            badge.onclick = () => {
                openSyncManager(); // ★いきなり送信せず、管理モーダルを開く
            };
        } else {
            badge.classList.remove('active');
            badge.onclick = null;
        }
    }
}

// ==========================================
// 4. バックグラウンド同期エンジン (自浄作用搭載)
// ==========================================
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function processSyncQueue() {
    if (!navigator.onLine) return;
    const queue = await getSyncQueue();
    if (queue.length === 0) {
        await updateSyncBadge();
        return;
    }

    // GAS移行により、フロントエンドでの50分ごとのトークン更新は完全に不要になった
    console.log(`🔄 同期エンジン起動：${queue.length}件の未送信データを処理する。`);
    showGlobalLoader(`同期中... 残り${queue.length}件`);

    let successCount = 0;
    let needsRefresh = false;
    let authErrorOccurred = false;

    for (let item of queue) {
        if (authErrorOccurred) break; // 認証エラーが確定したら処理を中断

        let retries = 3;
        let itemSuccess = false;

        while (retries > 0 && !itemSuccess && !authErrorOccurred) {
            try {
                // まずはそのまま送信を試みる
                await executeApiAction(item.payload, true);
                await clearSyncQueueItem(item.id);
                successCount++;
                itemSuccess = true;
                needsRefresh = true;

                const action = item.payload;
                // ★フリーズの真犯人を解体：同期エンジン内でも幽霊データを強制修復し、画面ロックのまま死ぬのを防ぐ
                let safeToday = new Date().toISOString().split('T')[0];
                if (!action.start || typeof action.start === 'object') { action.start = (action.start && (action.start.dateTime || action.start.date)) || safeToday; }
                if (!action.due || typeof action.due === 'object') { action.due = (action.due && (action.due.dateTime || action.due.date)) || safeToday; }

                const tdStr = action.start || action.due; let td = new Date();
                if (tdStr && typeof tdStr === 'string') { 
                    if (tdStr.includes('T')) { td = new Date(tdStr); } 
                    else { const p = tdStr.split('-'); td = new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2])); } 
                }
                const monthKey = `${td.getFullYear()}-${td.getMonth()}`;

                if (dataCache[monthKey]) {
                    if (action.method === 'update') {
                        let targetList = action.type === 'event' ? dataCache[monthKey].events : dataCache[monthKey].tasks;
                        let existing = targetList.find(e => e.id === action.id);
                        if (existing) {
                            if (action.type === 'event') existing.colorId = action.colorId;
                            delete existing._pendingUpdate;
                        }
                    } else if (action.method === 'delete') {
                        if (action.type === 'event') dataCache[monthKey].events = dataCache[monthKey].events.filter(e => e.id !== action.id);
                        if (action.type === 'task') dataCache[monthKey].tasks = dataCache[monthKey].tasks.filter(t => t.id !== action.id);
                    } else if (action.method === 'insert') {
                        // ★無差別浄化：月またぎのゴーストを全滅させる
                        for (const key in dataCache) {
                            if (action.type === 'event' && dataCache[key].events) {
                                const existing = dataCache[key].events.find(e => e._localId === item.id);
                                if (existing) delete existing._localId;
                            }
                            if (action.type === 'task' && dataCache[key].tasks) {
                                const existing = dataCache[key].tasks.find(t => t._localId === item.id);
                                if (existing) delete existing._localId;
                            }
                        }
                    }
                }
                await sleep(500);
            } catch (error) {
                const code = error.status || (error.result && error.result.error && error.result.error.code);
                if (code === 401 || code === 403) {
                    console.error("❌ GASサーバーでの認証エラー。手動認証はもう存在しない。");
                    authErrorOccurred = true;
                    hideGlobalLoader();
                    showToast('⚠️ サーバー側で認証エラーが起きた。設定(GAS)を見直してくれ。');
                    await updateSyncBadge();
                } else if (code === 400 || code === 404 || code === 410) {
                    console.error(`❌ Googleから拒絶された(Code:${code})。不正データとして破棄する。`, error);
                    await clearSyncQueueItem(item.id);
                    itemSuccess = true;
                    needsRefresh = true;
                } else if (code === 429) {
                    // ★追加：API利用制限(429)に引っかかった場合は、リトライせずに直ちに撤退する
                    console.error(`❌ GoogleのAPI制限(429)に到達した。同期を一時中断する。`, error);
                    authErrorOccurred = true; // 便宜上エラー状態としてループを抜ける
                    showToast('⚠️ Googleの通信制限に引っかかった。時間を置いてから再試行してくれ。');
                } else {
                    retries--;
                    console.warn(`同期失敗 (ID: ${item.id}) - 残りリトライ: ${retries}回`, error);
                    if (retries > 0) {
                        const backoff = (4 - retries) * 2000; // ★2秒, 4秒, 6秒の指数関数的バックオフ
                        await sleep(backoff);
                    } else {
                        console.error("3回のリトライに失敗。ローカルの控え室に残置する。");
                    }
                }
            }
        }
    }

    hideGlobalLoader();
    if (successCount > 0) showToast(`✅ ${successCount}件の同期を完了した。`);

    // ★第1段階：即時UI浄化（バッジ消去と点線解除をラグなしで実行）
    await updateSyncBadge(); // 成功直後に即座に青帯を消す
    
    if (needsRefresh) {
        // ローカルキャッシュの浄化状態（点線が消えた状態）で即座に画面を再描画する
        const wrappers = document.querySelectorAll('.month-wrapper');
        for (const wrapper of wrappers) {
            const parts = wrapper.id.split('-');
            if (parts.length === 3) {
                const y = parseInt(parts[1]);
                const m = parseInt(parts[2]);
                const existingMonth = document.getElementById(`month-${y}-${m}`);
                if (existingMonth && dataCache[`${y}-${m}`]) {
                    existingMonth.remove();
                    renderMonthDOM(y, m, dataCache[`${y}-${m}`], 'replace');
                }
            }
        }
        if (typeof selectedDateStr !== 'undefined' && selectedDateStr) { 
            openDailyModal(selectedDateStr, new Date(selectedDateStr).getDay()); 
        }
    }

    // ★第2段階：バックグラウンド最新化（本物IDの取得）
    if (needsRefresh && !authErrorOccurred) {
        setTimeout(async () => {
            const wrappers = document.querySelectorAll('.month-wrapper');
            for (const wrapper of wrappers) {
                const parts = wrapper.id.split('-');
                if (parts.length === 3) {
                    const y = parseInt(parts[1]);
                    const m = parseInt(parts[2]);
                    await fetchAndRenderMonth(y, m, 'replace', true);
                }
            }
            // 取得後、詳細ビューが開いていれば再更新する
            if (typeof selectedDateStr !== 'undefined' && selectedDateStr) { 
                openDailyModal(selectedDateStr, new Date(selectedDateStr).getDay()); 
            }
        }, 2000);
    }
}

// ==========================================
// 5. 絵文字辞書関連
// ==========================================
const EMOJI_LIST = [{ cat: "顔・感情", icons: ["😀", "😂", "🥰", "😎", "🤔", "😭", "😡", "😴", "🤯", "😇", "😈", "👻", "👽", "🤖", "💩", "💡", "😆", "😅", "😊", "😉", "😍", "😘", "😋", "😜", "🤪", "🤫", "🤭", "🤮", "🤧", "😷"] }, { cat: "仕事・学校", icons: ["💻", "📱", "📞", "🔋", "📅", "📈", "📂", "✏️", "✂️", "🗑️", "🚩", "⚠️", "✅", "❌", "🏫", "🎓", "💼", "📌", "📎", "📏", "📖", "📚", "📝", "✉️", "📧", "🔍", "🔑", "🔒", "🔓", "🛠️"] }, { cat: "生活・家事", icons: ["🏠", "🛒", "🧹", "👕", "🍽️", "🍳", "🍱", "🍙", "☕", "🍺", "🍷", "💊", "🏥", "🛀", "🛌", "💰", "💳", "🛍️", "🛋️", "🧴", "🧻", "🪥", "🧽", "🗑️", "🧺", "🧷", "🧵", "🧶", "🪴", "✂️"] }, { cat: "動物・自然", icons: ["🐈", "🐕", "🐇", "🐻", "🐤", "🐟", "🌲", "🌸", "🌻", "🍁", "🍄", "🌍", "☀️", "🌙", "⭐", "🔥", "🐭", "🐹", "🦊", "🐼", "🦁", "🐯", "🐮", "🐷", "🐸", "🐵", "🐧", "🦉", "🦋", "🐾"] }, { cat: "建物・場所", icons: ["🏢", "⛩️", "🎡", "♨️", "📍", "🏦", "🏤", "🏥", "🏫", "🏪", "🏰", "🗼", "🗽", "⛪", "🕌", "🛕", "🏟️", "🏕️", "🏖️", "🗻", "🏝️", "🏞️", "🏘️", "🏚️", "🏗️", "🏭", "🏠", "🏡", "⛺", "🚥"] }, { cat: "乗り物・旅行", icons: ["🚗", "🚕", "🚙", "🚌", "🚎", "🏎️", "🚓", "🚑", "🚒", "🚐", "🛻", "🚚", "🚜", "🛴", "🚲", "🛵", "🏍️", "🛺", "🚨", "🚃", "🚄", "🚅", "🚆", "🚇", "🚈", "🚉", "✈️", "🛫", "🛬", "🛳️"] }, { cat: "食事・飲み物", icons: ["🍏", "🍎", "🍐", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🍈", "🍒", "🍑", "🥭", "🍍", "🥥", "🥝", "🍅", "🍆", "🥑", "🥦", "🥬", "🥒", "🌶️", "🌽", "🥕", "🧄", "🧅", "🥔", "🍠", "🥐"] }, { cat: "娯楽・スポーツ", icons: ["🎮", "🎬", "🎵", "🎨", "⚽", "⚾", "🎾", "🏊", "🚴", "🏆", "🎉", "🎂", "🎁", "🎈", "🎫", "🎳", "⛳", "⛸️", "🎣", "🎿", "🏂", "🏋️", "🤸", "⛹️", "🤾", "🎟️", "🎭", "🎪", "🎰", "🧩"] }, { cat: "記号・マーク", icons: ["❤️", "💛", "💚", "💙", "💜", "🖤", "🤍", "💯", "💢", "💬", "💭", "💤", "🎶", "💲", "🔴", "🟠", "🟡", "🟢", "🔵", "🟣", "⚫", "⚪", "🟤", "🟥", "🟧", "🟨", "🟩", "🟦", "🟪"] }];
function loadDict() { const saved = localStorage.getItem('jero_adv_dict'); if (saved) { try { advancedDict = JSON.parse(saved); } catch (e) { advancedDict = JSON.parse(JSON.stringify(DEFAULT_ADV_DICT)); } } else { advancedDict = JSON.parse(JSON.stringify(DEFAULT_ADV_DICT)); } renderDictUI(); }
function saveDict() { localStorage.setItem('jero_adv_dict', JSON.stringify(advancedDict)); renderDictUI(); triggerFullReRender(); }
function renderDictUI() { const container = document.getElementById('dict-list'); if (!container) return; container.innerHTML = ''; if (advancedDict.length === 0) { container.innerHTML = '<div style="color:#888; font-size:12px;">辞書は空だ。</div>'; return; } advancedDict.forEach((item, idx) => { const primary = item.keys[0] || "(接頭辞なし)"; const el = document.createElement('div'); el.className = 'dict-item'; el.innerHTML = `<div class="dict-info"><div>${item.icon} <span style="font-weight:bold;">${primary}</span></div><div><span class="dict-badge" style="background:${item.bg}; color:${item.txt};">Sample</span></div></div><div style="display:flex; flex-direction:column; gap:4px;"><button class="dict-btn-edit" onclick="openDictEditor(${idx})">編集</button><button class="dict-btn-del" onclick="removeDictItem(${idx})">削除</button></div>`; container.appendChild(el); }); }
function openDictEditor(idx = -1) { document.getElementById('dict-editor-modal').classList.add('active'); if (idx >= 0) { const item = advancedDict[idx]; document.getElementById('dict-edit-idx').value = idx; document.getElementById('dict-edit-prefix').value = item.keys[0] || ''; document.getElementById('dict-edit-aliases').value = item.keys.slice(1).join(', '); document.getElementById('dict-edit-icon').innerText = item.icon || '➕ 選択'; document.getElementById('dict-edit-bg').value = item.bg; document.getElementById('dict-edit-txt').value = item.txt; document.getElementById('dict-editor-title').innerText = '辞書編集'; } else { document.getElementById('dict-edit-idx').value = -1; document.getElementById('dict-edit-prefix').value = ''; document.getElementById('dict-edit-aliases').value = ''; document.getElementById('dict-edit-icon').innerText = '➕ 選択'; document.getElementById('dict-edit-bg').value = '#0a84ff'; document.getElementById('dict-edit-txt').value = '#ffffff'; document.getElementById('dict-editor-title').innerText = '新規追加'; } }
function closeDictEditor() { document.getElementById('dict-editor-modal').classList.remove('active'); }
function saveDictItem() { const idx = parseInt(document.getElementById('dict-edit-idx').value); const prefix = document.getElementById('dict-edit-prefix').value.trim(); const aliasesRaw = document.getElementById('dict-edit-aliases').value; const iconRaw = document.getElementById('dict-edit-icon').innerText; const icon = iconRaw === '➕ 選択' ? '' : iconRaw.trim(); const bg = document.getElementById('dict-edit-bg').value; const txt = document.getElementById('dict-edit-txt').value; if (!prefix || !icon) { showToast('接頭辞とアイコンは必須だ。'); return; } let keys = [prefix]; if (aliasesRaw) { const aliases = aliasesRaw.split(',').map(k => k.trim()).filter(k => k); keys = keys.concat(aliases); } const newItem = { keys, icon, bg, txt }; if (idx >= 0) advancedDict[idx] = newItem; else advancedDict.push(newItem); saveDict(); closeDictEditor(); }
function removeDictItem(idx) { advancedDict.splice(idx, 1); saveDict(); }
function openEmojiPicker() { document.getElementById('emoji-picker-modal').classList.add('active'); const container = document.getElementById('emoji-list-container'); if (container.innerHTML !== '') return; let html = ''; EMOJI_LIST.forEach(group => { html += `<div style="font-size:12px; font-weight:bold; color:#888; margin-top:10px; margin-bottom:5px;">${group.cat}</div><div style="display:flex; flex-wrap:wrap; gap:8px;">`; group.icons.forEach(icon => { html += `<div style="font-size:26px; padding:10px; background:var(--head-bg); border:1px solid var(--border); border-radius:8px; cursor:pointer;" onclick="selectEmoji('${icon}')">${icon}</div>`; }); html += `</div>`; }); html += `<div style="margin-top:20px; text-align:center;"><button class="btn-gray" style="padding:10px 20px; border-radius:20px; border:none; color:white; font-weight:bold; cursor:pointer;" onclick="document.getElementById('dict-edit-icon').innerText = '➕ 選択'; closeEmojiPicker(); showToast('一覧にない場合は、OSの絵文字キーボードを使って手入力してくれ。');">その他の絵文字を使う</button></div>`; container.innerHTML = html; }
function closeEmojiPicker() { document.getElementById('emoji-picker-modal').classList.remove('active'); }
function selectEmoji(icon) { document.getElementById('dict-edit-icon').innerText = icon; closeEmojiPicker(); }

function processSemanticText(text) { if (!text) return { text: "", style: null }; let resText = text; let matchStyle = null; for (const item of advancedDict) { let matched = false; for (const key of item.keys) { if (resText.includes(key)) { resText = resText.split(key).join(item.icon); matched = true; } } if (matched && !matchStyle) { matchStyle = { bg: item.bg, txt: item.txt }; } } return { text: resText, style: matchStyle }; }
function extractTaskData(notes) { if (!notes) return { colorId: "", recurrence: "", cleanNotes: "" }; let colorId = "", recurrence = "", cleanNotes = notes; const cMatch = cleanNotes.match(/\[c:(\d+)\]/); if (cMatch) { colorId = cMatch[1]; cleanNotes = cleanNotes.replace(/\[c:\d+\]/, ''); } const rMatch = cleanNotes.match(/\[r:([A-Z]+)\]/); if (rMatch) { recurrence = rMatch[1]; cleanNotes = cleanNotes.replace(/\[r:[A-Z]+\]/, ''); } return { colorId, recurrence, cleanNotes: cleanNotes.trim() }; }

// ==========================================
// 6. カレンダーコアロジック
// ==========================================
function initColorPicker() { const picker = document.getElementById('color-picker'); if (!picker) return; picker.innerHTML = `<div class="color-opt selected" style="background:var(--accent)" onclick="selectColor(this, '')"></div>`; Object.keys(GOOGLE_COLORS).forEach(id => { picker.innerHTML += `<div class="color-opt" style="background:${GOOGLE_COLORS[id]}" onclick="selectColor(this, '${id}')"></div>`; }); }
function selectColor(el, id) { document.querySelectorAll('#color-picker .color-opt').forEach(c => c.classList.remove('selected')); if (el) { el.classList.add('selected'); } else { document.querySelectorAll('#color-picker .color-opt').forEach(c => { if ((id === '' && c.style.background === 'var(--accent)') || c.getAttribute('onclick').includes(`'${id}'`)) c.classList.add('selected'); }); } selectedColorId = id; }
function initTaskColorPicker() { const picker = document.getElementById('task-color-picker'); if (!picker) return; picker.innerHTML = `<div class="color-opt selected" style="background:#34c759" onclick="selectTaskColor(this, '')"></div>`; Object.keys(GOOGLE_COLORS).forEach(id => { picker.innerHTML += `<div class="color-opt" style="background:${GOOGLE_COLORS[id]}" onclick="selectTaskColor(this, '${id}')"></div>`; }); }
function selectTaskColor(el, id) { document.querySelectorAll('#task-color-picker .color-opt').forEach(c => c.classList.remove('selected')); if (el) { el.classList.add('selected'); } else { document.querySelectorAll('#task-color-picker .color-opt').forEach(c => { if ((id === '' && c.style.background === 'rgb(52, 199, 89)') || c.getAttribute('onclick').includes(`'${id}'`)) c.classList.add('selected'); }); } selectedTaskColorId = id; }

function setupObserver() { const options = { rootMargin: '300px', threshold: 0.1 }; observer = new IntersectionObserver((entries) => { entries.forEach(e => { if (e.isIntersecting && !isFetching && !isAuthError) { if (e.target.id === 'bottom-trigger') { loadNextMonth(); } if (e.target.id === 'top-trigger') { loadPrevMonth(); } } }); }, options);['bottom-trigger', 'top-trigger'].forEach(id => { const el = document.getElementById(id); if (el) observer.observe(el); }); }
document.getElementById('scroll-container').addEventListener('scroll', updateHeaderDisplay);
function updateHeaderDisplay() { if (isAuthError) return; const wrappers = document.querySelectorAll('.month-wrapper'); wrappers.forEach(w => { const rect = w.getBoundingClientRect(); if (rect.top < window.innerHeight / 2 && rect.bottom > window.innerHeight / 2) { document.getElementById('month-display').innerText = w.querySelector('.month-title').innerText; } }); }
function scrollToToday() { const today = new Date(); const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`; const target = document.getElementById(`cell-${dateStr}`); if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' }); }

function triggerFullReRender() { document.getElementById('calendar-wrapper').innerHTML = ''; renderedMonths = []; const today = new Date(); const y = today.getFullYear(); const m = today.getMonth(); renderMonthDOM(y, m, dataCache[`${y}-${m}`], 'append'); renderedMonths.push({ year: y, month: m }); renderMonthDOM(y, m + 1, dataCache[`${y}-${m + 1}`], 'append'); renderedMonths.push({ year: y, month: m + 1 }); }

function isEventSpanning(eventObj, dateStr) {
    if (!eventObj || !eventObj.start || !eventObj.end) return 'single'; 
    let stDateStr, edDateStr;
    if (eventObj.start.date && eventObj.end.date) {
        stDateStr = eventObj.start.date;
        const edDate = new Date(eventObj.end.date);
        edDate.setDate(edDate.getDate() - 1); 
        edDateStr = `${edDate.getFullYear()}-${String(edDate.getMonth() + 1).padStart(2, '0')}-${String(edDate.getDate()).padStart(2, '0')}`;
    } else if (eventObj.start.dateTime && eventObj.end.dateTime) {
        const stD = new Date(eventObj.start.dateTime);
        stDateStr = `${stD.getFullYear()}-${String(stD.getMonth() + 1).padStart(2, '0')}-${String(stD.getDate()).padStart(2, '0')}`;
        
        const edD = new Date(eventObj.end.dateTime);
        // ★深夜0時終了の予定を「前日終了」として正しく補正する
        if (edD.getHours() === 0 && edD.getMinutes() === 0) {
            edD.setDate(edD.getDate() - 1);
        }
        edDateStr = `${edD.getFullYear()}-${String(edD.getMonth() + 1).padStart(2, '0')}-${String(edD.getDate()).padStart(2, '0')}`;
    } else { return 'single'; }

    if (stDateStr === edDateStr) return 'single';
    if (dateStr === stDateStr) return 'span-start';
    if (dateStr === edDateStr) return 'span-end';
    if (dateStr > stDateStr && dateStr < edDateStr) return 'span-mid';
    return 'single';
}
function getCardHtml(type, item) {
    const isEvent = type === 'event';
    const colorId = isEvent ? item.colorId : extractTaskData(item.notes).colorId;
    const color = isEvent ? (colorId ? GOOGLE_COLORS[colorId] : 'var(--accent)') : (colorId ? GOOGLE_COLORS[colorId] : '#34c759');

    // ★視覚化ロジック（編集状態を追加）
    const isPendingInsert = item._localId ? true : false;
    const isPendingUpdate = item._pendingUpdate ? true : false;
    const isPendingDelete = item._pendingDelete ? true : false;

    let stateIcon = '';
    if (isPendingInsert) stateIcon = ' ➕🔄(追加予定)';
    if (isPendingUpdate) stateIcon = ' 📝🔄(編集予定)';
    if (isPendingDelete) stateIcon = ' 🗑️(削除予定)';

    const title = (isEvent ? (item.summary || '(無名予定)') : (item.title || '(無名タスク)')) + stateIcon;

    const safeData = encodeURIComponent(JSON.stringify(item));
    const clickFn = isEvent ? `openEditor(JSON.parse(decodeURIComponent('${safeData}')))` : `openTaskEditor(JSON.parse(decodeURIComponent('${safeData}')))`;

    let timeHtml = "";
    if (isEvent) {
        if (item.start && item.start.dateTime) {
            const d = new Date(item.start.dateTime);
            const timeStr = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
            let endTimeStr = "";
            if (item.end && item.end.dateTime) {
                const ed = new Date(item.end.dateTime);
                endTimeStr = `${ed.getHours()}:${String(ed.getMinutes()).padStart(2, '0')}`;
            }
            const fullTimeStr = endTimeStr ? `${timeStr} 〜 ${endTimeStr}` : timeStr;
            timeHtml = `<span class="time-text" onclick="event.stopPropagation(); showTimePopup(this, '${fullTimeStr}', '${color}')">${timeStr}</span>`;
        }
    } else {
        const checkIcon = item.status === 'completed' ? '✅' : '⬜️';
        timeHtml = `<span style="font-size:16px; margin-right:4px; cursor:pointer;" onclick="event.stopPropagation(); toggleTaskCompletion('${item.id}', '${item.status === 'completed' ? 'needsAction' : 'completed'}')">${checkIcon}</span>`;
    }

    let titleStyle = (!isEvent && item.status === 'completed') ? 'text-decoration: line-through; opacity: 0.6;' : '';
    let cardStyle = '';

    // オフライン状態での視覚スタイル適用
    if (isPendingInsert) {
        cardStyle = 'border: 2px dashed #0a84ff; opacity: 0.9;';
    }
    if (isPendingUpdate) {
        cardStyle = 'border: 2px dotted #ff9500; opacity: 0.9;'; // 編集予定はオレンジ
    }
    if (isPendingDelete) {
        titleStyle = 'text-decoration: line-through;';
        cardStyle = 'opacity: 0.3; filter: grayscale(100%); pointer-events: none;'; // クリック不可
    }

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
    selectedDateStr = dateStr; const days = ['日', '月', '火', '水', '木', '金', '土']; const [y, m, d] = dateStr.split('-');
    document.querySelectorAll('.day').forEach(el => el.classList.remove('selected'));
    const selectedCell = document.getElementById(`cell-${dateStr}`);
    if (selectedCell) selectedCell.classList.add('selected');
    document.getElementById('bottom-detail-date').innerHTML = `<span style="font-size:24px; font-weight:300;">${parseInt(d)}</span> <span style="font-size:12px; color:#888;">${days[dow]}</span>`;
    const list = document.getElementById('bottom-detail-list'); list.innerHTML = '';
    const monthKey = `${y}-${parseInt(m) - 1}`; const data = dataCache[monthKey]; let hasItems = false;
    let modalItems = [];
    if (data) {
        if (data.events) { const events = data.events.filter(e => { if (!e.start) return false; const td = e.start.date || e.start.dateTime; return (td && td.includes(dateStr)) || (isEventSpanning(e, dateStr) !== 'single'); }); events.forEach(e => modalItems.push({ type: 'event', data: e })); }
        if (data.tasks) { const tasks = data.tasks.filter(t => t.due && t.due.includes(dateStr)); tasks.forEach(t => modalItems.push({ type: 'task', data: t })); }
    }
    modalItems.sort((a, b) => { const aIsCompleted = a.type === 'task' && a.data.status === 'completed' ? 1 : 0; const bIsCompleted = b.type === 'task' && b.data.status === 'completed' ? 1 : 0; return aIsCompleted - bIsCompleted; });

    if (modalItems.length > 0) { hasItems = true; modalItems.forEach(item => { list.innerHTML += getCardHtml(item.type, item.data); }); }
    if (!hasItems) list.innerHTML = `<div style="text-align:center; color:#888; padding: 30px; font-weight: 500;">予定はありません</div>`;
}

function renderMonthDOM(year, month, data, position) {
    if (!data) return; const wrapper = document.createElement('div'); wrapper.className = 'month-wrapper'; wrapper.id = `month-${year}-${month}`; wrapper.innerHTML = `<div class="month-title">${year}年 ${month + 1}月</div><div class="calendar-grid"></div>`; const grid = wrapper.querySelector('.calendar-grid');
    const daysInMonth = new Date(year, month + 1, 0).getDate(); const firstDay = new Date(year, month, 1).getDay(); for (let i = 0; i < firstDay; i++) { const empty = document.createElement('div'); empty.className = 'day empty'; empty.style.backgroundColor = 'var(--head-bg)'; grid.appendChild(empty); }

    const getEventDuration = (e) => {
        if (!e || !e.start || !e.end) return 0;
        if (e.start.date && e.end.date) { return new Date(e.end.date).getTime() - new Date(e.start.date).getTime(); }
        if (e.start.dateTime && e.end.dateTime) { return new Date(e.end.dateTime).getTime() - new Date(e.start.dateTime).getTime(); }
        return 0;
    };
    const sortedEvents = [...data.events].sort((a, b) => {
        const durA = getEventDuration(a); const durB = getEventDuration(b);
        if (durA !== durB) return durB - durA; 
        const aAllDay = a.start && a.start.date ? 1 : 0; const bAllDay = b.start && b.start.date ? 1 : 0;
        if (aAllDay !== bAllDay) return bAllDay - aAllDay; 
        const tA = a.start && (a.start.dateTime || a.start.date) ? new Date(a.start.dateTime || a.start.date).getTime() : 0;
        const tB = b.start && (b.start.dateTime || b.start.date) ? new Date(b.start.dateTime || b.start.date).getTime() : 0;
        if (tA !== tB) return tA - tB; 
        return (a.id || "").localeCompare(b.id || ""); 
    });
    const today = new Date();

    const slotMap = {};
    for (let i = 1; i <= daysInMonth; i++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        slotMap[dateStr] = [];
    }

    sortedEvents.forEach(e => {
        if (!e.start) return;
        const occupiedDates = [];
        for (let i = 1; i <= daysInMonth; i++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            let isTargetDay = false;
            if (e.start.date) { isTargetDay = e.start.date === dateStr; } 
            else if (e.start.dateTime) {
                const stD = new Date(e.start.dateTime);
                const stStr = `${stD.getFullYear()}-${String(stD.getMonth() + 1).padStart(2, '0')}-${String(stD.getDate()).padStart(2, '0')}`;
                isTargetDay = stStr === dateStr;
            }
            if (isTargetDay || isEventSpanning(e, dateStr) !== 'single') {
                occupiedDates.push(dateStr);
            }
        }
        if (occupiedDates.length === 0) return;

        let slotIndex = 0;
        while (true) {
            let isFree = true;
            for (const d of occupiedDates) {
                if (slotMap[d][slotIndex]) { isFree = false; break; } 
            }
            if (isFree) break; 
            slotIndex++;
        }
        for (const d of occupiedDates) {
            while (slotMap[d].length <= slotIndex) slotMap[d].push(null);
            slotMap[d][slotIndex] = e;
        }
    });

    for (let i = 1; i <= daysInMonth; i++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`; const dayEl = document.createElement('div'); let className = 'day'; const dow = new Date(year, month, i).getDay();
        if (dow === 0) dayEl.style.backgroundColor = 'var(--sun)'; if (dow === 6) dayEl.style.backgroundColor = 'var(--sat)'; if (year === today.getFullYear() && month === today.getMonth() && i === today.getDate()) className += ' today';
        dayEl.className = className; dayEl.id = `cell-${dateStr}`; dayEl.setAttribute('onclick', `openDailyModal('${dateStr}', ${dow})`); dayEl.innerHTML = `<div class="day-num">${i}</div>`;

        const slots = slotMap[dateStr] || [];
        slots.forEach(e => {
            if (!e) {
                const spacer = document.createElement('div');
                spacer.className = 'event'; 
                spacer.style.visibility = 'hidden'; 
                spacer.innerHTML = '&nbsp;';
                spacer.style.height = '14px';
                spacer.style.minHeight = '14px';
                spacer.style.flexShrink = '0';
                spacer.style.margin = '1px 0';
                spacer.style.padding = '0';
                spacer.style.border = '1px solid transparent';
                spacer.style.boxSizing = 'border-box';
                dayEl.appendChild(spacer);
                return;
            }

            const div = document.createElement('div'); div.className = 'event';
            let timeStr = ""; if (e.start.dateTime) { const d = new Date(e.start.dateTime); timeStr = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; }
            const spanType = isEventSpanning(e, dateStr);

            const isPendingInsert = e._localId ? true : false;
            const isPendingUpdate = e._pendingUpdate ? true : false;
            const isPendingDelete = e._pendingDelete ? true : false;

            let stateIcon = '';
            if (isPendingInsert) stateIcon = '➕🔄 ';
            if (isPendingUpdate) stateIcon = '📝🔄 ';
            if (isPendingDelete) stateIcon = '🗑️ ';

            const recurIcon = e.recurrence ? '🔁 ' : '';
            const pData = processSemanticText(e.summary);

            div.innerText = stateIcon + recurIcon + pData.text + (timeStr ? ` (${timeStr})` : '');

            let bgColor = 'var(--accent)'; let txtColor = '#ffffff';
            if (pData.style) { bgColor = pData.style.bg; txtColor = pData.style.txt; }
            else if (e.colorId && GOOGLE_COLORS[e.colorId]) {
                bgColor = GOOGLE_COLORS[e.colorId];
                txtColor = getContrastYIQ(bgColor);
            }

            // ★ベーススタイル（絶対固定）
            div.style.overflow = 'hidden';
            div.style.whiteSpace = 'nowrap';
            div.style.position = 'relative'; 
            div.style.zIndex = '1';
            div.style.boxSizing = 'border-box';
            div.style.fontSize = '10px';
            div.style.fontWeight = '700';

            if (spanType !== 'single') {
                // ★連続予定：絶対アンダーラインスタイル
                div.classList.add('continuous');
                div.classList.add(spanType);
                div.style.background = 'transparent'; // 旧コードの残骸を強制上書き
                div.style.color = bgColor; 
                
                div.style.borderTop = 'none';
                div.style.borderBottom = `3px solid ${bgColor}`;
                
                div.style.height = '14px';
                div.style.lineHeight = '11px';
                div.style.margin = '1px 0';
                div.style.padding = '0 2px';
                div.style.boxShadow = 'none'; 

                if (spanType === 'span-start') {
                    div.style.borderLeft = 'none';
                    div.style.borderRadius = '0'; 
                    div.style.marginRight = '-6px'; 
                    div.style.paddingRight = '6px'; 
                } else if (spanType === 'span-mid') {
                    div.style.borderRadius = '0';
                    div.style.borderLeft = 'none';
                    div.style.borderRight = 'none';
                    div.style.marginLeft = '-6px';  
                    div.style.marginRight = '-6px'; 
                    div.style.color = 'transparent'; 
                } else if (spanType === 'span-end') {
                    div.style.borderRight = 'none';
                    div.style.borderRadius = '0';
                    div.style.marginLeft = '-6px';  
                    div.style.paddingLeft = '6px';
                    div.style.color = 'transparent'; 
                }
            } else {
                // ★単発予定
                div.classList.add('single');
                div.style.background = bgColor;
                div.style.color = txtColor;
                div.style.borderRadius = '3px';
                div.style.height = '14px';
                div.style.lineHeight = '14px';
                div.style.margin = '1px 2px';
                div.style.padding = '0 3px';
            }

            if (isPendingInsert || isPendingUpdate) {
                div.style.border = `1px dashed ${txtColor}`;
                div.style.opacity = '0.8';
            }
            if (isPendingDelete) {
                div.style.textDecoration = 'line-through';
                div.style.opacity = '0.3';
                div.style.filter = 'grayscale(100%)';
            }
            
            dayEl.appendChild(div);
        });

        if (data.tasks) data.tasks.filter(t => t.due && t.due.includes(dateStr)).forEach(t => {
            const div = document.createElement('div'); div.className = `task ${t.status === 'completed' ? 'completed' : ''}`;
            const tData = extractTaskData(t.notes); const pData = processSemanticText(t.title); const recurIcon = tData.recurrence ? '🔁 ' : '';

            const isPendingInsert = t._localId ? true : false;
            const isPendingDelete = t._pendingDelete ? true : false;
            const insertIcon = isPendingInsert ? '➕🔄 ' : '';
            const deleteIcon = isPendingDelete ? '🗑️ ' : '';

            div.innerHTML = `<span style="opacity:0.8;">☑</span> ${deleteIcon}${insertIcon}${recurIcon}${pData.text}`;

            if (pData.style) { div.style.background = pData.style.bg; div.style.color = pData.style.txt; }
            else if (tData.colorId && GOOGLE_COLORS[tData.colorId]) { div.style.background = GOOGLE_COLORS[tData.colorId]; div.style.color = getContrastYIQ(GOOGLE_COLORS[tData.colorId]); }

            div.style.height = '14px';
            div.style.lineHeight = '14px';
            div.style.margin = '1px 2px';
            div.style.padding = '0 3px';
            div.style.borderRadius = '3px';
            div.style.fontSize = '10px';
            div.style.boxSizing = 'border-box';

            if (isPendingInsert) {
                div.style.border = `1px dashed var(--txt)`;
                div.style.opacity = '0.8';
            }
            if (isPendingDelete) {
                div.style.textDecoration = 'line-through';
                div.style.opacity = '0.4';
                div.style.filter = 'grayscale(100%)';
            }
            dayEl.appendChild(div);
        });
        grid.appendChild(dayEl);
    }
    const container = document.getElementById('calendar-wrapper');
    if (position === 'append') container.appendChild(wrapper);
    else if (position === 'prepend') container.insertBefore(wrapper, container.firstChild);
    else if (position === 'replace') { const children = Array.from(container.children); const insertIndex = children.findIndex(c => { const [_, y, m] = c.id.split('-'); return parseInt(y) > year || (parseInt(y) === year && parseInt(m) > month); }); if (insertIndex === -1) container.appendChild(wrapper); else container.insertBefore(wrapper, children[insertIndex]); }
}

// ★限界突破：二重起動を防止しつつ、安全にカレンダーを展開する
async function initCalendar() {
    if (isCalendarInited) return;
    isCalendarInited = true;
    setProgress(10);
    try {
        await loadDataCacheFromIDB();
        await rehydrateSyncQueue(); // ★ここに追加：控え室の幽霊データを画面に呼び戻す
        const today = new Date(); const y = today.getFullYear(); const m = today.getMonth();
        await fetchAndRenderMonth(y, m, 'append', false);
        await fetchAndRenderMonth(y, m + 1, 'append', false);
        scrollToToday();
        if (navigator.onLine && !isAuthError) {
            fetchAndRenderMonth(y, m, 'replace', true);
            fetchAndRenderMonth(y, m + 1, 'replace', true);
        }
        await updateSyncBadge();
    } finally {
        setProgress(100);
    }
}

async function loadNextMonth() { if (renderedMonths.length === 0 || isFetching || isAuthError) return; isFetching = true; document.getElementById('bottom-trigger').classList.remove('hidden'); try { const last = renderedMonths[renderedMonths.length - 1]; let nextY = last.year; let nextM = last.month + 1; if (nextM > 11) { nextM = 0; nextY++; } await fetchAndRenderMonth(nextY, nextM, 'append'); } finally { isFetching = false; document.getElementById('bottom-trigger').classList.add('hidden'); } }
async function loadPrevMonth() { if (renderedMonths.length === 0 || isFetching || isAuthError) return; isFetching = true; document.getElementById('top-trigger').classList.remove('hidden'); try { const container = document.getElementById('scroll-container'); const oldHeight = container.scrollHeight; const first = renderedMonths[0]; let prevY = first.year; let prevM = first.month - 1; if (prevM < 0) { prevM = 11; prevY--; } await fetchAndRenderMonth(prevY, prevM, 'prepend'); container.scrollTop += (container.scrollHeight - oldHeight); } finally { isFetching = false; document.getElementById('top-trigger').classList.add('hidden'); } }
function notifyAuthError() { isAuthError = true; localStorage.removeItem('jero_token'); localStorage.removeItem('jero_token_time'); document.getElementById('auth-btn').style.display = 'block'; document.getElementById('auth-btn').classList.add('auth-pulse'); const monthDisp = document.getElementById('month-display'); monthDisp.innerText = '⚠️右上の🔑をタップ'; monthDisp.style.color = '#ff3b30'; }

async function fetchAndRenderMonth(year, month, position = 'append', forceFetch = false) {
    const monthKey = `${year}-${month}`; 
    let needsRender = false;
    
    if (forceFetch || !dataCache[monthKey]) {
        if (!navigator.onLine) { if (!dataCache[monthKey]) showToast('オフラインのためデータが取得できません。'); return; }
        let events = [], tasks = [];
        
        try {
            // ★GASのdoGetに対してfetchを実行
            const url = `${getGasUrl()}?year=${year}&month=${month}`;
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.success) {
                events = data.events || [];
                tasks = data.tasks || [];
            } else {
                throw new Error(data.error || '不明なサーバーエラー');
            }
        } catch (e) { 
            console.error("GASデータ取得エラー:", e);
            showToast('通信エラーが発生した。');
            return;
        }
        
        dataCache[monthKey] = { events, tasks }; 
        saveDataCacheToIDB(monthKey, { events, tasks }); 
        needsRender = true;
    } else { if (!document.getElementById(`month-${year}-${month}`)) needsRender = true; }
    if (needsRender) { const existing = document.getElementById(`month-${year}-${month}`); if (existing) existing.remove(); renderMonthDOM(year, month, dataCache[monthKey], position); if (!existing) { if (position === 'append') renderedMonths.push({ year, month }); else if (position === 'prepend') renderedMonths.unshift({ year, month }); } updateHeaderDisplay(); }
}

// ==========================================
// 7. エディタ UI
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
    let st = new Date(); let ed = new Date(st.getTime() + 60 * 60 * 1000);
    if (selectedDateStr && !e) { st = new Date(selectedDateStr + 'T12:00'); ed = new Date(selectedDateStr + 'T13:00'); }
    if (e && e.start) {
        st = new Date(e.start.dateTime || e.start.date);
        ed = new Date(e.end.dateTime || e.end.date);
        if (isAllDay) ed.setDate(ed.getDate() - 1);
    }
    startInput.type = isAllDay ? 'date' : 'datetime-local';
    endInput.type = isAllDay ? 'date' : 'datetime-local';
    if (isAllDay) {
        startInput.value = `${st.getFullYear()}-${String(st.getMonth() + 1).padStart(2, '0')}-${String(st.getDate()).padStart(2, '0')}`;
        endInput.value = `${ed.getFullYear()}-${String(ed.getMonth() + 1).padStart(2, '0')}-${String(ed.getDate()).padStart(2, '0')}`;
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
    if (convertBtn) convertBtn.style.display = e ? 'block' : 'none';
    renderIconPalette('event-icon-palette', 'edit-title');
}

function closeEditor() { 
    document.getElementById('editor-modal').classList.remove('active'); 
    if (!document.getElementById('daily-modal').classList.contains('active')) { document.getElementById('overlay').classList.remove('active'); } 
    const prev = document.getElementById('edit-attach-preview');
    if(prev) prev.innerHTML = ''; // 閉じる時にプレビューを消去
}

// ★死角の修復：リンクと画像の添付処理（欠損していた関数の復元）
function addUrlPrompt() {
    const url = prompt("追加するリンク(URL)を入力してくれ:");
    if (url) {
        const desc = document.getElementById('edit-desc');
        desc.value = desc.value + (desc.value ? '\n' : '') + url;
    }
}

function addTaskUrlPrompt() {
    const url = prompt("追加するリンク(URL)を入力してくれ:");
    if (url) {
        const desc = document.getElementById('task-edit-notes');
        desc.value = desc.value + (desc.value ? '\n' : '') + url;
    }
}

function handleImageUpload(event, previewId) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const imgData = e.target.result;
        const previewContainer = document.getElementById(previewId);
        const imgDiv = document.createElement('div');
        imgDiv.className = 'preview-item';
        imgDiv.innerHTML = `<img src="${imgData}"><div class="preview-del" onclick="this.parentElement.remove()">✕</div>`;
        previewContainer.appendChild(imgDiv);
        
        // Google Calendarへの画像送信はDrive連携が必須なため、まずはメモ欄に記録を残す仕様
        const descId = previewId === 'edit-attach-preview' ? 'edit-desc' : 'task-edit-notes';
        const descEl = document.getElementById(descId);
        if (!descEl.value.includes('[写真添付あり]')) {
            descEl.value = descEl.value + (descEl.value ? '\n' : '') + '[写真添付あり]';
        }
        showToast('✅ 写真をプレビューにセットした。');
    };
    reader.readAsDataURL(file);
    event.target.value = ''; 
}

function toggleTimeInputs() {
    const isAllDay = document.getElementById('edit-allday').checked;
    const startInput = document.getElementById('edit-start'); const endInput = document.getElementById('edit-end');
    let startVal = startInput.value; let endVal = endInput.value;
    startInput.type = isAllDay ? 'date' : 'datetime-local'; endInput.type = isAllDay ? 'date' : 'datetime-local';
    if (startVal) startInput.value = isAllDay ? startVal.split('T')[0] : (startVal.includes('T') ? startVal : startVal + 'T12:00');
    if (endVal) endInput.value = isAllDay ? endVal.split('T')[0] : (endVal.includes('T') ? endVal : endVal + 'T13:00');
}

async function saveEvent() {
    const id = document.getElementById('edit-id').value; const title = document.getElementById('edit-title').value.trim();
    if (!title) { showToast('タイトルを入力してくれ'); return; }
    const isAllDay = document.getElementById('edit-allday').checked; let startVal = document.getElementById('edit-start').value; let endVal = document.getElementById('edit-end').value;
    if (!startVal) { showToast('開始日時が不正だ'); return; } if (!endVal) endVal = startVal;

    const action = { type: 'event', method: id ? 'update' : 'insert', id: id, title: title, location: document.getElementById('edit-loc').value, description: document.getElementById('edit-desc').value, colorId: selectedColorId };
    try {
        if (isAllDay) {
            action.start = startVal;
            let parts = endVal.split('-');
            const ed = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
            ed.setDate(ed.getDate() + 1);
            action.end = `${ed.getFullYear()}-${String(ed.getMonth() + 1).padStart(2, '0')}-${String(ed.getDate()).padStart(2, '0')}`;
        }
        else { action.start = startVal + ':00+09:00'; action.end = endVal + ':00+09:00'; }
    } catch (err) { showToast('日時の処理でエラーが起きた。もう一度頼む。'); return; }
    closeEditor(); closeAllModals(); await dispatchManualAction(action);
}

async function confirmDeleteEvent() { const id = document.getElementById('edit-id').value; if (!id || !confirm('この予定を完全に消し去るか？')) return; const action = { type: 'event', method: 'delete', id: id }; closeEditor(); closeAllModals(); await dispatchManualAction(action); }

function duplicateEvent() { document.getElementById('edit-id').value = ''; document.getElementById('editor-title').innerText = '新規予定 (複製)'; document.getElementById('btn-delete').style.display = 'none'; document.getElementById('btn-duplicate').style.display = 'none'; const convertBtn = document.getElementById('btn-convert-task'); if (convertBtn) convertBtn.style.display = 'none'; showToast('複製モードだ。日時を変えて保存を押せ。'); }

function openTaskEditor(t = null) {
    document.getElementById('overlay').classList.add('active'); document.getElementById('task-editor-modal').classList.add('active');
    document.getElementById('task-edit-id').value = t ? t.id : ''; document.getElementById('task-edit-title').value = t ? t.title || '' : '';
    let cleanNotes = "";
    if (t && t.notes) { const extracted = extractTaskData(t.notes); cleanNotes = extracted.cleanNotes; selectTaskColor(null, extracted.colorId); } else { selectTaskColor(null, ''); }
    document.getElementById('task-edit-notes').value = cleanNotes;
    const dueInput = document.getElementById('task-edit-due');
    if (t && t.due) { 
        const d = new Date(t.due); 
        dueInput.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; 
    } else { 
        const d = new Date(); 
        dueInput.value = selectedDateStr || `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; 
    }
    document.getElementById('task-editor-title').innerText = t ? 'タスクの編集' : '新規タスク'; document.getElementById('task-btn-delete').style.display = t ? 'block' : 'none';
    const convertBtn = document.getElementById('btn-convert-event'); if (convertBtn) convertBtn.style.display = t ? 'block' : 'none';
    renderIconPalette('task-icon-palette', 'task-edit-title');
}

function closeTaskEditor() { 
    document.getElementById('task-editor-modal').classList.remove('active'); 
    if (!document.getElementById('daily-modal').classList.contains('active')) { document.getElementById('overlay').classList.remove('active'); } 
    const prev = document.getElementById('task-attach-preview');
    if(prev) prev.innerHTML = ''; // 閉じる時にプレビューを消去
}

async function toggleTaskCompletion(taskId, newStatus) {
    let targetTask = null;
    for (const key in dataCache) { if (dataCache[key].tasks) { targetTask = dataCache[key].tasks.find(t => t.id === taskId); if (targetTask) break; } }
    if (!targetTask) return;

    if (targetTask._localId) { showToast('🔄 未同期タスクの完了はできない。'); return; }

    targetTask.status = newStatus;
    const td = targetTask.due ? new Date(targetTask.due) : new Date();

    await fetchAndRenderMonth(td.getFullYear(), td.getMonth(), 'replace', false);
    if (selectedDateStr) { const dow = new Date(selectedDateStr).getDay(); openDailyModal(selectedDateStr, dow); }

    const payload = { type: 'task', method: 'update', id: taskId, status: newStatus };
    try {
        if (navigator.onLine) {
            // ★GASのdoPostに対してfetchを実行 (Content-Typeは指定せずtext/plain扱いで送るのがCORS回避の秘訣だ)
            await fetch(getGasUrl(), { method: 'POST', body: JSON.stringify(payload) });
        } else {
            showToast('圏外ではタスクの完了操作はできない。');
            targetTask.status = newStatus === 'completed' ? 'needsAction' : 'completed';
            await fetchAndRenderMonth(td.getFullYear(), td.getMonth(), 'replace', false);
        }
    } catch (e) { console.error('同期エラー:', e.message); }
}

async function saveTask() {
    const id = document.getElementById('task-edit-id').value; const title = document.getElementById('task-edit-title').value.trim();
    if (!title) { showToast('タスク名を入力してくれ'); return; }
    let rawNotes = document.getElementById('task-edit-notes').value.trim(); if (selectedTaskColorId) { rawNotes += (rawNotes ? '\n' : '') + `[c:${selectedTaskColorId}]`; }
    const action = { type: 'task', method: id ? 'update' : 'insert', id: id, title: title, description: rawNotes };
    const dueVal = document.getElementById('task-edit-due').value; if (dueVal) { action.due = dueVal + 'T00:00:00+09:00'; }
    closeTaskEditor(); closeAllModals(); await dispatchManualAction(action);
}

async function confirmDeleteTask() { const id = document.getElementById('task-edit-id').value; if (!id || !confirm('このタスクを完全に消し去るか？')) return; const action = { type: 'task', method: 'delete', id: id }; closeTaskEditor(); closeAllModals(); await dispatchManualAction(action); }

async function executeConversion(fromType) {
    if (!confirm(`この${fromType === 'event' ? '予定をタスク' : 'タスクを予定'}に変換して良いか？\n元のデータは消去されるぞ。`)) return;
    let deleteAction = null; let insertAction = null; let redrawDate = new Date();
    if (fromType === 'event') {
        const id = document.getElementById('edit-id').value; const title = document.getElementById('edit-title').value.trim() || '無名タスク'; const startVal = document.getElementById('edit-start').value; const notes = document.getElementById('edit-desc').value; const colorId = selectedColorId;
        if (id) deleteAction = { type: 'event', method: 'delete', id: id };
        let rawNotes = notes; if (colorId) rawNotes += (rawNotes ? '\n' : '') + `[c:${colorId}]`;
        let dueIso = ''; if (startVal) { let dStr = startVal.includes('T') ? startVal.split('T')[0] : startVal; let parts = dStr.split('-'); redrawDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])); dueIso = dStr + 'T00:00:00.000Z'; } // ★UTC0時に修正
        insertAction = { type: 'task', method: 'insert', title: title, description: rawNotes, due: dueIso };
    } else {
        const id = document.getElementById('task-edit-id').value; const title = document.getElementById('task-edit-title').value.trim() || '無名予定'; const dueVal = document.getElementById('task-edit-due').value; const notesVal = document.getElementById('task-edit-notes').value; const colorId = selectedTaskColorId;
        if (id) deleteAction = { type: 'task', method: 'delete', id: id };
        insertAction = { type: 'event', method: 'insert', title: title, description: notesVal, colorId: colorId };
        if (dueVal) { let parts = dueVal.split('-'); redrawDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])); insertAction.start = dueVal; const ed = new Date(redrawDate); ed.setDate(ed.getDate() + 1); insertAction.end = `${ed.getFullYear()}-${String(ed.getMonth() + 1).padStart(2, '0')}-${String(ed.getDate()).padStart(2, '0')}`; }
        else { 
            const td = new Date(); insertAction.start = `${td.getFullYear()}-${String(td.getMonth() + 1).padStart(2, '0')}-${String(td.getDate()).padStart(2, '0')}`; 
            const tmrw = new Date(); tmrw.setDate(tmrw.getDate() + 1); insertAction.end = `${tmrw.getFullYear()}-${String(tmrw.getMonth() + 1).padStart(2, '0')}-${String(tmrw.getDate()).padStart(2, '0')}`; 
        }
    }
    // UIを即座に閉じる（画面ロックなし）
    closeEditor(); closeTaskEditor(); closeAllModals();
    showToast('🔄 変換をバックグラウンドで処理中...');

    // キャッシュから即座に削除して再描画
    if (typeof dataCache !== 'undefined' && deleteAction) { 
        for (let key in dataCache) { 
            if (deleteAction.type === 'event' && dataCache[key].events) { dataCache[key].events = dataCache[key].events.filter(e => e.id !== deleteAction.id); } 
            if (deleteAction.type === 'task' && dataCache[key].tasks) { dataCache[key].tasks = dataCache[key].tasks.filter(t => t.id !== deleteAction.id); } 
        } 
    }
    await fetchAndRenderMonth(redrawDate.getFullYear(), redrawDate.getMonth(), 'replace', false);

    // 裏で非同期通信
    (async () => {
        try {
            if (navigator.onLine) { 
                if (deleteAction) await executeApiAction(deleteAction); 
                await executeApiAction(insertAction); 
                showToast('✅ 変換を完了した'); 
                await fetchAndRenderMonth(redrawDate.getFullYear(), redrawDate.getMonth(), 'replace', true);
            } else { 
                if (deleteAction) await saveToSyncQueue(deleteAction); 
                await saveToSyncQueue(insertAction); 
                showToast('📦 圏外のためローカルの控え室に保管した。'); 
                await updateSyncBadge();
            }
        } catch (e) { 
            showToast('❌ 変換中に通信エラー発生。控え室を確認しろ。'); 
            if (deleteAction) await saveToSyncQueue(deleteAction); 
            await saveToSyncQueue(insertAction); 
            await updateSyncBadge();
        }
    })();
}

// ==========================================
// 8. アクション司令塔 (完全リアルタイム・オプティミスティックUI)
// ==========================================
async function dispatchManualAction(action) {
    let msgAction = action.method === 'insert' ? '追加' : action.method === 'update' ? '更新' : '削除';
    const msgType = action.type === 'event' ? '予定' : 'タスク';

    // ★絶対防衛線：オブジェクト化、あるいは完全に欠損している幽霊データの日付を安全な文字列に強制修復
    const _td1 = new Date(); let safeToday = `${_td1.getFullYear()}-${String(_td1.getMonth() + 1).padStart(2, '0')}-${String(_td1.getDate()).padStart(2, '0')}`;
    if (!action.start || typeof action.start === 'object') { action.start = (action.start && (action.start.dateTime || action.start.date)) || safeToday; }
    if (!action.end || typeof action.end === 'object') { action.end = (action.end && (action.end.dateTime || action.end.date)) || action.start; }
    if (!action.due || typeof action.due === 'object') { action.due = (action.due && (action.due.dateTime || action.due.date)) || safeToday; }

    let tdStr = action.start || action.due; let td = new Date();
    if (tdStr && typeof tdStr === 'string') { 
        if (tdStr.includes('T')) { td = new Date(tdStr); } 
        else { const p = tdStr.split('-'); td = new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2])); } 
    }
    const year = td.getFullYear(); const month = td.getMonth();
    const monthKey = `${year}-${month}`;

    const tempLocalId = 'temp_' + Date.now() + '_' + Math.floor(Math.random()*1000); 
    updateLocalCacheForOptimisticUI(action, tempLocalId);

    // ★通信を待たず、即座にカレンダーを再描画してユーザーに見せる
    const existingMonth = document.getElementById(`month-${year}-${month}`);
    if (existingMonth) existingMonth.remove();
    if (dataCache[monthKey]) renderMonthDOM(year, month, dataCache[monthKey], 'replace');
    if (typeof selectedDateStr !== 'undefined' && selectedDateStr) openDailyModal(selectedDateStr, new Date(selectedDateStr).getDay());

    // ★通信とエラー処理を非同期の裏側に分離
    (async () => {
        if (!navigator.onLine) {
            const localId = await saveToSyncQueue(action);
            updateLocalCacheForOptimisticUI(action, localId, tempLocalId);
            showToast(`📦 圏外だ。${msgAction}を控え室に退避した。`);
            await updateSyncBadge();
        } else {
            try {
                await executeApiAction(action);
                showToast(`✅ ${msgType}の${msgAction}完了`);

                if (dataCache[monthKey]) {
                    if (action.method === 'delete') {
                        if (action.type === 'event') dataCache[monthKey].events = dataCache[monthKey].events.filter(e => e.id !== action.id);
                        if (action.type === 'task') dataCache[monthKey].tasks = dataCache[monthKey].tasks.filter(t => t.id !== action.id);
                    } else if (action.method === 'update') {
                        let targetList = action.type === 'event' ? dataCache[monthKey].events : dataCache[monthKey].tasks;
                        let existing = targetList.find(e => e.id === action.id);
                        if (existing) delete existing._pendingUpdate;
                    } else if (action.method === 'insert') {
                        for (const key in dataCache) {
                            if (action.type === 'event' && dataCache[key].events) {
                                const existing = dataCache[key].events.find(e => e._localId === tempLocalId);
                                if (existing) delete existing._localId;
                            }
                            if (action.type === 'task' && dataCache[key].tasks) {
                                const existing = dataCache[key].tasks.find(t => t._localId === tempLocalId);
                                if (existing) delete existing._localId;
                            }
                        }
                        setTimeout(() => fetchAndRenderMonth(year, month, 'replace', true), 1500);
                    }
                }
                const existingMonthAfter = document.getElementById(`month-${year}-${month}`);
                if (existingMonthAfter) existingMonthAfter.remove();
                if (dataCache[monthKey]) renderMonthDOM(year, month, dataCache[monthKey], 'replace');
                if (typeof selectedDateStr !== 'undefined' && selectedDateStr) openDailyModal(selectedDateStr, new Date(selectedDateStr).getDay());
                await updateSyncBadge();

            } catch (e) {
                console.error("API送信エラー:", e);
                const localId = await saveToSyncQueue(action);
                updateLocalCacheForOptimisticUI(action, localId, tempLocalId);
                showToast(`📦 通信不良だ。裏で控え室に退避した。`);
                
                const existingMonthErr = document.getElementById(`month-${year}-${month}`);
                if (existingMonthErr) existingMonthErr.remove();
                if (dataCache[monthKey]) renderMonthDOM(year, month, dataCache[monthKey], 'replace');
                if (typeof selectedDateStr !== 'undefined' && selectedDateStr) openDailyModal(selectedDateStr, new Date(selectedDateStr).getDay());
                
                await updateSyncBadge();
            }
        }
    })();
}

function updateLocalCacheForOptimisticUI(action, localId, replaceTempId = null) {
    // ★絶対防衛線：オブジェクト化、あるいは完全に欠損している幽霊データの日付を安全な文字列に強制修復する
    const _td2 = new Date(); let safeToday = `${_td2.getFullYear()}-${String(_td2.getMonth() + 1).padStart(2, '0')}-${String(_td2.getDate()).padStart(2, '0')}`;
    if (!action.start || typeof action.start === 'object') { action.start = (action.start && (action.start.dateTime || action.start.date)) || safeToday; }
    if (!action.end || typeof action.end === 'object') { action.end = (action.end && (action.end.dateTime || action.end.date)) || action.start; }
    if (!action.due || typeof action.due === 'object') { action.due = (action.due && (action.due.dateTime || action.due.date)) || safeToday; }

    let tdStr = action.start || action.due; let td = new Date();
    if (tdStr && typeof tdStr === 'string') { 
        if (tdStr.includes('T')) { td = new Date(tdStr); } 
        else { const p = tdStr.split('-'); td = new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2])); } 
    }
    const monthKey = `${td.getFullYear()}-${td.getMonth()}`;
    if (!dataCache[monthKey]) dataCache[monthKey] = { events: [], tasks: [] };

    const targetList = action.type === 'event' ? dataCache[monthKey].events : dataCache[monthKey].tasks;

    // キュー保存後にIDをすり替える処理
    if (replaceTempId) {
        const itemToReplace = targetList.find(item => item._localId === replaceTempId);
        if (itemToReplace) { itemToReplace._localId = localId; itemToReplace.id = 'dummy_' + localId; }
        return;
    }

    if (action.method === 'insert') {
        if (targetList.some(item => item._localId === localId)) return;
        const newItem = action.type === 'event' ? {
            id: 'dummy_' + localId, summary: action.title, location: action.location, description: action.description,
            start: action.start.includes('T') ? { dateTime: action.start } : { date: action.start },
            end: action.end ? (action.end.includes('T') ? { dateTime: action.end } : { date: action.end }) : null,
            colorId: action.colorId, _localId: localId
        } : {
            id: 'dummy_' + localId, title: action.title, notes: action.description, due: action.due, status: 'needsAction', _localId: localId
        };
        targetList.push(newItem);
    } else if (action.method === 'update') {
        const existing = targetList.find(item => item.id === action.id);
        if (existing) {
            if (action.type === 'event') {
                existing.summary = action.title;
                existing.location = action.location;
                existing.description = action.description; // ★メモの変更も即時反映
                existing.start = action.start.includes('T') ? { dateTime: action.start } : { date: action.start };
                if (action.end) existing.end = action.end.includes('T') ? { dateTime: action.end } : { date: action.end };
                existing.colorId = action.colorId;         // ★色の変更も即時反映
            } else {
                existing.title = action.title;
                existing.notes = action.description;
                existing.due = action.due;
            }
            existing._pendingUpdate = true;
        }
    } else if (action.method === 'delete') {
        const existing = targetList.find(item => item.id === action.id);
        if (existing) existing._pendingDelete = true;
    }
}

async function rehydrateSyncQueue() {
    const queue = await getSyncQueue();
    for (const item of queue) {
        updateLocalCacheForOptimisticUI(item.payload, item.id);
    }
}

async function executeApiAction(action, isRetry = false) {
    if (!navigator.onLine) throw new Error("Offline");

    // ★第一原理：参照渡しによるペイロードの破壊（変質）を防ぐため、完全なクローンを生成して作業する
    const payload = JSON.parse(JSON.stringify(action));

    // ★第1段階：データの強制正規化（TypeErrorの爆弾を解体し、安全な形に整える）
    payload.title = payload.title || "(無名)";
    payload.description = payload.description || "";
    payload.location = payload.location || "";

    if (payload.type === 'event') {
        // 過去のバグで日付がオブジェクトになっていた場合、文字列を抽出する
        if (payload.start && typeof payload.start === 'object') payload.start = payload.start.dateTime || payload.start.date || "";
        if (payload.end && typeof payload.end === 'object') payload.end = payload.end.dateTime || payload.end.date || "";

        // それでも日付が空なら、安全策として「今日」にする
        if (!payload.start || typeof payload.start !== 'string') {
            const td = new Date();
            payload.start = `${td.getFullYear()}-${String(td.getMonth() + 1).padStart(2, '0')}-${String(td.getDate()).padStart(2, '0')}`;
        }
        if (!payload.end || typeof payload.end !== 'string') payload.end = payload.start;

        if (payload.id && payload.id.startsWith('dummy_')) {
            if (payload.method === 'delete') return; // 未送信のまま消したものは成功扱い
            if (payload.method === 'update') { payload.method = 'insert'; delete payload.id; }
        }

        // ★死角3の排除：GASに対して「Google標準のネイティブ通知（リマインダー）を確実にオンにしろ」と明示的に命令する
        payload.useDefaultReminders = true;

    } else if (payload.type === 'task') {
        if (payload.id && payload.id.startsWith('dummy_')) {
            if (payload.method === 'delete') return;
            if (payload.method === 'update') { payload.method = 'insert'; delete payload.id; }
        }
        // タスクの期限も文字列化を保証
        if (payload.due && typeof payload.due === 'object') payload.due = payload.due.dateTime || payload.due.date || "";
        
        // ★絶対防衛線：タスクの日付が「+09:00」を含んでいるとGoogle側で前日（UTC）に計算されてズレる。
        // 強制的に「YYYY-MM-DDT00:00:00.000Z」のUTC形式に上書きして浄化する。
        if (payload.due && typeof payload.due === 'string') {
            const dateMatch = payload.due.match(/^(\d{4}-\d{2}-\d{2})/);
            if (dateMatch) {
                payload.due = dateMatch[1] + 'T00:00:00.000Z';
            }
        }
    }

    // ★第2段階：GASエンドポイントへの通信と、貴重なデータの「絶対救出」
    try {
        const response = await fetch(getGasUrl(), {
            method: 'POST',
            body: JSON.stringify(payload) // プリフライト(OPTIONS)回避のため、あえて text/plain 扱いで送信
        });
        const result = await response.json();

        if (!result.success) {
            // ★第一原理：GASが返したエラーメッセージから真のステータスを推論し、安易なデータ破壊（強制400扱い）を防ぐ
            let simulatedStatus = 500; // デフォルトは「リトライ対象」となる一時的なサーバーエラー
            const errStr = (result.error || "").toLowerCase();
            
            if (errStr.includes("not found") || errStr.includes("404")) simulatedStatus = 404;
            else if (errStr.includes("invalid") || errStr.includes("400") || errStr.includes("bad request") || errStr.includes("parse")) simulatedStatus = 400;
            else if (errStr.includes("410") || errStr.includes("gone")) simulatedStatus = 410;
            else if (errStr.includes("429") || errStr.includes("quota") || errStr.includes("rate limit")) simulatedStatus = 429;
            else if (errStr.includes("401") || errStr.includes("403") || errStr.includes("unauthorized") || errStr.includes("forbidden")) simulatedStatus = 401;

            // サーバー側でエラーが起きた場合、解析したステータスを投げて下のcatchに拾わせる
            throw { status: simulatedStatus, message: result.error }; 
        }

    } catch (error) {
        const code = error.status || 500;
        
        // 救出作戦 A: 既にGoogle上で消えている予定をオフラインで「更新」していた場合 (404/410)
        if ((code === 404 || code === 410) && payload.method === 'update') {
            console.warn(`⚠️ 対象(ID:${payload.id})がGoogle上に存在しない。貴重な更新データを「新規追加(insert)」として復活させる。`);
            payload.method = 'insert';
            delete payload.id;
            await executeApiAction(payload, true); // 新規追加として自らを再帰実行し救出
            return;
        }
        
        // 救出作戦 B: Googleに日付形式などを拒絶された場合 (400)
        if (code === 400 && !isRetry) {
            console.warn(`⚠️ Googleが形式を拒絶(400)。最低限のテキストデータとして今日の終日予定に強制変換して救出する。`);
            if (payload.type === 'event') {
                const td = new Date();
                const fallbackDate = `${td.getFullYear()}-${String(td.getMonth() + 1).padStart(2, '0')}-${String(td.getDate()).padStart(2, '0')}`;
                payload.start = fallbackDate;
                payload.end = fallbackDate;
            } else {
                delete payload.due; // タスクの場合は期限を消して無期限化
            }
            await executeApiAction(payload, true); // 安全な形式で自らを再帰実行し救出
            return;
        }

        throw error; // 上記で救出できない純粋な通信エラー等は上に投げる
    }
}

// ==========================================
// 9. その他初期化プロセス等
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
    showToast('📶 電波が回復した。');
    await updateSyncBadge();
    processSyncQueue();
});

window.addEventListener('offline', async () => {
    showToast('⚡️ 圏外になった。以後の操作はローカルの控え室に退避する。');
    await updateSyncBadge();
});

// ★生命維持装置：サイレント・リフレッシュ機能（無音・無演出の完全同期）
async function executeSilentRefresh() {
    if (!navigator.onLine || isAuthError || isFetching) return;
    
    // オフライン退避中のデータがある場合は、コンフリクトを防ぐため同期を一時停止する
    const queue = await getSyncQueue();
    if (queue.length > 0) return; 

    const monthsToRefresh = [...renderedMonths];
    if (monthsToRefresh.length === 0) return;

    let isUpdated = false;
    for (const m of monthsToRefresh) {
        try {
            const url = `${getGasUrl()}?year=${m.year}&month=${m.month}`;
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.success) {
                const monthKey = `${m.year}-${m.month}`;
                const oldDataStr = JSON.stringify(dataCache[monthKey]);
                const newDataStr = JSON.stringify({ events: data.events || [], tasks: data.tasks || [] });
                
                // ★ハッシュ比較：1文字でも差分がある時だけDOMを書き換える（無駄なガタツキの完全防止）
                if (oldDataStr !== newDataStr) {
                    dataCache[monthKey] = { events: data.events || [], tasks: data.tasks || [] };
                    saveDataCacheToIDB(monthKey, dataCache[monthKey]);
                    
                    const existingMonth = document.getElementById(`month-${m.year}-${m.month}`);
                    if (existingMonth) {
                        existingMonth.remove();
                        renderMonthDOM(m.year, m.month, dataCache[monthKey], 'replace');
                    }
                    isUpdated = true;
                }
            }
        } catch (e) { 
            console.warn("サイレント同期スキップ:", e); 
        }
    }

    // もし詳細ビュー（画面下部）を開いたまま復帰した場合、その中身も静かに最新化する
    if (isUpdated && typeof selectedDateStr !== 'undefined' && selectedDateStr) {
        const modal = document.getElementById('daily-modal');
        if (modal && modal.classList.contains('active')) {
            openDailyModal(selectedDateStr, new Date(selectedDateStr).getDay());
        }
    }
}

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        processSyncQueue();
        executeSilentRefresh();
    }
});

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await initIDB(); loadSettings(); loadDict(); initColorPicker(); initTaskColorPicker();
        if (typeof initSpeech === 'function') initSpeech(); if (typeof initNotification === 'function') initNotification();
        const eventActionBar = document.querySelector('#editor-modal .action-bar');
        if (eventActionBar && !document.getElementById('btn-convert-task')) { const btn = document.createElement('button'); btn.id = 'btn-convert-task'; btn.className = 'btn btn-gray'; btn.style.display = 'none'; btn.innerText = '🔄 タスクへ'; btn.onclick = () => executeConversion('event'); eventActionBar.insertBefore(btn, document.getElementById('btn-duplicate')); }
        const taskActionBar = document.querySelector('#task-editor-modal .action-bar');
        if (taskActionBar && !document.getElementById('btn-convert-event')) { const btn = document.createElement('button'); btn.id = 'btn-convert-event'; btn.className = 'btn btn-gray'; btn.style.display = 'none'; btn.innerText = '🔄 予定へ'; btn.onclick = () => executeConversion('task'); taskActionBar.insertBefore(btn, document.getElementById('task-btn-delete')); }

        // ★限界突破：Google APIの応答を待たずに、キャッシュから自律起動する
        if (localStorage.getItem('jero_token')) {
            setTimeout(() => {
                if (!isCalendarInited) {
                    console.log("⚡️ Google APIの応答なし。キャッシュによる自律起動を開始。");
                    document.getElementById('offline-badge').innerText = '⚡️ 完全自律モード (キャッシュ起動)';
                    document.getElementById('offline-badge').classList.add('active');
                    initCalendar();
                }
            }, 1500); // 1.5秒待って初期化されていなければ強制起動
        }

    } catch (err) { showToast("初期化エラー: " + err.message); }
});

// ====== 旧Google認証(OAuth)コードは全て削除済 ======

// ★起動シーケンス：認証不要で直ちに自律起動する
function startApp() {
    document.getElementById('auth-btn').style.display = 'none'; // 鍵マークを完全に隠す
    initWeekdays();
    setupObserver();
    initCalendar(); 
    
    // 自律起動後に未送信データをチェック
    setTimeout(() => { processSyncQueue(); }, 1000);
}

// DOM読み込み完了時に強制的に起動
document.addEventListener('DOMContentLoaded', () => {
    // 既存のDOMContentLoaded処理（ServiceWorkerや初期化など）が終わった後で呼び出す
    setTimeout(startApp, 500);
});

document.addEventListener('DOMContentLoaded', () => {
    const resizer = document.getElementById('resizer');
    const bottomView = document.getElementById('bottom-detail-view');
    let startY = 0;
    let startHeight = 0;

    if (resizer && bottomView) {
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

// ==========================================
// ★ 野戦倉庫管理UI (未送信データマネージャー)
// ==========================================
async function openSyncManager() {
    document.getElementById('overlay').classList.add('active');
    document.getElementById('sync-manager-modal').classList.add('active');
    await renderSyncQueueList();
}

function closeSyncManager() {
    document.getElementById('sync-manager-modal').classList.remove('active');
    if (!document.getElementById('daily-modal').classList.contains('active') &&
        !document.getElementById('editor-modal').classList.contains('active') &&
        !document.getElementById('task-editor-modal').classList.contains('active')) {
        document.getElementById('overlay').classList.remove('active');
    }
}

async function renderSyncQueueList() {
    const listEl = document.getElementById('sync-queue-list');
    if (!listEl) return;

    const queue = await getSyncQueue();
    if (queue.length === 0) {
        listEl.innerHTML = '<div style="text-align:center; padding:20px; color:#888; font-size:13px;">未送信のデータはない。平和だ。</div>';
        return;
    }

    let html = '';
    queue.forEach(item => {
        const payload = item.payload;
        const isEvent = payload.type === 'event';
        const method = payload.method === 'insert' ? '追加' : payload.method === 'update' ? '更新' : '削除';
        const title = payload.title || '(無名)';
        let dateStr = "日時不明";
        if (payload.start) dateStr = payload.start.includes('T') ? new Date(payload.start).toLocaleString('ja-JP') : payload.start;
        else if (payload.due) dateStr = new Date(payload.due).toLocaleDateString('ja-JP');

        html += `
            <div style="background:var(--head-bg); border:1px solid var(--border); border-radius:8px; padding:10px; display:flex; justify-content:space-between; align-items:center;">
                <div style="flex:1; overflow:hidden; margin-right:10px;">
                    <div style="font-size:10px; color:var(--accent); font-weight:bold; margin-bottom:2px;">[${isEvent ? '予定' : 'タスク'} : ${method}]</div>
                    <div style="font-size:14px; font-weight:bold; color:var(--txt); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${title}</div>
                    <div style="font-size:11px; color:#888;">${dateStr}</div>
                </div>
                <div style="display:flex; gap:6px; flex-shrink:0;">
                    <button class="btn-gray" style="padding:6px 10px; font-size:12px; border-radius:6px; border:none; color:white; cursor:pointer;" onclick="retrySingleSyncItem('${item.id}')">再送</button>
                    <button class="btn-red" style="padding:6px 10px; font-size:12px; border-radius:6px; border:none; color:white; cursor:pointer;" onclick="discardSingleSyncItem('${item.id}')">破棄</button>
                </div>
            </div>
        `;
    });
    listEl.innerHTML = html;
}

async function discardSingleSyncItem(id) {
    if (!confirm("この未送信データを破棄する。ゴーストデータならこれが正解だ。いいか？")) return;
    await clearSyncQueueItem(id); // 削除完了を確実に待つ

    await renderSyncQueueList();
    await updateSyncBadge();
    showToast("🚮 データを破棄した。UIのゴーストを浄化する。");

    // ★重要: _pendingUpdateなどのおばけフラグを消すため、強制的にGoogleから最新状態を再取得する
    const today = new Date();
    showGlobalLoader("カレンダーを最新化中...");
    await fetchAndRenderMonth(today.getFullYear(), today.getMonth(), 'replace', true);
    hideGlobalLoader();
}

async function retrySingleSyncItem(id) {
    const queue = await getSyncQueue();
    const item = queue.find(q => q.id === id);
    if (!item) return;

    // GAS移行により通行証(トークン)の賞味期限チェックは不要になった
    showGlobalLoader("1件だけ再送信中...");
    try {
        await executeApiAction(item.payload);
        await clearSyncQueueItem(id); // 削除完了を確実に待つ
        showToast("✅ 送信成功だ！");
        await renderSyncQueueList();
        await updateSyncBadge();
        const today = new Date();
        await fetchAndRenderMonth(today.getFullYear(), today.getMonth(), 'replace', true);
    } catch (e) {
        console.error(e);
        showToast("❌ やはり弾かれた。形式が不正なゴーストデータの可能性が高い。破棄を勧めるぞ。");
    } finally {
        hideGlobalLoader();
    }
}
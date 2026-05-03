// JeroCalendar v9.5 Main Logic - Full Compressor & Native Attachments Edition
function getGasUrl() { const url = localStorage.getItem('jero_gas_url'); if (!url) { showToast('⚠️ 設定画面(⚙️)から「サーバー接続キー」を入力してくれ。'); throw new Error('GAS URL missing'); } return url; }
let dataCache = {}; let renderedMonths = []; let observer, isFetching = false, isAuthError = false;
let selectedDateStr = "", selectedColorId = "", selectedTaskColorId = "", currentView = 'calendar';
let isCalendarInited = false; 
let deletedIds = new Set(); // ★幻影迎撃用ブラックリスト（Googleの同期遅延によるデータの復活を防ぐ） 
const GOOGLE_COLORS = { "1": "#7986cb", "2": "#33b679", "3": "#8e24aa", "4": "#e67c73", "5": "#f6bf26", "6": "#f4511e", "7": "#039be5", "8": "#616161", "9": "#3f51b5", "10": "#0b8043", "11": "#d50000" };
let advancedDict = []; const DEFAULT_ADV_DICT = [{ keys: ["誕生日", "【誕】"], icon: "🎂", bg: "#ff2d55", txt: "#ffffff" }, { keys: ["会議", "【会】"], icon: "👥", bg: "#5856d6", txt: "#ffffff" }, { keys: ["休日", "【休】"], icon: "🏖️", bg: "#ff3b30", txt: "#ffffff" }];

const SAFE_PDF_ICON = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22%23ff3b30%22%3E%3Cpath d=%22M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8.5 7.5c0 .83-.67 1.5-1.5 1.5H9v2H7.5V7H10c.83 0 1.5.67 1.5 1.5v1zm5 2c0 .83-.67 1.5-1.5 1.5h-2.5V7H15c.83 0 1.5.67 1.5 1.5v3zm4-3H19v1h1.5V11H19v2h-1.5V7h3v1.5zM9 9.5h1v-1H9v1zM4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm10 5.5h1v-3h-1v3z%22/%3E%3C/svg%3E";

// ==========================================
// 1. ユーティリティ & UI操作群
// ==========================================
function getSafeLocalDateStr(dateObj = new Date()) { return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`; }

// ★休日・法定休日の最強判定エンジン
function isHolidayEvent(summary) {
    if (!summary) return false;
    // 1. ユーザー要望の完全網羅：最初に出現する「)」または「）」の前に「休」の文字が含まれていれば検知する
    if (summary.match(/^[^)）]*休[^)）]*[)）]/)) return true;
    // 2. 法定休日対応：設定画面で指定したカンマ区切りのキーワードに合致するか
    const wordsStr = localStorage.getItem('jero_holiday_words') || '';
    if (wordsStr) {
        const words = wordsStr.split(',').map(w => w.trim()).filter(w => w);
        if (words.some(w => summary.includes(w))) return true;
    }
    return false;
}

// ★触覚フィードバック（Haptics）エンジン
function triggerHaptic(type = 'light') {
    if (!navigator.vibrate) return;
    try {
        if (type === 'light') navigator.vibrate(10); // 軽いタップ
        else if (type === 'success') navigator.vibrate([15, 50, 15]); // 達成感（タスク完了・保存など）
        else if (type === 'heavy') navigator.vibrate(40); // 重い操作（削除など）
    } catch(e) {}
}

// ★画像圧縮エンジン（ペイロード爆発を防ぐ最強の盾）
async function compressImage(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let w = img.width, h = img.height; const maxD = 1200;
                if (w > maxD || h > maxD) { if (w > h) { h = Math.round(h * maxD / w); w = maxD; } else { w = Math.round(w * maxD / h); h = maxD; } }
                canvas.width = w; canvas.height = h;
                const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, w, h);
                // ★極限圧縮：次世代フォーマットWebPを採用。JPEGと同画質でファイルサイズをさらに削減する
                resolve(canvas.toDataURL('image/webp', 0.8).split(',')[1]);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// ★タスク用：メモ欄から添付ファイルを解析・分離
function parseTaskAttachments(text) {
    if (!text) return { cleanText: '', files: [] };
    let files = []; let cleanText = text;
    
    // 1. 抽出フェーズ（イテレーション中の文字列破壊を禁止）
    const regex = /📁 \[(.*?)\] (https:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)[^\s]*)/g;
    const matches = [...cleanText.matchAll(regex)];
    matches.forEach(match => { files.push({ title: match[1], fileUrl: match[2], fileId: match[3] }); });

    const oldRegex = /(https:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)[^\s]*)/g;
    const oldMatches = [...cleanText.matchAll(oldRegex)];
    oldMatches.forEach(match => { if (!files.some(f => f.fileId === match[2])) { files.push({ title: 'ファイル', fileUrl: match[1], fileId: match[2] }); } });

    // 2. 浄化フェーズ（抽出後に一括で削ぎ落とす）
    cleanText = cleanText.replace(/📁 \[(.*?)\] (https:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)[^\s]*)/g, '')
                         .replace(/(https:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)[^\s]*)/g, '')
                         .replace(/📁 添付ファイル:[\s\S]*/, '')
                         .replace(/\[写真添付あり\]/g, '')
                         .trim();
    return { cleanText, files };
}

// ★プレビュー表示・ピンチズーム統合エンジン
let currentViewerFileId = null;
let viewerZoom = { scale: 1, x: 0, y: 0 };

async function openImageViewer(fileId) {
    // ★大手術：PDFなどの「画像じゃないファイル」を引いた場合は、ビューアーの黒画面を開かずに直接Driveへ飛ばす
    let isImg = true; let foundAtt = null;
    if (typeof activeEventAttachments !== 'undefined') foundAtt = activeEventAttachments.find(a => a.fileId === fileId) || foundAtt;
    if (typeof activeTaskAttachments !== 'undefined') foundAtt = activeTaskAttachments.find(a => a.fileId === fileId) || foundAtt;
    if (!foundAtt) {
        for (const key in dataCache) {
            const evs = dataCache[key].events || [];
            for (const e of evs) {
                if (e.attachments) { const m = e.attachments.find(a => a.fileId === fileId || (a.fileUrl && a.fileUrl.includes(fileId))); if (m) { foundAtt = m; break; } }
                const p = parseTaskAttachments(e.description || ''); const m = p.files.find(f => f.fileId === fileId); if (m) { foundAtt = { title: m.title, mimeType: m.title.match(/\.(pdf|doc|docx|xls|xlsx|txt|zip|csv)$/i) ? 'application/pdf' : 'image/jpeg' }; break; }
            }
            if (foundAtt) break;
            const tks = dataCache[key].tasks || [];
            for (const t of tks) { const p = parseTaskAttachments(t.notes || ''); const m = p.files.find(f => f.fileId === fileId); if (m) { foundAtt = { title: m.title, mimeType: m.title.match(/\.(pdf|doc|docx|xls|xlsx|txt|zip|csv)$/i) ? 'application/pdf' : 'image/jpeg' }; break; } }
            if (foundAtt) break;
        }
    }
    if (foundAtt) {
        if (foundAtt.mimeType && !foundAtt.mimeType.startsWith('image/')) isImg = false;
        else if (foundAtt.title && foundAtt.title.match(/\.(pdf|doc|docx|xls|xlsx|txt|zip|csv)$/i)) isImg = false;
        else if (foundAtt.isImg === false) isImg = false;
    }
    
    // 画像以外なら別タブでDriveを開いて、ビューアー処理はここで打ち切る
    if (!isImg && !fileId.startsWith('dummy_')) {
        window.open(`https://drive.google.com/file/d/${fileId}/view`, '_blank');
        return;
    }

    const viewer = document.getElementById('img-viewer'); const img = document.getElementById('img-viewer-src'); const driveBtn = document.getElementById('img-viewer-drive-btn');
    if (!viewer || !img) return;
    
    currentViewerFileId = fileId;
    img.src = ''; 
    if (driveBtn) driveBtn.style.display = 'none'; 
    resetViewerZoom(); // ★状態の記憶喪失防止：必ず1倍サイズ・中央にリセット
    
    if (fileId.startsWith('dummy_')) {
        const realUid = parseInt(fileId.replace('dummy_', ''));
        const queue = await getSyncQueue();
        let foundBase64 = null; let foundMime = 'image/jpeg';
        for (const q of queue) { if (q.payload.attachments) { const match = q.payload.attachments.find(a => a.uid === realUid); if (match && match.base64) { foundBase64 = match.base64; foundMime = match.mimeType; break; } } }
        if (foundBase64) {
            if (!foundMime.startsWith('image/')) { showToast('⚠️ 画像以外のファイルは送信完了後にDriveで開けるぞ。'); return; }
            img.src = `data:${foundMime};base64,${foundBase64}`; 
            viewer.classList.add('active'); 
            showToast('🔄 送信待機中だ。指で拡大できるぞ'); 
            return; 
        }
    }
    
    showGlobalLoader('画像を読み込み中...');
    img.onload = () => { hideGlobalLoader(); if (driveBtn) driveBtn.style.display = 'block'; };
    img.onerror = () => { hideGlobalLoader(); showToast('❌ 読み込み失敗'); };
    img.src = `https://drive.google.com/thumbnail?id=${fileId}&sz=w1200`; 
    viewer.classList.add('active');
}

function closeImageViewer() {
    const viewer = document.getElementById('img-viewer');
    if (viewer) { viewer.classList.remove('active'); resetViewerZoom(); }
}

function openOriginalInDrive() {
    if (currentViewerFileId && !currentViewerFileId.startsWith('dummy_')) {
        window.open(`https://drive.google.com/file/d/${currentViewerFileId}/view`, '_blank');
        closeImageViewer(); 
    }
}

// ★ピンチズーム・パンニング計算隔離エンジン（裏側への干渉を完全遮断）
function initImageViewerZoom() {
    const container = document.getElementById('img-viewer-zoom-container');
    if (!container) return;

    let startTouches = []; let initialScale = 1; let startX = 0, startY = 0; let isPanning = false;
    const getDistance = (touches) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);

    container.addEventListener('touchstart', (e) => {
        if (e.touches.length >= 1) {
            startTouches = Array.from(e.touches);
            initialScale = viewerZoom.scale;
            if (e.touches.length === 1) {
                startX = e.touches[0].clientX - viewerZoom.x; startY = e.touches[0].clientY - viewerZoom.y;
                isPanning = viewerZoom.scale > 1; 
            }
        }
    }, { passive: false });

    container.addEventListener('touchmove', (e) => {
        e.preventDefault(); // ★絶対防壁：指の動きをここで完全に殺し、カレンダー側へのスクロール暴発を防ぐ
        if (e.touches.length === 2 && startTouches.length === 2) {
            const scaleChange = getDistance(e.touches) / getDistance(startTouches);
            viewerZoom.scale = Math.max(1, Math.min(initialScale * scaleChange, 4)); 
            applyZoomTransform();
        } else if (e.touches.length === 1 && isPanning) {
            viewerZoom.x = e.touches[0].clientX - startX; viewerZoom.y = e.touches[0].clientY - startY;
            applyZoomTransform();
        }
    }, { passive: false });

    container.addEventListener('touchend', (e) => {
        if (e.touches.length < 2) startTouches = [];
        if (e.touches.length === 0) {
            isPanning = false;
            if (viewerZoom.scale < 1) resetViewerZoom();
            else applyZoomTransform();
        }
    });
}

function applyZoomTransform() {
    const img = document.getElementById('img-viewer-src');
    if (img) img.style.transform = `translate(${viewerZoom.x}px, ${viewerZoom.y}px) scale(${viewerZoom.scale})`;
}

function resetViewerZoom() {
    viewerZoom = { scale: 1, x: 0, y: 0 };
    const img = document.getElementById('img-viewer-src');
    if (img) {
        img.style.transition = 'transform 0.2s ease-out';
        applyZoomTransform();
        setTimeout(() => img.style.transition = 'none', 200); 
    }
}

function getContrastYIQ(hexcolor) { if (!hexcolor) return '#ffffff'; hexcolor = hexcolor.replace("#", ""); if (hexcolor.length === 3) hexcolor = hexcolor.split('').map(c => c + c).join(''); var r = parseInt(hexcolor.substr(0, 2), 16); var g = parseInt(hexcolor.substr(2, 2), 16); var b = parseInt(hexcolor.substr(4, 2), 16); var yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000; return (yiq >= 128) ? '#000000' : '#ffffff'; }
function initWeekdays() { const days = ['日', '月', '火', '水', '木', '金', '土']; const c = document.getElementById('weekdays'); if (c) c.innerHTML = days.map(d => `<div class="wd">${d}</div>`).join(''); }
// ★設定の一元管理辞書（共通化による拡張性の確保）
const UI_THEME_COLORS = {
    red: { rgb: '255, 59, 48', hex: '#ff3b30' },
    blue: { rgb: '0, 122, 255', hex: '#007aff' },
    green: { rgb: '52, 199, 89', hex: '#34c759' },
    orange: { rgb: '255, 149, 0', hex: '#ff9500' },
    purple: { rgb: '175, 82, 222', hex: '#af52de' },
    yellow: { rgb: '255, 204, 0', hex: '#ffcc00' },
    darkgray: { rgb: '68, 68, 68', hex: '#444444' },
    black: { rgb: '0, 0, 0', hex: '#000000' }
};

// ★役割分離：DOM(画面)への反映だけを専門に行う純粋な関数
function applyAppConfig(config) {
    document.body.setAttribute('data-theme', config.theme);
    document.documentElement.style.setProperty('--fs', config.fs + 'px');
    document.documentElement.style.setProperty('--bg-alpha', (parseInt(config.alpha) / 100).toString());
    
    const sel = UI_THEME_COLORS[config.selColor] || UI_THEME_COLORS['red'];
    document.documentElement.style.setProperty('--sel-rgb', sel.rgb);
    document.documentElement.style.setProperty('--sel-hex', sel.hex);
    
    // ★本日と休日の色をCSS変数に注入する
    const today = UI_THEME_COLORS[config.todayColor] || UI_THEME_COLORS['red'];
    document.documentElement.style.setProperty('--today-rgb', today.rgb);
    document.documentElement.style.setProperty('--today-hex', today.hex);

const holiday = UI_THEME_COLORS[config.holidayColor] || UI_THEME_COLORS['darkgray'];
        document.documentElement.style.setProperty('--holiday-hex', holiday.hex);
        
        const fsVal = document.getElementById('fs-val'); if(fsVal) fsVal.innerText = config.fs;
        const alphaVal = document.getElementById('alpha-val'); if(alphaVal) alphaVal.innerText = config.alpha;
        const maxDispVal = document.getElementById('max-disp-val'); if(maxDispVal) maxDispVal.innerText = config.maxDisp;
    }

    function loadSettings() { 
        // ★設定の読み込みをオブジェクトとして構造化
        const config = {
            theme: localStorage.getItem('jero_theme') || 'light',
            fs: localStorage.getItem('jero_fs') || '10',
            selColor: localStorage.getItem('jero_sel_color') || 'red',
            todayColor: localStorage.getItem('jero_today_color') || 'red',
            holidayColor: localStorage.getItem('jero_holiday_color') || 'darkgray',
            holidayWords: localStorage.getItem('jero_holiday_words') || '',
            alpha: localStorage.getItem('jero_bg_alpha') || '25',
            maxDisp: localStorage.getItem('jero_max_disp') || '6'
        };
        
        const elTheme = document.getElementById('st-theme'); if(elTheme) elTheme.value = config.theme;
        const elFs = document.getElementById('st-fs'); if(elFs) elFs.value = config.fs;
        const elSel = document.getElementById('st-sel-color'); if(elSel) elSel.value = config.selColor;
        const elToday = document.getElementById('st-today-color'); if(elToday) elToday.value = config.todayColor;
        const elHoliday = document.getElementById('st-holiday-color'); if(elHoliday) elHoliday.value = config.holidayColor;
        const elHWords = document.getElementById('st-holiday-words'); if(elHWords) elHWords.value = config.holidayWords;
        const elAlpha = document.getElementById('st-alpha'); if(elAlpha) elAlpha.value = config.alpha;
        const elMaxDisp = document.getElementById('st-max-disp'); if(elMaxDisp) elMaxDisp.value = config.maxDisp;
        
        applyAppConfig(config); // 画面への適用は専門関数へ丸投げ    
    // その他外部連携設定
    const voiceEnabled = localStorage.getItem('jero_voice_enabled') === 'true'; 
    const stVoice = document.getElementById('st-voice'); if (stVoice) stVoice.checked = voiceEnabled; 
    if (typeof isVoiceEnabled !== 'undefined') isVoiceEnabled = voiceEnabled; 
    
    const gasUrl = localStorage.getItem('jero_gas_url') || ''; 
    const gasUrlInput = document.getElementById('st-gas-url'); if (gasUrlInput) gasUrlInput.value = gasUrl; 
    
    const accInfo = document.getElementById('account-info'); 
    if (accInfo) { if (gasUrl) { accInfo.innerText = "連携サーバー(GAS) 接続済"; accInfo.style.color = '#34c759'; } else { accInfo.innerText = "連携サーバー 未設定"; accInfo.style.color = '#ff3b30'; } } 
    
    const gKey = localStorage.getItem('jero_gemini_key') || ''; 
    const gKeyInput = document.getElementById('st-gemini-key'); if (gKeyInput) gKeyInput.value = gKey; 
    
    const gPrompt = localStorage.getItem('jero_gemini_prompt') || (typeof DEFAULT_SYSTEM_PROMPT !== 'undefined' ? DEFAULT_SYSTEM_PROMPT : ''); 
    const gPromptInput = document.getElementById('st-gemini-prompt'); if (gPromptInput) gPromptInput.value = gPrompt; 
}

function saveGasUrl() { localStorage.setItem('jero_gas_url', document.getElementById('st-gas-url').value.trim()); showToast('✅ サーバー接続キーを保存した。'); triggerFullReRender(); }

function saveAndApplySettings() { 
        // ★設定の保存をオブジェクトとして構造化
        const config = {
            theme: document.getElementById('st-theme') ? document.getElementById('st-theme').value : 'light',
            fs: document.getElementById('st-fs') ? document.getElementById('st-fs').value : '10',
            selColor: document.getElementById('st-sel-color') ? document.getElementById('st-sel-color').value : 'red',
            todayColor: document.getElementById('st-today-color') ? document.getElementById('st-today-color').value : 'red',
            holidayColor: document.getElementById('st-holiday-color') ? document.getElementById('st-holiday-color').value : 'darkgray',
            holidayWords: document.getElementById('st-holiday-words') ? document.getElementById('st-holiday-words').value : '',
            alpha: document.getElementById('st-alpha') ? document.getElementById('st-alpha').value : '25',
            maxDisp: document.getElementById('st-max-disp') ? document.getElementById('st-max-disp').value : '6'
        };
        
        localStorage.setItem('jero_theme', config.theme);
        localStorage.setItem('jero_fs', config.fs);
        localStorage.setItem('jero_sel_color', config.selColor);
        localStorage.setItem('jero_today_color', config.todayColor);
        localStorage.setItem('jero_holiday_color', config.holidayColor);
        localStorage.setItem('jero_holiday_words', config.holidayWords);
        localStorage.setItem('jero_bg_alpha', config.alpha);
        localStorage.setItem('jero_max_disp', config.maxDisp);
        
        applyAppConfig(config); // 画面への適用は専門関数へ丸投げ
        triggerFullReRender(); // ★Phase 1: 表示上限を変えた瞬間にカレンダーを再描画する
    }
function setProgress(p) { const pb = document.getElementById('progress-bar'); if (pb) { pb.style.width = p + '%'; if (p >= 100) setTimeout(() => pb.style.width = '0%', 500); } }
function scrollToToday() { const todayStr = getSafeLocalDateStr(); const todayCell = document.getElementById(`cell-${todayStr}`); if (todayCell) { todayCell.scrollIntoView({ behavior: 'smooth', block: 'center' }); todayCell.click(); showToast('今日に移動したぞ。'); } else { const t = new Date(); fetchAndRenderMonth(t.getFullYear(), t.getMonth(), 'replace', false).then(() => { const retryCell = document.getElementById(`cell-${todayStr}`); if (retryCell) { retryCell.scrollIntoView({ behavior: 'smooth', block: 'center' }); retryCell.click(); showToast('今日に移動したぞ。'); } }); } }
function closeAllModals() { document.querySelectorAll('.bottom-modal').forEach(m => m.classList.remove('active')); document.getElementById('overlay').classList.remove('active'); }
function openSettings() { document.getElementById('overlay').classList.add('active'); document.getElementById('settings-modal').classList.add('active'); if (typeof checkNotificationStatus === 'function') checkNotificationStatus(); }
function closeSettings() { document.getElementById('settings-modal').classList.remove('active'); document.getElementById('overlay').classList.remove('active'); }
function switchAccount() { if (confirm("サーバー接続設定(GAS URL)をリセットして初期状態に戻すか？")) { localStorage.removeItem('jero_gas_url'); location.reload(); } }
function exportSettings() { const data = { theme: localStorage.getItem('jero_theme'), fs: localStorage.getItem('jero_fs'), voice: localStorage.getItem('jero_voice_enabled'), gemini_key: localStorage.getItem('jero_gemini_key'), gemini_prompt: localStorage.getItem('jero_gemini_prompt'), dict: localStorage.getItem('jero_adv_dict'), gas_url: localStorage.getItem('jero_gas_url') }; const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `JeroCalendar_Backup_${new Date().toISOString().split('T')[0]}.json`; a.click(); URL.revokeObjectURL(url); showToast('✅ 辞書と設定データを書き出した。'); }
function importSettings() { const input = document.createElement('input'); input.type = 'file'; input.accept = 'application/json'; input.onchange = (e) => { const file = e.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = (evt) => { try { const data = JSON.parse(evt.target.result); if (data.theme) localStorage.setItem('jero_theme', data.theme); if (data.fs) localStorage.setItem('jero_fs', data.fs); if (data.voice) localStorage.setItem('jero_voice_enabled', data.voice); if (data.gemini_key) localStorage.setItem('jero_gemini_key', data.gemini_key); if (data.gemini_prompt) localStorage.setItem('jero_gemini_prompt', data.gemini_prompt); if (data.gas_url) localStorage.setItem('jero_gas_url', data.gas_url); if (data.dict) { localStorage.setItem('jero_adv_dict', data.dict); advancedDict = JSON.parse(data.dict); } showToast('✅ 復元した。再起動するぞ。'); setTimeout(() => location.reload(), 1500); } catch (err) { showToast('❌ 形式が違うぞ。'); } }; reader.readAsText(file); }; input.click(); }

// ★新設：データを守りつつ、プログラム(JS)のキャッシュのみを強制突破するエンジン
function forceHardReload() { 
    if (confirm('最新のプログラム(JS/CSS)を強制取得して再起動するか？\n※予定データや設定は消えないから安心しろ。')) { 
        if ('serviceWorker' in navigator) { 
            navigator.serviceWorker.getRegistrations().then(function(registrations) { 
                for(let registration of registrations) { registration.unregister(); } 
                // URLの末尾に現在時刻(ミリ秒)を付与することで、ブラウザに「全く新しいページだ」と錯覚させキャッシュを貫通する
                window.location.href = window.location.pathname + '?t=' + new Date().getTime(); 
            }); 
        } else { 
            window.location.href = window.location.pathname + '?t=' + new Date().getTime(); 
        } 
    } 
}

function executeEmergencyReset() { if (confirm('全キャッシュとシステム(ServiceWorker)を消去・再起動するか？（事前に「データ書出」推奨）')) { indexedDB.deleteDatabase('JeroDB_v8'); localStorage.clear(); if ('serviceWorker' in navigator) { navigator.serviceWorker.getRegistrations().then(function(registrations) { for(let registration of registrations) { registration.unregister(); } window.location.href = window.location.pathname + '?t=' + new Date().getTime(); }); } else { window.location.href = window.location.pathname + '?t=' + new Date().getTime(); } } }
function showGlobalLoader(msg) { document.getElementById('loader-msg').innerText = msg; document.getElementById('global-loader').classList.add('active'); }
function hideGlobalLoader() { document.getElementById('global-loader').classList.remove('active'); }
function showToast(msg) { const toast = document.getElementById('toast'); toast.innerText = msg; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 5000); }

// ==========================================
// 2. データベース & ローカル控え室 
// ==========================================
let idb;
function initIDB() { return new Promise((resolve) => { const timeout = setTimeout(() => { resolve(); }, 2000); try { const req = indexedDB.open('JeroDB_v8', 4); req.onupgradeneeded = (e) => { const db = e.target.result; if (!db.objectStoreNames.contains('images')) db.createObjectStore('images', { keyPath: 'id' }); if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache', { keyPath: 'key' }); if (!db.objectStoreNames.contains('sync_queue')) db.createObjectStore('sync_queue', { keyPath: 'id' }); if (!db.objectStoreNames.contains('shadow_vault')) db.createObjectStore('shadow_vault', { keyPath: 'date' }); }; req.onsuccess = (e) => { clearTimeout(timeout); idb = e.target.result; resolve(); }; req.onerror = (e) => { clearTimeout(timeout); resolve(); }; } catch (e) { clearTimeout(timeout); resolve(); } }); }
function generateUUID() { return 'xxxx-xxxx-4xxx-yxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8); return v.toString(16); }); }
async function saveToSyncQueue(actionPayload) {
    if (!idb) return null; const queue = await getSyncQueue();
    if (actionPayload.method === 'update' || actionPayload.method === 'delete') {
        const targetDummyId = actionPayload.id;
        if (targetDummyId && targetDummyId.startsWith('dummy_')) {
            const targetLocalId = targetDummyId.replace('dummy_', ''); const existingItem = queue.find(q => q.id === targetLocalId);
            if (existingItem) {
                if (actionPayload.method === 'delete') { await clearSyncQueueItem(targetLocalId); return targetLocalId; } 
                else if (actionPayload.method === 'update') { const mergedPayload = { ...existingItem.payload, ...actionPayload, method: 'insert', id: '' }; return new Promise((resolve) => { try { const tx = idb.transaction('sync_queue', 'readwrite'); tx.objectStore('sync_queue').put({ id: targetLocalId, payload: mergedPayload, timestamp: Date.now() }); tx.oncomplete = () => resolve(targetLocalId); } catch (e) { resolve(null); } }); }
            }
        }
    }
    return new Promise((resolve) => { try { const tx = idb.transaction('sync_queue', 'readwrite'); const id = generateUUID(); const payloadWithLocalId = { ...actionPayload, _localId: id }; tx.objectStore('sync_queue').put({ id: id, payload: payloadWithLocalId, timestamp: Date.now() }); tx.oncomplete = () => { resolve(id); }; } catch (e) { resolve(null); } });
}
function getSyncQueue() { return new Promise((resolve) => { if (!idb) return resolve([]); try { const tx = idb.transaction('sync_queue', 'readonly'); const req = tx.objectStore('sync_queue').getAll(); req.onsuccess = () => resolve(req.result || []); } catch (e) { resolve([]); } }); }
function clearSyncQueueItem(id) { return new Promise((resolve) => { if (!idb) return resolve(); try { const tx = idb.transaction('sync_queue', 'readwrite'); tx.objectStore('sync_queue').delete(id); tx.oncomplete = () => resolve(); tx.onerror = () => resolve(); } catch (e) { resolve(); } }); }
function saveDataCacheToIDB(monthKey, data) { if (!idb) return; try { const tx = idb.transaction('cache', 'readwrite'); tx.objectStore('cache').put({ key: monthKey, data: data, timestamp: Date.now() }); } catch (e) { } }
function loadDataCacheFromIDB() { return new Promise((resolve) => { if (!idb) return resolve(); try { const tx = idb.transaction('cache', 'readonly'); const req = tx.objectStore('cache').getAll(); req.onsuccess = () => { if (req.result) { req.result.forEach(item => { dataCache[item.key] = item.data; }); } resolve(); }; req.onerror = () => resolve(); } catch (e) { resolve(); } }); }

// ★フライトレコーダー（自動バックアップ＆タイムマシン）
async function executeSilentBackup() { if (!idb) return; const todayStr = getSafeLocalDateStr(); const lastBackup = localStorage.getItem('jero_last_backup'); if (lastBackup === todayStr) return; try { const backupData = { date: todayStr, timestamp: Date.now(), cache: JSON.stringify(dataCache), dict: JSON.stringify(advancedDict), settings: { theme: localStorage.getItem('jero_theme'), fs: localStorage.getItem('jero_fs'), gas_url: localStorage.getItem('jero_gas_url') } }; const tx = idb.transaction('shadow_vault', 'readwrite'); tx.objectStore('shadow_vault').put(backupData); const req = tx.objectStore('shadow_vault').getAll(); req.onsuccess = () => { if (req.result) { const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000); req.result.forEach(b => { if (b.timestamp < sevenDaysAgo) { const delTx = idb.transaction('shadow_vault', 'readwrite'); delTx.objectStore('shadow_vault').delete(b.date); } }); } }; localStorage.setItem('jero_last_backup', todayStr); console.log('✅ フライトレコーダー記録完了'); } catch (e) { console.error(e); } }
// ★差分プレビュー搭載型タイムマシン（X線ゴーグル）
async function openTimeMachine() { if (!idb) { showToast('DB接続エラー'); return; } const tx = idb.transaction('shadow_vault', 'readonly'); const req = tx.objectStore('shadow_vault').getAll(); req.onsuccess = () => { const backups = req.result || []; if (backups.length === 0) { showToast('⚠️ 復元可能な過去データが存在しない。'); return; } let msg = "【タイムマシン】\n復元したい日付の番号を入力しろ：\n"; backups.sort((a,b)=>b.timestamp - a.timestamp).forEach((b, i) => { msg += `[${i}] ${b.date}\n`; }); const sel = prompt(msg); if (sel !== null && backups[sel]) { const backupCache = JSON.parse(backups[sel].cache); const getMap = (cache, type) => { let map = {}; for (const k in cache) { if(cache[k][type]) cache[k][type].forEach(item => map[item.id] = item); } return map; }; const curEMap = getMap(dataCache, 'events'); const bkpEMap = getMap(backupCache, 'events'); const curTMap = getMap(dataCache, 'tasks'); const bkpTMap = getMap(backupCache, 'tasks'); const calcDiff = (cur, bkp) => { let a = 0, d = 0, m = 0; for(const id in bkp) { if(!cur[id]) a++; else if(JSON.stringify(bkp[id]) !== JSON.stringify(cur[id])) m++; } for(const id in cur) { if(!bkp[id]) d++; } return {a, d, m}; }; const eDiff = calcDiff(curEMap, bkpEMap); const tDiff = calcDiff(curTMap, bkpTMap); const diffStr = `📊 復元時の変動予測 (今から過去へ)\n[予定] 復活:+${eDiff.a}件 / 消失:-${eDiff.d}件 / 変更:~${eDiff.m}件\n[タスク] 復活:+${tDiff.a}件 / 消失:-${tDiff.d}件 / 変更:~${tDiff.m}件\n\n`; if(confirm(`${diffStr}本当に ${backups[sel].date} の状態へ巻き戻すか？\n※現在の未送信データなどは上書きされるぞ`)) { dataCache = backupCache; advancedDict = JSON.parse(backups[sel].dict); saveDict(); for(const key in dataCache) saveDataCacheToIDB(key, dataCache[key]); showToast('🔄 データの復元に成功した。再起動するぞ。'); setTimeout(() => location.reload(), 1500); } } }; }

// ==========================================
// 3. 同期エンジン
// ==========================================
async function updateSyncBadge() {
    const badge = document.getElementById('offline-badge'); if (!idb) return;
    const queue = await getSyncQueue(); const count = queue.length;
    if (!navigator.onLine) { badge.innerText = count > 0 ? `⚡️ 圏外 (未送信: ${count}件退避中)` : '⚡️ 完全自律モード (キャッシュ起動)'; badge.style.background = '#ff9500'; badge.classList.add('active'); badge.onclick = null; } 
    else { if (count > 0) { badge.innerText = `🔄 未送信データが ${count} 件あるぞ (タップで管理)`; badge.style.background = 'var(--accent)'; badge.classList.add('active'); badge.onclick = () => { openSyncManager(); }; } else { badge.classList.remove('active'); badge.onclick = null; } }
}
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
let isSyncProcessing = false; // ★究極防壁2：死の二重アップロードを防ぐ絶対ロック

// ★サイレントモードを追加（isSilentがtrueなら画面をロックしない）
async function processSyncQueue(isSilent = false) {
    if (isSyncProcessing) return; // 既に裏で通信中なら弾く（多重送信バグの根絶）
    isSyncProcessing = true;
    try {
        let authErrorOccurred = false; let needsRefresh = false; let totalSuccessCount = 0;
        
        // ★ループ化：キューが完全に空になるまで、何度でも荷物を運び続ける
        while (navigator.onLine && !authErrorOccurred) {
            const queue = await getSyncQueue(); 
            if (queue.length === 0) break;
            
            if (!isSilent) showToast(`🔄 裏で未送信データ(${queue.length}件)を同期中...`);
            
            let batchSuccess = false;
            for (let item of queue) {
                if (authErrorOccurred) break; 
                let retries = 3; let itemSuccess = false;
                while (retries > 0 && !itemSuccess && !authErrorOccurred) {
                    try {
                        await executeApiAction(item.payload, true); await clearSyncQueueItem(item.id); totalSuccessCount++; itemSuccess = true; needsRefresh = true; batchSuccess = true;
                        const action = item.payload; let safeToday = getSafeLocalDateStr();
                        if (!action.start || typeof action.start === 'object') { action.start = (action.start && (action.start.dateTime || action.start.date)) || safeToday; }
                        if (!action.due || typeof action.due === 'object') { action.due = (action.due && (action.due.dateTime || action.due.date)) || safeToday; }
                        const tdStr = action.start || action.due; let td = new Date(); if (tdStr && typeof tdStr === 'string') { if (tdStr.includes('T')) { td = new Date(tdStr); } else { const p = tdStr.split('-'); td = new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2])); } }
                        const monthKey = `${td.getFullYear()}-${td.getMonth()}`;
                        if (dataCache[monthKey]) {
                            if (action.method === 'update') { let targetList = action.type === 'event' ? dataCache[monthKey].events : dataCache[monthKey].tasks; let existing = targetList.find(e => e.id === action.id); if (existing) { if (action.type === 'event') existing.colorId = action.colorId; delete existing._pendingUpdate; } } 
                            else if (action.method === 'delete') { if (action.type === 'event') dataCache[monthKey].events = dataCache[monthKey].events.filter(e => e.id !== action.id); if (action.type === 'task') dataCache[monthKey].tasks = dataCache[monthKey].tasks.filter(t => t.id !== action.id); } 
                        }
                        await sleep(500);
                    } catch (error) {
                        const code = error.status || (error.result && error.result.error && error.result.error.code);
                        const msg = error.message || "";
                        if (code === 401 || code === 403) { authErrorOccurred = true; hideGlobalLoader(); showToast('⚠️ サーバー側で認証エラーが起きた。'); await updateSyncBadge(); } 
                        else if (code === 400 || code === 404 || code === 410 || code === 413) { console.error(`❌ Google拒絶(Code:${code})。不正データ破棄。`); await clearSyncQueueItem(item.id); itemSuccess = true; needsRefresh = true; batchSuccess = true; } 
                        else if (code === 429) { authErrorOccurred = true; showToast('⚠️ Google通信制限(429)。一時中断。'); } 
                        else { 
                            if (msg) showToast(`⚠️ 裏側通信エラー: ${msg}`);
                            retries--; 
                            if (retries > 0) { const backoff = (4 - retries) * 2000; await sleep(backoff); } 
                        }
                    }
                }
            }
            // もしエラーで1つも進まなかったら、無限ループを防ぐため抜ける
            if (!batchSuccess) break;
        }
        
        if (totalSuccessCount > 0 && !isSilent) showToast(`✅ ${totalSuccessCount}件の裏側同期が完了した。`); 
        await updateSyncBadge(); 
        if (needsRefresh) {
            const wrappers = document.querySelectorAll('.month-wrapper');
            for (const wrapper of wrappers) { const parts = wrapper.id.split('-'); if (parts.length === 3) { const y = parseInt(parts[1]); const m = parseInt(parts[2]); const existingMonth = document.getElementById(`month-${y}-${m}`); if (existingMonth && dataCache[`${y}-${m}`]) { existingMonth.remove(); renderMonthDOM(y, m, dataCache[`${y}-${m}`], 'replace'); } } }
            if (typeof selectedDateStr !== 'undefined' && selectedDateStr) { openDailyModal(selectedDateStr, new Date(selectedDateStr).getDay(), true); }
        }
        if (needsRefresh && !authErrorOccurred) {
            setTimeout(async () => {
                const wrappers = document.querySelectorAll('.month-wrapper');
                for (const wrapper of wrappers) { const parts = wrapper.id.split('-'); if (parts.length === 3) { await fetchAndRenderMonth(parseInt(parts[1]), parseInt(parts[2]), 'replace', true); } }
                if (typeof selectedDateStr !== 'undefined' && selectedDateStr) { openDailyModal(selectedDateStr, new Date(selectedDateStr).getDay(), true); }
            }, 2000);
        }
    } finally {
        isSyncProcessing = false; // ★究極防壁2：処理やエラーが終われば確実にロックを解除
    }
}

// ==========================================
// 4. UI 描画（完全体カード生成）
// ==========================================
function getCardHtml(type, item) {
    const isEvent = type === 'event';
    const colorId = isEvent ? item.colorId : extractTaskData(item.notes).colorId;
    let color = isEvent ? (colorId ? GOOGLE_COLORS[colorId] : 'var(--accent)') : (colorId ? GOOGLE_COLORS[colorId] : '#34c759');
    const isPendingInsert = item._localId ? true : false; const isPendingUpdate = item._pendingUpdate ? true : false; const isPendingDelete = item._pendingDelete ? true : false;
    let stateIcon = ''; if (isPendingInsert) stateIcon = ' ➕🔄'; if (isPendingUpdate) stateIcon = ' 📝🔄'; if (isPendingDelete) stateIcon = ' 🗑️';
    
    // ★詳細カードにも変換エンジンを適用し、タイトルとカラーバーをスタンプ色で上書きする
    let rawTitle = isEvent ? (item.summary || '(無名予定)') : (item.title || '(無名タスク)');
    const pData = processSemanticText(rawTitle);
    const title = pData.text + stateIcon;
    if (pData.style) {
        color = pData.style.bg; // カード左端のカラーバーをスタンプ色で染める
    }

    // ★Drive Nexus：添付ファイルの美しいチップ化（PDF対応）
    let driveThumbHtml = '';
    let fileItems = [];
    
    if (isEvent) {
        if (item.attachments && item.attachments.length > 0) {
            item.attachments.forEach(att => {
                let fileId = att.fileId || null;
                if (!fileId && att.fileUrl) { const match = att.fileUrl.match(/d\/([a-zA-Z0-9_-]+)/) || att.fileUrl.match(/id=([a-zA-Z0-9_-]+)/); if (match) fileId = match[1]; }
                if (fileId) { let isImg = att.mimeType && att.mimeType.startsWith('image/'); if (!isImg && att.title) { isImg = !att.title.match(/\.(pdf|doc|docx|xls|xlsx|txt|zip|csv)$/i); } fileItems.push({ id: fileId, title: att.title || 'ファイル', isImg: isImg, base64: att.base64, mimeType: att.mimeType }); }
            });
        }
        // ★Googleに弾かれたDriveリンクも、メモ欄からサルベージして強制的にチップ化する
        const parsedEventNotes = parseTaskAttachments(item.description || '');
        parsedEventNotes.files.forEach(f => {
            if (!fileItems.some(existing => existing.id === f.fileId)) {
                let isImg = f.title.match(/\.(pdf|doc|docx|xls|xlsx|txt|zip|csv)$/i) ? false : true;
                fileItems.push({ id: f.fileId, title: f.title, isImg: isImg, base64: null, mimeType: isImg ? 'image/jpeg' : 'application/pdf' });
            }
        });
    } else if (!isEvent) {
        const parsed = parseTaskAttachments(item.notes);
        parsed.files.forEach(f => {
            let b64 = null; let mType = 'image/jpeg';
            let isImg = f.title.match(/\.(pdf|doc|docx|xls|xlsx|txt|zip|csv)$/i) ? false : true;
            if (!isImg) mType = 'application/pdf';
            if (item.attachments) { const match = item.attachments.find(a => a.fileId === f.fileId); if (match) { b64 = match.base64; mType = match.mimeType; isImg = mType.startsWith('image/'); } }
            fileItems.push({ id: f.fileId, title: f.title, isImg: isImg, base64: b64, mimeType: mType });
        });
    }

    if (fileItems.length > 0) {
        driveThumbHtml = '<div style="display:flex; flex-wrap:nowrap; overflow-x:auto; gap:8px; margin-top:6px; padding-bottom:4px; padding-left:2px; -webkit-overflow-scrolling:touch;">';
        fileItems.forEach(f => {
            const thumbSrc = (f.isImg && f.base64) ? `data:${f.mimeType};base64,${f.base64}` : (f.isImg ? `https://drive.google.com/thumbnail?id=${f.id}&sz=w150-h150` : SAFE_PDF_ICON);
            driveThumbHtml += `
                <div style="position:relative; flex-shrink:0; border-radius:6px; cursor:pointer; box-shadow:0 1px 4px rgba(0,0,0,0.15); overflow:hidden; border:1px solid var(--border);" onclick="event.stopPropagation(); openImageViewer('${f.id}')">
                    <img src="${thumbSrc}" onerror="this.onerror=null; this.src=SAFE_PDF_ICON" loading="lazy" style="height:44px; width:44px; object-fit:cover; display:block; background:#f0f0f0;">
                </div>`;
        });
        driveThumbHtml += '</div>';
    }

    const safeData = encodeURIComponent(JSON.stringify(item));
    const isPending = isPendingInsert || isPendingUpdate || isPendingDelete;
    // ★究極の自律化2（修正版）：未送信データ(dummy_)の連続編集による二重登録・通信エラーの連鎖を物理的に防ぐ止血処理
    const clickFn = isPendingDelete ? `event.stopPropagation(); showToast('⚠️ 削除処理中の亡霊だ。触るな。')` : 
                    isPendingInsert ? `event.stopPropagation(); showToast('⏳ サーバーへ送信中だ。完了するまで少し待て。')` :
                    (isEvent ? `openEditor(JSON.parse(decodeURIComponent('${safeData}')))` : `openTaskEditor(JSON.parse(decodeURIComponent('${safeData}')))`);
    let timeHtml = "";
    if (isEvent) {
        if (item.start && item.start.dateTime) {
            const d = new Date(item.start.dateTime); const timeStr = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
            let endTimeStr = ""; if (item.end && item.end.dateTime) { const ed = new Date(item.end.dateTime); endTimeStr = `${ed.getHours()}:${String(ed.getMinutes()).padStart(2, '0')}`; }
            const fullTimeStr = endTimeStr ? `${timeStr} 〜 ${endTimeStr}` : timeStr;
            timeHtml = `<span class="time-text" onclick="event.stopPropagation(); showTimePopup(this, '${fullTimeStr}', '${color}')" style="margin-right:6px;">${timeStr}</span>`;
        }
    } else { const checkIcon = item.status === 'completed' ? '✅' : '⬜️'; timeHtml = `<span style="font-size:16px; margin-right:6px; cursor:pointer;" onclick="event.stopPropagation(); toggleTaskCompletion('${item.id}', '${item.status === 'completed' ? 'needsAction' : 'completed'}')">${checkIcon}</span>`; }

    let titleStyle = (!isEvent && item.status === 'completed') ? 'text-decoration: line-through; opacity: 0.6;' : '';
    let cardStyle = '';
    
    // ★歴史の沈殿：完了済みのタスクは、カード全体を少し色褪せさせて背景に溶け込ませる
    if (!isEvent && item.status === 'completed') { cardStyle += 'opacity: 0.65; filter: grayscale(20%);'; }
    
    if (isPendingInsert) cardStyle += 'border: 2px dashed #0a84ff; opacity: 0.9;';
    if (isPendingUpdate) cardStyle += 'border: 2px dotted #ff9500; opacity: 0.9;'; 
    if (isPendingDelete) { titleStyle = 'text-decoration: line-through;'; cardStyle += 'opacity: 0.3; filter: grayscale(100%); pointer-events: none;'; }

    // ★究極の自律化3：未送信データでもD&D移動を許可する（削除待機中のみロック）
    const dragAttrs = isPendingDelete ? "" : `draggable="true" data-type="${type}" data-id="${item.id}" ondragstart="handleDragStart(event)"`;

    // ★スマートメモ機能：メモがあれば💬アイコンを表示する
    let memoIconHtml = '';
    const cleanMemoText = isEvent ? (item.description || '').replace(/\[写真添付あり\]/g, '').replace(/📁 添付ファイル:[\s\S]*/, '').trim() : extractTaskData(item.notes).cleanNotes;
    if (cleanMemoText) {
        memoIconHtml = `<div style="width:1px; background:var(--border); margin:0 8px; align-self:stretch;"></div><div style="font-size:16px; cursor:pointer; opacity:0.8; padding:4px; flex-shrink:0; display:flex; align-items:center;" onclick="event.stopPropagation(); openQuickMemo('${item.id}', '${type}')">💬</div>`;
    }

    // ★美しいレイアウト：タイトルと画像を左に寄せ、縦線で区切って右端に💬を配置する
    return `<div class="item-card" onclick="${clickFn}" ${dragAttrs} style="${cardStyle} align-items:stretch;">
                <div class="card-color-bar" style="background-color: ${color};"></div>
                <div class="card-content" style="display:flex; align-items:center; width:100%; padding:6px 0; overflow:hidden;">
                    <div style="display:flex; flex-direction:column; flex:1; overflow:hidden; justify-content:center;">
                        <div style="display:flex; align-items:center; width:100%; ${titleStyle}">
                            ${timeHtml}
                            <div class="card-title" style="flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:14px; font-weight:bold; color:var(--txt);">${title}</div>
                        </div>
                        ${driveThumbHtml}
                    </div>
                    ${memoIconHtml}
                </div>
            </div>`;
}
// ---------------- 以下、カレンダー描画・通信など ----------------
const EMOJI_LIST = [{ cat: "顔・感情", icons: ["😀", "😂", "🥰", "😎", "🤔", "😭", "😡", "😴", "🤯", "😇", "😈", "👻", "👽", "🤖", "💩", "💡", "😆", "😅", "😊", "😉", "😍", "😘", "😋", "😜", "🤪", "🤫", "🤭", "🤮", "🤧", "😷"] }, { cat: "仕事・学校", icons: ["💻", "📱", "📞", "🔋", "📅", "📈", "📂", "✏️", "✂️", "🗑️", "🚩", "⚠️", "✅", "❌", "🏫", "🎓", "💼", "📌", "📎", "📏", "📖", "📚", "📝", "✉️", "📧", "🔍", "🔑", "🔒", "🔓", "🛠️"] }, { cat: "生活・家事", icons: ["🏠", "🛒", "🧹", "👕", "🍽️", "🍳", "🍱", "🍙", "☕", "🍺", "🍷", "💊", "🏥", "🛀", "🛌", "💰", "💳", "🛍️", "🛋️", "🧴", "🧻", "🪥", "🧽", "🗑️", "🧺", "🧷", "🧵", "🧶", "🪴", "✂️"] }, { cat: "動物・自然", icons: ["🐈", "🐕", "🐇", "🐻", "🐤", "🐟", "🌲", "🌸", "🌻", "🍁", "🍄", "🌍", "☀️", "🌙", "⭐", "🔥", "🐭", "🐹", "🦊", "🐼", "🦁", "🐯", "🐮", "🐷", "🐸", "🐵", "🐧", "🦉", "🦋", "🐾"] }, { cat: "建物・場所", icons: ["🏢", "⛩️", "🎡", "♨️", "📍", "🏦", "🏤", "🏥", "🏫", "🏪", "🏰", "🗼", "🗽", "⛪", "🕌", "🛕", "🏟️", "🏕️", "🏖️", "🗻", "🏝️", "🏞️", "🏘️", "🏚️", "🏗️", "🏭", "🏠", "🏡", "⛺", "🚥"] }, { cat: "乗り物・旅行", icons: ["🚗", "🚕", "🚙", "🚌", "🚎", "🏎️", "🚓", "🚑", "🚒", "🚐", "🛻", "🚚", "🚜", "🛴", "🚲", "🛵", "🏍️", "🛺", "🚨", "🚃", "🚄", "🚅", "🚆", "🚇", "🚈", "🚉", "✈️", "🛫", "🛬", "🛳️"] }, { cat: "食事・飲み物", icons: ["🍏", "🍎", "🍐", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🍈", "🍒", "🍑", "🥭", "🍍", "🥥", "🥝", "🍅", "🍆", "🥑", "🥦", "🥬", "🥒", "🌶️", "🌽", "🥕", "🧄", "🧅", "🥔", "🍠", "🥐"] }, { cat: "娯楽・スポーツ", icons: ["🎮", "🎬", "🎵", "🎨", "⚽", "⚾", "🎾", "🏊", "🚴", "🏆", "🎉", "🎂", "🎁", "🎈", "🎫", "🎳", "⛳", "⛸️", "🎣", "🎿", "🏂", "🏋️", "🤸", "⛹️", "🤾", "🎟️", "🎭", "🎪", "🎰", "🧩"] }, { cat: "記号・マーク", icons: ["❤️", "💛", "💚", "💙", "💜", "🖤", "🤍", "💯", "💢", "💬", "💭", "💤", "🎶", "💲", "🔴", "🟠", "🟡", "🟢", "🔵", "🟣", "⚫", "⚪", "🟤", "🟥", "🟧", "🟨", "🟩", "🟦", "🟪"] }];
function loadDict() { const saved = localStorage.getItem('jero_adv_dict'); if (saved) { try { advancedDict = JSON.parse(saved); } catch (e) { advancedDict = JSON.parse(JSON.stringify(DEFAULT_ADV_DICT)); } } else { advancedDict = JSON.parse(JSON.stringify(DEFAULT_ADV_DICT)); } renderDictUI(); }
function saveDict() { localStorage.setItem('jero_adv_dict', JSON.stringify(advancedDict)); renderDictUI(); triggerFullReRender(); }
function renderDictUI() { const container = document.getElementById('dict-list'); if (!container) return; container.innerHTML = ''; if (advancedDict.length === 0) { container.innerHTML = '<div style="color:#888; font-size:12px;">辞書は空だ。</div>'; return; } advancedDict.forEach((item, idx) => { const primary = item.keys[0] || "(接頭辞なし)"; const el = document.createElement('div'); el.className = 'dict-item'; el.innerHTML = `<div class="dict-info"><div>${item.icon} <span style="font-weight:bold;">${primary}</span></div><div><span class="dict-badge" style="background:${item.bg}; color:${item.txt};">Sample</span></div></div><div style="display:flex; flex-direction:column; gap:4px;"><button class="dict-btn-edit" onclick="openDictEditor(${idx})">編集</button><button class="dict-btn-del" onclick="removeDictItem(${idx})">削除</button></div>`; container.appendChild(el); }); }
function openDictEditor(idx = -1) { document.getElementById('dict-editor-modal').classList.add('active'); if (idx >= 0) { const item = advancedDict[idx]; document.getElementById('dict-edit-idx').value = idx; document.getElementById('dict-edit-prefix').value = item.keys[0] || ''; document.getElementById('dict-edit-aliases').value = item.keys.slice(1).join(', '); document.getElementById('dict-edit-icon').innerText = item.icon || '➕ 選択'; document.getElementById('dict-edit-bg').value = item.bg; document.getElementById('dict-edit-txt').value = item.txt; document.getElementById('dict-editor-title').innerText = '辞書編集'; } else { document.getElementById('dict-edit-idx').value = -1; document.getElementById('dict-edit-prefix').value = ''; document.getElementById('dict-edit-aliases').value = ''; document.getElementById('dict-edit-icon').innerText = '➕ 選択'; document.getElementById('dict-edit-bg').value = '#0a84ff'; document.getElementById('dict-edit-txt').value = '#ffffff'; document.getElementById('dict-editor-title').innerText = '新規追加'; } }
function closeDictEditor() { document.getElementById('dict-editor-modal').classList.remove('active'); }
function saveDictItem() { const idx = parseInt(document.getElementById('dict-edit-idx').value); const prefix = document.getElementById('dict-edit-prefix').value.trim(); const aliasesRaw = document.getElementById('dict-edit-aliases').value; const iconRaw = document.getElementById('dict-edit-icon').innerText; const icon = iconRaw === '➕ 選択' ? '' : iconRaw.trim(); const bg = document.getElementById('dict-edit-bg').value; const txt = document.getElementById('dict-edit-txt').value; if (!prefix || !icon) { showToast('接頭辞とアイコンは必須だ。'); return; } let keys = [prefix]; if (aliasesRaw) { const aliases = aliasesRaw.split(',').map(k => k.trim()).filter(k => k); keys = keys.concat(aliases); } const newItem = { keys, icon, bg, txt }; if (idx >= 0) advancedDict[idx] = newItem; else advancedDict.push(newItem); saveDict(); closeDictEditor(); }
function removeDictItem(idx) { advancedDict.splice(idx, 1); saveDict(); }
function openEmojiPicker() { document.getElementById('emoji-picker-modal').classList.add('active'); const container = document.getElementById('emoji-list-container'); if (container.innerHTML !== '') return; let html = ''; EMOJI_LIST.forEach(group => { html += `<div style="font-size:12px; font-weight:bold; color:#888; margin-top:10px; margin-bottom:5px;">${group.cat}</div><div style="display:flex; flex-wrap:wrap; gap:8px;">`; group.icons.forEach(icon => { html += `<div style="font-size:26px; padding:10px; background:var(--head-bg); border:1px solid var(--border); border-radius:8px; cursor:pointer;" onclick="selectEmoji('${icon}')">${icon}</div>`; }); html += `</div>`; }); html += `<div style="margin-top:20px; text-align:center;"><button class="btn-gray" style="padding:10px 20px; border-radius:20px; border:none; color:white; font-weight:bold; cursor:pointer;" onclick="document.getElementById('dict-edit-icon').innerText = '➕ 選択'; closeEmojiPicker(); showToast('一覧にない場合は手入力してくれ。');">その他の絵文字を使う</button></div>`; container.innerHTML = html; }
function closeEmojiPicker() { document.getElementById('emoji-picker-modal').classList.remove('active'); }
function selectEmoji(icon) { document.getElementById('dict-edit-icon').innerText = icon; closeEmojiPicker(); }
function processSemanticText(text) { 
    if (!text) return { text: "", style: null }; 
    let resText = text; let matchStyle = null; 

    // ★部分一致バグの粉砕：辞書とスタンプの全キーワードを集め、文字数の「長い順」にソートする
    let allKeywords = [];
    
    if (typeof customStamps !== 'undefined') {
        customStamps.forEach(stamp => {
            if (stamp.insertText) allKeywords.push({ type: 'stamp', keyword: stamp.insertText, data: stamp });
        });
    }
    if (typeof advancedDict !== 'undefined') {
        advancedDict.forEach(item => {
            if (item.keys) item.keys.forEach(key => allKeywords.push({ type: 'dict', keyword: key, data: item }));
        });
    }
    
    // 文字数の降順（長いものから先に処理）
    allKeywords.sort((a, b) => b.keyword.length - a.keyword.length);

    for (const item of allKeywords) {
        if (resText.includes(item.keyword)) {
            if (item.type === 'stamp') {
                const stamp = item.data;
                resText = resText.split(stamp.insertText).join(stamp.icon + " " + stamp.label);
                
                let hexColor = stamp.baseColor;
                if (!hexColor) {
                    const match = stamp.bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
                    if (match) {
                        const r = parseInt(match[1]).toString(16).padStart(2, '0');
                        const g = parseInt(match[2]).toString(16).padStart(2, '0');
                        const b = parseInt(match[3]).toString(16).padStart(2, '0');
                        hexColor = `#${r}${g}${b}`;
                    } else { hexColor = '#0a84ff'; }
                }
                const txtColor = getContrastYIQ(hexColor);
                if (!matchStyle) matchStyle = { bg: hexColor, txt: txtColor }; // 最初に見つけた色を最優先
            } else if (item.type === 'dict') {
                const dictItem = item.data;
                resText = resText.split(item.keyword).join(dictItem.icon);
                if (!matchStyle) matchStyle = { bg: dictItem.bg, txt: dictItem.txt };
            }
        }
    }

    return { text: resText, style: matchStyle }; 
}
function extractTaskData(notes) { if (!notes) return { colorId: "", recurrence: "", cleanNotes: "" }; let colorId = "", recurrence = "", cleanNotes = notes; const cMatch = cleanNotes.match(/\[c:(\d+)\]/); if (cMatch) { colorId = cMatch[1]; cleanNotes = cleanNotes.replace(/\[c:\d+\]/, ''); } const rMatch = cleanNotes.match(/\[r:([A-Z]+)\]/); if (rMatch) { recurrence = rMatch[1]; cleanNotes = cleanNotes.replace(/\[r:[A-Z]+\]/, ''); } return { colorId, recurrence, cleanNotes: cleanNotes.trim() }; }
function initColorPicker() { const picker = document.getElementById('color-picker'); if (!picker) return; picker.innerHTML = `<div class="color-opt selected" style="background:var(--accent)" onclick="selectColor(this, '')"></div>`; Object.keys(GOOGLE_COLORS).forEach(id => { picker.innerHTML += `<div class="color-opt" style="background:${GOOGLE_COLORS[id]}" onclick="selectColor(this, '${id}')"></div>`; }); }
function selectColor(el, id) { document.querySelectorAll('#color-picker .color-opt').forEach(c => c.classList.remove('selected')); if (el) { el.classList.add('selected'); } else { document.querySelectorAll('#color-picker .color-opt').forEach(c => { if ((id === '' && c.style.background === 'var(--accent)') || c.getAttribute('onclick').includes(`'${id}'`)) c.classList.add('selected'); }); } selectedColorId = id; }
function initTaskColorPicker() { const picker = document.getElementById('task-color-picker'); if (!picker) return; picker.innerHTML = `<div class="color-opt selected" style="background:#34c759" onclick="selectTaskColor(this, '')"></div>`; Object.keys(GOOGLE_COLORS).forEach(id => { picker.innerHTML += `<div class="color-opt" style="background:${GOOGLE_COLORS[id]}" onclick="selectTaskColor(this, '${id}')"></div>`; }); }
function selectTaskColor(el, id) { document.querySelectorAll('#task-color-picker .color-opt').forEach(c => c.classList.remove('selected')); if (el) { el.classList.add('selected'); } else { document.querySelectorAll('#task-color-picker .color-opt').forEach(c => { if ((id === '' && c.style.background === 'rgb(52, 199, 89)') || c.getAttribute('onclick').includes(`'${id}'`)) c.classList.add('selected'); }); } selectedTaskColorId = id; }

function setupObserver() { const options = { rootMargin: '300px', threshold: 0.1 }; observer = new IntersectionObserver((entries) => { entries.forEach(e => { if (e.isIntersecting && !isFetching && !isAuthError) { if (e.target.id === 'bottom-trigger') { loadNextMonth(); } if (e.target.id === 'top-trigger') { loadPrevMonth(); } } }); }, options);['bottom-trigger', 'top-trigger'].forEach(id => { const el = document.getElementById(id); if (el) observer.observe(el); }); }
document.getElementById('scroll-container').addEventListener('scroll', updateHeaderDisplay);
function updateHeaderDisplay() { 
    if (isAuthError) return; 
    // ★スタンプモード中でも年月は正しく表示させるため、ロックを完全撤廃
    const wrappers = document.querySelectorAll('.month-wrapper'); 
    wrappers.forEach(w => { const rect = w.getBoundingClientRect(); if (rect.top < window.innerHeight / 2 && rect.bottom > window.innerHeight / 2) { const md = document.getElementById('month-display'); md.innerText = w.querySelector('.month-title').innerText; md.style.color = 'var(--txt)'; md.style.background = 'transparent'; md.style.boxShadow = 'none'; } }); 
}
function triggerFullReRender() { document.getElementById('calendar-wrapper').innerHTML = ''; renderedMonths = []; const today = new Date(); const y = today.getFullYear(); const m = today.getMonth(); renderMonthDOM(y, m, dataCache[`${y}-${m}`], 'append'); renderedMonths.push({ year: y, month: m }); renderMonthDOM(y, m + 1, dataCache[`${y}-${m + 1}`], 'append'); renderedMonths.push({ year: y, month: m + 1 }); }

function isEventSpanning(eventObj, dateStr) {
    if (!eventObj || !eventObj.start || !eventObj.end) return 'single'; 
    let stDateStr, edDateStr;
    if (eventObj.start.date && eventObj.end.date) { stDateStr = eventObj.start.date; const edDate = new Date(eventObj.end.date); edDate.setDate(edDate.getDate() - 1); edDateStr = `${edDate.getFullYear()}-${String(edDate.getMonth() + 1).padStart(2, '0')}-${String(edDate.getDate()).padStart(2, '0')}`; } 
    else if (eventObj.start.dateTime && eventObj.end.dateTime) { const stD = new Date(eventObj.start.dateTime); stDateStr = `${stD.getFullYear()}-${String(stD.getMonth() + 1).padStart(2, '0')}-${String(stD.getDate()).padStart(2, '0')}`; const edD = new Date(eventObj.end.dateTime); if (edD.getHours() === 0 && edD.getMinutes() === 0) { edD.setDate(edD.getDate() - 1); } edDateStr = `${edD.getFullYear()}-${String(edD.getMonth() + 1).padStart(2, '0')}-${String(edD.getDate()).padStart(2, '0')}`; } 
    else { return 'single'; }
    if (stDateStr === edDateStr) return 'single'; if (dateStr === stDateStr) return 'span-start'; if (dateStr === edDateStr) return 'span-end'; if (dateStr > stDateStr && dateStr < edDateStr) return 'span-mid'; return 'single';
}

function showTimePopup(el, text, colorCode) { document.querySelectorAll('.time-popup').forEach(p => p.remove()); const popup = document.createElement('div'); popup.className = 'time-popup'; popup.style.backgroundColor = colorCode; popup.innerHTML = `${text}<span style="position:absolute; bottom:-4px; left:14px; width:0; height:0; border-left:5px solid transparent; border-right:5px solid transparent; border-top:5px solid ${colorCode};"></span>`; const rect = el.getBoundingClientRect(); popup.style.top = (rect.top - 32) + 'px'; popup.style.left = (rect.left - 4) + 'px'; document.body.appendChild(popup); setTimeout(() => popup.classList.add('show'), 10); setTimeout(() => { popup.classList.remove('show'); setTimeout(() => popup.remove(), 200); }, 2000); }
async function openDailyModal(dateStr, dow, isSilent = false) {
    if (!isSilent) triggerHaptic('light'); // ★触覚：画面の自動更新時は静かにする
    
    selectedDateStr = dateStr; const days = ['日', '月', '火', '水', '木', '金', '土']; const [y, m, d] = dateStr.split('-'); document.querySelectorAll('.day').forEach(el => el.classList.remove('selected')); const selectedCell = document.getElementById(`cell-${dateStr}`); if (selectedCell) selectedCell.classList.add('selected'); document.getElementById('bottom-detail-date').innerHTML = `<span style="font-size:24px; font-weight:300;">${parseInt(d)}</span> <span style="font-size:12px; color:#888;">${days[dow]}</span>`;
    const list = document.getElementById('bottom-detail-list'); list.innerHTML = ''; const monthKey = `${y}-${parseInt(m) - 1}`; const data = dataCache[monthKey]; let hasItems = false; let modalItems = [];
    if (data) { if (data.events) { const events = data.events.filter(e => { if (!e.start) return false; const td = e.start.date || e.start.dateTime; return (td && td.includes(dateStr)) || (isEventSpanning(e, dateStr) !== 'single'); }); events.forEach(e => modalItems.push({ type: 'event', data: e })); } if (data.tasks) { const tasks = data.tasks.filter(t => t.due && t.due.includes(dateStr)); tasks.forEach(t => modalItems.push({ type: 'task', data: t })); } }
    modalItems.sort((a, b) => { const aIsCompleted = a.type === 'task' && a.data.status === 'completed' ? 1 : 0; const bIsCompleted = b.type === 'task' && b.data.status === 'completed' ? 1 : 0; return aIsCompleted - bIsCompleted; });
    
    if (modalItems.length > 0) { 
        hasItems = true; 
        modalItems.forEach(item => { 
            // ★UI最適化：無駄な行を消費する区切り線を廃止し、純粋にカードだけを並べる
            list.innerHTML += getCardHtml(item.type, item.data); 
        }); 
    }
    if (!hasItems) list.innerHTML = `<div style="text-align:center; color:#888; padding: 30px; font-weight: 500;">予定はありません</div>`;
}

function renderMonthDOM(year, month, data, position) {
    if (!data) return; const wrapper = document.createElement('div'); wrapper.className = 'month-wrapper'; wrapper.id = `month-${year}-${month}`; 
    // ★視認性強化：西暦に加えて「令和」の元号を動的に表示する
    const eraStr = year >= 2019 ? ` <span style="font-size:0.8em; color:#888;">(令和${year - 2018}年)</span>` : '';
    wrapper.innerHTML = `<div class="month-title">${year}年${eraStr} ${month + 1}月</div><div class="calendar-grid"></div>`; 
    const grid = wrapper.querySelector('.calendar-grid'); const daysInMonth = new Date(year, month + 1, 0).getDate(); const firstDay = new Date(year, month, 1).getDay(); for (let i = 0; i < firstDay; i++) { const empty = document.createElement('div'); empty.className = 'day empty'; empty.style.backgroundColor = 'var(--head-bg)'; empty.innerHTML = `<div class="day-header"></div>`; grid.appendChild(empty); }
    
    const getEventDuration = (e) => { if (!e || !e.start || !e.end) return 0; if (e.start.date && e.end.date) { return new Date(e.end.date).getTime() - new Date(e.start.date).getTime(); } if (e.start.dateTime && e.end.dateTime) { return new Date(e.end.dateTime).getTime() - new Date(e.start.dateTime).getTime(); } return 0; };
    
// ★Phase 1改善（項目4）：連続する予定（2日以上）を最優先で上に固め、千切れを防ぐ最強のソート
    const sortedEvents = [...data.events].sort((a, b) => { 
        const durA = getEventDuration(a); const durB = getEventDuration(b);
        const isMultiA = durA > 86400000 ? 1 : 0; // 24時間(1日)より長いか
        const isMultiB = durB > 86400000 ? 1 : 0;
        if (isMultiA !== isMultiB) return isMultiB - isMultiA; // 連続予定を絶対的最優先
        
        const isHolA = isHolidayEvent(a.summary) ? 1 : 0;
        const isHolB = isHolidayEvent(b.summary) ? 1 : 0;
        if (isHolA !== isHolB) return isHolB - isHolA; // 次に休日スタンプ
        
        if (durA !== durB) return durB - durA; // 同じ属性なら期間が長い順
        
        const aAllDay = a.start && a.start.date ? 1 : 0; const bAllDay = b.start && b.start.date ? 1 : 0; 
        if (aAllDay !== bAllDay) return bAllDay - aAllDay; 
        
        const tA = a.start && (a.start.dateTime || a.start.date) ? new Date(a.start.dateTime || a.start.date).getTime() : 0; 
        const tB = b.start && (b.start.dateTime || b.start.date) ? new Date(b.start.dateTime || b.start.date).getTime() : 0; 
        if (tA !== tB) return tA - tB; 
        return (a.id || "").localeCompare(b.id || ""); 
    });
    const today = new Date(); const slotMap = {}; for (let i = 1; i <= daysInMonth; i++) { const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`; slotMap[dateStr] = []; }
    sortedEvents.forEach(e => { if (!e.start) return; const occupiedDates = []; for (let i = 1; i <= daysInMonth; i++) { const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`; let isTargetDay = false; if (e.start.date) { isTargetDay = e.start.date === dateStr; } else if (e.start.dateTime) { const stD = new Date(e.start.dateTime); const stStr = `${stD.getFullYear()}-${String(stD.getMonth() + 1).padStart(2, '0')}-${String(stD.getDate()).padStart(2, '0')}`; isTargetDay = stStr === dateStr; } if (isTargetDay || isEventSpanning(e, dateStr) !== 'single') { occupiedDates.push(dateStr); } } if (occupiedDates.length === 0) return; let slotIndex = 0; while (true) { let isFree = true; for (const d of occupiedDates) { if (slotMap[d][slotIndex]) { isFree = false; break; } } if (isFree) break; slotIndex++; } for (const d of occupiedDates) { while (slotMap[d].length <= slotIndex) slotMap[d].push(null); slotMap[d][slotIndex] = e; } });
    
    for (let i = 1; i <= daysInMonth; i++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`; const dayEl = document.createElement('div'); let className = 'day'; const dow = new Date(year, month, i).getDay(); 
        if (dow === 0) dayEl.style.backgroundColor = 'var(--sun)'; 
        if (dow === 6) dayEl.style.backgroundColor = 'var(--sat)'; 
        
        const slots = slotMap[dateStr] || [];
        const hasHoliday = slots.some(e => e && isHolidayEvent(e.summary));
        const isToday = (year === today.getFullYear() && month === today.getMonth() && i === today.getDate());
        let numStyle = '';
        let headerStyle = ''; // ★新設：上の1マス（ヘッダー部分）専用のスタイル
        
        // ★完全理解：セル全体（dayEl）の誤った塗りを剥がし、上の1マス（day-header）だけに色を流し込む
        if (hasHoliday) { 
            className += ' holiday-cell'; 
            headerStyle = 'background-color: var(--holiday-hex) !important; border-bottom: none;'; 
            numStyle = 'color: #ffffff !important;'; 
            dayEl.style.removeProperty('background-color'); 
        }
        if (isToday) { 
            className += ' today'; 
            headerStyle = 'background-color: var(--today-hex) !important; border-bottom: none;'; 
            numStyle = 'color: #ffffff !important;'; 
            dayEl.style.removeProperty('background-color'); 
        }
        
        dayEl.className = className; dayEl.id = `cell-${dateStr}`; dayEl.setAttribute('onclick', `openDailyModal('${dateStr}', ${dow})`); dayEl.setAttribute('ondragover', 'handleDragOver(event)'); dayEl.setAttribute('ondragenter', 'handleDragEnter(event)'); dayEl.setAttribute('ondragleave', 'handleDragLeave(event)'); dayEl.setAttribute('ondrop', `handleDrop(event, '${dateStr}')`); 
// ★上の1マス（day-header）のスタイルに headerStyle を適用する
        dayEl.innerHTML = `<div class="day-header" style="${headerStyle}"><span class="day-num" style="${numStyle}">${i}</span></div>`;
        
        // ★Phase 1改善（項目7）：一日のセル表示制限
        const MAX_DISPLAY = parseInt(localStorage.getItem('jero_max_disp') || '6');
        let currentSlotIdx = 0; let hiddenCount = 0;

        slots.forEach(e => {
            if (currentSlotIdx >= MAX_DISPLAY) { if (e) hiddenCount++; currentSlotIdx++; return; } // 上限を超えたらカウントだけして描画スキップ
            
            if (!e) { const spacer = document.createElement('div'); spacer.className = 'event'; spacer.style.visibility = 'hidden'; spacer.innerHTML = '&nbsp;'; spacer.style.height = '14px'; spacer.style.minHeight = '14px'; spacer.style.flexShrink = '0'; spacer.style.margin = '1px 0'; spacer.style.padding = '0'; spacer.style.border = '1px solid transparent'; spacer.style.boxSizing = 'border-box'; dayEl.appendChild(spacer); currentSlotIdx++; return; }
            const div = document.createElement('div'); div.className = 'event'; let timeStr = ""; if (e.start.dateTime) { const d = new Date(e.start.dateTime); timeStr = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; }
            let spanType = isEventSpanning(e, dateStr); 
            if (dateStr.endsWith('-01') && spanType === 'span-mid') { spanType = 'span-start'; }
            else if (dateStr.endsWith('-01') && spanType === 'span-end') { spanType = 'single'; } 
            
            const isPendingInsert = e._localId ? true : false; const isPendingUpdate = e._pendingUpdate ? true : false; const isPendingDelete = e._pendingDelete ? true : false; let stateIcon = ''; if (isPendingInsert) stateIcon = '➕🔄 '; if (isPendingUpdate) stateIcon = '📝🔄 '; if (isPendingDelete) stateIcon = '🗑️ '; const recurIcon = e.recurrence ? '🔁 ' : ''; const pData = processSemanticText(e.summary); 
            
            let attachIcon = '';
            if (e.attachments && e.attachments.length > 0) { attachIcon = `<span style="margin-left:3px; opacity:0.8;">📎</span>`; }
            div.innerHTML = stateIcon + recurIcon + `<span style="pointer-events:none;">${pData.text}</span>` + attachIcon + (timeStr ? `<span style="pointer-events:none;"> (${timeStr})</span>` : '');
            
            let bgColor = 'var(--accent)'; let txtColor = '#ffffff'; if (pData.style) { bgColor = pData.style.bg; txtColor = pData.style.txt; } else if (e.colorId && GOOGLE_COLORS[e.colorId]) { bgColor = GOOGLE_COLORS[e.colorId]; txtColor = getContrastYIQ(bgColor); }
            div.style.overflow = 'hidden'; div.style.whiteSpace = 'nowrap'; div.style.textOverflow = 'clip'; div.style.position = 'relative'; div.style.zIndex = '1'; div.style.boxSizing = 'border-box'; div.style.fontSize = '10px'; div.style.fontWeight = '700';
            
            if (spanType !== 'single') { 
                div.classList.add('continuous'); div.classList.add(spanType); div.style.background = 'transparent'; div.style.color = bgColor; div.style.borderTop = 'none'; div.style.borderBottom = `3px solid ${bgColor}`; div.style.height = '14px'; div.style.lineHeight = '11px'; div.style.margin = '1px 0'; div.style.padding = '0 2px'; div.style.boxShadow = 'none'; 
                if (spanType === 'span-start') { div.style.borderLeft = 'none'; div.style.borderRadius = '0'; div.style.marginRight = '-6px'; div.style.paddingRight = '6px'; } 
                else if (spanType === 'span-mid') { div.style.borderRadius = '0'; div.style.borderLeft = 'none'; div.style.borderRight = 'none'; div.style.marginLeft = '-6px'; div.style.marginRight = '-6px'; div.style.color = 'transparent'; } 
                else if (spanType === 'span-end') { div.style.borderRight = 'none'; div.style.borderRadius = '0'; div.style.marginLeft = '-6px'; div.style.paddingLeft = '6px'; div.style.color = 'transparent'; } 
            } else { 
                div.classList.add('single'); div.style.background = bgColor; div.style.color = txtColor; div.style.borderRadius = '3px'; div.style.height = '14px'; div.style.lineHeight = '14px'; div.style.margin = '1px 2px'; div.style.padding = '0 3px'; 
            }
            if (isPendingInsert || isPendingUpdate) { div.style.border = `1px dashed ${txtColor}`; div.style.opacity = '0.8'; } if (isPendingDelete) { div.style.textDecoration = 'line-through'; div.style.opacity = '0.3'; div.style.filter = 'grayscale(100%)'; } 
            
            dayEl.appendChild(div);
            currentSlotIdx++;
        });

        if (data.tasks) data.tasks.filter(t => t.due && t.due.includes(dateStr)).forEach(t => {
            if (currentSlotIdx >= MAX_DISPLAY) { hiddenCount++; currentSlotIdx++; return; } // タスクも上限検知
            
            const div = document.createElement('div'); div.className = `task ${t.status === 'completed' ? 'completed' : ''}`; const tData = extractTaskData(t.notes); const pData = processSemanticText(t.title); const recurIcon = tData.recurrence ? '🔁 ' : ''; const isPendingInsert = t._localId ? true : false; const isPendingDelete = t._pendingDelete ? true : false; const insertIcon = isPendingInsert ? '➕🔄 ' : ''; const deleteIcon = isPendingDelete ? '🗑️ ' : '';
            let taskAttachIcon = ''; const parsedNotes = parseTaskAttachments(t.notes || ''); if (parsedNotes.files && parsedNotes.files.length > 0) { taskAttachIcon = `<span style="margin-left:3px; opacity:0.8;">📎</span>`; }
            div.innerHTML = `<span style="opacity:0.8; pointer-events:none;">☑</span> <span style="pointer-events:none;">${deleteIcon}${insertIcon}${recurIcon}${pData.text}</span>${taskAttachIcon}`; 
            
            if (pData.style) { div.style.background = pData.style.bg; div.style.color = pData.style.txt; } else if (tData.colorId && GOOGLE_COLORS[tData.colorId]) { div.style.background = GOOGLE_COLORS[tData.colorId]; div.style.color = getContrastYIQ(GOOGLE_COLORS[tData.colorId]); }
            div.style.height = '14px'; div.style.lineHeight = '14px'; div.style.margin = '1px 2px'; div.style.padding = '0 3px'; div.style.borderRadius = '3px'; div.style.fontSize = '10px'; div.style.boxSizing = 'border-box'; if (isPendingInsert) { div.style.border = `1px dashed var(--txt)`; div.style.opacity = '0.8'; } if (isPendingDelete) { div.style.textDecoration = 'line-through'; div.style.opacity = '0.4'; div.style.filter = 'grayscale(100%)'; } 
            
            dayEl.appendChild(div);
            currentSlotIdx++;
        });

        // ★隠れた予定がある場合「+N件」バッジを追加
        if (hiddenCount > 0) {
            const moreBadge = document.createElement('div');
            moreBadge.innerHTML = `+${hiddenCount}件`;
            moreBadge.style.cssText = 'font-size: 9px; font-weight: bold; color: #888; text-align: center; margin-top: 1px; padding: 1px 0; background: rgba(0,0,0,0.03); border-radius: 4px; pointer-events: none;';
            dayEl.appendChild(moreBadge);
        }

        grid.appendChild(dayEl);    }
    const container = document.getElementById('calendar-wrapper'); if (position === 'append') container.appendChild(wrapper); else if (position === 'prepend') container.insertBefore(wrapper, container.firstChild); else if (position === 'replace') { const children = Array.from(container.children); const insertIndex = children.findIndex(c => { const [_, y, m] = c.id.split('-'); return parseInt(y) > year || (parseInt(y) === year && parseInt(m) > month); }); if (insertIndex === -1) container.appendChild(wrapper); else container.insertBefore(wrapper, children[insertIndex]); }
}

async function initCalendar() { if (isCalendarInited) return; isCalendarInited = true; setProgress(10); try { await loadDataCacheFromIDB(); await rehydrateSyncQueue(); const today = new Date(); const y = today.getFullYear(); const m = today.getMonth(); await fetchAndRenderMonth(y, m, 'append', false); await fetchAndRenderMonth(y, m + 1, 'append', false); scrollToToday(); if (navigator.onLine && !isAuthError) { fetchAndRenderMonth(y, m, 'replace', true); fetchAndRenderMonth(y, m + 1, 'replace', true); } await updateSyncBadge(); } finally { setProgress(100); } }
async function loadNextMonth() { 
    if (renderedMonths.length === 0 || isFetching || isAuthError) return; 
    isFetching = true; 
    document.getElementById('bottom-trigger').classList.remove('hidden'); 
    try { 
        const last = renderedMonths[renderedMonths.length - 1]; 
        let nextY = last.year; let nextM = last.month + 1; 
        if (nextM > 11) { nextM = 0; nextY++; } 
        await fetchAndRenderMonth(nextY, nextM, 'append'); 
    } finally { 
        document.getElementById('bottom-trigger').classList.add('hidden'); 
        setTimeout(() => { isFetching = false; }, 100); // ★連打防止クールタイム
    } 
}

async function loadPrevMonth() { 
    if (renderedMonths.length === 0 || isFetching || isAuthError) return; 
    isFetching = true; 
    const container = document.getElementById('scroll-container'); 
    const topTrigger = document.getElementById('top-trigger'); 
    
    // ★絶対座標(GPS)トラッキング：現在の先頭月（アンカー）の物理位置を記憶する
    const firstMonthEl = document.getElementById(`month-${renderedMonths[0].year}-${renderedMonths[0].month}`);
    const anchorOffset = firstMonthEl ? firstMonthEl.offsetTop : 0;
    const currentScroll = Math.max(0, container.scrollTop); // iOSのマイナスバウンスを0に補正
    const relativeScroll = currentScroll - anchorOffset; 
    
    topTrigger.classList.remove('hidden'); 
    try { 
        const first = renderedMonths[0]; 
        let prevY = first.year; let prevM = first.month - 1; 
        if (prevM < 0) { prevM = 11; prevY--; } 
        await fetchAndRenderMonth(prevY, prevM, 'prepend'); 
    } finally { 
        topTrigger.classList.add('hidden'); 
        // ★DOMの描画確定を待つ
        await new Promise(r => requestAnimationFrame(r));
        
        // ★記憶したアンカーの新しい位置にスクロールを完璧に追従させる（ワープの完全消滅）
        if (firstMonthEl) {
            container.scrollTop = firstMonthEl.offsetTop + relativeScroll;
        }
        
        // ★無限ループ（ワープ）防止のクールタイム
        setTimeout(() => { isFetching = false; }, 100);
    } 
}
function notifyAuthError() { isAuthError = true; localStorage.removeItem('jero_token'); localStorage.removeItem('jero_token_time'); document.getElementById('auth-btn').style.display = 'block'; document.getElementById('auth-btn').classList.add('auth-pulse'); const monthDisp = document.getElementById('month-display'); monthDisp.innerText = '⚠️右上の🔑をタップ'; monthDisp.style.color = '#ff3b30'; }

async function fetchAndRenderMonth(year, month, position = 'append', forceFetch = false) {
    const monthKey = `${year}-${month}`; let needsRender = false;
    if (forceFetch || !dataCache[monthKey]) {
        if (!navigator.onLine) { if (!dataCache[monthKey]) showToast('オフラインのためデータが取得できません。'); return; }
        let events = [], tasks = [];
        try { const url = `${getGasUrl()}?year=${year}&month=${month}`; const response = await fetch(url); const data = await response.json(); if (data.success) { 
            // ★ブラックリストによる幻影の迎撃：遅延で送られてきた「すでに消したはずのデータ」を完全に弾く
            events = (data.events || []).filter(e => !deletedIds.has(e.id)); 
            tasks = (data.tasks || []).filter(t => !deletedIds.has(t.id)); 
        } else { throw new Error(data.error || '不明なサーバーエラー'); } } catch (e) { console.error("GASデータ取得エラー:", e); showToast('通信エラーが発生した。'); return; }
        dataCache[monthKey] = { events, tasks }; saveDataCacheToIDB(monthKey, { events, tasks }); 
        
        // ★最強の防壁：サーバーのデータで上書きした直後、未送信キュー（野戦倉庫）にいる仮アイテムを再合成して点線を保護する
        const queue = await getSyncQueue();
        if (queue.length > 0) { queue.forEach(item => updateLocalCacheForOptimisticUI(item.payload, item.id)); }
        
        needsRender = true;
    } else { if (!document.getElementById(`month-${year}-${month}`)) needsRender = true; }
    if (needsRender) { const existing = document.getElementById(`month-${year}-${month}`); if (existing) existing.remove(); renderMonthDOM(year, month, dataCache[monthKey], position); if (!existing) { if (position === 'append') renderedMonths.push({ year, month }); else if (position === 'prepend') renderedMonths.unshift({ year, month }); } updateHeaderDisplay(); }
}

// ==========================================
// 7. エディタ UI (完全非同期マルチアップロード)
// ==========================================
function renderIconPalette(targetId, inputId) { 
    const palette = document.getElementById(targetId); if (!palette) return; 
    palette.innerHTML = ''; 
    
    // ① 辞書データのボタンを配置
    advancedDict.forEach(item => { 
        if (!item.icon || !item.keys || item.keys.length === 0) return; 
        const prefix = item.keys[0]; 
        const btn = document.createElement('div'); 
        btn.innerHTML = `<span style="font-size:18px;">${item.icon}</span><span style="font-size:10px; color:#666; margin-left:4px; font-weight:bold;">${prefix}</span>`; 
        btn.style.cssText = `display:flex; align-items:center; cursor: pointer; padding: 4px 8px; background: var(--head-bg); border: 1px solid var(--border); border-radius: 8px; flex-shrink: 0; box-shadow: 0 1px 2px rgba(0,0,0,0.05);`; 
        btn.onclick = () => { 
            const inputEl = document.getElementById(inputId); 
            if (!inputEl.value.includes(prefix)) { inputEl.value = prefix + " " + inputEl.value; } 
        }; 
        palette.appendChild(btn); 
    }); 

    // ② スタンプデータのボタンも連動して配置（デザインはスタンプの透明色を活かす）
    if (typeof customStamps !== 'undefined') {
        customStamps.forEach(stamp => {
            if (!stamp.icon || !stamp.insertText) return;
            const btn = document.createElement('div');
            btn.innerHTML = `<span style="font-size:18px;">${stamp.icon}</span><span style="font-size:10px; color:${stamp.baseColor || '#666'}; margin-left:4px; font-weight:bold;">${stamp.label}</span>`;
            btn.style.cssText = `display:flex; align-items:center; cursor: pointer; padding: 4px 8px; background: ${stamp.bg || 'var(--head-bg)'}; border: 1px solid ${stamp.border || 'var(--border)'}; border-radius: 8px; flex-shrink: 0; box-shadow: 0 1px 2px rgba(0,0,0,0.05);`;
            btn.onclick = () => { 
                const inputEl = document.getElementById(inputId); 
                if (!inputEl.value.includes(stamp.insertText)) { 
                    // スタンプは既存の文字があれば末尾に、無ければそのまま追加する
                    inputEl.value = inputEl.value ? inputEl.value + " " + stamp.insertText : stamp.insertText; 
                } 
            };
            palette.appendChild(btn);
        });
    }
}

// ★退避配列（保持する既存データ群と、新規追加するデータ群）
let activeEventAttachments = []; let activeTaskAttachments = [];
let pendingEventAttachments = []; let pendingTaskAttachments = [];
let initialEventAttachments = ""; let initialTaskAttachments = ""; // ★幻影検知: 変更差分を検知するための記憶領域

function openEditor(e = null) {
    if (e && (e._localId || e._pendingUpdate || e._pendingDelete || (e.id && String(e.id).startsWith('dummy_')))) { showToast('⏳ サーバーと通信中のデータだ。完了するまで少し待て。'); return; }
    document.getElementById('overlay').classList.add('active'); document.getElementById('editor-modal').classList.add('active');
    document.getElementById('edit-id').value = e ? e.id : ''; document.getElementById('edit-title').value = e ? e.summary || '' : ''; document.getElementById('edit-loc').value = e ? e.location || '' : '';
    
    const parsedDesc = parseTaskAttachments(e ? e.description || '' : '');
    document.getElementById('edit-desc').value = parsedDesc.cleanText;
    
    const recRuleInput = document.getElementById('edit-recurrence-rule');
    const recDisplay = document.getElementById('edit-recurrence-display');
    if (recRuleInput && recDisplay) {
        if (e && e.recurrence) { recRuleInput.value = JSON.stringify(e.recurrence); recDisplay.innerText = '設定あり(保護中)'; }
        else { recRuleInput.value = ''; recDisplay.innerText = 'なし'; }
    }

    activeEventAttachments = []; pendingEventAttachments = [];
    const previewContainer = document.getElementById('edit-attach-preview');
    if (previewContainer) {
        previewContainer.innerHTML = ''; previewContainer.style.cssText = "display:flex; flex-wrap:wrap; gap:10px; margin-top:8px;";

        if (e && e.attachments && e.attachments.length > 0) {
            e.attachments.forEach(att => {
                const match = att.fileUrl.match(/d\/([a-zA-Z0-9_-]+)/) || att.fileUrl.match(/id=([a-zA-Z0-9_-]+)/);
                if (match) {
                    const fileId = match[1]; 
                    let mType = att.mimeType;
                    if (!mType || mType === 'application/octet-stream') { mType = (att.title && att.title.match(/\.(pdf|doc|docx|xls|xlsx|txt|zip|csv)$/i)) ? 'application/pdf' : 'image/jpeg'; }
                    activeEventAttachments.push({ fileUrl: att.fileUrl, title: att.title, mimeType: mType, fileId: fileId });
                    let isImg = mType.startsWith('image/');
                    const thumbSrc = (isImg && att.base64) ? `data:${mType};base64,${att.base64}` : (isImg ? `https://drive.google.com/thumbnail?id=${fileId}&sz=w150-h150` : SAFE_PDF_ICON);
                    previewContainer.innerHTML += `<div class="preview-item" style="position:relative; display:inline-block; cursor:pointer;" onclick="openImageViewer('${fileId}')"><img src="${thumbSrc}" onerror="this.onerror=null; this.src='${SAFE_PDF_ICON}'" style="height:60px; width:60px; object-fit:cover; border-radius:8px; border:1px solid var(--border); background:#f0f0f0;"><div class="preview-del" onclick="event.stopPropagation(); removeExistingEventAttachment(this, '${fileId}')" style="position:absolute; top:-6px; right:-6px; background:#ff3b30; color:white; border-radius:50%; width:22px; height:22px; text-align:center; line-height:22px; font-size:12px; z-index:10;">✕</div></div>`;
                }
            });
        }
        parsedDesc.files.forEach(f => {
            if (!activeEventAttachments.some(a => a.fileId === f.fileId)) {
                let isImg = f.title.match(/\.(pdf|doc|docx|xls|xlsx|txt|zip|csv)$/i) ? false : true;
                let mType = isImg ? 'image/jpeg' : 'application/pdf';
                activeEventAttachments.push({ fileUrl: f.fileUrl, title: f.title, mimeType: mType, fileId: f.fileId });
                const thumbSrc = isImg ? `https://drive.google.com/thumbnail?id=${f.fileId}&sz=w150-h150` : SAFE_PDF_ICON;
                previewContainer.innerHTML += `<div class="preview-item" style="position:relative; display:inline-block; cursor:pointer;" onclick="openImageViewer('${f.fileId}')"><img src="${thumbSrc}" onerror="this.onerror=null; this.src='${SAFE_PDF_ICON}'" style="height:60px; width:60px; object-fit:cover; border-radius:8px; border:1px solid var(--border); background:#f0f0f0;"><div class="preview-del" onclick="event.stopPropagation(); removeExistingEventAttachment(this, '${f.fileId}')" style="position:absolute; top:-6px; right:-6px; background:#ff3b30; color:white; border-radius:50%; width:22px; height:22px; text-align:center; line-height:22px; font-size:12px; z-index:10;">✕</div></div>`;
            }
        });
    }
    
    selectColor(null, e && e.colorId ? e.colorId : ''); const isAllDay = e && e.start && e.start.date; document.getElementById('edit-allday').checked = !!isAllDay;
    const startInput = document.getElementById('edit-start'); const endInput = document.getElementById('edit-end'); let st = new Date(); let ed = new Date(st.getTime() + 60 * 60 * 1000); if (selectedDateStr && !e) { st = new Date(selectedDateStr + 'T12:00'); ed = new Date(selectedDateStr + 'T13:00'); } if (e && e.start) { st = new Date(e.start.dateTime || e.start.date); ed = new Date(e.end.dateTime || e.end.date); if (isAllDay) ed.setDate(ed.getDate() - 1); }
    startInput.type = isAllDay ? 'date' : 'datetime-local'; endInput.type = isAllDay ? 'date' : 'datetime-local';
    if (isAllDay) { startInput.value = getSafeLocalDateStr(st); endInput.value = getSafeLocalDateStr(ed); } else { const tzOffset = st.getTimezoneOffset() * 60000; startInput.value = new Date(st.getTime() - tzOffset).toISOString().slice(0, 16); endInput.value = new Date(ed.getTime() - tzOffset).toISOString().slice(0, 16); }
    document.getElementById('editor-title').innerText = e ? '予定の編集' : '新規予定'; document.getElementById('btn-delete').style.display = e ? 'block' : 'none'; document.getElementById('btn-duplicate').style.display = e ? 'block' : 'none'; const convertBtn = document.getElementById('btn-convert-task'); if (convertBtn) convertBtn.style.display = e ? 'block' : 'none'; renderIconPalette('event-icon-palette', 'edit-title');
    
    initialEventAttachments = JSON.stringify(activeEventAttachments);
}
function removeExistingEventAttachment(el, fileId) { el.parentElement.remove(); activeEventAttachments = activeEventAttachments.filter(a => a.fileId !== fileId); showToast('🗑️ 添付を外したぞ（※保存で確定/Driveには残る）'); }
function removeExistingTaskAttachment(el, fileId) { el.parentElement.remove(); activeTaskAttachments = activeTaskAttachments.filter(a => a.fileId !== fileId); showToast('🗑️ 添付を外したぞ（※保存で確定/Driveには残る）'); }
function closeEditor() { document.getElementById('editor-modal').classList.remove('active'); if (!document.getElementById('daily-modal').classList.contains('active')) { document.getElementById('overlay').classList.remove('active'); } const prev = document.getElementById('edit-attach-preview'); if(prev) prev.innerHTML = ''; pendingEventAttachments = []; activeEventAttachments = []; if (typeof resetAiEditState === 'function') resetAiEditState(); }
function addUrlPrompt() { const url = prompt("追加する一般のリンク(URL)を入力してくれ:"); if (url) { const desc = document.getElementById('edit-desc'); desc.value = desc.value + (desc.value ? '\n' : '') + url; } }
function addTaskUrlPrompt() { const url = prompt("追加する一般のリンク(URL)を入力してくれ:"); if (url) { const desc = document.getElementById('task-edit-notes'); desc.value = desc.value + (desc.value ? '\n' : '') + url; } }

// ★Phase 2改善（項目2・3）：Driveリンクを自動解析し、サムネイル付き添付ファイルに変換するエンジン
function addDriveLinkPrompt(type) {
    const url = prompt("Google Driveの共有リンク(URL)を貼り付けてくれ:");
    if (!url) return;
    
    const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
    if (!match) { showToast('⚠️ DriveのIDが抽出できない。通常の「リンク」から追加してくれ。'); return; }
    
    const fileId = match[1];
    // ★バグ修正: 新規アップロード待ち(pending)ではなく、既存ファイル(active)として扱うことで保存時の消失を防ぐ
    const attachmentData = { mimeType: 'application/pdf', title: 'Driveファイル', fileUrl: url, fileId: fileId };
    
    const previewContainer = document.getElementById(type === 'event' ? 'edit-attach-preview' : 'task-attach-preview');
    if (previewContainer) previewContainer.style.cssText = "display:flex; flex-wrap:wrap; gap:10px; margin-top:8px;";
    
    const imgDiv = document.createElement('div'); 
    imgDiv.className = 'preview-item'; 
    imgDiv.style.cssText = "position:relative; display:inline-block; cursor:pointer;";
    imgDiv.setAttribute('onclick', `openImageViewer('${fileId}')`);
    
    if (type === 'event') activeEventAttachments.push(attachmentData);
    else activeTaskAttachments.push(attachmentData);
    
    const removeFunc = type === 'event' ? 'removeExistingEventAttachment' : 'removeExistingTaskAttachment';
    const thumbSrc = `https://drive.google.com/thumbnail?id=${fileId}&sz=w150-h150`;
    
    // onerror でPDFアイコンにフォールバック。クリック時の削除処理も既存ファイルの解除関数に委譲する
    imgDiv.innerHTML = `<img src="${thumbSrc}" onerror="this.onerror=null; this.src=SAFE_PDF_ICON" style="height:60px; width:60px; object-fit:cover; border-radius:8px; border:1px solid var(--border); background:#f0f0f0;"><div class="preview-del" onclick="event.stopPropagation(); ${removeFunc}(this, '${fileId}')" style="position:absolute; top:-6px; right:-6px; background:#ff3b30; color:white; border-radius:50%; width:22px; height:22px; text-align:center; line-height:22px; font-size:12px; cursor:pointer; z-index:10;">✕</div>`;
    
    previewContainer.appendChild(imgDiv);
    showToast('✅ Driveリンクを抽出し、添付チップとして追加したぞ。');
}

// ★複数ファイルを圧縮しながら安全にループ処理する
async function handleImageUpload(event, previewId) {
    const files = event.target.files; if (!files || files.length === 0) return;
    const previewContainer = document.getElementById(previewId); previewContainer.style.cssText = "display:flex; flex-wrap:wrap; gap:10px; margin-top:8px;";
    showGlobalLoader('画像圧縮・処理中...');
    
    for (const file of Array.from(files)) {
        let base64Data = ''; let fileBlob = file;
        if (file.type.startsWith('image/')) {
            base64Data = await compressImage(file);
            const byteString = atob(base64Data); const ab = new ArrayBuffer(byteString.length); const ia = new Uint8Array(ab);
            for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
            // ★完全同期：中身をWebPとして正しく宣言し、元のファイル名の拡張子を「.webp」にすげ替える
            fileBlob = new Blob([ab], { type: 'image/webp' }); 
            fileBlob.name = file.name.replace(/\.[^/.]+$/, "") + ".webp";
        } else {
            if (file.size > 15 * 1024 * 1024) { showToast(`❌ ${file.name} は巨大すぎる。弾いたぞ。`); continue; }
            base64Data = await new Promise(r => { const reader = new FileReader(); reader.onload = e => r(e.target.result.split(',')[1]); reader.readAsDataURL(file); });
        }
        const uid = Date.now() + Math.floor(Math.random()*1000);
        // ★修正：バイナリデータ(fileBlob)を通信用の弾薬として追加保持する。不明な場合は拡張子から推論
        const inferredMime = file.name.match(/\.(pdf|doc|docx|xls|xlsx|txt|zip|csv)$/i) ? 'application/pdf' : 'application/octet-stream';
        const attachmentData = { mimeType: fileBlob.type || file.type || inferredMime, name: file.name, base64: base64Data, fileBlob: fileBlob, uid: uid };
        const imgDiv = document.createElement('div'); imgDiv.className = 'preview-item'; imgDiv.style.cssText = "position:relative; display:inline-block;";
        
        const thumbSrc = file.type.startsWith('image/') ? `data:${file.type};base64,${base64Data}` : SAFE_PDF_ICON;

        if (previewId === 'edit-attach-preview') {
            pendingEventAttachments.push(attachmentData);
            imgDiv.innerHTML = `<img src="${thumbSrc}" onerror="this.onerror=null; this.src='${SAFE_PDF_ICON}'" style="height:60px; width:60px; object-fit:cover; border-radius:8px; border:1px solid var(--border); background:#f0f0f0;"><div class="preview-del" onclick="this.parentElement.remove(); pendingEventAttachments = pendingEventAttachments.filter(a => a.uid !== ${uid}); showToast('🗑️ 追加予定の画像をキャンセルした。');" style="position:absolute; top:-6px; right:-6px; background:#ff3b30; color:white; border-radius:50%; width:22px; height:22px; text-align:center; line-height:22px; font-size:12px; cursor:pointer; z-index:10;">✕</div>`;
        } else {
            pendingTaskAttachments.push(attachmentData);
            imgDiv.innerHTML = `<img src="${thumbSrc}" onerror="this.onerror=null; this.src='${SAFE_PDF_ICON}'" style="height:60px; width:60px; object-fit:cover; border-radius:8px; border:1px solid var(--border); background:#f0f0f0;"><div class="preview-del" onclick="this.parentElement.remove(); pendingTaskAttachments = pendingTaskAttachments.filter(a => a.uid !== ${uid}); showToast('🗑️ 追加予定の画像をキャンセルした。');" style="position:absolute; top:-6px; right:-6px; background:#ff3b30; color:white; border-radius:50%; width:22px; height:22px; text-align:center; line-height:22px; font-size:12px; cursor:pointer; z-index:10;">✕</div>`;
        }
        previewContainer.appendChild(imgDiv);
    }
    hideGlobalLoader(); event.target.value = ''; showToast('✅ 処理完了だ。');
}

function toggleTimeInputs() { const isAllDay = document.getElementById('edit-allday').checked; const startInput = document.getElementById('edit-start'); const endInput = document.getElementById('edit-end'); let startVal = startInput.value; let endVal = endInput.value; startInput.type = isAllDay ? 'date' : 'datetime-local'; endInput.type = isAllDay ? 'date' : 'datetime-local'; if (startVal) startInput.value = isAllDay ? startVal.split('T')[0] : (startVal.includes('T') ? startVal : startVal + 'T12:00'); if (endVal) endInput.value = isAllDay ? endVal.split('T')[0] : (endVal.includes('T') ? endVal : endVal + 'T13:00'); }

let isSavingLock = false; // ★通常保存・削除の連打防止ロック
async function saveEvent() {
    if (isSavingLock) return; isSavingLock = true; setTimeout(() => isSavingLock = false, 1000);
    triggerHaptic('success'); // ★触覚：保存
    const id = document.getElementById('edit-id').value; const title = document.getElementById('edit-title').value.trim(); if (!title) { showToast('タイトルを入力してくれ'); return; }
    const isAllDay = document.getElementById('edit-allday').checked; let startVal = document.getElementById('edit-start').value; let endVal = document.getElementById('edit-end').value; if (!startVal) { showToast('開始日時が不正だ'); return; } if (!endVal) endVal = startVal;
    
    // ★予定の死角保護2：終了時間が開始時間より前になる「時間逆転バグ」を強制補正する
    if (!isAllDay && new Date(startVal) > new Date(endVal)) endVal = startVal;

    const action = { type: 'event', method: id ? 'update' : 'insert', id: id, title: title, location: document.getElementById('edit-loc').value, description: document.getElementById('edit-desc').value, colorId: selectedColorId };
    
    // ★予定の死角保護3：退避しておいた繰り返しルールをパケットに乗せ、Google側での消失を防ぐ
    const recRuleInput = document.getElementById('edit-recurrence-rule');
    if (recRuleInput && recRuleInput.value) {
        try { action.recurrence = JSON.parse(recRuleInput.value); } catch(e) {}
    }
    
    // ★完全結合ルール：変更の有無に関わらず、既存の添付ファイルがあるなら必ずフラグを立てて再結合させる
    const isAttachmentsChanged = (pendingEventAttachments.length > 0) || (JSON.stringify(activeEventAttachments) !== initialEventAttachments);
    if (isAttachmentsChanged || activeEventAttachments.length > 0) {
        action.keptAttachments = activeEventAttachments;
        action.attachmentsModified = true;
        if (pendingEventAttachments.length > 0) action.attachments = pendingEventAttachments;
    }

    try { if (isAllDay) { action.start = startVal; let parts = endVal.split('-'); const ed = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])); ed.setDate(ed.getDate() + 1); action.end = getSafeLocalDateStr(ed); } else { action.start = startVal + ':00+09:00'; action.end = endVal + ':00+09:00'; } } catch (err) { showToast('エラーが起きた。もう一度頼む。'); return; }
    
    // ★AIインターセプト：検閲モード中の保存なら、野戦倉庫へは送らずに検閲リストを上書きして終わる
    if (typeof handleAiEditIntercept === 'function' && handleAiEditIntercept(action, 'event')) return;

    closeEditor(); closeAllModals(); await dispatchManualAction(action);
}

async function confirmDeleteEvent() { if (isSavingLock) return; const id = document.getElementById('edit-id').value; if (!id || !confirm('この予定を完全に消し去るか？')) return; triggerHaptic('heavy'); // ★触覚：削除
isSavingLock = true; setTimeout(() => isSavingLock = false, 1000); const startVal = document.getElementById('edit-start').value; const action = { type: 'event', method: 'delete', id: id, start: startVal }; closeEditor(); closeAllModals(); await dispatchManualAction(action); }
function duplicateEvent() { document.getElementById('edit-id').value = ''; document.getElementById('editor-title').innerText = '新規予定 (複製)'; document.getElementById('btn-delete').style.display = 'none'; document.getElementById('btn-duplicate').style.display = 'none'; const convertBtn = document.getElementById('btn-convert-task'); if (convertBtn) convertBtn.style.display = 'none'; showToast('複製モードだ。保存を押せ。'); }

function openTaskEditor(t = null) {
    if (t && (t._localId || t._pendingUpdate || t._pendingDelete || (t.id && String(t.id).startsWith('dummy_')))) { showToast('⏳ サーバーと通信中のデータだ。完了するまで少し待て。'); return; }
    document.getElementById('overlay').classList.add('active'); document.getElementById('task-editor-modal').classList.add('active');
    document.getElementById('task-edit-id').value = t ? t.id : ''; document.getElementById('task-edit-title').value = t ? t.title || '' : '';
    
    activeTaskAttachments = []; pendingTaskAttachments = [];
    const parsed = parseTaskAttachments(t ? t.notes || '' : '');
    const extractedData = extractTaskData(parsed.cleanText);
    document.getElementById('task-edit-notes').value = extractedData.cleanNotes;
    
    const recSelect = document.getElementById('task-edit-recurrence');
    if (recSelect) recSelect.value = t ? extractedData.recurrence : '';
    
    const statusCheckbox = document.getElementById('task-edit-status');
    const statusText = document.getElementById('task-edit-status-text');
    const isCompleted = t && t.status === 'completed';
    if (statusCheckbox && statusText) {
        statusCheckbox.checked = isCompleted;
        statusText.innerText = isCompleted ? '完了済' : '未完了';
        statusText.style.color = isCompleted ? '#34c759' : '#888';
    }
    
    const previewContainer = document.getElementById('task-attach-preview');
    if (previewContainer) {
        previewContainer.innerHTML = ''; previewContainer.style.cssText = "display:flex; flex-wrap:wrap; gap:10px; margin-top:8px;";

        parsed.files.forEach(f => {
            let isImg = f.title.match(/\.(pdf|doc|docx|xls|xlsx|txt|zip|csv)$/i) ? false : true;
            let currentMime = isImg ? 'image/jpeg' : 'application/pdf';
            let thumbSrc = isImg ? `https://drive.google.com/thumbnail?id=${f.fileId}&sz=w150-h150` : SAFE_PDF_ICON;
            if (t && t.attachments) { const match = t.attachments.find(a => a.fileId === f.fileId); if (match) { currentMime = match.mimeType || currentMime; if (currentMime === 'application/octet-stream') currentMime = isImg ? 'image/jpeg' : 'application/pdf'; isImg = currentMime.startsWith('image/'); if (isImg && match.base64) thumbSrc = `data:${currentMime};base64,${match.base64}`; else if (!isImg) thumbSrc = SAFE_PDF_ICON; } }
            activeTaskAttachments.push({ title: f.title, fileUrl: f.fileUrl, fileId: f.fileId, mimeType: currentMime });
            previewContainer.innerHTML += `<div class="preview-item" style="position:relative; display:inline-block; cursor:pointer;" onclick="openImageViewer('${f.fileId}')"><img src="${thumbSrc}" onerror="this.onerror=null; this.src='${SAFE_PDF_ICON}'" style="height:60px; width:60px; object-fit:cover; border-radius:8px; border:1px solid var(--border); background:#f0f0f0;"><div class="preview-del" onclick="event.stopPropagation(); removeExistingTaskAttachment(this, '${f.fileId}')" style="position:absolute; top:-6px; right:-6px; background:#ff3b30; color:white; border-radius:50%; width:22px; height:22px; text-align:center; line-height:22px; font-size:12px; z-index:10;">✕</div></div>`;
        });
    }
    
    selectTaskColor(null, t ? extractTaskData(t.notes).colorId : '');
    const dueInput = document.getElementById('task-edit-due'); if (t && t.due) { dueInput.value = getSafeLocalDateStr(new Date(t.due)); } else { dueInput.value = selectedDateStr || getSafeLocalDateStr(); }
    document.getElementById('task-editor-title').innerText = t ? 'タスクの編集' : '新規タスク'; document.getElementById('task-btn-delete').style.display = t ? 'block' : 'none'; const convertBtn = document.getElementById('btn-convert-event'); if (convertBtn) convertBtn.style.display = t ? 'block' : 'none'; renderIconPalette('task-icon-palette', 'task-edit-title');
    
    initialTaskAttachments = JSON.stringify(activeTaskAttachments);
}
function closeTaskEditor() { document.getElementById('task-editor-modal').classList.remove('active'); if (!document.getElementById('daily-modal').classList.contains('active')) { document.getElementById('overlay').classList.remove('active'); } const prev = document.getElementById('task-attach-preview'); if(prev) prev.innerHTML = ''; pendingTaskAttachments = []; activeTaskAttachments = []; if (typeof resetAiEditState === 'function') resetAiEditState(); }

async function toggleTaskCompletion(taskId, newStatus) { 
    triggerHaptic(newStatus === 'completed' ? 'success' : 'light'); // ★触覚：タスク完了
    let targetTask = null; 
    for (const key in dataCache) { if (dataCache[key].tasks) { targetTask = dataCache[key].tasks.find(t => t.id === taskId); if (targetTask) break; } } 
    if (!targetTask) return; 
    
    // ★異常精査による浄化：司令塔(dispatchManualAction)が完璧にUIを自動更新するため、ここでの重複した画面書き換え（5重レンダリングのCPUスパイク）を完全に削ぎ落とす
    
    // ★大手術：古い直接通信を破壊し、最強の司令塔へ丸投げする
    const payload = { type: 'task', method: 'update', id: taskId, title: targetTask.title, description: targetTask.notes || '', due: targetTask.due, status: newStatus }; 
    // ★絶対防壁：完了操作時に添付ファイルが消し飛ぶバグを防ぐため、引継ぎフラグを強制付与
    if (targetTask.attachments && targetTask.attachments.length > 0) {
        payload.keptAttachments = targetTask.attachments;
        payload.attachmentsModified = true;
    }
    
    await dispatchManualAction(payload); // 野戦倉庫・UI更新・裏側通信のすべてを自動化
}

async function saveTask() {
    if (isSavingLock) return; isSavingLock = true; setTimeout(() => isSavingLock = false, 1000);
    triggerHaptic('success'); // ★触覚：保存
    const id = document.getElementById('task-edit-id').value; const title = document.getElementById('task-edit-title').value.trim(); if (!title) { showToast('タスク名を入力してくれ'); return; }
    let rawNotes = document.getElementById('task-edit-notes').value.trim(); if (selectedTaskColorId) { rawNotes += (rawNotes ? '\n' : '') + `[c:${selectedTaskColorId}]`; }
    
    // ★新設：すっぽ抜けていた「繰り返し設定」の永続化
    const recSelect = document.getElementById('task-edit-recurrence');
    if (recSelect && recSelect.value) { rawNotes += (rawNotes ? '\n' : '') + `[r:${recSelect.value}]`; }
    
    // ★修正: 状態の保存を追加
    const isCompleted = document.getElementById('task-edit-status') ? document.getElementById('task-edit-status').checked : false;
    const action = { type: 'task', method: id ? 'update' : 'insert', id: id, title: title, description: rawNotes, status: isCompleted ? 'completed' : 'needsAction' };
    
    // ★完全結合ルール：変更の有無に関わらず、既存の添付ファイルがあるなら必ずフラグを立てて再結合させる
    const isAttachmentsChanged = (pendingTaskAttachments.length > 0) || (JSON.stringify(activeTaskAttachments) !== initialTaskAttachments);
    if (isAttachmentsChanged || activeTaskAttachments.length > 0) {
        action.keptAttachments = activeTaskAttachments;
        action.attachmentsModified = true;
        if (pendingTaskAttachments.length > 0) action.attachments = pendingTaskAttachments;
    }
    
    const dueVal = document.getElementById('task-edit-due').value; if (dueVal) { action.due = dueVal + 'T00:00:00+09:00'; }

    // ★AIインターセプト：検閲モード中の保存なら、野戦倉庫へは送らずに検閲リストを上書きして終わる
    if (typeof handleAiEditIntercept === 'function' && handleAiEditIntercept(action, 'task')) return;

    closeTaskEditor(); closeAllModals(); await dispatchManualAction(action);
}

async function confirmDeleteTask() { if (isSavingLock) return; const id = document.getElementById('task-edit-id').value; if (!id || !confirm('完全に消し去るか？')) return; triggerHaptic('heavy'); // ★触覚：削除
isSavingLock = true; setTimeout(() => isSavingLock = false, 1000); const dueVal = document.getElementById('task-edit-due').value; const action = { type: 'task', method: 'delete', id: id, due: dueVal }; closeTaskEditor(); closeAllModals(); await dispatchManualAction(action); }

let isConverting = false; // ★連打防止の絶対ロック
async function executeConversion(fromType) {
    if (isConverting) return; // ★連打されたら冷酷に弾く
    if (pendingEventAttachments.length > 0 || pendingTaskAttachments.length > 0) { showToast('⚠️ 追加中のファイルがある。先に保存しろ。'); return; }
    if (!confirm(`この${fromType === 'event' ? '予定をタスク' : 'タスクを予定'}に変換して良いか？\n元のデータは消去されるぞ。`)) return; 
    
    isConverting = true;
    try {
        let deleteAction = null; let insertAction = null; let redrawDate = new Date();
    
    if (fromType === 'event') { 
        const id = document.getElementById('edit-id').value; 
        const title = document.getElementById('edit-title').value.trim(); 
        if (!title) { showToast('タイトルがないと変換できないぞ。'); return; }
        const startVal = document.getElementById('edit-start').value; 
        const endVal = document.getElementById('edit-end').value;
        const locVal = document.getElementById('edit-loc').value.trim();
        const notes = document.getElementById('edit-desc').value; 
        const colorId = selectedColorId; 
        if (id) deleteAction = { type: 'event', method: 'delete', id: id, start: startVal }; 
        
        let rawNotes = notes; 
        if (locVal) rawNotes = `📍 場所: ${locVal}\n` + rawNotes;
        if (startVal && startVal.includes('T')) {
            const stStr = startVal.replace('T', ' '); const edStr = endVal && endVal.includes('T') ? endVal.replace('T', ' ') : '';
            rawNotes = `⏰ 予定時間: ${stStr} 〜 ${edStr}\n` + rawNotes;
        }
        if (colorId) rawNotes += (rawNotes ? '\n' : '') + `[c:${colorId}]`; 
        
        let dueIso = ''; 
        if (startVal) { 
            let dStr = startVal.includes('T') ? startVal.split('T')[0] : startVal; 
            let parts = dStr.split('-'); 
            redrawDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])); 
            dueIso = dStr + 'T00:00:00.000Z'; 
        } 
        insertAction = { type: 'task', method: 'insert', title: title, description: rawNotes, due: dueIso }; 
        if (activeEventAttachments && activeEventAttachments.length > 0) {
            insertAction.keptAttachments = activeEventAttachments.map(a => {
                let inferredMime = a.title.match(/\.(pdf|doc|docx|xls|xlsx|txt|zip|csv)$/i) ? 'application/pdf' : 'image/jpeg';
                let finalMime = (!a.mimeType || a.mimeType === 'application/octet-stream') ? inferredMime : a.mimeType;
                return { ...a, mimeType: finalMime };
            });
            insertAction.attachmentsModified = true; // ★追加：画像引継ぎフラグを確実におっ立てる
        }
    } else { 
        const id = document.getElementById('task-edit-id').value; 
        const title = document.getElementById('task-edit-title').value.trim(); 
        if (!title) { showToast('タスク名がないと変換できないぞ。'); return; }
        const dueVal = document.getElementById('task-edit-due').value; 
        let notesVal = document.getElementById('task-edit-notes').value; 
        const colorId = selectedTaskColorId; 
        if (id) deleteAction = { type: 'task', method: 'delete', id: id, due: dueVal }; 
        
        let locMatch = notesVal.match(/📍 場所:\s*(.+)/);
        let locationStr = locMatch ? locMatch[1] : '';
        notesVal = notesVal.replace(/📍 場所:\s*(.+)\n?/, '');
        
        insertAction = { type: 'event', method: 'insert', title: title, description: notesVal, location: locationStr, colorId: colorId }; 
        
        // ★真の完全引継ぎ：タスクの添付ファイルも、予定の「純正添付ファイル」としてGASへ安全に引き渡す
        if (activeTaskAttachments && activeTaskAttachments.length > 0) {
            insertAction.keptAttachments = activeTaskAttachments.map(a => {
                let inferredMime = a.title.match(/\.(pdf|doc|docx|xls|xlsx|txt|zip|csv)$/i) ? 'application/pdf' : 'image/jpeg';
                let finalMime = (!a.mimeType || a.mimeType === 'application/octet-stream') ? inferredMime : a.mimeType;
                return { ...a, mimeType: finalMime };
            });
            insertAction.attachmentsModified = true; // ★追加：画像引継ぎフラグを確実におっ立てる
        } 
        if (dueVal) { 
            let parts = dueVal.split('-'); 
            redrawDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])); 
            insertAction.start = dueVal; 
            const ed = new Date(redrawDate); ed.setDate(ed.getDate() + 1); 
            insertAction.end = getSafeLocalDateStr(ed); 
        } else { 
            insertAction.start = getSafeLocalDateStr(); const tmrw = new Date(); tmrw.setDate(tmrw.getDate() + 1); insertAction.end = getSafeLocalDateStr(tmrw); 
        } 
    }
    
    closeEditor(); closeTaskEditor(); closeAllModals();
    
    // ★司令塔(dispatchManualAction)への完全委譲。オプティミスティックUIも野戦倉庫も自動で効く
    if (deleteAction) await dispatchManualAction(deleteAction);
    await dispatchManualAction(insertAction);
    
    } finally {
        isConverting = false; // ★処理が終われば確実に出口でロック解除
    }
}

// ==========================================
// 8. アクション司令塔 
// ==========================================
// ★ヘルパー：表示中の「全ての月」を一斉に再描画する
function refreshAllVisibleMonths() {
    const wrappers = document.querySelectorAll('.month-wrapper');
    for (const wrapper of wrappers) {
        const parts = wrapper.id.split('-');
        if (parts.length === 3) {
            const y = parseInt(parts[1]); const m = parseInt(parts[2]);
            wrapper.remove();
            if (dataCache[`${y}-${m}`]) renderMonthDOM(y, m, dataCache[`${y}-${m}`], 'replace');
        }
    }
    // ★バグ根絶：削除済みの古いモード変数を参照してシステムがクラッシュするのを防ぐ
    if (typeof selectedDateStr !== 'undefined' && selectedDateStr) { 
        openDailyModal(selectedDateStr, new Date(selectedDateStr).getDay(), true); 
    }
}

async function dispatchManualAction(action) {
    let msgAction = action.method === 'insert' ? '追加' : action.method === 'update' ? '更新' : '削除'; const msgType = action.type === 'event' ? '予定' : 'タスク'; let safeToday = getSafeLocalDateStr();
    if (action.method === 'delete' && action.id) deletedIds.add(action.id);
    if (!action.start || typeof action.start === 'object') { action.start = (action.start && (action.start.dateTime || action.start.date)) || safeToday; } if (!action.end || typeof action.end === 'object') { action.end = (action.end && (action.end.dateTime || action.end.date)) || action.start; } if (!action.due || typeof action.due === 'object') { action.due = (action.due && (action.due.dateTime || action.due.date)) || safeToday; }

    // ★絶対防壁：システム内部で「0日間の予定」になるのを防ぐ
    if (action.type === 'event' && action.start && !action.start.includes('T') && action.start === action.end) {
        const parts = action.start.split('-');
        if(parts.length === 3) {
            const ed = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
            ed.setDate(ed.getDate() + 1);
            action.end = `${ed.getFullYear()}-${String(ed.getMonth() + 1).padStart(2, '0')}-${String(ed.getDate()).padStart(2, '0')}`;
        }
    }

    // ★第1層：オプティミスティックUI（仮IDで即座に画面反映）
    const tempLocalId = 'temp_' + Date.now() + '_' + Math.floor(Math.random()*1000);
    updateLocalCacheForOptimisticUI(action, tempLocalId);
    refreshAllVisibleMonths();

    // ★第2層：ハブ＆スポーク（すべての操作を必ずローカルキューへ通し、永続化）
    const localId = await saveToSyncQueue(action);
    updateLocalCacheForOptimisticUI(action, localId, tempLocalId);
    refreshAllVisibleMonths();
    await updateSyncBadge();

    // ★第3層：バックグラウンド通信網へ完全委譲
    if (navigator.onLine) {
        showToast(`✅ ${msgType}の${msgAction}を指示した`);
        processSyncQueue(true); // 裏で一斉送信と再取得を自動化
    } else {
        showToast(`📦 圏外だ。退避した。`);
    }
}

function updateLocalCacheForOptimisticUI(action, localId, replaceTempId = null) {
    let safeToday = getSafeLocalDateStr(); if (!action.start || typeof action.start === 'object') { action.start = (action.start && (action.start.dateTime || action.start.date)) || safeToday; } if (!action.end || typeof action.end === 'object') { action.end = (action.end && (action.end.dateTime || action.end.date)) || action.start; } if (!action.due || typeof action.due === 'object') { action.due = (action.due && (action.due.dateTime || action.due.date)) || safeToday; }
    
    // ★真の月跨ぎ対応：開始月から終了月までの「全ての月」のキー（配列）を生成し、全方位にキャッシュを配備する
    let targetMonthKeys = [];
    if (action.type === 'event' && action.start && action.end) {
        let stD = action.start.includes('T') ? new Date(action.start) : new Date(action.start + 'T00:00:00');
        let edD = action.end.includes('T') ? new Date(action.end) : new Date(action.end + 'T00:00:00');
        if (edD < stD) edD = stD;
        let currD = new Date(stD.getFullYear(), stD.getMonth(), 1);
        while (currD <= edD) { targetMonthKeys.push(`${currD.getFullYear()}-${currD.getMonth()}`); currD.setMonth(currD.getMonth() + 1); }
    } else {
        let tdStr = action.start || action.due; let td = new Date(); if (tdStr && typeof tdStr === 'string') { if (tdStr.includes('T')) { td = new Date(tdStr); } else { const p = tdStr.split('-'); td = new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2])); } }
        targetMonthKeys.push(`${td.getFullYear()}-${td.getMonth()}`);
    }
    
    // 存在しない月のキャッシュを事前生成
    targetMonthKeys.forEach(mKey => { if (!dataCache[mKey]) dataCache[mKey] = { events: [], tasks: [] }; });

    if (replaceTempId) { 
        for (const key in dataCache) {
            const list = action.type === 'event' ? dataCache[key].events : dataCache[key].tasks;
            if (list) {
                const itemToReplace = list.find(item => item._localId === replaceTempId); 
                if (itemToReplace) { itemToReplace._localId = localId; itemToReplace.id = 'dummy_' + localId; } // returnせずに全月舐める
            }
        }
        return; 
    }
    
    let tempAttachments = [];
    if (action.keptAttachments) tempAttachments = tempAttachments.concat(action.keptAttachments.map(a => ({ fileUrl: a.fileUrl || `https://drive.google.com/file/d/${a.fileId}`, title: a.title, mimeType: a.mimeType, fileId: a.fileId })));
    if (action.attachments) tempAttachments = tempAttachments.concat(action.attachments.map(a => ({ fileUrl: `https://drive.google.com/file/d/dummy_${a.uid}`, title: a.name, mimeType: a.mimeType, fileId: `dummy_${a.uid}`, base64: a.base64 })));
    
    let taskNotesWithAtt = action.description || '';
    if (tempAttachments.length > 0) {
        const fileLinks = tempAttachments.map(a => `📁 [${a.title}] ${a.fileUrl}`).join('\n');
        taskNotesWithAtt = taskNotesWithAtt.replace(/\[写真添付あり\]/g, '').replace(/📁 添付ファイル:[\s\S]*/g, '').trim() + (taskNotesWithAtt ? '\n\n' : '') + '📁 添付ファイル:\n' + fileLinks;
    }

    // ★アーキテクチャの共通化：アイテムを整形する専用のビルダ関数を定義し、予定とタスクの生成ロジックを統合する
    const buildCommonItem = (baseId) => {
        if (action.type === 'event') {
            return { id: baseId, summary: action.title, location: action.location, description: action.description, start: action.start.includes('T') ? { dateTime: action.start } : { date: action.start }, end: action.end ? (action.end.includes('T') ? { dateTime: action.end } : { date: action.end }) : null, colorId: action.colorId, attachments: tempAttachments, recurrence: action.recurrence };
        } else {
            return { id: baseId, title: action.title, notes: action.attachmentsModified ? taskNotesWithAtt : action.description, due: action.due, status: action.status || 'needsAction', attachments: action.attachmentsModified ? tempAttachments : undefined };
        }
    };

    if (action.method === 'insert') { 
        const newItem = { ...buildCommonItem('dummy_' + localId), _localId: localId };
        targetMonthKeys.forEach(mKey => {
            const list = action.type === 'event' ? dataCache[mKey].events : dataCache[mKey].tasks;
            if (!list.some(item => item._localId === localId)) list.push({ ...newItem });
        });
    } 
    else if (action.method === 'update') { 
        let oldItem = null;
        for (const key in dataCache) {
            const list = action.type === 'event' ? dataCache[key].events : dataCache[key].tasks;
            if (list) { const idx = list.findIndex(e => e.id === action.id); if (idx !== -1) { oldItem = list[idx]; list.splice(idx, 1); } }
        }
        if (!oldItem) oldItem = { id: action.id, status: action.type === 'task' ? 'needsAction' : undefined }; 
        
        const updatedItem = { ...oldItem, ...buildCommonItem(action.id), _pendingUpdate: true };
        // ★絶対防壁：予定もタスクも、画像に変更指示がない場合は、UI上の既存画像を完全に保護する
        if (!action.attachmentsModified && oldItem.attachments) {
            updatedItem.attachments = oldItem.attachments;
        }
        
        targetMonthKeys.forEach(mKey => {
            const list = action.type === 'event' ? dataCache[mKey].events : dataCache[mKey].tasks;
            list.push({ ...updatedItem });
        });
    } 
    else if (action.method === 'delete') { 
        for (const key in dataCache) {
            const list = action.type === 'event' ? dataCache[key].events : dataCache[key].tasks;
            if (list) { const existing = list.find(item => item.id === action.id); if (existing) existing._pendingDelete = true; }
        }
    }
}

async function rehydrateSyncQueue() { const queue = await getSyncQueue(); for (const item of queue) { updateLocalCacheForOptimisticUI(item.payload, item.id); } }
async function executeApiAction(action, isRetry = false) {
    if (!navigator.onLine) throw new Error("Offline"); const payload = JSON.parse(JSON.stringify(action)); payload.title = payload.title || "(無名)"; payload.description = payload.description || ""; payload.location = payload.location || "";
    if (payload.type === 'event') { 
        if (payload.start && typeof payload.start === 'object') payload.start = payload.start.dateTime || payload.start.date || ""; 
        if (payload.end && typeof payload.end === 'object') payload.end = payload.end.dateTime || payload.end.date || ""; 
        if (!payload.start || typeof payload.start !== 'string') { payload.start = getSafeLocalDateStr(); } 
        if (!payload.end || typeof payload.end !== 'string') payload.end = payload.start; 
        
        // ★真・絶対防壁：GASへ送る直前、開始と終了が完全に一致(0日間/0分間)なら強制的に時間を広げる
        if (payload.start && payload.start === payload.end) {
            if (payload.start.includes('T')) {
                // 時間指定の場合：終了時間を開始の「1時間後」に強制補正
                let stDate = new Date(payload.start);
                stDate.setHours(stDate.getHours() + 1);
                const pad = (n) => String(n).padStart(2, '0');
                payload.end = `${stDate.getFullYear()}-${pad(stDate.getMonth()+1)}-${pad(stDate.getDate())}T${pad(stDate.getHours())}:${pad(stDate.getMinutes())}:${pad(stDate.getSeconds())}+09:00`;
            } else {
                // 終日予定の場合：終了日を「翌日」に強制補正
                const parts = payload.start.split('-');
                if(parts.length === 3) {
                    const ed = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                    ed.setDate(ed.getDate() + 1);
                    payload.end = `${ed.getFullYear()}-${String(ed.getMonth() + 1).padStart(2, '0')}-${String(ed.getDate()).padStart(2, '0')}`;
                }
            }
        }
        
        if (payload.id && payload.id.startsWith('dummy_')) { if (payload.method === 'delete') return; if (payload.method === 'update') { payload.method = 'insert'; delete payload.id; } } 
        if (payload.method === 'insert') payload.useDefaultReminders = true; 
    } 
    else if (payload.type === 'task') { if (payload.id && payload.id.startsWith('dummy_')) { if (payload.method === 'delete') return; if (payload.method === 'update') { payload.method = 'insert'; delete payload.id; } } if (payload.due && typeof payload.due === 'object') payload.due = payload.due.dateTime || payload.due.date || ""; if (payload.due && typeof payload.due === 'string') { const dateMatch = payload.due.match(/^(\d{4}-\d{2}-\d{2})/); if (dateMatch) { payload.due = dateMatch[1] + 'T00:00:00.000Z'; } } }
            
    // ★ジェロの真の最適解：Base64/JSON個別送信（CORS・302リダイレクトの壁を完全に突破する）
    if (payload.attachments && payload.attachments.length > 0) {
        if (!payload.keptAttachments) payload.keptAttachments = [];
        
        for (let i = 0; i < payload.attachments.length; i++) {
            const f = payload.attachments[i];
            // 安全網：Blobしか持っていない場合はBase64を再生成してパケットに詰める
            if (!f.base64) {
                if (f.fileBlob) {
                    f.base64 = await new Promise(r => { const reader = new FileReader(); reader.onload = e => r(e.target.result.split(',')[1]); reader.readAsDataURL(f.fileBlob); });
                } else { continue; }
            }
            if (f.fileUrl) continue; // 既にURL化済みならスキップ
            
            if (typeof setProgress === 'function') setProgress(Math.round(((i) / payload.attachments.length) * 100));
            
            // ★iOS/Safariの悪魔（302リダイレクトによるFormDataのボディ消失）を完全に殺す。
            // 最強の堅牢性を誇る「ヘッダー無し(text/plain)でのBase64/JSONペイロード送信」へ回帰する。
            const uploadPayload = {
                type: 'upload',
                title: payload.title,
                file: {
                    name: f.name,
                    mimeType: f.mimeType,
                    base64: f.base64
                }
            };

            const res = await fetch(getGasUrl(), { method: 'POST', body: JSON.stringify(uploadPayload) });
            const resData = await res.json();
            if (!resData.success || !resData.data) throw { status: 500, message: `GAS拒絶: ${resData.error || "詳細不明"}` };
            
            payload.keptAttachments.push(resData.data);
            
            // ★真の進行状況の記憶：引数の元の action にも成功の証を刻み込み、リトライ時の重複を防ぐ
            if (typeof action !== 'undefined' && action && action.attachments && action.attachments[i]) {
                action.attachments[i].fileUrl = resData.data.fileUrl;
                action.attachments[i].fileId = resData.data.fileId;
                action.attachments[i].title = resData.data.title;
                action.attachments[i].mimeType = resData.data.mimeType;
                delete action.attachments[i].base64; // 実体を消して身軽にする
            }
            f.base64 = null; f.fileBlob = null; 
            
            // ★負荷分散：連続送信によるGASのパニックを防ぐため、1秒の冷却時間を設ける
            await new Promise(r => setTimeout(r, 1000));
        }
        
        delete payload.attachments; 
        // ★修正: リトライのために元の action.attachments は保持しつつ、全て fileUrl 化された場合はもう送る必要がないので破棄する
        if (typeof action !== 'undefined' && action && action.attachments) {
            const allSent = action.attachments.every(a => a.fileUrl);
            if (allSent) delete action.attachments;
        }
        payload.attachmentsModified = true;
        if (typeof action !== 'undefined' && action) action.attachmentsModified = true;
        
        if (typeof setProgress === 'function') setProgress(100);
    }

    // ★ネットワーク層の最終変換：GASへ送る直前に、確実にURLをテキストに再結合する（予定・タスク共通）
    // Google APIが無言でDriveリンクを弾く現象を完全に防ぐため、必ずメモ欄(description)にも刻み込む
    payload.description = (payload.description || '').replace(/\[写真添付あり\]/g, '').replace(/📁 添付ファイル:[\s\S]*/g, '').trim();
    if (payload.keptAttachments && payload.keptAttachments.length > 0) {
        const fileLinks = payload.keptAttachments.map(a => `📁 [${a.title || 'ファイル'}] ${a.fileUrl}`).join('\n');
        payload.description += (payload.description ? '\n\n' : '') + '📁 添付ファイル:\n' + fileLinks;
    }

    try {
        const response = await fetch(getGasUrl(), { method: 'POST', body: JSON.stringify(payload) }); const result = await response.json();
        if (!result.success) { let simulatedStatus = 500; const errStr = (result.error || "").toLowerCase(); if (errStr.includes("not found") || errStr.includes("404")) simulatedStatus = 404; else if (errStr.includes("invalid") || errStr.includes("400") || errStr.includes("bad request") || errStr.includes("parse") || errStr.includes("payload")) simulatedStatus = 400; else if (errStr.includes("410") || errStr.includes("gone") || errStr.includes("deleted")) simulatedStatus = 410; else if (errStr.includes("429") || errStr.includes("quota") || errStr.includes("rate limit")) simulatedStatus = 429; else if (errStr.includes("401") || errStr.includes("403") || errStr.includes("unauthorized") || errStr.includes("forbidden")) simulatedStatus = 401; throw { status: simulatedStatus, message: result.error }; }
    } catch (error) {
        const code = error.status || 500;
        // ★真の目的達成：削除しようとして既に無い(404/410)場合は、成功として無罪放免にする
        if ((code === 404 || code === 410) && payload.method === 'delete') return;
        if ((code === 404 || code === 410) && payload.method === 'update') { payload.method = 'insert'; delete payload.id; await executeApiAction(payload, true); return; }
        if (code === 400 && !isRetry) { if (payload.type === 'event') { const fallbackDate = getSafeLocalDateStr(); payload.start = fallbackDate; payload.end = fallbackDate; } else { delete payload.due; } await executeApiAction(payload, true); return; }
        throw error;
    }
}

// ==========================================
// 9. その他初期化プロセス等
// ==========================================
async function processPDFFile(file) { showGlobalLoader('PDFを読み込み中...'); try { pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js'; const arrayBuffer = await file.arrayBuffer(); const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer }); const pdf = await loadingTask.promise; const page = await pdf.getPage(1); const viewport = page.getViewport({ scale: 1.5 }); const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d'); canvas.width = viewport.width; canvas.height = viewport.height; await page.render({ canvasContext: ctx, viewport: viewport }).promise; const base64String = canvas.toDataURL('image/webp', 0.8).split(',')[1]; chatFileBase64 = base64String; chatFileMime = 'image/webp'; document.getElementById('chat-file-name').innerText = file.name + ' (極限圧縮済)'; document.getElementById('chat-attach-box').style.display = 'flex'; openJeroChat(); document.getElementById('chat-input').value = "この画像を解析し、含まれる予定を抽出してくれ。"; unlockAudioAndSend(); } catch (error) { showToast('❌ PDF読み込み失敗'); } finally { hideGlobalLoader(); } }
window.addEventListener('online', async () => { showToast('📶 電波回復'); await updateSyncBadge(); processSyncQueue(true); }); window.addEventListener('offline', async () => { showToast('⚡️ 圏外だ。退避する'); await updateSyncBadge(); });
async function executeSilentRefresh() { if (!navigator.onLine || isAuthError || isFetching) return; const queue = await getSyncQueue(); if (queue.length > 0) return; const monthsToRefresh = [...renderedMonths]; if (monthsToRefresh.length === 0) return; let isUpdated = false; for (const m of monthsToRefresh) { try { const url = `${getGasUrl()}?year=${m.year}&month=${m.month}`; const response = await fetch(url); const data = await response.json(); if (data.success) { const monthKey = `${m.year}-${m.month}`; const oldDataStr = JSON.stringify(dataCache[monthKey]); const newDataStr = JSON.stringify({ events: data.events || [], tasks: data.tasks || [] }); if (oldDataStr !== newDataStr) { dataCache[monthKey] = { events: data.events || [], tasks: data.tasks || [] }; saveDataCacheToIDB(monthKey, dataCache[monthKey]); const existingMonth = document.getElementById(`month-${m.year}-${m.month}`); if (existingMonth) { existingMonth.remove(); renderMonthDOM(m.year, m.month, dataCache[monthKey], 'replace'); } isUpdated = true; } } } catch (e) { } } if (isUpdated && typeof selectedDateStr !== 'undefined' && selectedDateStr) { const modal = document.getElementById('daily-modal'); if (modal && modal.classList.contains('active')) { openDailyModal(selectedDateStr, new Date(selectedDateStr).getDay()); } } }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { processSyncQueue(true); executeSilentRefresh(); } });
document.addEventListener('DOMContentLoaded', async () => { try { await initIDB(); loadSettings(); loadDict(); initColorPicker(); initTaskColorPicker(); if (typeof initSpeech === 'function') initSpeech(); if (typeof initNotification === 'function') initNotification(); const eventActionBar = document.querySelector('#editor-modal .action-bar'); if (eventActionBar && !document.getElementById('btn-convert-task')) { const btn = document.createElement('button'); btn.id = 'btn-convert-task'; btn.className = 'btn btn-gray'; btn.style.display = 'none'; btn.innerText = '🔄 タスクへ'; btn.onclick = () => executeConversion('event'); eventActionBar.insertBefore(btn, document.getElementById('btn-duplicate')); } const taskActionBar = document.querySelector('#task-editor-modal .action-bar'); if (taskActionBar && !document.getElementById('btn-convert-event')) { const btn = document.createElement('button'); btn.id = 'btn-convert-event'; btn.className = 'btn btn-gray'; btn.style.display = 'none'; btn.innerText = '🔄 予定へ'; btn.onclick = () => executeConversion('task'); taskActionBar.insertBefore(btn, document.getElementById('task-btn-delete')); } if (localStorage.getItem('jero_token')) { setTimeout(() => { if (!isCalendarInited) { document.getElementById('offline-badge').innerText = '⚡️ 完全自律モード (キャッシュ起動)'; document.getElementById('offline-badge').classList.add('active'); initCalendar(); } }, 1500); } } catch (err) {} });
// ★自律型AIアイコン（ドラッグ記憶＆ステルスモード）
function initDraggableFAB() {
    const fab = document.getElementById('jero-fab'); if (!fab) return;
    const savedPos = localStorage.getItem('jero_fab_pos');
    if (savedPos) { const pos = JSON.parse(savedPos); fab.style.right = 'auto'; fab.style.bottom = 'auto'; fab.style.left = pos.x + 'px'; fab.style.top = pos.y + 'px'; }

    let isDragging = false, hasDragged = false;
    let startX, startY, initialX, initialY;

    const startDrag = (e) => {
        const evt = e.type.includes('touch') ? e.touches[0] : e;
        startX = evt.clientX; startY = evt.clientY;
        const rect = fab.getBoundingClientRect();
        initialX = rect.left; initialY = rect.top;
        isDragging = true; hasDragged = false;
        fab.style.transition = 'none'; fab.style.opacity = '1';
    };

    const doDrag = (e) => {
        if (!isDragging) return;
        const evt = e.type.includes('touch') ? e.touches[0] : e;
        const dx = evt.clientX - startX; const dy = evt.clientY - startY;
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) hasDragged = true;
        if (hasDragged) {
            e.preventDefault();
            let newX = Math.max(0, Math.min(initialX + dx, window.innerWidth - fab.offsetWidth));
            let newY = Math.max(0, Math.min(initialY + dy, window.innerHeight - fab.offsetHeight));
            fab.style.right = 'auto'; fab.style.bottom = 'auto';
            fab.style.left = newX + 'px'; fab.style.top = newY + 'px';
        }
    };

    const endDrag = () => {
        if (!isDragging) return;
        isDragging = false;
        fab.style.transition = 'transform 0.2s, opacity 0.3s';
        if (hasDragged) { localStorage.setItem('jero_fab_pos', JSON.stringify({ x: parseInt(fab.style.left), y: parseInt(fab.style.top) })); } 
        else { openJeroChat(); }
        resetFabStealth();
    };

    fab.addEventListener('mousedown', startDrag); document.addEventListener('mousemove', doDrag, { passive: false }); document.addEventListener('mouseup', endDrag);
    fab.addEventListener('touchstart', startDrag, { passive: true }); document.addEventListener('touchmove', doDrag, { passive: false }); document.addEventListener('touchend', endDrag);

    let stealthTimer;
    const resetFabStealth = () => {
        clearTimeout(stealthTimer); fab.style.opacity = '1';
        stealthTimer = setTimeout(() => { if (!isDragging && !document.getElementById('jero-chat-modal').classList.contains('active')) fab.style.opacity = '0.4'; }, 3000);
    };
    resetFabStealth(); document.addEventListener('scroll', resetFabStealth, { passive: true });
}

function startApp() { document.getElementById('auth-btn').style.display = 'none'; initWeekdays(); setupObserver(); initCalendar(); initDraggableFAB(); initImageViewerZoom(); /* ★ズームエンジン起動 */ setTimeout(() => { processSyncQueue(true); executeSilentBackup(); }, 1000); }
document.addEventListener('DOMContentLoaded', () => { setTimeout(startApp, 500); });
document.addEventListener('DOMContentLoaded', () => { const resizer = document.getElementById('resizer'); const bottomView = document.getElementById('bottom-detail-view'); let startY = 0; let startHeight = 0; if (resizer && bottomView) { resizer.addEventListener('touchstart', (e) => { startY = e.touches[0].clientY; startHeight = bottomView.getBoundingClientRect().height; document.body.style.userSelect = 'none'; }, { passive: true }); document.addEventListener('touchmove', (e) => { if (startY === 0) return; const deltaY = startY - e.touches[0].clientY; let newHeight = startHeight + deltaY; const minH = window.innerHeight * 0.1; const maxH = window.innerHeight * 0.7; if (newHeight < minH) newHeight = minH; if (newHeight > maxH) newHeight = maxH; bottomView.style.height = `${newHeight}px`; }, { passive: true }); document.addEventListener('touchend', () => { startY = 0; document.body.style.userSelect = ''; }); } });

// ==========================================
// ★ 野戦倉庫管理UI 
// ==========================================
async function openSyncManager() { document.getElementById('overlay').classList.add('active'); document.getElementById('sync-manager-modal').classList.add('active'); await renderSyncQueueList(); }
function closeSyncManager() { document.getElementById('sync-manager-modal').classList.remove('active'); if (!document.getElementById('daily-modal').classList.contains('active') && !document.getElementById('editor-modal').classList.contains('active') && !document.getElementById('task-editor-modal').classList.contains('active')) { document.getElementById('overlay').classList.remove('active'); } }
async function renderSyncQueueList() { const listEl = document.getElementById('sync-queue-list'); if (!listEl) return; const queue = await getSyncQueue(); if (queue.length === 0) { listEl.innerHTML = '<div style="text-align:center; padding:20px; color:#888; font-size:13px;">未送信のデータはない。平和だ。</div>'; return; } let html = ''; queue.forEach(item => { const payload = item.payload; const isEvent = payload.type === 'event'; const method = payload.method === 'insert' ? '追加' : payload.method === 'update' ? '更新' : '削除'; const title = payload.title || '(無名)'; let dateStr = "日時不明"; if (payload.start) dateStr = payload.start.includes('T') ? new Date(payload.start).toLocaleString('ja-JP') : payload.start; else if (payload.due) dateStr = new Date(payload.due).toLocaleDateString('ja-JP'); html += `<div style="background:var(--head-bg); border:1px solid var(--border); border-radius:8px; padding:10px; display:flex; justify-content:space-between; align-items:center;"><div style="flex:1; overflow:hidden; margin-right:10px;"><div style="font-size:10px; color:var(--accent); font-weight:bold; margin-bottom:2px;">[${isEvent ? '予定' : 'タスク'} : ${method}]</div><div style="font-size:14px; font-weight:bold; color:var(--txt); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${title}</div><div style="font-size:11px; color:#888;">${dateStr}</div></div><div style="display:flex; gap:6px; flex-shrink:0;"><button class="btn-gray" style="padding:6px 10px; font-size:12px; border-radius:6px; border:none; color:white; cursor:pointer;" onclick="retrySingleSyncItem('${item.id}')">再送</button><button class="btn-red" style="padding:6px 10px; font-size:12px; border-radius:6px; border:none; color:white; cursor:pointer;" onclick="discardSingleSyncItem('${item.id}')">破棄</button></div></div>`; }); listEl.innerHTML = html; }
async function discardSingleSyncItem(id) { if (!confirm("破棄していいか？")) return; await clearSyncQueueItem(id); await renderSyncQueueList(); await updateSyncBadge(); showToast("🚮 データを破棄した。"); const today = new Date(); showGlobalLoader("最新化中..."); await fetchAndRenderMonth(today.getFullYear(), today.getMonth(), 'replace', true); hideGlobalLoader(); }

// ★全データ一括破棄（緊急パージ用）
async function discardAllSyncItems() { 
    if (!confirm("【警告】未送信の全データを一括で破棄していいか？\n※無限増殖したバグデータなどを消去するための緊急ボタンだ。")) return; 
    showGlobalLoader("全データを焼却中..."); 
    try { 
        const queue = await getSyncQueue(); 
        for(const item of queue) { await clearSyncQueueItem(item.id); } 
        await renderSyncQueueList(); 
        await updateSyncBadge(); 
        showToast("🗑️ 全ての未送信データを焼却した。"); 
        closeSyncManager(); 
        // 幻影（一時IDで描画されたDOM）を消し去るためリロードで浄化する
        setTimeout(() => location.reload(), 1000);
    } catch(e) { 
        showToast("❌ 破棄エラー: " + e.message); 
        hideGlobalLoader();
    } 
}

async function retrySingleSyncItem(id) { const queue = await getSyncQueue(); const item = queue.find(q => q.id === id); if (!item) return; showGlobalLoader("送信中..."); try { await executeApiAction(item.payload); await clearSyncQueueItem(id); showToast("✅ 送信成功だ！"); await renderSyncQueueList(); await updateSyncBadge(); const today = new Date(); await fetchAndRenderMonth(today.getFullYear(), today.getMonth(), 'replace', true); } catch (e) { showToast("❌ やはり弾かれた。破棄を勧めるぞ。"); } finally { hideGlobalLoader(); } }
// ==========================================
// ★ ストレージ大掃除 (ガベージコレクション) エンジン
// ==========================================
let orphanFilesCache = [];

function openStorageCleaner() {
    closeSettings();
    document.getElementById('overlay').classList.add('active');
    document.getElementById('cleaner-modal').classList.add('active');
    document.getElementById('cleaner-results').innerHTML = '';
    document.getElementById('cleaner-action-bar').style.display = 'none';
    orphanFilesCache = [];
}

async function runStorageScan() {
    if (!navigator.onLine) { showToast('圏外ではスキャンできないぞ。'); return; }
    const btn = document.getElementById('btn-run-scan');
    const resultsArea = document.getElementById('cleaner-results');
    btn.innerText = '⏳ 全カレンダーとDriveを照合中... (最大1〜2分)';
    btn.disabled = true;
    resultsArea.innerHTML = '<div style="text-align:center; padding: 20px;"><div class="spinner" style="border-top-color: var(--accent);"></div></div>';

    try {
        // GASに新設する「cleanup_scan」エンドポイントを叩く
        const res = await fetch(`${getGasUrl()}?action=cleanup_scan`);
        const data = await res.json();
        
        if (!data.success) throw new Error(data.error || 'スキャン失敗');
        
        orphanFilesCache = data.orphanFiles || [];
        
        if (orphanFilesCache.length === 0) {
            resultsArea.innerHTML = '<div style="text-align:center; padding:20px; color:#34c759; font-weight:bold;">孤立ファイルはゼロだ。完璧に美しい状態だ。</div>';
            document.getElementById('cleaner-action-bar').style.display = 'none';
        } else {
            let html = `<div style="color:#ff3b30; font-weight:bold; margin-bottom: 5px;">⚠️ ${orphanFilesCache.length}件の孤立ファイルを発見した。</div>`;
            orphanFilesCache.forEach(f => {
                const thumbSrc = f.mimeType.startsWith('image/') ? `https://drive.google.com/thumbnail?id=${f.id}&sz=w100-h100` : SAFE_PDF_ICON;
                html += `
                <div style="background:var(--head-bg); border:1px solid var(--border); border-radius:8px; padding:10px; display:flex; align-items:center; gap:10px;">
                    <img src="${thumbSrc}" style="width:40px; height:40px; object-fit:cover; border-radius:4px; background:#f0f0f0;">
                    <div style="flex:1; overflow:hidden;">
                        <div style="font-size:12px; font-weight:bold; color:var(--txt); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${f.name}</div>
                        <div style="font-size:10px; color:#888;">作成: ${new Date(f.created).toLocaleDateString('ja-JP')} / サイズ: ${Math.round(f.size/1024)}KB</div>
                    </div>
                    <a href="${f.url}" target="_blank" style="font-size:12px; color:var(--accent); text-decoration:none; padding:4px;">確認</a>
                </div>`;
            });
            resultsArea.innerHTML = html;
            document.getElementById('cleaner-action-bar').style.display = 'block';
        }
    } catch (e) {
        resultsArea.innerHTML = `<div style="text-align:center; color:#ff3b30; padding:20px;">エラーが発生した: ${e.message}</div>`;
    } finally {
        btn.innerText = '🔍 再スキャンする';
        btn.disabled = false;
    }
}

async function executeStorageCleanup() {
    if (orphanFilesCache.length === 0) return;
    if (!confirm(`本当にこれら ${orphanFilesCache.length} 件のファイルを「ゴミ箱」へ移動していいか？\n（※Google Driveのゴミ箱から30日以内なら復元可能だ）`)) return;

    showGlobalLoader('ゴミ箱へ転送中...');
    try {
        const payload = { type: 'cleanup_execute', fileIds: orphanFilesCache.map(f => f.id) };
        const response = await fetch(getGasUrl(), { method: 'POST', body: JSON.stringify(payload) });
        const result = await response.json();
        
        if (!result.success) throw new Error(result.error || '削除失敗');
        
        showToast(`✅ ${result.deletedCount}件のファイルをゴミ箱に送った。`);
        document.getElementById('cleaner-action-bar').style.display = 'none';
        document.getElementById('cleaner-results').innerHTML = '<div style="text-align:center; padding:20px; color:#34c759; font-weight:bold;">掃討完了。システムは浄化された。</div>';
        orphanFilesCache = [];
    } catch (e) {
        showToast(`❌ エラー: ${e.message}`);
    } finally {
        hideGlobalLoader();
    }
}

// ==========================================
// ★ ドラッグ＆ドロップ (D&D) エンジン
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (typeof MobileDragDrop !== 'undefined') {
            MobileDragDrop.polyfill({
                // ★操作性の極限最適化：250msだとスタンプを「サッと掴む」操作ですっぽ抜けるため、
                // スクロール誤爆しないギリギリのラインである 150ms に短縮し、ネイティブアプリの吸い付きを再現する。
                holdToDrag: 150, 
                dragImageTranslateOverride: MobileDragDrop.scrollBehaviourDragImageTranslateOverride
            });
            // iOS Safariのスクロールバグ回避
            window.addEventListener('touchmove', function() {}, {passive: false});
        }
    }, 500);
});

function handleDragStart(e) {
    // ★統合エンジン分岐1：スタンプ（新規作成パレット）を掴んだ場合
    const templateType = e.currentTarget.getAttribute('data-template');
    if (templateType) {
        e.dataTransfer.setData('text/plain', JSON.stringify({ isTemplate: true, templateType: templateType }));
        e.dataTransfer.effectAllowed = 'move';
        triggerHaptic('light');
        return;
    }

    // ★統合エンジン分岐2：カレンダー上の既存予定・タスクを掴んだ場合
    if (!e.currentTarget.getAttribute('data-id')) { e.preventDefault(); return; }
    
    // ★真の起点記憶：カレンダー上から掴んだ場合はそのセル、下のリストから掴んだ場合は「現在選択中の日付(selectedDateStr)」を起点とする
    const parentCell = e.currentTarget.closest('.day');
    const sourceDateStr = parentCell ? parentCell.id.replace('cell-', '') : (typeof selectedDateStr !== 'undefined' ? selectedDateStr : null);

    if (!sourceDateStr) { showToast('⚠️ 起点の日付が不明だ。もう一度選び直してくれ。'); e.preventDefault(); return; }

    e.dataTransfer.setData('text/plain', JSON.stringify({
        id: e.currentTarget.getAttribute('data-id'),
        type: e.currentTarget.getAttribute('data-type'),
        sourceDate: sourceDateStr
    }));
    e.dataTransfer.effectAllowed = 'move';
    triggerHaptic('light'); // ★古い個別バイブ記述(navigator.vibrate)を、共通の触覚エンジンへ統一
}

function handleDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
function handleDragEnter(e) { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }
function handleDragLeave(e) { e.currentTarget.classList.remove('drag-over'); }

async function handleDrop(e, targetDateStr) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    triggerHaptic('success'); // ★触覚：ドロップ成功
    
    const dataStr = e.dataTransfer.getData('text/plain');
    if (!dataStr) return;
    
    // ★UIスレッドの【完全】解放：
    // await で待つのではなく、setTimeoutで別スレッドの未来に処理を丸投げする。
    // これにより、ブラウザは「点線枠を消す」などの描画を即座に100%完了させることができる。
    setTimeout(async () => {
        try {
            const data = JSON.parse(dataStr);
            if (data.isTemplate) {
                await applyTemplateStamp(data.templateType, targetDateStr);
            } else {
                await moveItemToDate(data.type, data.id, targetDateStr, data.sourceDate);
            }
        } catch(err) { console.error("Drop Error:", err); }
    }, 10); // わずか10msの隙間で描画の詰まり（フリーズ）は完全に消滅する
}

async function moveItemToDate(type, id, targetDateStr, sourceDateStr) {
    let item = null;
    for (const key in dataCache) {
        const list = type === 'event' ? dataCache[key].events : dataCache[key].tasks;
        if (list) { item = list.find(x => x.id === id); if (item) break; }
    }
    if (!item) return;

    // ★真の浄化（パージ＆クリーン）：APIの生データをそのまま投げ返さず、サーバーが100%理解できる純粋な形に整形し直す
    let cleanAttachments = [];
    if (item.attachments && item.attachments.length > 0) {
        cleanAttachments = item.attachments.map(att => {
            let fileId = att.fileId;
            if (!fileId && att.fileUrl) {
                const match = att.fileUrl.match(/d\/([a-zA-Z0-9_-]+)/) || att.fileUrl.match(/id=([a-zA-Z0-9_-]+)/);
                if (match) fileId = match[1];
            }
            let mType = att.mimeType || 'image/jpeg';
            if (!att.mimeType || att.mimeType === 'application/octet-stream') { 
                mType = (att.title && att.title.match(/\.(pdf|doc|docx|xls|xlsx|txt|zip|csv)$/i)) ? 'application/pdf' : 'image/jpeg'; 
            }
            return { fileUrl: att.fileUrl, title: att.title || 'ファイル', mimeType: mType, fileId: fileId };
        }).filter(a => a.fileId); // IDのない不正データは絶対に混入させない
    }
    
    // タスク特有の抽出処理
    if (type === 'task' && cleanAttachments.length === 0 && item.notes) {
        const parsed = parseTaskAttachments(item.notes);
        if (parsed.files.length > 0) {
            cleanAttachments = parsed.files.map(f => {
                let mType = (f.title && f.title.match(/\.(pdf|doc|docx|xls|xlsx|txt|zip|csv)$/i)) ? 'application/pdf' : 'image/jpeg';
                return { title: f.title, fileUrl: f.fileUrl, fileId: f.fileId, mimeType: mType };
            });
        }
    }

    // ★究極の自律化4：内部ロジックでも未送信データのD&D移動を許可する
    // if (item._localId) { showToast('⚠️ 通信中のデータは動かせない。少し待て。'); return; }

    const payload = { type: type, method: 'update', id: id };
    
    // ★完璧な引継ぎチケットの発行：浄化された完全なデータだけをパケットに縛り付ける
    if (cleanAttachments.length > 0) {
        payload.keptAttachments = cleanAttachments;
        payload.attachmentsModified = true;
    }

    // ★真のシフトロジック：掴んだ日からドロップ先への「相対移動日数(オフセット)」を計算する
    let offsetDays = 0;
    if (sourceDateStr) {
        const srcParts = sourceDateStr.split('-'); const tgtParts = targetDateStr.split('-');
        const srcD = new Date(parseInt(srcParts[0]), parseInt(srcParts[1]) - 1, parseInt(srcParts[2]));
        const tgtD = new Date(parseInt(tgtParts[0]), parseInt(tgtParts[1]) - 1, parseInt(tgtParts[2]));
        offsetDays = Math.round((tgtD.getTime() - srcD.getTime()) / (1000 * 60 * 60 * 24));
    }

    if (type === 'event') {
        payload.title = item.summary; payload.description = item.description; payload.location = item.location; payload.colorId = item.colorId;
        // ★予定の死角保護4：D&Dで移動した時に、既存の繰り返し設定が吹き飛んで単発になるのを防ぐ
        if (item.recurrence) payload.recurrence = item.recurrence;
        
        const isAllDay = item.start && item.start.date;
        if (isAllDay) {
            // 終日予定：本来の開始・終了日にオフセット日数をそのまま加算する（間隔を完全に維持）
            const stParts = item.start.date.split('-'); const edParts = item.end.date.split('-');
            const newSt = new Date(parseInt(stParts[0]), parseInt(stParts[1]) - 1, parseInt(stParts[2]));
            const newEd = new Date(parseInt(edParts[0]), parseInt(edParts[1]) - 1, parseInt(edParts[2]));
            newSt.setDate(newSt.getDate() + offsetDays);
            newEd.setDate(newEd.getDate() + offsetDays);
            payload.start = getSafeLocalDateStr(newSt);
            payload.end = getSafeLocalDateStr(newEd);
        } else {
            // 時間指定予定：同じくオフセット日数を加算し、時間はそのまま維持する
            const newSt = new Date(item.start.dateTime);
            const newEd = new Date(item.end.dateTime);
            newSt.setDate(newSt.getDate() + offsetDays);
            newEd.setDate(newEd.getDate() + offsetDays);
            const pad = (n) => String(n).padStart(2, '0');
            const formatIso = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}+09:00`;
            payload.start = formatIso(newSt);
            payload.end = formatIso(newEd);
        }
    } else {
        // ★テキストの保護：通信直前(ネットワーク層)で掃除と再結合を行うため、ここでは元のテキストをそのまま渡す
        payload.title = item.title; payload.description = item.notes || ''; payload.status = item.status;
        // タスク：これもオフセット移動させることで、どの画面から掴んでも正確に移動できる
        if (item.due && offsetDays !== 0) {
            const dueD = new Date(item.due);
            dueD.setDate(dueD.getDate() + offsetDays);
            payload.due = getSafeLocalDateStr(dueD) + 'T00:00:00+09:00';
        } else {
            payload.due = targetDateStr + 'T00:00:00+09:00';
        }
    }
    
    closeAllModals();
    showToast('🔄 日付を移動中...');
    // 司令塔に投げ込み、野戦倉庫とオプティミスティックUIを自動発動させる
    await dispatchManualAction(payload);
}

// ★クイックメモ機能（即時編集＆閲覧ハイブリッドエンジン）
function openQuickMemo(id, type) {
    let item = null;
    for (const key in dataCache) { const list = type === 'event' ? dataCache[key].events : dataCache[key].tasks; if (list) { item = list.find(x => x.id === id); if (item) break; } }
    if (!item) return;

    const title = type === 'event' ? (item.summary || '(無名)') : (item.title || '(無名)');
    const currentMemo = type === 'event' ? (item.description || '').replace(/\[写真添付あり\]/g, '').replace(/📁 添付ファイル:[\s\S]*/, '').trim() : extractTaskData(item.notes).cleanNotes;

    const overlay = document.createElement('div');
    overlay.id = 'quick-memo-overlay';
    overlay.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.5); z-index:9999; display:flex; justify-content:center; align-items:center; opacity:0; transition:opacity 0.2s;';
    // 背景タップで静かに閉じる（保存しない）
    overlay.onclick = (e) => { if (e.target === overlay) closeQuickMemo(); };

    const box = document.createElement('div');
    box.style.cssText = 'background:var(--bg); color:var(--txt); width:85%; max-width:340px; border-radius:12px; padding:20px; box-shadow:0 10px 30px rgba(0,0,0,0.3); transform:scale(0.9); transition:transform 0.2s;';
    
    box.innerHTML = `
        <div style="font-weight:bold; font-size:15px; margin-bottom:12px; color:var(--txt); border-bottom:1px solid var(--border); padding-bottom:8px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${title}</div>
        <textarea id="quick-memo-text" style="width:100%; height:150px; padding:10px; border-radius:8px; border:1px solid var(--border); background:var(--head-bg); color:var(--txt); font-size:14px; line-height:1.5; resize:none; box-sizing:border-box;">${currentMemo}</textarea>
        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:15px;">
            <button style="padding:8px 16px; border-radius:8px; border:1px solid var(--border); background:transparent; color:var(--txt); font-weight:bold; cursor:pointer;" onclick="closeQuickMemo()">閉じる</button>
            <button style="padding:8px 20px; border-radius:8px; border:none; background:var(--accent); color:white; font-weight:bold; cursor:pointer;" onclick="saveQuickMemo('${id}', '${type}')">保存</button>
        </div>
    `;
    overlay.appendChild(box); document.body.appendChild(overlay);
    setTimeout(() => { overlay.style.opacity = '1'; box.style.transform = 'scale(1)'; }, 10);
}

function closeQuickMemo() {
    const overlay = document.getElementById('quick-memo-overlay');
    if (overlay) { overlay.style.opacity = '0'; overlay.firstChild.style.transform = 'scale(0.9)'; setTimeout(() => overlay.remove(), 200); }
}

async function saveQuickMemo(id, type) {
    const newMemo = document.getElementById('quick-memo-text').value.trim();
    closeQuickMemo();
    triggerHaptic('success'); // ★触覚：メモ保存

    let item = null;
    for (const key in dataCache) { const list = type === 'event' ? dataCache[key].events : dataCache[key].tasks; if (list) { item = list.find(x => x.id === id); if (item) break; } }
    if (!item) return;

    const payload = { type: type, method: 'update', id: id };
    if (type === 'event') {
        let oldDesc = item.description || '';
        let attMatch = oldDesc.match(/📁 添付ファイル:[\s\S]*/);
        // ★添付ファイルリンクを破壊せずに再結合する
        payload.description = newMemo + (attMatch ? (newMemo ? '\n\n' : '') + attMatch[0] : '');
        payload.title = item.summary; payload.location = item.location; payload.colorId = item.colorId;
        payload.start = item.start.dateTime || item.start.date; payload.end = item.end.dateTime || item.end.date;
        // ★予定の死角保護5：メモだけ更新した時に、既存の繰り返し設定が吹き飛んで単発になるのを防ぐ
        if (item.recurrence) payload.recurrence = item.recurrence;
    } else {
        let oldNotes = item.notes || '';
        let tData = extractTaskData(oldNotes);
        let attMatch = oldNotes.match(/📁 添付ファイル:[\s\S]*/);
        let finalNotes = newMemo;
        // ★辞書タグや添付ファイルリンクを破壊せずに再結合する
        if (tData.colorId) finalNotes += (finalNotes ? '\n' : '') + '[c:' + tData.colorId + ']';
        if (tData.recurrence) finalNotes += (finalNotes ? '\n' : '') + '[r:' + tData.recurrence + ']';
        if (attMatch) finalNotes += (finalNotes ? '\n\n' : '') + attMatch[0];
        payload.description = finalNotes;
        payload.title = item.title; payload.status = item.status; payload.due = item.due;
    }
    showToast('🔄 メモを更新中...');
    await dispatchManualAction(payload);
}

// ==========================================
// ★ 究極の最適解：汎用アイコン＆スタンプ統合エンジン (Phase 3+)
// ==========================================

function hexToRgbForStamp(hex) {
    let r = 0, g = 0, b = 0; hex = hex.replace('#', '');
    if (hex.length === 3) { r = parseInt(hex.charAt(0) + hex.charAt(0), 16); g = parseInt(hex.charAt(1) + hex.charAt(1), 16); b = parseInt(hex.charAt(2) + hex.charAt(2), 16); } 
    else if (hex.length === 6) { r = parseInt(hex.substring(0, 2), 16); g = parseInt(hex.substring(2, 4), 16); b = parseInt(hex.substring(4, 6), 16); }
    return `${r}, ${g}, ${b}`;
}

function rgbaToHexForStamp(rgbaStr) {
    const match = rgbaStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (match) { const r = parseInt(match[1]).toString(16).padStart(2, '0'); const g = parseInt(match[2]).toString(16).padStart(2, '0'); const b = parseInt(match[3]).toString(16).padStart(2, '0'); return `#${r}${g}${b}`; }
    return '#0a84ff';
}

function loadDict() { 
    const savedDict = localStorage.getItem('jero_adv_dict'); 
    const savedStamps = localStorage.getItem('jero_stamps');
    
    if (savedDict || savedStamps) {
        let merged = [];
        if (savedDict) {
            try {
                JSON.parse(savedDict).forEach(d => {
                    let baseColor = d.color || d.bg || '#0a84ff';
                    if (baseColor.startsWith('rgba')) baseColor = rgbaToHexForStamp(baseColor);
                    merged.push({ keys: d.keys || [], icon: d.icon || '', color: baseColor, isStamp: d.isStamp || false, label: d.label || '' });
                });
            } catch(e) {}
        }
        // ★自動マイグレーション：過去のスタンプデータがあれば統合して破棄する
        if (savedStamps) {
            try {
                JSON.parse(savedStamps).forEach(s => {
                    let baseColor = s.baseColor || rgbaToHexForStamp(s.bg);
                    let existing = merged.find(m => m.keys.includes(s.insertText));
                    if (existing) { existing.isStamp = true; existing.label = s.label; existing.color = baseColor; existing.icon = s.icon; } 
                    else { merged.unshift({ keys: [s.insertText], icon: s.icon, color: baseColor, isStamp: true, label: s.label }); }
                });
            } catch(e) {}
            localStorage.removeItem('jero_stamps'); localStorage.setItem('jero_adv_dict', JSON.stringify(merged));
        }
        advancedDict = merged;
    } else { 
        // 初期装備
        advancedDict = [
            { keys: ["休)"], icon: "🏖️", color: "#ff3b30", isStamp: true, label: "休" },
            { keys: ["有休)"], icon: "🌴", color: "#34c759", isStamp: true, label: "有休" },
            { keys: ["在宅)"], icon: "💻", color: "#007aff", isStamp: true, label: "在宅" },
            { keys: ["出張)"], icon: "🚄", color: "#ff9500", isStamp: true, label: "出張" },
            { keys: ["誕生日", "【誕】"], icon: "🎂", color: "#ff2d55", isStamp: false },
            { keys: ["会議", "【会】"], icon: "👥", color: "#5856d6", isStamp: false }
        ];
    } 
    renderDictUI(); renderStampPaletteUI();
}

function saveDict() { localStorage.setItem('jero_adv_dict', JSON.stringify(advancedDict)); renderDictUI(); renderStampPaletteUI(); triggerFullReRender(); }

function renderDictUI() { 
    const container = document.getElementById('dict-list'); if (!container) return; 
    container.innerHTML = ''; 
    if (advancedDict.length === 0) { container.innerHTML = '<div style="color:#888; font-size:12px;">辞書は空だ。</div>'; return; } 
    advancedDict.forEach((item, idx) => { 
        const primary = item.keys[0] || "(キーなし)"; 
        const rgbStr = hexToRgbForStamp(item.color);
        const bg = `rgba(${rgbStr}, 0.15)`; const border = `rgba(${rgbStr}, 0.4)`;
        
        const el = document.createElement('div'); el.className = 'dict-item'; 
        el.innerHTML = `
            <div class="dict-info">
                <div style="display:flex; align-items:center; gap:6px;">
                    <span style="font-size:20px;">${item.icon}</span>
                    <span style="font-weight:bold;">${item.isStamp ? item.label : primary}</span>
                    ${item.isStamp ? '<span style="font-size:10px; background:rgba(10,132,255,0.1); color:#0a84ff; padding:2px 6px; border-radius:4px;">スタンプON</span>' : ''}
                </div>
                <div style="font-size:11px; color:#888; margin-top:6px;">キーワード: ${item.keys.join(', ')}</div>
                <div style="margin-top:6px; padding:2px 8px; border-radius:6px; background:${bg}; border:1px solid ${border}; color:var(--txt); font-size:12px; display:inline-block;">プレビュー</div>
            </div>
            <div style="display:flex; flex-direction:column; gap:4px;">
                <button class="dict-btn-edit" onclick="openDictEditor(${idx})">編集</button>
                <button class="dict-btn-del" onclick="removeDictItem(${idx})">削除</button>
            </div>
        `; 
        container.appendChild(el); 
    }); 
}

function openDictEditor(idx = -1) { 
    document.getElementById('dict-editor-modal').classList.add('active'); 
    if (idx >= 0) { 
        const item = advancedDict[idx]; 
        document.getElementById('dict-edit-idx').value = idx; 
        document.getElementById('dict-edit-keys').value = item.keys.join(', '); 
        document.getElementById('dict-edit-icon').innerText = item.icon || '➕ 選択'; 
        document.getElementById('dict-edit-color').value = item.color || '#0a84ff'; 
        document.getElementById('dict-edit-is-stamp').checked = !!item.isStamp;
        document.getElementById('stamp-name-row').style.display = item.isStamp ? 'block' : 'none';
        document.getElementById('dict-edit-label').value = item.label || ''; 
        document.getElementById('dict-editor-title').innerText = '辞書・スタンプ編集'; 
    } else { 
        document.getElementById('dict-edit-idx').value = -1; 
        document.getElementById('dict-edit-keys').value = ''; 
        document.getElementById('dict-edit-icon').innerText = '➕ 選択'; 
        document.getElementById('dict-edit-color').value = '#0a84ff'; 
        document.getElementById('dict-edit-is-stamp').checked = false;
        document.getElementById('stamp-name-row').style.display = 'none';
        document.getElementById('dict-edit-label').value = ''; 
        document.getElementById('dict-editor-title').innerText = '新規追加'; 
    } 
}

function closeDictEditor() { document.getElementById('dict-editor-modal').classList.remove('active'); }

function saveDictItem() { 
    const idx = parseInt(document.getElementById('dict-edit-idx').value); 
    const keysRaw = document.getElementById('dict-edit-keys').value; 
    const iconRaw = document.getElementById('dict-edit-icon').innerText; 
    const icon = iconRaw === '➕ 選択' ? '' : iconRaw.trim(); 
    const color = document.getElementById('dict-edit-color').value; 
    const isStamp = document.getElementById('dict-edit-is-stamp').checked;
    const label = document.getElementById('dict-edit-label').value.trim();

    if (!keysRaw || !icon) { showToast('キーワードとアイコンは必須だ。'); return; } 
    if (isStamp && !label) { showToast('スタンプ化する場合は表示名が必須だ。'); return; }

    const keys = keysRaw.split(',').map(k => k.trim()).filter(k => k);
    const newItem = { keys, icon, color, isStamp, label }; 
    if (idx >= 0) advancedDict[idx] = newItem; else advancedDict.push(newItem); 
    
    saveDict(); closeDictEditor(); 
}

function removeDictItem(idx) { if(!confirm('本当に削除するか？')) return; advancedDict.splice(idx, 1); saveDict(); }

function renderStampPaletteUI() {
    const container = document.getElementById('stamp-palette-container'); if (!container) return; container.innerHTML = '';
    const stampItems = advancedDict.filter(d => d.isStamp);
    if(stampItems.length === 0) { container.innerHTML = '<span style="font-size:12px; color:#888;">設定から追加できるぞ</span>'; return; }
    
    stampItems.forEach(stamp => {
        const rgbStr = hexToRgbForStamp(stamp.color); const bg = `rgba(${rgbStr}, 0.15)`; const border = `rgba(${rgbStr}, 0.4)`;
        const el = document.createElement('div');
        el.setAttribute('draggable', 'true'); el.setAttribute('data-template', stamp.keys[0]); el.setAttribute('ondragstart', 'handleDragStart(event)');
        el.style.cssText = `font-size:16px; cursor:grab; padding:2px 10px; border-radius:8px; background:${bg}; border:1px solid ${border}; color:var(--txt); touch-action:none; box-shadow: 0 1px 2px rgba(0,0,0,0.05); flex-shrink: 0; display: flex; align-items: center; gap: 4px;`;
        el.innerHTML = `<span>${stamp.icon}</span><span style="font-size:12px; font-weight:bold;">${stamp.label}</span>`;
        container.appendChild(el);
    });
}

async function applyTemplateStamp(templateKey, targetDateStr) {
    const stamp = advancedDict.find(s => s.keys[0] === templateKey); if (!stamp) return;
    const targetTag = stamp.keys[0]; const [y, m, d] = targetDateStr.split('-'); const data = dataCache[`${y}-${parseInt(m) - 1}`];
    let existingItem = null;
    if (data && data.events) { existingItem = data.events.find(e => { if (!e.start) return false; const isTargetDay = (e.start.date === targetDateStr) || (e.start.dateTime && e.start.dateTime.startsWith(targetDateStr)); return isTargetDay && stamp.keys.some(tag => (e.summary || '').includes(tag)); }); }

    if (existingItem) { triggerHaptic('heavy'); await dispatchManualAction({ type: 'event', method: 'delete', id: existingItem.id, start: targetDateStr }); } 
    else { triggerHaptic('success'); const edD = new Date(targetDateStr); edD.setDate(edD.getDate() + 1); await dispatchManualAction({ type: 'event', method: 'insert', title: targetTag, description: '', location: '', colorId: '', start: targetDateStr, end: getSafeLocalDateStr(edD) }); }
}

function renderIconPalette(targetId, inputId) { 
    const palette = document.getElementById(targetId); if (!palette) return; palette.innerHTML = ''; 
    advancedDict.forEach(item => { 
        if (!item.icon || !item.keys || item.keys.length === 0) return; 
        const prefix = item.keys[0]; 
        let bg = 'var(--head-bg)'; let border = 'var(--border)'; let txtColor = '#666'; let label = prefix;
        
        if(item.isStamp) { const rgbStr = hexToRgbForStamp(item.color); bg = `rgba(${rgbStr}, 0.15)`; border = `rgba(${rgbStr}, 0.4)`; txtColor = item.color; label = item.label; }

        const btn = document.createElement('div'); 
        btn.innerHTML = `<span style="font-size:18px;">${item.icon}</span><span style="font-size:10px; color:${txtColor}; margin-left:4px; font-weight:bold;">${label}</span>`; 
        btn.style.cssText = `display:flex; align-items:center; cursor: pointer; padding: 4px 8px; background: ${bg}; border: 1px solid ${border}; border-radius: 8px; flex-shrink: 0; box-shadow: 0 1px 2px rgba(0,0,0,0.05);`; 
        btn.onclick = () => { const inputEl = document.getElementById(inputId); if (!inputEl.value.includes(prefix)) { inputEl.value = item.isStamp ? (inputEl.value ? inputEl.value + " " + prefix : prefix) : prefix + " " + inputEl.value; } }; 
        palette.appendChild(btn); 
    }); 
}

function processSemanticText(text) { 
    if (!text) return { text: "", style: null }; 
    let resText = text; let matchStyle = null; 

    // 長いキーワード順にソートして部分一致バグを確実に防ぐ
    let allKeywords = [];
    advancedDict.forEach(item => { item.keys.forEach(key => allKeywords.push({ keyword: key, data: item })); });
    allKeywords.sort((a, b) => b.keyword.length - a.keyword.length);

    for (const item of allKeywords) {
        if (resText.includes(item.keyword)) {
            const dictItem = item.data;
            if (dictItem.isStamp) resText = resText.split(item.keyword).join(dictItem.icon + " " + dictItem.label);
            else resText = resText.split(item.keyword).join(dictItem.icon);
            
            // 色は最初に見つけたもの（一番長いキーワード）を優先
            if (!matchStyle) { const hexColor = dictItem.color || '#0a84ff'; const txtColor = getContrastYIQ(hexColor); matchStyle = { bg: hexColor, txt: txtColor }; }
        }
    }
    return { text: resText, style: matchStyle }; 
}

function selectEmoji(icon) { document.getElementById('dict-edit-icon').innerText = icon; closeEmojiPicker(); }

document.addEventListener('DOMContentLoaded', () => { loadDict(); });

// ==========================================
// ★ Phase 5: JeroDB (IndexedDB) & ガベージコレクション
// ==========================================

const JeroDB = {
    dbName: 'JeroStorage',
    dbVersion: 1,
    storeName: 'quickFiles',
    db: null,

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName, { keyPath: 'id' });
                }
            };
            request.onsuccess = (e) => { this.db = e.target.result; resolve(); };
            request.onerror = (e) => { console.error("JeroDB Error", e); reject(e); };
        });
    },

    async saveFile(file) {
        return new Promise((resolve, reject) => {
            const record = { id: Date.now().toString(), name: file.name, type: file.type, data: file, timestamp: Date.now() };
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            store.put(record);
            transaction.oncomplete = () => resolve(record);
            transaction.onerror = (e) => reject(e);
        });
    },

    // ★追加：URLリンクをDBに保存するメソッド
    async saveLink(title, url) {
        return new Promise((resolve, reject) => {
            const record = { id: Date.now().toString(), name: title, type: 'url', data: url, timestamp: Date.now() };
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            store.put(record);
            transaction.oncomplete = () => resolve(record);
            transaction.onerror = (e) => reject(e);
        });
    },

    async getAllFiles() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => reject(e);
        });
    },

    async deleteFile(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            store.delete(id);
            transaction.oncomplete = () => resolve();
            transaction.onerror = (e) => reject(e);
        });
    }
};

// クイックアクセスUIの描画
async function renderQuickFiles() {
    const container = document.getElementById('quick-files-container');
    if (!container) return;
    try {
        const files = await JeroDB.getAllFiles();
        if (files.length === 0) {
            container.innerHTML = '<span style="font-size:11px; color:#888;">資料やリンクをピン留めできるぞ</span>';
            return;
        }
        container.innerHTML = '';
        files.sort((a, b) => b.timestamp - a.timestamp).forEach(f => {
            const isUrl = f.type === 'url';
            
            // ★追加：データ構造を一目で判別できる視覚的バッジを錬成
            const badgeStr = isUrl 
                ? '<span style="background:#34c759; color:white; padding:2px 4px; border-radius:4px; font-size:9px; margin-right:4px;">🌐 リンク</span>' 
                : '<span style="background:#0a84ff; color:white; padding:2px 4px; border-radius:4px; font-size:9px; margin-right:4px;">💾 実体</span>';
                
            const el = document.createElement('div');
            el.style.cssText = `display:flex; align-items:center; padding:4px 8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; font-size:11px; font-weight:bold; cursor:pointer; box-shadow:0 1px 2px rgba(0,0,0,0.05); white-space:nowrap;`;
            
            const nameSpan = document.createElement('span');
            nameSpan.innerHTML = `${badgeStr} ${f.name.length > 10 ? f.name.substring(0,10)+'...' : f.name}`;
            nameSpan.onclick = () => openQuickFile(f);
            
            const delBtn = document.createElement('span');
            delBtn.innerText = '✕';
            delBtn.style.cssText = `margin-left:4px; color:#888; font-weight:normal; font-size:10px; padding:2px;`;
            delBtn.onclick = async (e) => { e.stopPropagation(); if(confirm('このピン留めを外すか？')) { await JeroDB.deleteFile(f.id); renderQuickFiles(); } };
            
            el.appendChild(nameSpan);
            el.appendChild(delBtn);
            container.appendChild(el);
        });
    } catch(e) { console.error("Quick files render error", e); }
}

async function handleQuickFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (typeof showGlobalLoader === 'function') showGlobalLoader('DBに保存中...');
    try {
        await JeroDB.saveFile(file);
        await renderQuickFiles();
    } catch(e) {
        alert('保存に失敗したぞ。');
    } finally {
        if (typeof hideGlobalLoader === 'function') hideGlobalLoader();
        event.target.value = '';
    }
}

// ★追加：URLリンクをプロンプトから受け取って保存する関数 (クリップボード自動読み取り機能付き)
async function promptAddQuickLink() {
    let defaultUrl = "";
    try {
        // ★ボタンを押した瞬間、クリップボードにURLがあれば自動で掠め取る
        const clipText = await navigator.clipboard.readText();
        if (clipText && clipText.startsWith("http")) defaultUrl = clipText;
    } catch(e) { /* 権限がない場合は無視する */ }

    const url = prompt("ピン留めするURL:\n(コピー済みの場合は最初から入っているぞ)", defaultUrl);
    if (!url) return;
    const title = prompt("表示する短い名前:", "Driveリンク") || "リンク";
    
    if (typeof showGlobalLoader === 'function') showGlobalLoader('リンクを保存中...');
    try {
        await JeroDB.saveLink(title, url);
        await renderQuickFiles();
    } catch(e) {
        alert('保存に失敗したぞ。');
    } finally {
        if (typeof hideGlobalLoader === 'function') hideGlobalLoader();
    }
}

async function openQuickFile(fileRecord) {
    // ★リンクの場合はそのまま別タブ(外部ブラウザ)で開く
    if (fileRecord.type === 'url') {
        window.open(fileRecord.data, '_blank');
        return;
    }

    const file = fileRecord.data;

    // ★画像の場合：アプリ内の安全なビューワ(×ボタンで戻れる)を使う
    if (file.type && file.type.startsWith('image/')) {
        const blobUrl = URL.createObjectURL(file);
        const viewer = document.getElementById('img-viewer');
        const img = document.getElementById('img-viewer-src');
        if (viewer && img) {
            img.src = blobUrl;
            viewer.style.display = 'flex';
            return;
        }
    }

    // ★PDFなどの場合：iOS特有の「スクロール不可＆戻れない地獄」を完全に回避する
    try {
        // iPhoneネイティブの「共有メニュー」を呼び出し、OSの力で読ませる
        if (navigator.share && navigator.canShare) {
            const shareFile = new File([file], fileRecord.name, { type: file.type });
            if (navigator.canShare({ files: [shareFile] })) {
                await navigator.share({ files: [shareFile], title: fileRecord.name });
                return; // 成功すれば、クイックルックや他のアプリで安全に読める
            }
        }
    } catch(e) {
        console.log("共有がキャンセルされたか、失敗した", e);
    }

    // 共有メニューが使えなかった場合の最終手段（強制ダウンロード）
    const blobUrl = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = fileRecord.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
}
// カレンダーのガベージコレクション（古いキャッシュの破棄）
function runGarbageCollection() {
    if (typeof dataCache === 'undefined') return;
    const now = new Date();
    const keepMonths = [];
    // 前後3ヶ月分(計7ヶ月)のキーを生成 (例: "2026-4")
    for (let i = -3; i <= 3; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
        keepMonths.push(`${d.getFullYear()}-${d.getMonth()}`);
    }
    
    let deletedCount = 0;
    for (const key in dataCache) {
        if (!keepMonths.includes(key)) {
            delete dataCache[key];
            deletedCount++;
        }
    }
    if (deletedCount > 0) {
        console.log(`🧹 Jero GC: 古いキャッシュを ${deletedCount} ヶ月分破棄し、メモリを解放したぞ。`);
    }
}

// アプリ起動時にJeroDBとGCを起動する
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await JeroDB.init();
        renderQuickFiles();
    } catch(e) { console.error("JeroDBの初期化に失敗した", e); }
    
    // アプリの起動を邪魔しないよう、5秒後に裏側でひっそりとGCを実行する
    setTimeout(runGarbageCollection, 5000);
});
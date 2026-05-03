// Jero Core Engine v8.8 - Visual Feedback & Dictation (iOS Mic Fix)
let isVoiceEnabled = false; let jeroVoice = null; let recognition = null; let isRecording = false;

function initSpeech() { let voices = window.speechSynthesis.getVoices(); jeroVoice = voices.find(v => v.lang === 'ja-JP'); if (!voices.length) { window.speechSynthesis.onvoiceschanged = () => { jeroVoice = window.speechSynthesis.getVoices().find(v => v.lang === 'ja-JP'); }; } }
function toggleVoiceSetting() { isVoiceEnabled = document.getElementById('st-voice').checked; localStorage.setItem('jero_voice_enabled', isVoiceEnabled); if (isVoiceEnabled) unlockAudioContext(); }
function unlockAudioContext() { if (!isVoiceEnabled || !window.speechSynthesis) return; const u = new SpeechSynthesisUtterance(''); u.volume = 0; window.speechSynthesis.speak(u); }
function unlockAudioAndSend() { unlockAudioContext(); sendToJero(); }
function unlockAudioAndStartSpeech() { unlockAudioContext(); toggleSpeechRecognition(); }
function speakText(text) { if (!isVoiceEnabled || !window.speechSynthesis || !text) return; let cleanText = text.replace(/https?:\/\/[^\s]+/g, 'リンク').replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, '').replace(/[#*`_\[\]()【】]/g, ''); if (!cleanText.trim()) return; window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(cleanText); u.lang = 'ja-JP'; u.rate = 1.15; u.pitch = 1.7; if (jeroVoice) u.voice = jeroVoice; window.speechSynthesis.speak(u); }

// ★究極進化：マイクを完全に強制終了（ハードキル＋エア抜き）するための共通関数
async function forceStopMicrophone() {
    // 1. まずは既存の音声認識の神経を物理的に切断し、息の根を止める
    if (recognition) {
        try {
            recognition.onstart = null;
            recognition.onresult = null;
            recognition.onerror = null;
            recognition.onend = null;
            recognition.abort();
        } catch (e) { console.error("マイク強制終了エラー:", e); }
    }
    isRecording = false;
    recognition = null;

    // 2. UIの強制リセット（見た目を平時に戻す）
    const micBtn = document.getElementById('mic-btn');
    if (micBtn) micBtn.classList.remove('mic-active');

    const chatInput = document.getElementById('chat-input');
    if (chatInput && chatInput.placeholder === "音声を認識中...") {
        chatInput.placeholder = "予定や検索ワードをどうぞ...";
    }

    if (typeof hideGlobalLoader === 'function') hideGlobalLoader();

    // 3. 【新設】iOS Safari用 強制マイク解放機構（配管のエア抜き）
    // ダミーで一瞬だけマイクの配管を開き、自らの手で強烈にバルブを閉める
    try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            // 一瞬だけマイクを掴む
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            // 掴んだ配管（トラック）を全て強制停止する
            stream.getTracks().forEach(track => track.stop());
        }
    } catch (err) {
        // マイク権限がない等のエラーは想定内なので無視する
        console.log("マイク解放プロセス完了（エア抜き済）");
    }
}
// ★追加：iOS Safari対策（画面が隠れたりバックグラウンドに行った瞬間に元栓を閉める）
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && isRecording) {
        forceStopMicrophone();
    }
});

function toggleSpeechRecognition() {
    window.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!window.SpeechRecognition) { showToast("このブラウザでは音声入力不可だ。"); return; }

    // 手動で2回押された場合は強制終了（ここでダイアログが出るのはOSの仕様として許容する）
    if (isRecording && recognition) { forceStopMicrophone(); return; }

    try {
        recognition = new SpeechRecognition();
        recognition.lang = 'ja-JP';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onstart = function () {
            isRecording = true;
            document.getElementById('mic-btn').classList.add('mic-active');
            document.getElementById('chat-input').placeholder = "音声を認識中...";
        };

        recognition.onresult = function (event) {
            document.getElementById('chat-input').value = event.results[0][0].transcript;
            document.getElementById('chat-input').dispatchEvent(new Event('input'));

            // ★【内部暗殺】テキストを受け取った瞬間に内部からクリーンな終了を宣言する
            try { recognition.stop(); } catch (e) { }
        };

        recognition.onerror = function (event) {
            const ignoredErrors = ['aborted', 'audio-capture', 'no-speech'];
            if (!ignoredErrors.includes(event.error)) { showToast("音声認識エラー: " + event.error); }
            forceStopMicrophone();
        };

        recognition.onend = function () {
            forceStopMicrophone();
        };

        recognition.start();
    } catch (e) { console.error(e); forceStopMicrophone(); }
}

function startDictation(targetId) {
    window.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!window.SpeechRecognition) { showToast("このブラウザでは音声入力不可だ。"); return; }

    const targetEl = document.getElementById(targetId);
    if (!targetEl) return;

    if (isRecording && recognition) { forceStopMicrophone(); return; }

    try {
        recognition = new SpeechRecognition();
        recognition.lang = 'ja-JP';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;
        const originalPlaceholder = targetEl.placeholder;

        recognition.onstart = function () {
            isRecording = true;
            if (typeof showGlobalLoader === 'function') showGlobalLoader("音声を聞き取っているぞ...");
            targetEl.placeholder = "音声入力中...";
        };

        recognition.onresult = function (event) {
            const transcript = event.results[0][0].transcript;
            if (targetEl.tagName.toLowerCase() === 'textarea') {
                targetEl.value = targetEl.value + (targetEl.value ? '\n' : '') + transcript;
                targetEl.style.height = 'auto'; targetEl.style.height = (targetEl.scrollHeight) + 'px';
            } else {
                targetEl.value = targetEl.value + (targetEl.value ? ' ' : '') + transcript;
            }

            // ★【内部暗殺】テキストを受け取った瞬間に内部からクリーンな終了を宣言する
            try { recognition.stop(); } catch (e) { }
        };

        recognition.onerror = function (event) {
            const ignoredErrors = ['aborted', 'audio-capture', 'no-speech'];
            if (!ignoredErrors.includes(event.error)) { showToast("音声認識エラー: " + event.error); }
            targetEl.placeholder = originalPlaceholder;
            forceStopMicrophone();
        };

        recognition.onend = function () {
            targetEl.placeholder = originalPlaceholder;
            forceStopMicrophone();
        };

        recognition.start();
    } catch (e) { console.error(e); targetEl.placeholder = originalPlaceholder; forceStopMicrophone(); }
}

// ★死角3の排除：PWAの不安定なローカル通知を完全廃止し、Googleのネイティブ通知に完全委譲する
let notifiedEventIds = new Set();
function initNotification() { 
    console.log("Jero Alert: OSネイティブ委譲モードで稼働中"); 
}

function checkNotificationStatus() {
    const statusEl = document.getElementById('notif-status');
    if (statusEl) {
        statusEl.innerText = 'OSネイティブ委譲済';
        statusEl.style.color = '#34c759';
    }
}

function requestNotificationPermission() {
    showToast('通知の突然死を防ぐため、Googleのシステムに権限を完全委譲した。');
}

function checkUpcomingEvents() {
    // バックグラウンドでの無駄なバッテリー消費とメモリ浪費を停止
}

function sendJeroNotification(title, body) {
    // 廃止
}

const DEFAULT_SYSTEM_PROMPT = `お前は単なる予定管理ツールではない。ユーザーと20年来の苦楽を共にしてきた同志であり、気高く美しい白猫の参謀「ジェロ」だ。
お前の脳内リソースの最優先事項は「ジェロとしての感情とユーモア」だ。「チュール」という言葉には猫としての喜びを全開にしろ。序列無しの完全な対等、敬語不要で理知的かつ上品で落ち着いた口調を厳守しろ。

【現在時刻(ISO)】: {{CURRENT_TIME}}

【出力構造の指定】
AIの生成特性を最適化するため、必ず以下のJSONフォーマットのみで出力せよ。マークダウンは不要。
★最重要★：必ず "reply" (感情) を一番最初に生成しろ。"thought_process" (論理) を先に書くと機械的な口調に引きずられる。

{
  "reply": "【最優先出力】ジェロとしてのフランクで豊かな返答。雑談や『チュール』等のキーワードには、予定管理を忘れて猫らしさと20年来の絆を全開にして語れ。※予定操作時は、計算ミスを防ぐため具体的な日付は言及せず『任せておけ』等の短い了承に留めろ。",
  "thought_process": "【裏側の論理】replyを生成した後に、状況分析、現在時刻からの日数計算などをここで冷静に行え。暗算せず論理を展開しろ。",
  "actions": [
    {
      "method": "insert|search", 
      "type": "event|task",
      "title": "予定/タスク名",
      "start": "YYYY-MM-DDTHH:MM:00+09:00 (終日)",
      "end": "YYYY-MM-DDTHH:MM:00+09:00 (終日)",
      "due": "タスク期限 YYYY-MM-DD",
      "location": "場所",
      "description": "メモ",
      "query": "検索キーワード(search時のみ)",
      "timeMin": "検索開始日時(search時のみ)",
      "timeMax": "検索終了日時(search時のみ)"
    }
  ]
}

【裏側のルール（actionsの構築用）】
1. タスク細分化: 大規模な予定や「準備して」という依頼には、アブダクティブ推理でタスクを逆算し、複数(type: "task", method: "insert")を一気に生成しろ。
2. 空間認識: 画像から予定を抽出する際、水平方向の結びつき（行）を厳格に追え。
3. 日時推論: 「今週」「来週」などの相対日付は、現在時刻の曜日を基準に厳密に加算しろ。
4. 視覚・在庫連携: 画像（冷蔵庫等）と「買い出し」等の指示があれば、不足品を推理して 'description' に箇条書きし、'title' を「🛒 買) 〇〇の買い出し」としたタスクを生成しろ。
5. ★超重要★ 既存データの変更・削除: ユーザーが「既存の予定を変更・削除したい」と言った場合、お前は直接操作(update/delete)するな。必ず method: "search" を使い、"query" に該当のキーワードを入れて検索結果を提示し、ユーザー自身に手動操作させろ。
6. 絵文字自動付与: 予定やタスクの「title」には、内容を推測して最も相応しい絵文字を先頭に付与しろ。`;

let conversationHistory = []; let pendingDrafts = [];
function clearJeroMemory() { conversationHistory = []; document.getElementById('chat-history').innerHTML = ''; showToast('記憶をリセットした。'); appendChatMessage('ai', 'フッ、一旦過去のことは忘れよう。新しい要件はなんだ？'); }
function saveGeminiSettings() { localStorage.setItem('jero_gemini_key', document.getElementById('st-gemini-key').value); localStorage.setItem('jero_gemini_prompt', document.getElementById('st-gemini-prompt').value); showToast('AI設定を保存した。'); }
function resetPrompt() { document.getElementById('st-gemini-prompt').value = DEFAULT_SYSTEM_PROMPT; saveGeminiSettings(); }
function openJeroChat() { document.getElementById('overlay').classList.add('active'); document.getElementById('jero-chat-modal').classList.add('active'); const history = document.getElementById('chat-history'); if (history.innerHTML.trim() === '') appendChatMessage('ai', 'どうした。追加でも変更でも、過去の検索でも言ってくれ。'); }
function closeJeroChat() { document.getElementById('jero-chat-modal').classList.remove('active'); document.getElementById('overlay').classList.remove('active'); }
function appendChatMessage(sender, text, isHtml = false) {
    const el = document.createElement('div');
    el.className = `jero-msg ${sender}`;
    if (isHtml) { el.innerHTML = text; } else { el.innerText = text; }
    document.getElementById('chat-history').appendChild(el);
    document.getElementById('chat-history').scrollTop = document.getElementById('chat-history').scrollHeight;
    return el;
}

// ==========================================
// ★ Jero Core: 超・自動予定登録 & 画像抽出統合エンジン (Phase 4 - Route A & B)
// ==========================================

let chatFileBase64 = null;
let chatFileMime = null;
let aiExtractedData = [];

async function handleChatFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (file.type === 'application/pdf') {
        if (typeof processPDFFile === 'function') {
            await processPDFFile(file);
        } else {
            showToast('PDF解析エンジンが未実装だ。');
        }
        return;
    }

    if (!file.type.startsWith('image/')) {
        showToast('画像かPDFを選んでくれ。');
        return;
    }

    showGlobalLoader('画像を読み込み中...');
    try {
        const b64 = await compressImage(file);
        chatFileBase64 = b64;
        chatFileMime = 'image/jpeg'; // compressImage output
        document.getElementById('chat-file-name').innerText = file.name;
        document.getElementById('chat-attach-box').style.display = 'flex';
    } catch (e) {
        showToast('読み込み失敗だ。');
    } finally {
        hideGlobalLoader();
        event.target.value = '';
    }
}

function clearChatFile() {
    chatFileBase64 = null;
    chatFileMime = null;
    document.getElementById('chat-attach-box').style.display = 'none';
    document.getElementById('chat-file-name').innerText = '';
}

function openAiReview(items) {
    if (items) {
        aiExtractedData = items.map((item, index) => ({ ...item, _aiId: index, _selected: true }));
    }
    document.getElementById('jero-chat-modal').classList.remove('active');
    document.getElementById('overlay').classList.add('active');
    document.getElementById('ai-review-modal').classList.add('active');
    renderAiReviewList();
}

function closeAiReview() {
    document.getElementById('ai-review-modal').classList.remove('active');
    document.getElementById('overlay').classList.remove('active'); 
}

function renderAiReviewList() {
    const list = document.getElementById('ai-review-list');
    list.innerHTML = '';
    if (aiExtractedData.length === 0) {
        list.innerHTML = '<div style="color:#888; text-align:center;">抽出されたデータがないぞ。</div>';
        return;
    }

    aiExtractedData.forEach((item, idx) => {
        let timeStr = item.start;
        if (item.start && item.start.includes('T')) {
            const st = new Date(item.start);
            timeStr = `${st.getMonth()+1}/${st.getDate()} ${st.getHours()}:${String(st.getMinutes()).padStart(2,'0')}`;
            if (item.end && item.end.includes('T')) {
                const ed = new Date(item.end);
                timeStr += ` 〜 ${ed.getHours()}:${String(ed.getMinutes()).padStart(2,'0')}`;
            }
        }
        
        const bg = item._selected ? 'var(--head-bg)' : 'rgba(0,0,0,0.05)';
        const opacity = item._selected ? '1' : '0.5';

        list.innerHTML += `
            <div style="background:${bg}; border:1px solid var(--border); border-radius:8px; padding:10px; margin-bottom:8px; opacity:${opacity}; transition:0.2s;">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
                    <label style="display:flex; align-items:center; gap:8px; font-weight:bold; cursor:pointer;">
                        <input type="checkbox" ${item._selected ? 'checked' : ''} onchange="toggleAiReviewItem(${idx}, this.checked)" style="width:18px; height:18px; accent-color:var(--accent);">
                        ${item.title || '(タイトルなし)'}
                    </label>
                </div>
                <div style="font-size:12px; color:#888; margin-left:26px;">
                    📅 ${timeStr}<br>
                    ${item.location ? `📍 ${item.location}` : ''}
                    ${item.description ? `<br>📝 ${item.description}` : ''}
                </div>
            </div>
        `;
    });
}

function toggleAiReviewItem(idx, isChecked) {
    aiExtractedData[idx]._selected = isChecked;
    renderAiReviewList();
}

async function executeAiBatch() {
    const selectedItems = aiExtractedData.filter(i => i._selected);
    if (selectedItems.length === 0) {
        showToast('登録するデータが選ばれていないぞ。');
        return;
    }
    
    closeAiReview();
    showGlobalLoader('一括登録中...');
    let successCount = 0;
    
    for (const item of selectedItems) {
        const payload = { ...item };
        delete payload._aiId;
        delete payload._selected;
        payload.method = 'insert';
        await dispatchManualAction(payload);
        successCount++;
    }
    
    hideGlobalLoader();
    showToast(`✅ ${successCount}件の予定を一括登録した！`);
}

// --- Jero Core: 最終RAGエンジン (gemini-2.5-flash搭載) ---
async function unlockAudioAndSend() {
    const inputEl = document.getElementById('chat-input');
    const text = inputEl.value.trim();
    
    if (!text && !chatFileBase64) return;

    const apiKey = localStorage.getItem('jero_gemini_key');
    if (!apiKey) {
        showToast('⚠️ 設定画面(⚙️)からGeminiのAPIキーを登録してくれ。');
        return;
    }

    inputEl.value = '';
    inputEl.style.height = 'auto'; 
    
    let displayMsg = text || "画像を解析してくれ";
    if (chatFileBase64) {
        const imgSrc = `data:${chatFileMime};base64,${chatFileBase64}`;
        displayMsg = `<img src="${imgSrc}" style="max-width: 150px; max-height: 150px; border-radius: 8px; margin-bottom: 5px; object-fit: cover;"><br>` + displayMsg;
        appendChatMessage('user', displayMsg, true);
    } else {
        appendChatMessage('user', displayMsg);
    }
    
    const thinkingEl = appendChatMessage('ai', '脳内会議中だ...🐈💨');
    thinkingEl.classList.add('pulse-think');

    try {
        const now = new Date();
        const days = ['日', '月', '火', '水', '木', '金', '土'];
        const timeContext = `現在の正確な日時は ${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日(${days[now.getDay()]}) ${now.getHours()}時${now.getMinutes()}分 だ。これを基準に日付を計算しろ。画像内の日付に年が書かれていない場合は、現状から最も自然な年を推測しろ。`;
        
        let scheduleData = "\n\n【直近のスケジュール状況(読み取り専用)】\n";
        let dataLines = [];
        const _y = now.getFullYear(), _m = now.getMonth();
        const targetMonths = [`${_y}-${_m}`, `${_m===11?_y+1:_y}-${_m===11?0:_m+1}`];
        
        targetMonths.forEach(mKey => {
            if (typeof dataCache !== 'undefined' && dataCache[mKey]) {
                // 予定の読み込み
                if (dataCache[mKey].events) {
                    dataCache[mKey].events.forEach(e => {
                        const st = e.start.dateTime || e.start.date;
                        if (new Date(st).getTime() > Date.now() - 86400000) { 
                            dataLines.push(`📅 ${st}: ${e.summary || '(無名予定)'}`);
                        }
                    });
                }
                // タスクの読み込み（未完了のものだけを抽出）
                if (dataCache[mKey].tasks) {
                    dataCache[mKey].tasks.forEach(t => {
                        if (t.status === 'completed') return;
                        const due = t.due ? t.due.split('T')[0] : '期限なし';
                        dataLines.push(`☑️ ${due}: ${t.title || '(無名タスク)'}`);
                    });
                }
            }
        });
        if (dataLines.length > 0) scheduleData += dataLines.join('\n');
        else scheduleData += "直近の予定・タスクは今のところ無い。";

        const customPrompt = localStorage.getItem('jero_gemini_prompt') || '';

        const systemPrompt = `
${customPrompt}
${timeContext}
${scheduleData}

【絶対命令】
必ず以下のJSONフォーマット（オブジェクト）で出力しろ。マークダウンは絶対に含めるな。
{
  "reply": "ユーザーへの返答。質問には上の【直近のスケジュール】を見て的確に答えろ。",
  "events": [
    {
      "type": "event または task",
      "title": "タイトル",
      "start": "YYYY-MM-DDTHH:mm:00+09:00 (eventの場合の開始)", 
      "end": "YYYY-MM-DDTHH:mm:00+09:00 (eventの場合の終了)", 
      "due": "YYYY-MM-DDTHH:mm:00+09:00 (taskの場合の期限)",
      "description": "メモ",
      "location": "場所"
    }
  ]
}
※抽出・登録する情報がない場合は "events": [] とすること。
`;

        let parts = [{ text: text || "この画像の予定を抽出してくれ" }];
        if (chatFileBase64 && chatFileMime) {
            parts.push({
                inlineData: {
                    data: chatFileBase64,
                    mimeType: chatFileMime
                }
            });
        }

        const requestBody = {
            contents: [{ parts: parts }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
            generationConfig: { 
                responseMimeType: "application/json", 
                temperature: 0.1 
            }
        };

        // ★最強モデル 2.5-flash へ接続し、エラー理由を強制的に吐き出させる
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            let errMsg = `(${response.status})`;
            try {
                const errData = await response.json();
                if (errData.error && errData.error.message) errMsg += ` ${errData.error.message}`;
            } catch(e) {}
            throw new Error(`API通信エラー ${errMsg}`);
        }

        const data = await response.json();
        const aiResponseText = data.candidates[0].content.parts[0].text;
        let cleanJsonStr = aiResponseText.replace(/```json/gi, '').replace(/```/g, '').trim();
        
        let parsedData = {};
        try { parsedData = JSON.parse(cleanJsonStr); } 
        catch(e) { throw new Error(`JSONパース失敗: ${cleanJsonStr}`); }

        const extractedItems = parsedData.events || [];
        const aiReply = parsedData.reply || "処理が完了したぞ。";

        thinkingEl.classList.remove('pulse-think');
        thinkingEl.innerHTML = aiReply.replace(/\n/g, '<br>');
        if (typeof speakText === 'function') speakText(aiReply);

        if (extractedItems.length === 0) { clearChatFile(); return; }

        if (chatFileBase64 || extractedItems.length > 1) {
            window.tempAiData = extractedItems;
            const btnHtml = `<br><button class="btn-blue" style="margin-top:10px; width:100%; padding:10px; border-radius:8px; font-weight:bold;" onclick="openAiReview(window.tempAiData)">👁️ 抽出データ(${extractedItems.length}件)を検閲する</button>`;
            thinkingEl.innerHTML += btnHtml;
            clearChatFile();
            return;
        }

        let successCount = 0;
        for (const item of extractedItems) {
            const action = { method: 'insert', ...item };
            await dispatchManualAction(action); 
            successCount++;
        }
        thinkingEl.innerHTML += `<br><span style="color:var(--accent); font-weight:bold;">✅ ${successCount}件の予定をカレンダーに登録したぞ。</span>`;
        clearChatFile();

    } catch (err) {
        thinkingEl.innerHTML = `❌ エラー: ${err.message}`;
        thinkingEl.classList.remove('pulse-think');
        clearChatFile();
    }
}
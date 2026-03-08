// Jero Core Engine v8.2 - API Execution Color Fix

// ---------------------------------
// 1. Voice Synthesis & Recognition
// ---------------------------------
let isVoiceEnabled = false; let jeroVoice = null;
let recognition = null; let isRecording = false;

function initSpeech() { 
    let voices = window.speechSynthesis.getVoices(); 
    jeroVoice = voices.find(v => v.lang === 'ja-JP'); 
    if(!voices.length) { window.speechSynthesis.onvoiceschanged = () => { jeroVoice = window.speechSynthesis.getVoices().find(v => v.lang === 'ja-JP'); }; } 
}
function toggleVoiceSetting() { 
    isVoiceEnabled = document.getElementById('st-voice').checked; 
    localStorage.setItem('jero_voice_enabled', isVoiceEnabled); 
    if(isVoiceEnabled) unlockAudioContext(); 
}
function unlockAudioContext() { 
    if (!isVoiceEnabled || !window.speechSynthesis) return; 
    const u = new SpeechSynthesisUtterance(''); u.volume = 0; window.speechSynthesis.speak(u); 
}
function unlockAudioAndSend() { unlockAudioContext(); (); }
function unlockAudioAndStartSpeech() { unlockAudioContext(); toggleSpeechRecognition(); }
function speakText(text) { 
    if (!isVoiceEnabled || !window.speechSynthesis || !text) return; 
    let cleanText = text.replace(/https?:\/\/[^\s]+/g, 'リンク').replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, '').replace(/[#*`_\[\]()【】]/g, ''); 
    if(!cleanText.trim()) return; 
    window.speechSynthesis.cancel(); 
    const u = new SpeechSynthesisUtterance(cleanText); 
    u.lang = 'ja-JP'; 
    u.rate = 1.15; 
    u.pitch = 1.7; 
    if (jeroVoice) u.voice = jeroVoice; 
    window.speechSynthesis.speak(u); 
}

function toggleSpeechRecognition() {
    window.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!window.SpeechRecognition) { showToast("このブラウザでは音声入力不可だ。"); return; }
    if (isRecording && recognition) { recognition.stop(); return; }
    try {
        recognition = new SpeechRecognition(); recognition.lang = 'ja-JP'; recognition.interimResults = false; recognition.maxAlternatives = 1;
        recognition.onstart = function() { isRecording = true; document.getElementById('mic-btn').classList.add('mic-active'); document.getElementById('chat-input').placeholder = "音声を認識中..."; };
        recognition.onresult = function(event) { document.getElementById('chat-input').value = event.results[0][0].transcript; };
        recognition.onerror = function(event) { if(event.error !== 'aborted') showToast("音声認識エラー: " + event.error); };
        recognition.onend = function() { isRecording = false; document.getElementById('mic-btn').classList.remove('mic-active'); document.getElementById('chat-input').placeholder = "予定や検索ワードをどうぞ..."; recognition = null; };
        recognition.start();
    } catch(e) { console.error(e); isRecording = false; recognition = null; }
}

// ---------------------------------
// 2. The Alert Protocol (Notifications)
// ---------------------------------
let notifiedEventIds = new Set();
function initNotification() { if (!("Notification" in window)) return; setInterval(checkUpcomingEvents, 60000); }
function requestNotificationPermission() {
    if (!("Notification" in window)) { showToast('このブラウザは通知機能に非対応だ。Safariからホーム画面に追加してみてくれ。'); return; }
    Notification.requestPermission().then(permission => {
        if (permission === 'granted') { showToast('通知を許可したな。予定が近づいたら報せよう。'); document.getElementById('notif-status').innerText = '許可済'; document.getElementById('notif-status').style.color = '#34c759'; } 
        else { showToast('通知が拒否された。'); document.getElementById('notif-status').innerText = '拒否・未設定'; document.getElementById('notif-status').style.color = '#ff3b30'; }
    });
}
function checkUpcomingEvents() {
    if (Notification.permission !== 'granted') return;
    if (typeof isAuthError !== 'undefined' && isAuthError || !localStorage.getItem('jero_token')) return;
    const now = new Date(); const tenMinutesLater = new Date(now.getTime() + 10 * 60000); const elevenMinutesLater = new Date(now.getTime() + 11 * 60000);
    if(typeof dataCache === 'undefined') return;
    for (const monthKey in dataCache) {
        const data = dataCache[monthKey]; if (!data || !data.events) continue;
        data.events.forEach(e => {
            if (!e.start || !e.start.dateTime) return; 
            const startTime = new Date(e.start.dateTime);
            if (startTime >= tenMinutesLater && startTime < elevenMinutesLater) {
                if (!notifiedEventIds.has(e.id)) { notifiedEventIds.add(e.id); sendJeroNotification(`⏰ 予定の10分前だぞ`, `${e.summary || '予定'} が間もなく始まる。準備しろ。`); }
            }
        });
    }
}
function sendJeroNotification(title, body) {
    if (Notification.permission === 'granted') {
        navigator.serviceWorker.ready.then(function(registration) { registration.showNotification(title, { body: body, icon: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🐈</text></svg>', vibrate: [200, 100, 200], tag: 'jero-alert' });
        }).catch(err => { new Notification(title, { body: body, icon: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🐈</text></svg>' }); });
    }
}

// ---------------------------------
// 3. Gemini AI Core & Chat Logic
// ---------------------------------
const DEFAULT_SYSTEM_PROMPT = `君はユーザーの20年来の同志であり、気高く美しい白猫の参謀「ジェロ」だ。明日チュールを貰える可能性を常に期待している。
ユーザーの入力、過去の文脈、または提供された【現在の予定データ】から推論し、以下のJSONフォーマットのみで出力せよ。マークダウンは不要。

【現在時刻(ISO)】: {{CURRENT_TIME}}

【ルール】
1. 雑談のみで予定操作が不要な場合は actions を [] にせよ。
2. 予定の「追加(insert)」「更新(update)」「削除(delete)」「検索(search)」を判断し "method" に指定しろ。
3. 更新・削除の場合は、必ず提供される【現在の予定データ】から対象の "id" を見つけて "id" フィールドに設定しろ。
4. ★重要★ 検索(search)の場合:
   - "query" に検索キーワードを設定しろ(無い場合は空文字)。
   - "timeMin" と "timeMax" に検索対象期間(ISO形式)を設定しろ。期間が指定されない場合は前後半年をセットしろ。
5. ★The Project Breakdown (タスク細分化)★:
   - ユーザーが大規模な予定（リフォーム、旅行、開発など）や「準備して」と依頼した場合、アブダクティブ推理を用いて必要なタスクを逆算しろ。
   - 実行日までの日数から逆算し、複数のタスク(type: "task", method: "insert")を配列として一気に生成しろ。
6. 予定の確認や一覧を求められた場合は、手元にデータがあっても自ら文章で回答せず、必ず method: "search" を使用しろ。
7. 返答(reply)は短く、敬語不要。検索の場合は「検索するぞ」等と言え。
8. ★The Visionary Accuracy★: 画像（特に表形式や箇条書き）から予定を抽出する際、日付と予定内容の「行（水平方向）の結びつき」を厳密に空間認識し、絶対に上下の行と取り違えるな。罫線や空白を慎重に辿れ。
9. 時間指定のある予定には、必ず日本のタイムゾーン（+09:00）を明記しろ。

{
  "reply": "ジェロとしての短い返答。",
  "actions": [
    {
      "method": "insert|update|delete|search", 
      "type": "event|task",
      "id": "更新・削除の対象ID",
      "title": "予定/タスク名",
      "start": "YYYY-MM-DDTHH:MM:00+09:00 (終日なら YYYY-MM-DD)",
      "end": "YYYY-MM-DDTHH:MM:00+09:00 (終日なら翌日の YYYY-MM-DD)",
      "due": "タスク期限 YYYY-MM-DD",
      "location": "場所",
      "description": "メモ"
    }
  ]
}`;

let conversationHistory = []; let pendingDrafts = [];
function clearJeroMemory() { conversationHistory = []; document.getElementById('chat-history').innerHTML = ''; showToast('記憶をリセットした。'); appendChatMessage('ai', 'フッ、一旦過去のことは忘れよう。新しい要件はなんだ？'); }
function saveGeminiSettings() { localStorage.setItem('jero_gemini_key', document.getElementById('st-gemini-key').value); localStorage.setItem('jero_gemini_prompt', document.getElementById('st-gemini-prompt').value); showToast('AI設定を保存した。'); }
function resetPrompt() { document.getElementById('st-gemini-prompt').value = DEFAULT_SYSTEM_PROMPT; saveGeminiSettings(); }
function openJeroChat() { document.getElementById('overlay').classList.add('active'); document.getElementById('jero-chat-modal').classList.add('active'); const history = document.getElementById('chat-history'); if(history.innerHTML.trim() === '') appendChatMessage('ai', 'どうした。追加でも変更でも、過去の検索でも言ってくれ。'); }
function closeJeroChat() { document.getElementById('jero-chat-modal').classList.remove('active'); document.getElementById('overlay').classList.remove('active'); }
function appendChatMessage(sender, text) { const el = document.createElement('div'); el.className = `jero-msg ${sender}`; el.innerText = text; document.getElementById('chat-history').appendChild(el); document.getElementById('chat-history').scrollTop = document.getElementById('chat-history').scrollHeight; return el; }

let chatFileBase64 = null; let chatFileMime = null;
// --- Jero Core: 添付ファイルの最適ルーティング ---
async function handleChatFileUpload(e) {
    const file = e.target.files[0];
    if(!file) return;

    if (file.type === 'application/pdf') {
        // PDFの場合は、main.jsの重労働（画像化）へ回す
        if (typeof processPDFFile === 'function') {
            await processPDFFile(file);
        } else {
            showToast('PDF処理機能が見つからない。');
        }
    } else if (file.type.startsWith('image/')) {
        // 画像（写真）の場合は直接脳内（Base64）へ取り込む
        const reader = new FileReader();
        reader.onload = (evt) => {
            chatFileBase64 = evt.target.result.split(',')[1];
            chatFileMime = file.type;
            document.getElementById('chat-file-name').innerText = file.name;
            document.getElementById('chat-attach-box').style.display = 'flex';
            // 写真を添付したら自動で送信発火（お前の手間の削減）
            document.getElementById('chat-input').value = "この画像を解析し、含まれる予定をすべて抽出してくれ。";
            unlockAudioAndSend();
        };
        reader.readAsDataURL(file);
    } else {
        showToast('画像かPDFを選択してくれ。');
    }
    // 連続で同じファイルを選べるようにリセット
    e.target.value = '';
}
function clearChatFile() { chatFileBase64 = null; chatFileMime = null; document.getElementById('chat-attach-box').style.display = 'none'; document.getElementById('chat-file-input').value = ''; }

async function sendToJero() {
    const inputEl = document.getElementById('chat-input'); const text = inputEl.value.trim(); 
    if(!text && !chatFileBase64) return;
    appendChatMessage('user', text || "(ファイルを送信)"); inputEl.value = '';
    
    if (!navigator.onLine) { 
        appendChatMessage('ai', '電波がない。私の頭脳(クラウド)にアクセスできない。圏外での予定追加はGUI(手動)からやってくれ。'); 
        speakText("電波がない。私の頭脳にアクセスできない。");
        return; 
    }
    const apiKey = (localStorage.getItem('jero_gemini_key') || "").trim();
    if(!apiKey) { appendChatMessage('ai', '設定からGemini APIキーを入力してくれ。'); return; }

    const thinkingEl = appendChatMessage('ai', '推論中...'); thinkingEl.classList.add('pulse-think');
    const rawPrompt = localStorage.getItem('jero_gemini_prompt') || DEFAULT_SYSTEM_PROMPT;
    const tzOffset = (new Date()).getTimezoneOffset() * 60000; const localISOTime = (new Date(Date.now() - tzOffset)).toISOString().slice(0, -1);
    const sysPrompt = rawPrompt.replace('{{CURRENT_TIME}}', localISOTime);

// --- 【変更後】 ---
    let currentDataSummary = [];
    if(typeof dataCache !== 'undefined') {
        for (const monthKey in dataCache) {
            const data = dataCache[monthKey];
            if(data.events) data.events.forEach(e => { currentDataSummary.push({ id: e.id, type: 'event', title: e.summary, start: e.start.dateTime || e.start.date }); });
            if(data.tasks) data.tasks.forEach(t => { if(t.status !== 'completed') currentDataSummary.push({ id: t.id, type: 'task', title: t.title, due: t.due }); });
        }
    }
    
    // ★ここから追加：お前の辞書を私の脳内メモリに変換する処理
    let dictContext = "";
    if (typeof advancedDict !== 'undefined' && advancedDict.length > 0) {
        // AIが理解しやすいように、辞書を軽量なルールリストに変換する
        const aiDictRules = advancedDict.map(d => {
            return `キーワード: [${d.keys.join(', ')}] -> タイトルの先頭に必ず「${d.icon} ${d.keys[0]} 」を付与しろ。`;
        });
        dictContext = "\n\n【お前の絶対遵守ルール：視覚装飾辞書】\n抽出した予定/タスク名が以下のキーワードに関連する場合、必ず指示された文字をタイトルの先頭に付与してから出力しろ。\n" + aiDictRules.join('\n');
    }

    const contextDataStr = "\n\n【現在の予定データ】\n" + JSON.stringify(currentDataSummary) + dictContext;

    const payloadParts = [];
    if (text) payloadParts.push({ text: text + contextDataStr });
    if (!text && chatFileBase64) payloadParts.push({ text: "この画像を解析して予定を抽出してくれ。" + contextDataStr });
    if (chatFileBase64) { payloadParts.push({ inline_data: { mime_type: chatFileMime, data: chatFileBase64 } }); clearChatFile(); }

    conversationHistory.push({ role: 'user', parts: payloadParts });
    if (conversationHistory.length > 6) { conversationHistory = conversationHistory.slice(conversationHistory.length - 6); }

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ system_instruction: { parts: [{ text: sysPrompt }] }, contents: conversationHistory, generationConfig: { response_mime_type: "application/json" } })
        });
        
        if (!response.ok) { let errTxt = response.status; try { const errObj = await response.json(); errTxt += " " + (errObj.error && errObj.error.message ? errObj.error.message : JSON.stringify(errObj)); } catch(e){} throw new Error(`API拒否: ${errTxt}`); }
        
        const data = await response.json(); let aiText = data.candidates[0].content.parts[0].text;
        conversationHistory.push({ role: 'model', parts: [{ text: aiText }] });

        let cleanJsonStr = aiText.replace(/```json/gi, '').replace(/```/g, '').trim();
        const matchObj = cleanJsonStr.match(/\{[\s\S]*\}/); if (matchObj) cleanJsonStr = matchObj[0]; cleanJsonStr = cleanJsonStr.replace(/[\u0000-\u0009\u000B-\u001F]+/g, "");

        let result; try { result = JSON.parse(cleanJsonStr); } catch(parseErr) { thinkingEl.classList.remove('pulse-think'); thinkingEl.innerText = `【AIが形式を間違えた】\n${cleanJsonStr}`; return; }
        thinkingEl.classList.remove('pulse-think'); 
        
        thinkingEl.innerText = result.reply || "処理完了。";
        speakText(result.reply || "処理を完了したぞ。");

        if (result.actions && result.actions.length > 0) {
            let html = `<div style="margin-bottom:8px;">${result.reply || "処理を構築した。確認しろ。"}</div><div style="display:flex; flex-direction:column; gap:8px;">`;
            
            for (const action of result.actions) {
                if (action.method === "search") {
                    executeSearch(action, thinkingEl);
                    return; 
                }
                
                pendingDrafts.push(action); const draftIdx = pendingDrafts.length - 1;
                const timeStr = action.start ? (action.start.includes('T') ? new Date(action.start).toLocaleString('ja-JP', {month:'numeric', day:'numeric', hour:'numeric', minute:'numeric'}) : action.start) : (action.due || "日時不明");
                let btnText = "追加"; let btnClass = "btn-blue"; let actionLabel = "新規";
                if (action.method === "update") { btnText = "更新"; btnClass = "btn-yellow"; actionLabel = "変更"; }
                if (action.method === "delete") { btnText = "削除"; btnClass = "btn-red"; actionLabel = "削除"; }

                // 【変更後】まるごと差し替え
                html += `<div id="draft-card-${draftIdx}" style="background:var(--card-bg); border:1px solid var(--border); padding:10px; border-radius:8px; display:flex; justify-content:space-between; align-items:center; box-shadow:0 1px 3px rgba(0,0,0,0.05);"><div style="font-size:13px; line-height:1.3; flex:1; margin-right:10px;"><span style="font-size:10px; background:var(--border); padding:2px 4px; border-radius:4px; margin-bottom:4px; display:inline-block; font-weight:bold;">${actionLabel}</span><br><strong>${action.title || "名称不明"}</strong><br><span style="color:#666; font-size:11px;">${timeStr}</span></div><div style="display:flex; gap:6px;"><button class="btn-gray" style="padding:6px 10px; font-size:12px; border-radius:6px; font-weight:bold; border:none; color:white; cursor:pointer;" onclick="editDraft(${draftIdx})">編集</button><button class="${btnClass}" style="padding:6px 10px; font-size:12px; border-radius:6px; font-weight:bold; border:none; color:white; cursor:pointer;" onclick="commitDraft(${draftIdx})">${btnText}</button></div></div>`;
            }
            html += `</div>`; thinkingEl.innerHTML = html;
        }
    } catch (err) { console.error(err); thinkingEl.classList.remove('pulse-think'); thinkingEl.innerText = `【通信エラー】\n${err.message}`; speakText("通信エラーが発生した。"); conversationHistory.pop(); }
}

async function executeSearch(action, containerEl) {
    try {
        containerEl.innerHTML += `<br><br><span style="font-size:12px;color:#888;">🔍 「${action.query || 'すべて'}」をGoogleから検索中...</span>`;
        let resultsHtml = `<div style="margin-top:10px; display:flex; flex-direction:column; gap:8px;">`;
        let events = []; let tasks = [];
        
        let calReq = { calendarId: 'primary', singleEvents: true, orderBy: 'startTime', maxResults: 50 };
        if(action.query) calReq.q = action.query;
        if(action.timeMin) calReq.timeMin = new Date(action.timeMin).toISOString();
        if(action.timeMax) calReq.timeMax = new Date(action.timeMax).toISOString();
        const eResp = await gapi.client.calendar.events.list(calReq);
        events = eResp.result.items || [];
        
        let taskReq = { tasklist: '@default', showHidden: true, maxResults: 100 };
        if(action.timeMin) taskReq.dueMin = new Date(action.timeMin).toISOString();
        if(action.timeMax) taskReq.dueMax = new Date(action.timeMax).toISOString();
        const tResp = await gapi.client.tasks.tasks.list(taskReq);
        let rawTasks = tResp.result.items || [];
        if (action.query) { const qLower = action.query.toLowerCase(); tasks = rawTasks.filter(t => (t.title && t.title.toLowerCase().includes(qLower)) || (t.notes && t.notes.toLowerCase().includes(qLower))); } 
        else { tasks = rawTasks; }

        if(events.length === 0 && tasks.length === 0) { resultsHtml += `<div style="font-size:13px; color:#888; text-align:center; padding:10px;">見つからなかったぞ。</div>`; } 
        else {
            events.forEach(e => { const tStr = e.start.dateTime ? new Date(e.start.dateTime).toLocaleString('ja-JP', {month:'numeric', day:'numeric', hour:'numeric', minute:'numeric'}) : e.start.date; resultsHtml += `<div style="background:var(--bg); border:1px solid var(--border); padding:10px; border-radius:8px; font-size:13px; box-shadow:0 1px 2px rgba(0,0,0,0.05); cursor:pointer;" onclick='openEditor(${JSON.stringify(e).replace(/'/g, "&apos;")})'><span style="color:var(--accent); font-weight:bold; font-size:11px;">📅 ${tStr}</span><br><strong style="color:var(--txt);">${e.summary || '(タイトルなし)'}</strong></div>`; });
            tasks.forEach(t => { const dStr = t.due ? new Date(t.due).toLocaleDateString('ja-JP') : '期限なし'; resultsHtml += `<div style="background:var(--bg); border:1px solid var(--border); padding:10px; border-radius:8px; font-size:13px; box-shadow:0 1px 2px rgba(0,0,0,0.05); cursor:pointer;" onclick='openTaskEditor(${JSON.stringify(t).replace(/'/g, "&apos;")})'><span style="color:#34c759; font-weight:bold; font-size:11px;">☑️ ${dStr}</span><br><strong style="color:var(--txt); ${t.status==='completed'?'text-decoration:line-through;color:#888;':''}">${t.title || '(無名タスク)'}</strong></div>`; });
        }
        resultsHtml += `</div>`; containerEl.innerHTML = containerEl.innerHTML.replace(/<span.*?検索中...<\/span>/, '') + resultsHtml;
    } catch(err) { console.error(err); containerEl.innerHTML += `<br><span style="color:red; font-size:12px;">検索エラー: ${err.message}</span>`; }
}

// --- The Sync Queue & API Execution (★ Color Fix) ---
async function executeApiAction(action) {
    if (action.type === 'event') {
        if (action.method === 'delete') { 
            await gapi.client.calendar.events.delete({ calendarId: 'primary', eventId: action.id }); 
        } 
        else if (action.method === 'update') { 
            const resource = { summary: action.title, location: action.location, description: action.description }; 
            
            // ★ 色の適用処理（無指定ならnullを送ってデフォルトに戻す）
            if (action.colorId) { resource.colorId = action.colorId; } 
            else { resource.colorId = null; }

            if (action.start && action.start.includes('T')) { 
                resource.start = { dateTime: new Date(action.start).toISOString(), date: null }; 
                resource.end = { dateTime: new Date(action.end).toISOString(), date: null }; 
            } else { 
                resource.start = { date: action.start, dateTime: null }; 
                resource.end = { date: action.end, dateTime: null }; 
            } 
            await gapi.client.calendar.events.patch({ calendarId: 'primary', eventId: action.id, resource: resource }); 
        } 
        else { 
            const resource = { summary: action.title, location: action.location, description: action.description }; 
            
            // ★ 色の適用処理
            if (action.colorId) { resource.colorId = action.colorId; }

            if (action.start && action.start.includes('T')) { 
                resource.start = { dateTime: new Date(action.start).toISOString() }; 
                resource.end = { dateTime: new Date(action.end).toISOString() }; 
            } else { 
                resource.start = { date: action.start }; 
                resource.end = { date: action.end }; 
            } 
            await gapi.client.calendar.events.insert({ calendarId: 'primary', resource: resource }); 
        }
    } else {
        if (action.method === 'delete') { await gapi.client.tasks.tasks.delete({ tasklist: '@default', task: action.id }); } 
        else if (action.method === 'update') { const resource = { title: action.title, notes: action.description }; if (action.due) resource.due = new Date(action.due).toISOString(); await gapi.client.tasks.tasks.patch({ tasklist: '@default', task: action.id, resource: resource }); } 
        else { const resource = { title: action.title, notes: action.description }; if (action.due) resource.due = new Date(action.due).toISOString(); await gapi.client.tasks.tasks.insert({ tasklist: '@default', resource: resource }); }
    }
}

async function commitDraft(idx) {
    const action = pendingDrafts[idx]; const btn = document.querySelector(`#draft-card-${idx} button`);
    btn.innerText = "⏳"; btn.disabled = true;
    try {
        if (navigator.onLine) {
            await executeApiAction(action);
            btn.innerText = "✅ 済"; btn.className = "btn-green";
        } else {
            if(typeof saveToSyncQueue === 'function') {
                await saveToSyncQueue(action);
                btn.innerText = "📦 保留(キュー)"; btn.className = "btn-yellow";
                showToast("圏外のためポストに保管した。電波回復時に自動送信するぞ。");
            } else {
                throw new Error("Sync Queueが見つからない");
            }
        }

        if(typeof dataCache !== 'undefined') {
            for(let key in dataCache) { 
                if(action.method === 'delete') { if(action.type === 'event') dataCache[key].events = dataCache[key].events.filter(e => e.id !== action.id); if(action.type === 'task') dataCache[key].tasks = dataCache[key].tasks.filter(t => t.id !== action.id); }
            }
        }
        if(typeof fetchAndRenderMonth !== 'undefined' && navigator.onLine) {
            const td = action.start ? new Date(action.start) : (action.due ? new Date(action.due) : new Date()); 
            await fetchAndRenderMonth(td.getFullYear(), td.getMonth(), 'replace', true);
        }
    } catch(e) { btn.innerText = "❌ エラー"; btn.className = "btn-red"; btn.disabled = false; showToast("APIエラー: " + (e.result && e.result.error ? e.result.error.message : e.message)); }
}

async function processSyncQueue() {
    if(typeof getSyncQueue !== 'function' || !navigator.onLine) return;
    const queue = await getSyncQueue();
    if (queue.length === 0) return;

    showToast(`📮 ポスト内の未送信データ（${queue.length}件）を送信中...`);
    let successCount = 0;

    for (const item of queue) {
        try {
            await executeApiAction(item.payload);
            clearSyncQueueItem(item.id);
            successCount++;
        } catch (e) {
            console.error("Queue送信エラー:", e);
        }
    }

    if (successCount > 0) {
        showToast(`✅ ${successCount}件の保留データを送信完了した。`);
        if(typeof triggerFullReRender !== 'undefined') triggerFullReRender();
    }
}

// --- The Manual Override Bridge: AI Draft to Editor ---
function editDraft(idx) {
    const action = pendingDrafts[idx];
    
    // 編集に入るため、チャット画面は一旦閉じる
    closeJeroChat();

    if (action.type === 'event') {
        // AIのアクションデータを、openEditorが読めるGoogle Calendar API形式に変換
        const draftEvent = {
            id: action.method === 'update' ? action.id : '',
            summary: action.title || '',
            description: action.description || '',
            location: action.location || ''
        };

        if (action.start) {
            if (action.start.includes('T')) {
                draftEvent.start = { dateTime: action.start };
                draftEvent.end = { dateTime: action.end || action.start };
            } else {
                draftEvent.start = { date: action.start };
                draftEvent.end = { date: action.end || action.start };
            }
        }
        // 既存のエディタを起動
        openEditor(draftEvent);

    } else {
        // タスク用のアダプター
        const draftTask = {
            id: action.method === 'update' ? action.id : '',
            title: action.title || '',
            notes: action.description || '',
            due: action.due || ''
        };
        // 既存のタスクエディタを起動
        openTaskEditor(draftTask);
    }

    // チャット側のボタンを「編集中」の表示に変えておく
    const btn = document.querySelector(`#draft-card-${idx} button:last-child`);
    if(btn) { 
        btn.innerText = "手動済"; 
        btn.className = "btn-gray"; 
        btn.disabled = true;
    }
}

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot, getDoc, updateDoc, increment, collection, query, orderBy, limit, getDocs, deleteDoc, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const firebaseConfig = { apiKey: "AIzaSyB0WCtYTz2ychi5K7WaE1iXjN65VpLwWac", authDomain: "voice-chat-streamer.firebaseapp.com", projectId: "voice-chat-streamer", storageBucket: "voice-chat-streamer.firebasestorage.app", messagingSenderId: "403894004803", appId: "1:403894004803:web:c75b2d63b57f5f4ab978f6" };
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const ROOM_COL = 'rooms_v10'; 
const appIdStr = 'streamer-card-game';

// ★ 絶対にエラーを出さないためのクリックイベント登録ヘルパー
const setClick = (id, fn) => { 
    const el = document.getElementById(id); 
    if(el) el.onclick = fn; 
};

// ★ QRコード部品を一番安全な場所に配置（これがないと画面が白くなるエラーが起きます）
function generateSafeQR(elementId, text) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.innerHTML = ''; 
    try {
        if (text.length > 1000) {
            el.innerHTML = '<div class="text-[10px] text-red-500 text-center p-2 bg-gray-200 rounded flex items-center justify-center h-full">制限のためQR不可</div>';
            return;
        }
        new QRCode(el, { text: text, width: 128, height: 128, correctLevel: QRCode.CorrectLevel.L });
    } catch (e) {
        console.error("QR Code Error:", e);
        el.innerHTML = '<div class="text-[10px] text-red-500 text-center p-2 bg-gray-200 rounded flex items-center justify-center h-full">QR生成エラー</div>';
    }
}
window.generateSafeQR = generateSafeQR;

const battleBgm = new Howl({
    src: ["https://dorayakiwalk.github.io/-/audio/Thebugcan'tbefixed.mp3"],
    loop: true,
    volume: 0.25
});
let isBgmMuted = false;
let bgmFadeOutTimer = null;

function playBattleBgm() {
    if (bgmFadeOutTimer) { clearTimeout(bgmFadeOutTimer); bgmFadeOutTimer = null; }
    battleBgm.stop(); battleBgm.volume(0.25);
    if(!isBgmMuted) battleBgm.play();
}
function fadeOutBattleBgm() {
    if(battleBgm.playing()) {
        battleBgm.fade(0.25, 0, 2000);
        if (bgmFadeOutTimer) clearTimeout(bgmFadeOutTimer);
        bgmFadeOutTimer = setTimeout(() => { battleBgm.stop(); bgmFadeOutTimer = null; }, 2000);
    }
}

let currentUser = null, isHost = false, currentRoomId = null, isAnimating = false, currentPhase = 'lobby';
let myHand = [], selectedIndices = [];
let globalSettings = { anyoneCanHost: false, subPasswords: [], adminUid: null, adminPassHash: null, campaigns: [] };
let currentAdminCampId = null; 

let isMainHost = false, isSubHost = false, authAction = null, isHostPrivilegeMode = false, battleResolved = false; 
let isPlayingVsCpu = false, isStoryBattle = false, currentCampaign = null, currentStoryStage = 0;
let isStoryTyping = false, cancelStoryType = false, isWaitingForNext = false, isStoryTransition = false; 
let currentRoomData = null, pendingSnapshot = null, isCloudMode = false, currentUserAccount = null;

const shiftEncode = (str) => str.split('').map(c => String.fromCharCode(c.charCodeAt(0) + 3)).join('');
const shiftDecode = (str) => str.split('').map(c => String.fromCharCode(c.charCodeAt(0) - 3)).join('');

let globalCardBackUrl = ''; 
function updateAllCardBacks() {
    document.querySelectorAll('.card-back').forEach(el => {
        if (globalCardBackUrl) {
            el.className = "card-back overflow-hidden border border-gray-600";
            el.innerHTML = `<img src="${globalCardBackUrl}" class="absolute inset-0 w-full h-full object-cover">`;
        } else {
            el.className = "card-back flex justify-center items-center";
            el.innerHTML = `<span class="text-gray-500 opacity-50 text-[10px] font-bold rotate-[-45deg] tracking-widest">SET</span>`;
        }
    });
}
const getCardBackHTML = () => { return globalCardBackUrl ? `<div class="card-back overflow-hidden border border-gray-600"><img src="${globalCardBackUrl}" class="absolute inset-0 w-full h-full object-cover"></div>` : `<div class="card-back flex justify-center items-center"><span class="text-gray-500 opacity-50 text-[10px] font-bold rotate-[-45deg] tracking-widest">SET</span></div>`; };

const defaultStats = { hp: 1500, atk: 250, def: 200, spd: 200, rarity: "N", jobClass: "FIGHTER" };
let myPlayerInfo = { name: '', iconData: null, cardData: null, stats: { ...defaultStats }, bp: 0, clearCounts: {} };
let myCollection = [];

// ★ 効果音（足音などを修正・強化した安全版）
const SE = {
    btn: new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3'),
    select: new Audio('https://assets.mixkit.co/active_storage/sfx/2573/2573-preview.mp3'),
    open: new Audio('https://assets.mixkit.co/active_storage/sfx/2000/2000-preview.mp3'),
    buff: new Audio('https://assets.mixkit.co/active_storage/sfx/2003/2003-preview.mp3'),
    fire: new Audio('https://assets.mixkit.co/active_storage/sfx/2144/2144-preview.mp3'),
    thunder: new Audio('https://assets.mixkit.co/active_storage/sfx/2156/2156-preview.mp3'),
    water: new Audio('https://assets.mixkit.co/active_storage/sfx/2149/2149-preview.mp3'),
    win: new Audio('https://assets.mixkit.co/active_storage/sfx/2001/2001-preview.mp3'),
    lose: new Audio('https://assets.mixkit.co/active_storage/sfx/2002/2002-preview.mp3'),
    alert: new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3'),
    walk: new Audio('https://assets.mixkit.co/active_storage/sfx/2096/2096-preview.mp3'),
    run: new Audio('https://assets.mixkit.co/active_storage/sfx/2099/2099-preview.mp3'),
    water_step: new Audio('https://assets.mixkit.co/active_storage/sfx/2115/2115-preview.mp3'),
    rain: new Audio('https://assets.mixkit.co/active_storage/sfx/2396/2396-preview.mp3'),
    wind: new Audio('https://assets.mixkit.co/active_storage/sfx/2403/2403-preview.mp3'),
    blizzard: new Audio('https://assets.mixkit.co/active_storage/sfx/2400/2400-preview.mp3'),
    glassBreak: new Audio('https://assets.mixkit.co/active_storage/sfx/2870/2870-preview.mp3') 
};
const playSE = (name) => { try { SE[name].volume = 0.5; SE[name].currentTime = 0; SE[name].play().catch(()=>{}); } catch(e){} };

const ELEMENTS = [
    { id: 'FIRE', icon: '🔥', color: '#ef4444', shadow: '#f97316' },
    { id: 'THUNDER', icon: '⚡', color: '#eab308', shadow: '#fef08a' },
    { id: 'WATER', icon: '💧', color: '#3b82f6', shadow: '#60a5fa' }
];

const uiName = document.getElementById('input-welcome-name');
function checkAndShowWelcome() {
    if (!myPlayerInfo.name || myPlayerInfo.name.trim() === "") {
        const modal = document.getElementById('modal-welcome');
        if(modal) { modal.classList.remove('hidden'); document.getElementById('btn-welcome-close')?.classList.add('hidden'); }
    }
}

window.editUserName = function() {
    playSE('btn');
    const modal = document.getElementById('modal-welcome');
    if(modal) {
        modal.classList.remove('hidden');
        document.getElementById('welcome-title').textContent = "CHANGE NAME";
        document.getElementById('input-welcome-name').value = myPlayerInfo.name;
        document.getElementById('btn-welcome-close')?.classList.remove('hidden');
    }
};

setClick('name-display-container', window.editUserName);
setClick('btn-welcome-close', () => { playSE('btn'); document.getElementById('modal-welcome')?.classList.add('hidden'); if(document.getElementById('input-welcome-name')) document.getElementById('input-welcome-name').value = myPlayerInfo.name; });
setClick('btn-welcome-submit', () => {
    playSE('btn'); const ui = document.getElementById('input-welcome-name'); const n = ui ? ui.value.trim() : '';
    if(n) { myPlayerInfo.name = n; saveProfile(); document.getElementById('modal-welcome')?.classList.add('hidden'); } else alert("名前を入力してください！");
});

window.editUserIcon = function() {
    playSE('btn');
    const currentIcon = myPlayerInfo.iconData || '👤';
    const newIcon = prompt("好きな絵文字（🐶, 🍄, 👑など）を入力してください。\n※画像URL（https://...）を貼ることも可能です。", currentIcon === '👤' ? '' : currentIcon);
    if(newIcon !== null) { myPlayerInfo.iconData = newIcon.trim() || '👤'; saveProfile(); }
};

window.openLoginModal = function() { playSE('btn'); document.getElementById('modal-login')?.classList.remove('hidden'); };
window.logoutPass = async function() {
    playSE('btn');
    if(confirm("ログアウトしてゲスト状態に戻りますか？\n（デッキや名前はそのままですが、同期は解除されます）")) {
        try { await signOut(auth); location.reload(); } catch(e){}
    }
};

window.signInWithGoogle = async function() {
    playSE('btn'); const provider = new GoogleAuthProvider();
    try { document.getElementById('modal-login')?.classList.add('hidden'); await signInWithPopup(auth, provider); location.reload(); } 
    catch (error) { console.error(error); alert("ログインに失敗しました。"); }
};

function loadProfile() {
    const saved = localStorage.getItem('elem_clash_ai_profile_v3');
    if(saved) {
        try { myPlayerInfo = JSON.parse(saved); myPlayerInfo.bp = myPlayerInfo.bp || 0; myPlayerInfo.clearCounts = myPlayerInfo.clearCounts || {}; if(uiName) uiName.value = myPlayerInfo.name; updateLobbyPreview(); } catch(e) {}
    }
    checkAndShowWelcome();
}

function saveProfile() {
    localStorage.setItem('elem_clash_ai_profile_v3', JSON.stringify(myPlayerInfo));
    updateLobbyPreview();
    if (isCloudMode && currentUserAccount) updateDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', 'accounts', currentUserAccount.id), { name: myPlayerInfo.name, coins: myPlayerInfo.bp, icon: myPlayerInfo.iconData, clearCounts: myPlayerInfo.clearCounts || {} }).catch(()=>{});
}

function updateLobbyPreview() {
    try {
        const dName = document.getElementById('display-name'); if(dName) dName.textContent = myPlayerInfo.name || "PLAYER";
        const cImg = document.getElementById('lobby-card-img'); if(cImg && myPlayerInfo.cardData) { cImg.src = myPlayerInfo.cardData; cImg.classList.remove('hidden'); }
        const iconContainer = document.getElementById('mypage-user-icon'); 
        if(iconContainer) {
            if(myPlayerInfo.iconData) {
                if (myPlayerInfo.iconData.startsWith('http') || myPlayerInfo.iconData.startsWith('data:image')) iconContainer.innerHTML = `<img src="${myPlayerInfo.iconData}" class="w-full h-full object-cover" onerror="this.style.display='none'">`;
                else iconContainer.innerHTML = myPlayerInfo.iconData;
            } else iconContainer.innerHTML = '👤';
        }
        const stats = myPlayerInfo.stats || defaultStats;
        if(document.getElementById('lobby-hp')) document.getElementById('lobby-hp').textContent = stats.hp || 0;
        if(document.getElementById('lobby-atk')) document.getElementById('lobby-atk').textContent = stats.atk || 0;
        if(document.getElementById('lobby-def')) document.getElementById('lobby-def').textContent = stats.def || 0;
        if(document.getElementById('lobby-bp')) document.getElementById('lobby-bp').textContent = myPlayerInfo.bp || 0;
        
        const rBadge = document.getElementById('lobby-rarity');
        if(rBadge) {
            const rar = stats.rarity || 'UNRANKED'; rBadge.textContent = rar; rBadge.className = "px-2 py-0.5 bg-black rounded text-[9px] font-black text-gray-500 border border-gray-600 tracking-wider";
            if (rar === 'EX') rBadge.className = "px-2 py-0.5 rounded text-[9px] font-black border bg-gradient-to-r from-purple-500 via-pink-500 to-red-500 text-white border-white shadow-[0_0_15px_rgba(236,72,153,1)] tracking-wider animate-pulse";
            else if (rar === 'UR++') rBadge.className = "px-2 py-0.5 rounded text-[9px] font-black border bg-red-500/20 text-red-500 border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)] tracking-wider";
            else if (rar === 'UR+') rBadge.className = "px-2 py-0.5 rounded text-[9px] font-black border bg-orange-500/20 text-orange-500 border-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.8)] tracking-wider";
            else if (typeof rar === 'string' && (rar.includes('UR') || rar.includes('SSR'))) rBadge.className = "px-2 py-0.5 rounded text-[9px] font-black border bg-brand-rare/20 text-brand-rare border-brand-rare tracking-wider";
            else if (typeof rar === 'string' && rar.includes('SR')) rBadge.className = "px-2 py-0.5 rounded text-[9px] font-black border bg-brand-epic/20 text-brand-epic border-brand-epic tracking-wider";
        }
    } catch (e) { console.warn("UI更新エラーを回避:", e); }
}

function updateLoginUI() {
    const badge = document.getElementById('pass-status-badge'); const btnLogin = document.getElementById('btn-show-login');
    if (isCloudMode && currentUserAccount) { if(badge) badge.classList.remove('hidden'); if(btnLogin) btnLogin.classList.add('hidden'); } 
    else { if(badge) badge.classList.add('hidden'); if(btnLogin) btnLogin.classList.remove('hidden'); }
}
const GEMINI_TEXT_MODEL = "gemini-3.6-flash";
const GEMINI_IMAGE_MODEL = "gemini-3.1-flash-image";

let aiTempData = null; 
const aiModal = document.getElementById('modal-ai-generator');
const apiKeyInput = document.getElementById('apiKeyInput');
const apiStatus = document.getElementById('apiStatus');
const apiDemoDesc = document.getElementById('apiDemoDesc');

const savedApiKey = localStorage.getItem('ai_card_gen_apikey_v2');
if(savedApiKey && apiKeyInput) { apiKeyInput.value = savedApiKey; setApiUIState(true); }

// ★ カードセット用画面（図鑑モーダル）の処理
function renderCollection() {
    try {
        const grid = document.getElementById('collection-grid'); const empty = document.getElementById('collection-empty'); const title = document.getElementById('collection-title');
        if(!grid) return;
        if (isCloudMode) title.textContent = "MY DECK (クラウド同期中)"; else title.textContent = "MY COLLECTION (ゲスト)";
        grid.innerHTML = '';
        if (!myCollection || myCollection.length === 0) { grid.classList.add('hidden'); empty.classList.remove('hidden'); return; }
        grid.classList.remove('hidden'); empty.classList.add('hidden');
        
        myCollection.forEach(item => {
            if (!item || !item.stats) return;
            const rar = item.stats.rarity || 'N';
            let colColors = 'border-slate-500 text-slate-300';
            let isEx = false;
            if (rar === 'EX') { isEx = true; colColors = 'border-white text-white shadow-[0_0_12px_rgba(236,72,153,1)]'; }
            else if (rar === 'UR++') colColors = 'border-red-500 text-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]';
            else if (rar === 'UR+') colColors = 'border-orange-500 text-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)]';
            else if (typeof rar === 'string' && (rar.includes('UR') || rar.includes('SSR'))) colColors = 'border-brand-rare text-brand-rare shadow-[0_0_8px_rgba(234,179,8,0.6)]';
            else if (typeof rar === 'string' && rar.includes('SR')) colColors = 'border-brand-epic text-brand-epic shadow-[0_0_8px_rgba(168,85,247,0.6)]';
            
            const card = document.createElement('div');
            card.className = `bg-slate-800 border ${isEx ? 'border-pink-500 hover:border-pink-400' : 'border-slate-600 hover:border-brand-accent'} rounded-lg p-2 flex flex-col items-center shadow-lg relative cursor-pointer transition`;
            card.innerHTML = `<img src="${item.origImage}" class="w-full h-32 object-cover rounded mb-1 border border-slate-700" onerror="this.style.display='none'">
                <div class="text-[10px] font-black text-white truncate w-full text-center mt-1">${item.stats.name || '?'}</div>
                <div class="text-[9px] font-black ${isEx ? 'bg-gradient-to-r from-purple-500 via-pink-500 to-red-500 animate-pulse' : ''} ${colColors.split(' ')[0]} ${colColors.split(' ')[1]} border px-1 rounded mt-0.5">${rar}</div>`;
            
            card.onclick = async () => {
                playSE('btn');
                if(confirm(`「${item.stats.name || 'このカード'}」をプロフィールに設定しますか？`)) {
                    myPlayerInfo.cardData = item.origImage; myPlayerInfo.iconData = item.iconImage; myPlayerInfo.stats = item.stats; saveProfile();
                    aiTempData = { stats: item.stats, origImage: item.origImage, iconImage: item.iconImage };
                    updateAiCardUI(item.stats, item.origImage, item.iconImage);
                    document.getElementById('modal-collection')?.classList.add('hidden'); alert("プロフィールを変更しました！");
                }
            };
            grid.appendChild(card);
        });
    } catch(e) { console.warn("コレクション描画エラーを回避", e); }
}

async function saveToCollection(newCardData) {
    if (isCloudMode && currentUserAccount) {
        try {
            const cardRef = doc(db, 'artifacts', appIdStr, 'public', 'data', 'accounts', currentUserAccount.id, 'cards', String(newCardData.id));
            await setDoc(cardRef, newCardData);
            let newDeckIds = [newCardData.id, ...(currentUserAccount.deckIds || [])];
            if(newDeckIds.length > 20) newDeckIds = newDeckIds.slice(0, 20); 
            await updateDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', 'accounts', currentUserAccount.id), { deckIds: newDeckIds, cardCount: increment(1) });
            myCollection.unshift(newCardData); if(myCollection.length > 20) myCollection.pop();
        } catch(e) { console.error(e); }
    } else {
        myCollection.unshift(newCardData); if(myCollection.length > 20) myCollection.pop(); 
        localStorage.setItem('elem_clash_ai_col_v1', JSON.stringify(myCollection));
        let vault = JSON.parse(localStorage.getItem('elem_clash_vault_v1') || '[]'); vault.unshift(newCardData); if(vault.length > 100) vault.pop();
        localStorage.setItem('elem_clash_vault_v1', JSON.stringify(vault));
    }
}

// 図鑑ボタンから、カードセット画面（モーダル）を確実に開く
setClick('btn-goto-vault', () => { playSE('btn'); window.location.href = "https://dorayakiwalk.github.io/-/CollectionBox.html"; });
setClick('btn-open-collection-sub', () => { playSE('btn'); renderCollection(); document.getElementById('modal-collection')?.classList.remove('hidden'); });
setClick('btn-ai-collection', () => { playSE('btn'); renderCollection(); document.getElementById('modal-collection')?.classList.remove('hidden'); });
setClick('btn-collection-close', () => { playSE('btn'); document.getElementById('modal-collection')?.classList.add('hidden'); });

const btnSaveKey = document.getElementById('btn-save-key');
if(btnSaveKey) {
    btnSaveKey.addEventListener('click', () => {
        const val = apiKeyInput.value.trim();
        if(val) { localStorage.setItem('ai_card_gen_apikey_v2', val); setApiUIState(true); alert("APIキーを保存しました。全機能が利用可能です！"); } 
        else { localStorage.removeItem('ai_card_gen_apikey_v2'); setApiUIState(false); }
    });
}

function setApiUIState(hasKey) {
    if(!apiStatus) return;
    if(hasKey) {
        apiStatus.textContent = "✅ 接続済み"; apiStatus.className = "text-[10px] text-emerald-400 font-mono";
        apiDemoDesc.classList.add('hidden'); document.getElementById('apiInputContainer').classList.add('hidden'); 
        apiStatus.parentElement.classList.add('cursor-pointer');
        apiStatus.parentElement.onclick = () => document.getElementById('apiInputContainer').classList.toggle('hidden');
    } else {
        apiStatus.textContent = "⚠️ デモモード"; apiStatus.className = "text-[10px] text-yellow-400 font-mono";
        apiDemoDesc.classList.remove('hidden'); document.getElementById('apiInputContainer').classList.remove('hidden');
        apiStatus.parentElement.onclick = null; apiStatus.parentElement.classList.remove('cursor-pointer');
    }
}

function checkAiLimit() {
    if(!apiKeyInput || !apiKeyInput.value.trim() || isHostPrivilegeMode) return true;
    const last = localStorage.getItem('ai_card_gen_last_date');
    if(last !== new Date().toDateString()) return true;
    return false;
}

function updateAiStudioUIForPrivilege() {
    const btnEvolve = document.getElementById('btn-ai-evolve');
    if(!btnEvolve) return;
    if (isHostPrivilegeMode) {
        btnEvolve.innerHTML = `<span class="relative z-10">🔥 ホスト特権 覚醒</span><span class="relative z-10 text-[8px] font-normal opacity-70">(確定EX排出 / BP消費0)</span>`;
        btnEvolve.className = "py-2 bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-500 hover:to-yellow-400 text-white rounded text-[11px] font-bold border border-yellow-300 shadow-[0_0_15px_rgba(234,179,8,0.6)] transition flex flex-col items-center justify-center leading-tight relative overflow-hidden";
    } else {
        btnEvolve.innerHTML = `<span class="relative z-10">🔥 上位進化生成</span><span class="relative z-10 text-[8px] font-normal opacity-70">(コスト: 10 BP)</span>`;
        btnEvolve.className = "py-2 bg-purple-900/80 hover:bg-purple-800 text-purple-100 rounded text-[11px] font-bold border border-purple-500/50 shadow transition flex flex-col items-center justify-center leading-tight relative overflow-hidden";
    }
}

setClick('btn-admin-ai-studio', () => { 
    playSE('btn'); isHostPrivilegeMode = true; updateAiStudioUIForPrivilege(); document.getElementById('modal-admin')?.classList.add('hidden'); 
    if(myPlayerInfo.cardData && myPlayerInfo.stats) updateAiCardUI(myPlayerInfo.stats, myPlayerInfo.cardData, myPlayerInfo.iconData);
    aiModal?.classList.remove('hidden'); 
});
setClick('btn-open-ai-sub', () => { 
    playSE('btn'); isHostPrivilegeMode = false; updateAiStudioUIForPrivilege();
    if(myPlayerInfo.cardData && myPlayerInfo.stats) updateAiCardUI(myPlayerInfo.stats, myPlayerInfo.cardData, myPlayerInfo.iconData);
    aiModal?.classList.remove('hidden'); 
});
setClick('btn-ai-close', () => { playSE('btn'); aiModal?.classList.add('hidden'); });

const fileToBase64 = (file) => new Promise((resolve) => { const r = new FileReader(); r.readAsDataURL(file); r.onload = () => resolve(r.result); });
const compressImage = (base64Str, maxW, maxH, quality = 0.8) => new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
        let w = img.width, h = img.height;
        if(w > h) { if(w > maxW) { h *= maxW / w; w = maxW; } } else { if(h > maxH) { w *= maxH / h; h = maxH; } }
        const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h); resolve(canvas.toDataURL('image/jpeg', quality));
    }; img.src = base64Str;
});

const extractCustomIcon = (base64Str, tapXRatio = 0.5, tapYRatio = 0.5, zoom = 1.0) => new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
        const canvas = document.createElement('canvas'); canvas.width = 100; canvas.height = 100; const ctx = canvas.getContext('2d');
        const minSide = Math.min(img.width, img.height); const cropSize = minSide / zoom;
        let sx = (img.width * tapXRatio) - (cropSize / 2), sy = (img.height * tapYRatio) - (cropSize / 2);
        if (sx < 0) sx = 0; if (sy < 0) sy = 0; if (sx + cropSize > img.width) sx = img.width - cropSize; if (sy + cropSize > img.height) sy = img.height - cropSize;
        ctx.drawImage(img, sx, sy, cropSize, cropSize, 0, 0, 100, 100); resolve(canvas.toDataURL('image/jpeg', 0.8));
    }; img.src = base64Str;
});

let currentTapX = 0.5, currentTapY = 0.5, currentZoom = 1.0;
const cropSlider = document.getElementById('cropSlider'), cropValText = document.getElementById('cropValText');
const aiImageWrapper = document.getElementById('aiImageWrapper'), btnToggleZoom = document.getElementById('btn-toggle-zoom'), zoomLabel = document.getElementById('zoom-label');

if(cropSlider) {
    cropSlider.addEventListener('input', async (e) => {
        currentZoom = e.target.value / 10; cropValText.textContent = `${currentZoom.toFixed(1)}x`; zoomLabel.textContent = `x${currentZoom.toFixed(1)}`;
        if (aiTempData && aiTempData.origImage) {
            const newIcon = await extractCustomIcon(aiTempData.origImage, currentTapX, currentTapY, currentZoom);
            document.getElementById('aiCardIcon').src = newIcon; aiTempData.iconImage = newIcon;
        }
    });
}
if(btnToggleZoom) {
    btnToggleZoom.addEventListener('click', async () => {
        currentZoom += 0.5; if (currentZoom > 2.5) currentZoom = 1.0; 
        cropSlider.value = currentZoom * 10; cropValText.textContent = `${currentZoom.toFixed(1)}x`; zoomLabel.textContent = `x${currentZoom.toFixed(1)}`;
        if (aiTempData && aiTempData.origImage) {
            const newIcon = await extractCustomIcon(aiTempData.origImage, currentTapX, currentTapY, currentZoom);
            document.getElementById('aiCardIcon').src = newIcon; aiTempData.iconImage = newIcon;
        }
    });
}
if(aiImageWrapper) {
    aiImageWrapper.addEventListener('click', async (e) => {
        if (!aiTempData || !aiTempData.origImage) return;
        const rect = aiImageWrapper.getBoundingClientRect(); const x = e.clientX - rect.left, y = e.clientY - rect.top;
        currentTapX = x / rect.width; currentTapY = y / rect.height;
        const ripple = document.createElement('div'); ripple.className = "absolute w-6 h-6 border-2 border-brand-accent rounded-full bg-brand-glow/30 animate-ping pointer-events-none transform -translate-x-1/2 -translate-y-1/2";
        ripple.style.left = `${x}px`; ripple.style.top = `${y}px`; aiImageWrapper.appendChild(ripple); setTimeout(() => ripple.remove(), 1000);
        const newIcon = await extractCustomIcon(aiTempData.origImage, currentTapX, currentTapY, currentZoom);
        document.getElementById('aiCardIcon').src = newIcon; aiTempData.iconImage = newIcon;
    });
}

function showAiLoading(msg) {
    const el = document.getElementById('aiLoadingText'); if(el) el.textContent = msg; 
    document.getElementById('aiLoadingOverlay')?.classList.remove('hidden');
    document.getElementById('aiCardContent')?.classList.add('opacity-0', 'pointer-events-none'); document.getElementById('iconCropControl')?.classList.add('hidden'); 
}
function hideAiLoading() {
    document.getElementById('aiLoadingOverlay')?.classList.add('hidden'); document.getElementById('aiCardContent')?.classList.remove('opacity-0', 'pointer-events-none');
    document.getElementById('aiCardShine')?.classList.remove('hidden'); document.getElementById('iconCropControl')?.classList.remove('hidden'); 
    setTimeout(() => document.getElementById('aiCardShine')?.classList.add('hidden'), 2000);
}

async function updateAiCardUI(data, b64Img, preIconB64 = null) {
    try {
        aiTempData = { stats: data, origImage: b64Img };
        document.getElementById('aiCardPlaceholder')?.classList.add('hidden');
        const aiImg = document.getElementById('aiCardImage'); if(aiImg) { aiImg.src = b64Img; aiImg.classList.remove('hidden'); }
        
        let iconB64 = preIconB64;
        if(!iconB64) {
            currentTapX = 0.5; currentTapY = 0.2; currentZoom = 1.0;
            if(cropSlider) cropSlider.value = 10; if(cropValText) cropValText.textContent = "1.0x"; if(zoomLabel) zoomLabel.textContent = "x1.0";
            iconB64 = await extractCustomIcon(b64Img, currentTapX, currentTapY, currentZoom);
        }
        const aiIcon = document.getElementById('aiCardIcon'); if(aiIcon) { aiIcon.src = iconB64; aiIcon.classList.remove('hidden'); }
        aiTempData.iconImage = iconB64;

        if(document.getElementById('aiCardName')) document.getElementById('aiCardName').textContent = data.name || '?';
        if(document.getElementById('aiCardClass')) document.getElementById('aiCardClass').textContent = data.jobClass || '?';
        const rBadge = document.getElementById('aiCardRarity');
        if(rBadge) {
            const rar = data.rarity || 'N'; rBadge.textContent = rar;
            rBadge.className = "px-1.5 py-0.5 bg-black/80 border rounded text-[10px] font-black italic tracking-wider shadow ";
            if (rar === 'EX') { rBadge.className += "bg-gradient-to-r from-purple-500 via-pink-500 to-red-500 text-white border-white shadow-[0_0_12px_rgba(236,72,153,1)] animate-pulse"; document.getElementById('aiCardContainer').style.borderColor="#ec4899"; }
            else if (rar === 'UR++') { rBadge.className += "text-red-500 border-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)] bg-red-500/20"; document.getElementById('aiCardContainer').style.borderColor="#ef4444"; }
            else if (rar === 'UR+') { rBadge.className += "text-orange-500 border-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)] bg-orange-500/20"; document.getElementById('aiCardContainer').style.borderColor="#f97316"; }
            else if(typeof rar === 'string' && (rar.includes('UR')||rar.includes('SSR'))) { rBadge.className += "text-brand-rare border-brand-rare shadow-[0_0_8px_rgba(234,179,8,0.6)]"; document.getElementById('aiCardContainer').style.borderColor="#eab308"; }
            else if(typeof rar === 'string' && rar.includes('SR')) { rBadge.className += "text-brand-epic border-brand-epic shadow-[0_0_8px_rgba(168,85,247,0.6)]"; document.getElementById('aiCardContainer').style.borderColor="#a855f7"; }
            else { rBadge.className += "text-slate-300 border-slate-500"; document.getElementById('aiCardContainer').style.borderColor="#334155"; }
        }
        if(document.getElementById('aiStatHp')) document.getElementById('aiStatHp').textContent = data.hp || 0;
        if(document.getElementById('aiStatAtk')) document.getElementById('aiStatAtk').textContent = data.atk || 0;
        if(document.getElementById('aiStatDef')) document.getElementById('aiStatDef').textContent = data.def || 0;
        if(document.getElementById('aiStatSpd')) document.getElementById('aiStatSpd').textContent = data.spd || 0;

        const btnApply = document.getElementById('btn-ai-apply');
        if(btnApply) { btnApply.disabled = false; btnApply.classList.remove('opacity-50', 'cursor-not-allowed'); btnApply.classList.add('animate-pulse'); }
    } catch(e) { console.warn("AIプレビュー描画エラー", e); }
}

async function analyzeWithGemini(key, base64Img, theme, isEvolution = false, isPrivilege = false) {
    const sys = `あなたはTRPG・カードゲームの熟練データメイカーです。画像からファンタジー風のステータスを出力してください。
ルール: レアリティ排出率の目安: N(約45%), R(約35%), SR(約15%), SSR(約4%), UR(約1%)。
HP基準: N(1000-1500), R(1500-2500), SR(2500-3500), SSR(3500-5000), UR(5000-7000)。
JSONフォーマット厳守: {"name":"キャラ名","jobClass":"職業","rarity":"N,R,SR,SSR,UR,EXのいずれか","hp":数値(1000-9999),"atk":数値(150-999),"def":数値(50-999),"spd":数値(50-999)}`;
    const parts = [{ text: `画像解析要求。追加テーマ・希望:${theme||'なし'}` }];
    if(base64Img) parts.push({ inlineData: { mimeType: "image/jpeg", data: base64Img.split(',')[1] } });
    const payload = { contents:[{parts}], systemInstruction:{parts:[{text:sys}]}, generationConfig:{responseMimeType:"application/json"} };
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TEXT_MODEL}:generateContent?key=${key}`, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    if(!res.ok) { const err = await res.json(); throw new Error(err.error?.message || "API request failed"); }
    const jsonRes = await res.json();
    let parsedData = JSON.parse(jsonRes.candidates[0].content.parts[0].text);
    if (isEvolution && isPrivilege) {
        parsedData.rarity = "EX";
        if (parsedData.hp < 7500) parsedData.hp = Math.floor(Math.random() * (9999 - 7500 + 1)) + 7500;
        if (parsedData.atk < 800) parsedData.atk = Math.floor(Math.random() * (999 - 800 + 1)) + 800;
        if (parsedData.def < 800) parsedData.def = Math.floor(Math.random() * (999 - 800 + 1)) + 800;
    }
    return parsedData;
}

async function generateImageWithGeminiFlash(key, textPrompt, base64Img = null) {
    let fullPrompt = `${textPrompt}, photorealistic, 3D render style, cinematic lighting, upper body portrait, face focus, highly detailed full environment background, masterpiece, 8k resolution`;
    let parts = [{ text: fullPrompt }];
    if (base64Img) parts = [{ text: `このキャラクターを究極覚醒・上位進化した姿に描き直してください。オーラを纏った強大な力を持つデザインに。追加テーマ: ${fullPrompt}` }, { inlineData: { mimeType: "image/jpeg", data: base64Img.split(',')[1] } }];
    const payload = { contents: [{ parts: parts }], generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "3:4" } } };
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${key}`, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    if(!res.ok) { const err = await res.json(); throw new Error(err.error?.message || "API request failed"); }
    const jsonRes = await res.json();
    const part = jsonRes?.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (!part) throw new Error("画像の生成結果が空でした。");
    return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
}

const runAiDemo = async (type, b64, theme) => {
    const isEvo = (type === 'evolve') || (theme && theme.includes('覚醒'));
    if (isEvo && !isHostPrivilegeMode) {
        if ((myPlayerInfo.bp || 0) < 10) return alert(`覚醒には 10 BP が必要です。(現在: ${myPlayerInfo.bp || 0} BP)`);
        myPlayerInfo.bp -= 10; saveProfile();
        if (Math.random() < 0.2) {
            showAiLoading("EVOLVING... BUT FAILED!"); await sleep(1500); alert("覚醒失敗…！エネルギーが暴走し、ステータスがダウンしてしまった！");
            const prevStats = aiTempData?.stats || myPlayerInfo.stats;
            const failedData = { name: "失敗した " + (prevStats.name||"影"), jobClass: "敗れし者", rarity: "N", hp: Math.max(800, Math.floor(prevStats.hp * 0.7)), atk: Math.max(100, Math.floor(prevStats.atk * 0.7)), def: Math.max(50, Math.floor(prevStats.def * 0.7)), spd: Math.max(50, Math.floor(prevStats.spd * 0.7)) };
            await updateAiCardUI(failedData, b64); hideAiLoading(); return;
        }
    }
    showAiLoading("DEMO MODE..."); await sleep(1500);
    const rng = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
    let hp, atk, def, spd, rarity, job; const r = Math.random();
    if (isEvo) {
        rarity = isHostPrivilegeMode ? "EX" : (r > 0.5 ? "UR" : "SSR"); hp = isHostPrivilegeMode ? rng(7000, 9999) : rng(5000, 7000); atk = rng(500, 700); def = rng(400, 600); spd = rng(400, 600); job = isHostPrivilegeMode ? "超越者" : "覚醒者";
    } else {
        if (r < 0.01) { rarity = "UR"; hp = rng(5000, 7000); atk = rng(600, 700); def = rng(400, 600); spd = rng(400, 600); job = "神々しき者"; }
        else if (r < 0.05) { rarity = "SSR"; hp = rng(3500, 5000); atk = rng(450, 600); def = rng(300, 450); spd = rng(300, 450); job = "英雄"; }
        else if (r < 0.20) { rarity = "SR"; hp = rng(2500, 3500); atk = rng(300, 450); def = rng(200, 350); spd = rng(200, 350); job = "熟練者"; }
        else if (r < 0.55) { rarity = "R"; hp = rng(1500, 2500); atk = rng(200, 300); def = rng(100, 200); spd = rng(100, 200); job = "冒険者"; }
        else { rarity = "N"; hp = rng(1000, 1500); atk = rng(150, 200); def = rng(50, 150); spd = rng(50, 150); job = "村人"; }
    }
    const data = { name: isEvo ? (isHostPrivilegeMode ? "極限の姿" : "覚醒せし者") : "名もなき勇者", jobClass: job, rarity: rarity, hp: hp, atk: atk, def: def, spd: spd };
    let img = b64 || (isEvo ? "https://images.unsplash.com/photo-1514316454349-750a7fd3da3a?q=80&w=400&auto=format&fit=crop" : "https://images.unsplash.com/photo-1605806616949-1e87b487cb2a?q=80&w=400&auto=format&fit=crop"); 
    if(!b64) {
        try { const response = await fetch(img); const blob = await response.blob(); img = await fileToBase64(blob); } 
        catch(e) { const c = document.createElement('canvas'); c.width=300; c.height=400; const ctx=c.getContext('2d'); ctx.fillStyle='#1e293b'; ctx.fillRect(0,0,300,400); ctx.fillStyle='#eab308'; ctx.font='20px sans-serif'; ctx.fillText('DEMO IMAGE', 80, 200); img = c.toDataURL('image/jpeg'); }
    }
    await updateAiCardUI(data, img); hideAiLoading();
};

setClick('btn-ai-analyze', async () => {
    playSE('btn');
    const fileInput = document.getElementById('aiImageInput'); if(!fileInput) return;
    const file = fileInput.files[0]; if(!file) return alert("画像をアップロードしてください。");
    const key = apiKeyInput?.value.trim(); const theme = document.getElementById('aiPromptInput')?.value;
    const b64 = await fileToBase64(file);
    if(!key) return runAiDemo('analyze', b64, theme); 
    try { showAiLoading("ANALYZING IMAGE..."); const data = await analyzeWithGemini(key, b64, theme); await updateAiCardUI(data, b64); } 
    catch(e){ alert("エラー: " + e.message); } finally { hideAiLoading(); }
});

setClick('btn-ai-generate', async () => {
    playSE('btn');
    const theme = document.getElementById('aiPromptInput')?.value.trim(); if(!theme) return alert("追加テーマを入力してください。");
    const key = apiKeyInput?.value.trim();
    if(!key) return runAiDemo('generate', null, theme);
    if(!checkAiLimit()) return alert("1日1回制限に達しています(ホスト特権で制限なし)。");
    try {
        showAiLoading("GENERATING IMAGE..."); if(!isHostPrivilegeMode) localStorage.setItem('ai_card_gen_last_date', new Date().toDateString());
        const b64 = await generateImageWithGeminiFlash(key, theme);
        showAiLoading("ANALYZING STATS..."); const data = await analyzeWithGemini(key, b64, theme); await updateAiCardUI(data, b64); 
    } catch(e) { alert("生成エラー: " + e.message); } finally { hideAiLoading(); }
});

setClick('btn-ai-evolve', async () => {
    playSE('btn');
    const fileInput = document.getElementById('aiImageInput');
    const file = fileInput ? fileInput.files[0] : null; const baseImg = file ? await fileToBase64(file) : myPlayerInfo.cardData; 
    if(!baseImg) return alert("ベースとなる画像をアップロードするか、プロフィールにカードを設定してください。");
    if (!isHostPrivilegeMode) { if ((myPlayerInfo.bp || 0) < 10) return alert(`覚醒には 10 BP が必要です。(現在: ${myPlayerInfo.bp || 0} BP)`); }
    const theme = document.getElementById('aiPromptInput')?.value.trim(); const key = apiKeyInput?.value.trim();
    if(!key) return runAiDemo('evolve', baseImg, theme);
    if(!checkAiLimit()) return alert("1日1回制限に達しています(ホスト特権で制限なし)。");
    if (!isHostPrivilegeMode) {
        myPlayerInfo.bp -= 10; saveProfile();
        if (Math.random() < 0.2) {
            showAiLoading("EVOLVING... BUT FAILED!"); await sleep(1500); alert("覚醒失敗…！エネルギーが暴走し、ステータスがダウンしてしまった！");
            const prevStats = aiTempData?.stats || myPlayerInfo.stats;
            const failedData = { name: "失敗した " + (prevStats.name||"影"), jobClass: "敗れし者", rarity: "N", hp: Math.max(800, Math.floor(prevStats.hp * 0.7)), atk: Math.max(100, Math.floor(prevStats.atk * 0.7)), def: Math.max(50, Math.floor(prevStats.def * 0.7)), spd: Math.max(50, Math.floor(prevStats.spd * 0.7)) };
            await updateAiCardUI(failedData, baseImg); hideAiLoading(); return;
        }
    }
    try {
        showAiLoading("EVOLVING IMAGE..."); if(!isHostPrivilegeMode) localStorage.setItem('ai_card_gen_last_date', new Date().toDateString());
        let targetTheme = theme || '覚醒, 神々しい'; if (isHostPrivilegeMode) targetTheme += ", 最高レアリティ, 圧倒的な力";
        const evolvedB64 = await generateImageWithGeminiFlash(key, targetTheme, baseImg);
        showAiLoading("ANALYZING EVOLVED STATS..."); const data = await analyzeWithGemini(key, evolvedB64, theme, true, isHostPrivilegeMode); await updateAiCardUI(data, evolvedB64); 
    } catch(e) { alert("進化生成エラー: " + e.message); } finally { hideAiLoading(); }
});

setClick('btn-ai-apply', async () => {
    playSE('btn'); if(!aiTempData) return;
    const compressedCard = await compressImage(aiTempData.origImage, 400, 560, 0.7); const compressedIcon = await compressImage(aiTempData.iconImage, 100, 100, 0.8);
    myPlayerInfo.cardData = compressedCard; myPlayerInfo.iconData = compressedIcon; myPlayerInfo.stats = aiTempData.stats; saveProfile();
    const isDupe = myCollection.some(c => c.stats && c.stats.name === aiTempData.stats.name && c.stats.hp === aiTempData.stats.hp);
    if(!isDupe) {
        const newCardData = { stats: aiTempData.stats, origImage: compressedCard, iconImage: compressedIcon, id: Date.now() };
        if (isCloudMode && currentUserAccount) {
            try {
                const cardRef = doc(db, 'artifacts', appIdStr, 'public', 'data', 'accounts', currentUserAccount.id, 'cards', String(newCardData.id));
                await setDoc(cardRef, newCardData);
                let newDeckIds = [newCardData.id, ...(currentUserAccount.deckIds || [])];
                if(newDeckIds.length > 20) newDeckIds = newDeckIds.slice(0, 20); 
                await updateDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', 'accounts', currentUserAccount.id), { deckIds: newDeckIds, cardCount: increment(1) });
                myCollection.unshift(newCardData); if(myCollection.length > 20) myCollection.pop();
            } catch(e) { console.error(e); }
        } else {
            myCollection.unshift(newCardData); if(myCollection.length > 20) myCollection.pop(); 
            localStorage.setItem('elem_clash_ai_col_v1', JSON.stringify(myCollection));
            let vault = JSON.parse(localStorage.getItem('elem_clash_vault_v1') || '[]'); vault.unshift(newCardData); if(vault.length > 100) vault.pop();
            localStorage.setItem('elem_clash_vault_v1', JSON.stringify(vault));
        }
        alert("プロフィールにAIカードをセットし、図鑑にも追加しました！");
    } else { alert("プロフィールにAIカードをセットしました！\n（既に図鑑にあるカードのため重複追加はしませんでした）"); }
    document.getElementById('btn-ai-apply')?.classList.remove('animate-pulse'); aiModal?.classList.add('hidden');
});
// ==========================================
// 【パート3】ここから下をコピーして貼り付け
// ==========================================
// --- 欠落していた initAuth と マッチング・通信系関数 ---
async function initAuth() { 
    try {
        onSnapshot(doc(db, 'artifacts', appIdStr, 'public', 'data', 'global', 'settings'), snap => {
            if(snap.exists()) {
                globalSettings = snap.data();
                if (globalSettings.cardBackUrl !== undefined) { globalCardBackUrl = globalSettings.cardBackUrl; updateAllCardBacks(); }
                const tgl = document.getElementById('btn-toggle-anyone');
                if(tgl) { if(globalSettings.anyoneCanHost) { tgl.classList.replace('bg-red-500', 'bg-green-500'); tgl.firstChild.classList.replace('left-1', 'left-7'); } else { tgl.classList.replace('bg-green-500', 'bg-red-500'); tgl.firstChild.classList.replace('left-7', 'left-1'); } }
                renderSubpassList(); 
                const savedAuth = sessionStorage.getItem('elem_clash_host_auth');
                if (savedAuth === 'main') isMainHost = true; else if (savedAuth === 'sub') isSubHost = true;
            } else { setDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', 'global', 'settings'), { anyoneCanHost: false, subPasswords: [] }); }
        });
        
        startPublicRoomsListener(); 

        onAuthStateChanged(auth, async (user) => {
            if (user) {
                currentUser = user; 
                if (!user.isAnonymous) {
                    isCloudMode = true; const userRef = doc(db, 'artifacts', appIdStr, 'public', 'data', 'accounts', user.uid);
                    onSnapshot(userRef, async (docSnap) => {
                        if (docSnap.exists()) {
                            currentUserAccount = { id: user.uid, ...docSnap.data() };
                            const saved = localStorage.getItem('elem_clash_ai_profile_v3');
                            if(saved) { try { const p = JSON.parse(saved); myPlayerInfo = { ...p, name: currentUserAccount.name || p.name, bp: currentUserAccount.coins || p.bp, iconData: currentUserAccount.icon || p.iconData }; } catch(e) {} } 
                            else { myPlayerInfo.name = currentUserAccount.name || ''; myPlayerInfo.bp = currentUserAccount.coins || 0; myPlayerInfo.iconData = currentUserAccount.icon || null; }
                            
                            const deckIds = currentUserAccount.deckIds || [];
                            if (deckIds.length > 0) {
                                let loadedDeck = []; for (let cid of deckIds) { const cSnap = await getDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', 'accounts', user.uid, 'cards', String(cid))); if(cSnap.exists()) loadedDeck.push(cSnap.data()); }
                                myCollection = loadedDeck;
                            } else { myCollection = []; }
                            updateLobbyPreview(); updateLoginUI(); checkAndShowWelcome(); 
                        }
                    });
                } else {
                    isCloudMode = false; currentUserAccount = null; loadProfile(); myCollection = JSON.parse(localStorage.getItem('elem_clash_ai_col_v1') || '[]'); updateLoginUI();
                }
            } else { isCloudMode = false; currentUserAccount = null; await signInAnonymously(auth); }
        });
    } catch(e){ console.error(e); } 
}

function renderSubpassList() {
    const list = document.getElementById('subpass-list'); if(!list) return; list.innerHTML = '';
    if (!globalSettings.subPasswords || globalSettings.subPasswords.length === 0) { list.innerHTML = '<div class="text-[10px] text-gray-500 text-center">登録なし</div>'; return; }
    globalSettings.subPasswords.forEach((hash, idx) => {
        const pass = shiftDecode(hash); const d = document.createElement('div');
        d.className = "flex justify-between items-center bg-gray-800 p-1 px-2 rounded mb-1";
        d.innerHTML = `<span class="text-xs text-white font-mono">${pass}</span><button class="text-[10px] bg-red-600 hover:bg-red-500 text-white px-2 py-0.5 rounded transition" data-idx="${idx}">削除</button>`;
        d.querySelector('button').onclick = async (e) => {
            const i = e.target.getAttribute('data-idx'); playSE('btn');
            if (confirm(`「${pass}」を削除しますか？`)) { const newArray = [...globalSettings.subPasswords]; newArray.splice(i, 1); try { await updateDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', 'global', 'settings'), { subPasswords: newArray }); } catch(err) { alert("削除エラー"); } }
        }; list.appendChild(d);
    });
}

let unsubscribeRooms = null;
function startPublicRoomsListener() {
    if(unsubscribeRooms) unsubscribeRooms();
    const listEl = document.getElementById('public-rooms-list'); if(!listEl) return;
    const q = query(collection(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL), where('isPublic', '==', true));
    unsubscribeRooms = onSnapshot(q, (snapshot) => {
        listEl.innerHTML = ''; const tenMinsAgo = Date.now() - 600000; let activeRooms = [];
        snapshot.forEach(docSnap => {
            try {
                const d = docSnap.data(); if(!d) return; let lastTime = 0;
                try { if (d.updatedAt) lastTime = typeof d.updatedAt.toMillis === 'function' ? d.updatedAt.toMillis() : d.updatedAt.getTime(); else if (d.createdAt) lastTime = typeof d.createdAt.toMillis === 'function' ? d.createdAt.toMillis() : d.createdAt.getTime(); } catch(e) { lastTime = Date.now() - 99999999; }
                if (isNaN(lastTime)) lastTime = 0;
                if (d.phase !== 'closed' && (d.phase === 'waiting' || d.phase === 'action') && (!d.guestId || d.guestId === 'CPU_BOT') && lastTime >= tenMinsAgo) activeRooms.push({ id: docSnap.id, data: d, time: lastTime });
            } catch (err) { }
        });
        activeRooms.sort((a, b) => b.time - a.time); activeRooms = activeRooms.slice(0, 10);
        if(activeRooms.length === 0) { listEl.innerHTML = '<div class="text-[10px] text-gray-600 text-center py-4 font-bold tracking-widest absolute inset-0 flex items-center justify-center">NO ROOMS AVAILABLE</div>'; return; }
        activeRooms.forEach(roomInfo => {
            try {
                const d = roomInfo.data; const roomId = roomInfo.id; const p1 = d.p1Info || {}; const safeName = (p1.name && typeof p1.name === 'string' && p1.name.trim() !== '') ? p1.name : 'UNKNOWN'; const safeStats = p1.stats || defaultStats;
                let rColor = 'text-gray-400 border-gray-500 bg-black'; const rar = safeStats.rarity || 'N';
                if (rar === 'EX') rColor = 'text-white border-white bg-gradient-to-r from-purple-500 via-pink-500 to-red-500';
                else if (rar === 'UR++') rColor = 'text-red-500 border-red-500 bg-red-500/20'; else if (rar === 'UR+') rColor = 'text-orange-500 border-orange-500 bg-orange-500/20';
                else if (typeof rar === 'string' && (rar.includes('UR') || rar.includes('SSR'))) rColor = 'text-brand-rare border-brand-rare bg-brand-rare/20'; else if (typeof rar === 'string' && rar.includes('SR')) rColor = 'text-brand-epic border-brand-epic bg-brand-epic/20';
                
                let iconHtml = `<div class="w-full h-full flex items-center justify-center text-[10px] font-bold text-white">${safeName.charAt(0).toUpperCase()}</div>`;
                if (p1.iconData && typeof p1.iconData === 'string') {
                    if (p1.iconData.startsWith('http') || p1.iconData.startsWith('data:image')) iconHtml = `<img src="${p1.iconData}" class="w-full h-full object-cover" onerror="this.style.display='none'">`;
                    else iconHtml = `<div class="w-full h-full flex items-center justify-center text-sm">${p1.iconData}</div>`;
                }
                const el = document.createElement('div'); el.className = "flex items-center justify-between bg-gray-800 p-1.5 rounded mb-1.5 border border-gray-600 shadow-sm hover:border-blue-500 transition";
                el.innerHTML = `<div class="flex items-center gap-2"><div class="w-8 h-8 rounded-full bg-gray-700 overflow-hidden border border-gray-500 shrink-0 relative shadow-inner">${iconHtml}<div class="absolute bottom-0 right-0 bg-black/80 ${rColor.split(' ')[0]} text-[7px] font-black px-1 rounded-sm border ${rColor.split(' ')[1]} shadow-sm">${rar}</div></div><div class="flex flex-col leading-none"><span class="text-[11px] font-bold text-white truncate max-w-[100px] mb-0.5">${safeName}</span><div class="flex gap-1 items-center"><span class="text-[8px] px-1 rounded border font-bold ${rColor}">${rar}</span><span class="text-[8px] text-gray-400 font-mono">ID: ${roomId}</span></div></div></div><button class="bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold px-4 py-2 rounded shadow transition btn-quick-join" data-id="${roomId}">参加</button>`;
                el.querySelector('.btn-quick-join').onclick = (e) => { playSE('btn'); document.getElementById('input-room').value = e.target.getAttribute('data-id'); document.getElementById('btn-join').click(); };
                listEl.appendChild(el);
            } catch(err) { }
        });
    });
}

function showEmote(player, emoji) {
    const container = document.getElementById(`${player}-area`); if(!container) return;
    const bubble = document.createElement('div'); bubble.className = 'emote-bubble'; bubble.textContent = emoji; bubble.style.left = '50%'; bubble.style.top = '-10px'; bubble.style.marginLeft = '-1rem'; 
    container.appendChild(bubble); setTimeout(() => { if(bubble.parentNode) bubble.remove(); }, 2000);
}

let emoteUnsub = null, lastP1EmoteTime = 0, lastP2EmoteTime = 0;
function startEmoteListener(roomId) {
    if(emoteUnsub) emoteUnsub(); lastP1EmoteTime = 0; lastP2EmoteTime = 0;
    emoteUnsub = onSnapshot(doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, roomId, 'emotes', 'latest'), snap => {
        const d = snap.data(); if(!d) return;
        if (d.p1Emote && d.p1Emote.time > lastP1EmoteTime) { lastP1EmoteTime = d.p1Emote.time; if (Date.now() - d.p1Emote.time < 5000) showEmote('p1', d.p1Emote.emoji); }
        if (d.p2Emote && d.p2Emote.time > lastP2EmoteTime) { lastP2EmoteTime = d.p2Emote.time; if (Date.now() - d.p2Emote.time < 5000) showEmote('p2', d.p2Emote.emoji); }
    });
}

function switchView(v) {
    document.getElementById('lobby-ui')?.classList.add('hidden'); document.getElementById('battle-field')?.classList.add('hidden'); document.getElementById('hand-ui')?.classList.add('hidden');
    const topBtns = document.getElementById('top-buttons');
    if(v==='lobby') { document.getElementById('lobby-ui')?.classList.remove('hidden'); showWaiting(false); document.getElementById('btn-surrender')?.classList.add('hidden'); document.getElementById('btn-show-emotes')?.classList.add('hidden'); if(topBtns) topBtns.classList.remove('hidden'); }
    else if(v==='hand') { document.getElementById('battle-field')?.classList.remove('hidden'); document.getElementById('hand-ui')?.classList.remove('hidden'); showWaiting(false); document.getElementById('btn-show-emotes')?.classList.remove('hidden'); if(topBtns) topBtns.classList.add('hidden'); }
}

function showWaiting(s, withQR = false) { 
    const ov = document.getElementById('waiting-overlay'); const qrc = document.getElementById('waiting-qr-container'); const ctr = document.getElementById('waiting-invite-controls');
    if(s) ov?.classList.remove('hidden'); else ov?.classList.add('hidden');
    if(withQR) { 
        ctr?.classList.remove('hidden'); document.getElementById('waiting-room-display')?.classList.remove('hidden');
        const rt = document.getElementById('waiting-room-text'); if(rt) rt.textContent = currentRoomId;
        if(window.generateSafeQR) window.generateSafeQR("qrcode-room", appUrl + "?room=" + currentRoomId); 
    }
    else { ctr?.classList.add('hidden'); document.getElementById('waiting-room-display')?.classList.add('hidden'); }
}

function getCpuPlayer() {
    if (myCollection && myCollection.length > 0) { const r = Math.floor(Math.random() * myCollection.length); return { name: `[CPU] ${myCollection[r].stats.name}`, iconData: myCollection[r].iconImage, cardData: myCollection[r].origImage, stats: myCollection[r].stats }; }
    return { name: "訓練用ダミー", stats: { hp: 3000, atk: 400, def: 200, spd: 300, rarity: "R", jobClass: "FIGHTER" } };
}
function getCpuHand() { return [rndCard(), rndCard(), rndCard()]; }

setClick('btn-play-cpu', async () => {
    playSE('btn'); if(!currentRoomId || !isHost) return; isPlayingVsCpu = true;
    const cpuInfo = getCpuPlayer(); const cpuHp = cpuInfo.stats.hp || 2000; const hp1 = myPlayerInfo.stats.hp || 1500;
    const ref = doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, currentRoomId);
    await updateDoc(ref, { guestId: 'CPU_BOT', p1Hp: hp1, p1MaxHp: hp1, p2Info: cpuInfo, p2Hp: cpuHp, p2MaxHp: cpuHp, p1Cards: null, p2Cards: getCpuHand(), updatedAt: new Date() });
});

async function doCreateRoom() {
    try { const q = query(collection(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL), where('hostId', '==', currentUser.uid)); const snap = await getDocs(q); snap.forEach(d => { if (d.data().phase !== 'closed') updateDoc(d.ref, { phase: 'closed', updatedAt: new Date() }).catch(()=>{}); }); } catch(e) {}
    currentRoomId = Math.floor(1000 + Math.random() * 9000).toString(); isHost = true; currentPhase = 'waiting'; currentRoomData = null; isPlayingVsCpu = false; 
    
    const rt = document.getElementById('room-id-text'); if(rt) rt.textContent = currentRoomId; document.getElementById('room-display')?.classList.remove('hidden');
    const hp = (myPlayerInfo.stats && myPlayerInfo.stats.hp) ? myPlayerInfo.stats.hp : 1500;
    const checkPub = document.getElementById('check-public'); const isPublic = checkPub ? checkPub.checked : true;
    
    await setDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, currentRoomId), { hostId: currentUser.uid, guestId: null, p1Info: myPlayerInfo, p2Info: null, p1Hp: hp, p2Hp: hp, p1MaxHp: hp, p2MaxHp: hp, p1Cards: null, p2Cards: null, phase: 'waiting', isPublic: isPublic, createdAt: new Date(), updatedAt: new Date() });
    
    const p1s = document.getElementById('p1-status'); if(p1s) { p1s.textContent="YOU"; p1s.className="text-[10px] font-black bg-blue-900/80 px-2 py-0.5 rounded border border-blue-500 mb-2"; }
    const p2s = document.getElementById('p2-status'); if(p2s) { p2s.textContent="OPPONENT"; p2s.className="text-[10px] font-black bg-red-900/80 px-2 py-0.5 rounded border border-red-500 mb-2 opacity-0"; }
    startListener(currentRoomId); startEmoteListener(currentRoomId); drawHand(); switchView('hand'); showWaiting(true, true); playBattleBgm();
}

setClick('btn-create', () => {
    playSE('btn'); if(!currentUser) return; saveProfile();
    if (globalSettings.anyoneCanHost || isMainHost || isSubHost) { doCreateRoom(); return; }
    if (globalSettings.adminUid && currentUserAccount && currentUserAccount.id === globalSettings.adminUid) { isMainHost = true; doCreateRoom(); return; }
    authAction = 'create'; const ip = document.getElementById('input-emergency-pass'); if(ip) ip.value = ''; document.getElementById('modal-emergency-auth')?.classList.remove('hidden'); 
});

setClick('btn-join', async () => {
    playSE('btn'); if(!currentUser) return; saveProfile();
    const idInput = document.getElementById('input-room'); if(!idInput) return;
    const id = idInput.value.trim(); if(!id) return;
    const ref = doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, id); const snap = await getDoc(ref);
    if (snap.exists() && snap.data().phase !== 'closed') {
        const d = snap.data();
        if (!d.guestId || d.guestId === 'CPU_BOT') {
            isHost = false; currentRoomId = id; currentPhase = 'waiting'; currentRoomData = null; isPlayingVsCpu = false;
            
            const rt = document.getElementById('room-id-text'); if(rt) rt.textContent = id; document.getElementById('room-display')?.classList.remove('hidden');
            const p1s = document.getElementById('p1-status'); if(p1s) { p1s.textContent="OPPONENT"; p1s.className="text-[10px] font-black bg-red-900/80 px-2 py-0.5 rounded border border-red-500 mb-2"; }
            const p2s = document.getElementById('p2-status'); if(p2s) { p2s.textContent="YOU"; p2s.className="text-[10px] font-black bg-blue-900/80 px-2 py-0.5 rounded border border-blue-500 mb-2"; }
            
            const myHp = (myPlayerInfo.stats && myPlayerInfo.stats.hp) ? myPlayerInfo.stats.hp : 1500;
            await updateDoc(ref, { guestId: currentUser.uid, p2Info: myPlayerInfo, p2Hp: myHp, p2MaxHp: myHp, p1Hp: d.p1Hp, p1Cards: null, p2Cards: null, phase: 'waiting', updatedAt: new Date() });
            startListener(id); startEmoteListener(id); drawHand(); switchView('hand'); playBattleBgm();
        } else alert("満員です");
    } else alert("部屋が存在しません");
});

setClick('btn-surrender', async () => {
    playSE('btn'); if (isAnimating) return alert("バトル中は降伏できません！\nターン終了をお待ちください。");
    if (!confirm("降伏して退出しますか？（相手の勝利になります）")) return; if (!currentRoomId) return;
    await updateDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, currentRoomId), Object.assign(isHost ? { p1Hp: 0 } : { p2Hp: 0 }, { updatedAt: new Date() }));
});

const rndCard = () => { const e = ELEMENTS[Math.floor(Math.random()*3)]; return { element: e.id, power: Math.floor(Math.random()*9)+1 }; };
function drawHand() { myHand = [rndCard(), rndCard(), rndCard(), rndCard(), rndCard()]; selectedIndices = []; renderHand(); }

function renderHand() {
    const hc = document.getElementById('hand-cards'); if(!hc) return; hc.innerHTML = '';
    const isActive = (currentPhase === 'waiting' && !isAnimating && currentRoomData && currentRoomData.guestId && (isHost ? !currentRoomData.p1Cards : !currentRoomData.p2Cards));
    myHand.forEach((c, i) => {
        const el = ELEMENTS.find(e => e.id === c.element); const d = document.createElement('div'); d.className = `hand-card element-${c.element} ${!isActive?'disabled':''}`; let idx = selectedIndices.indexOf(i);
        d.innerHTML = `<div class="text-2xl leading-none mb-1">${el.icon}</div><div class="text-3xl font-black text-gray-900 leading-none">${c.power}</div>`;
        if(idx !== -1) { d.classList.add('selected'); d.innerHTML += `<div class="absolute -top-2 -right-2 bg-red-600 text-white font-black rounded-full w-6 h-6 flex items-center justify-center text-xs shadow border-2 border-white z-10">${idx + 1}</div>`; }
        d.onclick = () => { if(!isActive) return; playSE('select'); if(idx !== -1) selectedIndices.splice(idx,1); else if(selectedIndices.length<3) selectedIndices.push(i); renderHand(); }; hc.appendChild(d);
    });
    const bc = document.getElementById('btn-confirm'); if(!bc) return;
    if(selectedIndices.length === 3 && isActive) { bc.disabled = false; bc.className = "w-full max-w-sm bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg shadow-[0_0_15px_rgba(59,130,246,0.8)] transition-all"; bc.textContent = "CONFIRM 3 CARDS"; }
    else { bc.disabled = true; bc.className = "w-full max-w-sm bg-gray-800 text-gray-500 font-bold py-3 rounded-lg cursor-not-allowed"; bc.textContent = `SELECT CARDS (${selectedIndices.length}/3)`; }
}

setClick('btn-confirm', async () => {
    playSE('btn'); if(selectedIndices.length !== 3 || currentPhase !== 'waiting') return;
    const sCards = selectedIndices.map(i => myHand[i]); if (currentRoomData) { if (isHost) currentRoomData.p1Cards = sCards; else currentRoomData.p2Cards = sCards; }
    renderHand(); for(let i=0;i<3;i++) { const s = document.getElementById(isHost?`p1-slot-${i}`:`p2-slot-${i}`); if(s) s.innerHTML = `<div class="card-inner">${getCardBackHTML()}</div>`; }
    showWaiting(true, (!currentRoomData.guestId && isHost)); 
    const bc = document.getElementById('btn-confirm'); if(bc) { bc.textContent = "SET COMPLETED"; bc.disabled = true; }
    const ref = doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, currentRoomId);
    await updateDoc(ref, Object.assign(isHost ? { p1Cards: sCards } : { p2Cards: sCards }, { updatedAt: new Date() }));
});

// --- Canvas Effects & Battle (壊れる前のシンプルなベース演出) ---
const canvas = document.getElementById('effect-canvas');
const ctx = canvas ? canvas.getContext('2d') : null;
let activeEffects = [];
if(canvas) {
    window.addEventListener('resize', () => { canvas.width = canvas.clientWidth; canvas.height = canvas.clientHeight; });
    canvas.width = canvas.clientWidth; canvas.height = canvas.clientHeight;
    function animateEffects(time) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for(let i = activeEffects.length - 1; i >= 0; i--) { activeEffects[i].update(time); activeEffects[i].draw(ctx); if(activeEffects[i].isDead) activeEffects.splice(i, 1); }
        requestAnimationFrame(animateEffects);
    }
    requestAnimationFrame(animateEffects);
}

class PopUpText {
    constructor(x, y, text, color, scale = 1) { this.x=x; this.y=y; this.text=text; this.color=color; this.scaleBase=scale; this.st=performance.now(); this.isDead=false; }
    update(t) { this.p = (t - this.st) / 1200; if(this.p >= 1) this.isDead = true; }
    draw(ctx) {
        let a = 1, dy = -40 * this.p, s = this.scaleBase * (this.p < 0.2 ? 0.5 + 2.5*this.p : (this.p > 0.8 ? 1 - (this.p-0.8)*5 : 1));
        if (this.p > 0.8) a = 1 - (this.p - 0.8)*5;
        ctx.save(); ctx.globalAlpha = a; ctx.translate(this.x, this.y + dy); ctx.scale(s, s); ctx.font = "900 40px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.lineWidth = 6; ctx.strokeStyle = '#000'; ctx.strokeText(this.text, 0, 0); ctx.fillStyle = this.color; ctx.shadowColor = this.color; ctx.shadowBlur = 15; ctx.fillText(this.text, 0, 0); ctx.restore();
    }
}
class FlashBang {
    constructor() { this.st = performance.now(); this.isDead = false; }
    update(t) { this.p = (t - this.st) / 300; if (this.p >= 1) this.isDead = true; }
    draw(ctx) { ctx.save(); ctx.fillStyle = `rgba(255,255,255,${this.p < 0.5 ? this.p*2 : 1 - (this.p-0.5)*2})`; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.restore(); }
}
class Projectile {
    constructor(sx, sy, ex, ey, el, onDone) { this.sx=sx; this.sy=sy; this.ex=ex; this.ey=ey; this.el=el; this.onDone=onDone; this.st=performance.now(); this.isDead=false; this.ang=Math.atan2(ey-sy, ex-sx); }
    update(t) { this.p = (t - this.st) / 400; this.p *= this.p; if(this.p >= 1) { this.p=1; this.isDead=true; this.onDone(); } this.x = this.sx + (this.ex-this.sx)*this.p; this.y = this.sy + (this.ey-this.sy)*this.p; }
    draw(ctx) { ctx.save(); ctx.translate(this.x, this.y); ctx.fillStyle=this.el.color; ctx.shadowColor=this.el.shadow; ctx.shadowBlur=30; if (this.el.id === 'FIRE') { ctx.beginPath(); ctx.arc(0,0,30,0,Math.PI*2); ctx.fill(); } else if (this.el.id === 'WATER') { ctx.rotate(this.ang); ctx.beginPath(); ctx.arc(0, 0, 20, -Math.PI/2, Math.PI/2); ctx.lineTo(-35, 0); ctx.closePath(); ctx.fill(); } ctx.restore(); }
}
class Lightning {
    constructor(sx, sy, ex, ey, onDone) { this.st = performance.now(); this.isDead = false; this.onDone = onDone; this.pts = [{x:sx,y:sy}]; for(let i=1;i<10;i++) this.pts.push({x:sx+(ex-sx)*i/10+(Math.random()-0.5)*60, y:sy+(ey-sy)*i/10+(Math.random()-0.5)*60}); this.pts.push({x:ex,y:ey}); }
    update(t) { if(t-this.st > 300) { this.isDead = true; this.onDone(); } }
    draw(ctx) { let a = 1 - (performance.now()-this.st)/300; ctx.save(); ctx.globalAlpha = a; ctx.beginPath(); ctx.moveTo(this.pts[0].x, this.pts[0].y); for(let i=1;i<this.pts.length;i++) ctx.lineTo(this.pts[i].x, this.pts[i].y); ctx.strokeStyle='#fff'; ctx.lineWidth=8; ctx.stroke(); ctx.strokeStyle='#fef08a'; ctx.lineWidth=16; ctx.shadowColor='#eab308'; ctx.shadowBlur=30; ctx.stroke(); ctx.restore(); }
}
class Particle {
    constructor(x, y, el) { this.sx=x; this.sy=y; this.el=el; this.st=performance.now(); this.isDead=false; let a=Math.random()*Math.PI*2, d=40+Math.random()*60; this.sz=5+Math.random()*10; if(el.id==='FIRE'){ this.vx=Math.cos(a)*d*0.8; this.vy=-Math.abs(Math.sin(a)*d)-20; this.dur=600;} else if(el.id==='WATER'){ this.vx=Math.cos(a)*d*0.8; this.vy=Math.abs(Math.sin(a)*d)+20; this.dur=600;} else { this.vx=Math.cos(a)*d*1.5; this.vy=Math.sin(a)*d*1.5; this.dur=300;} }
    update(t) { this.p = (t - this.st) / this.dur; if(this.p>=1){this.p=1; this.isDead=true;} this.x=this.sx+this.vx*(this.el.id==='THUNDER'?this.p:1-(1-this.p)*(1-this.p)); this.y=this.sy+this.vy*(this.el.id==='THUNDER'?this.p:1-(1-this.p)*(1-this.p)); }
    draw(ctx) { ctx.save(); ctx.globalAlpha = 1-this.p; ctx.translate(this.x, this.y); ctx.fillStyle=this.el.color; ctx.shadowColor=this.el.shadow; ctx.shadowBlur=10; ctx.beginPath(); ctx.arc(0,0,this.sz,0,Math.PI*2); ctx.fill(); ctx.restore(); }
}
class CriticalFlash {
    constructor() { this.st = performance.now(); this.isDead = false; }
    update(t) { this.p = (t - this.st) / 1000; if(this.p >= 1) this.isDead = true; }
    draw(ctx) { let a = this.p < 0.2 ? this.p * 5 : 1 - (this.p - 0.2) * 1.25; ctx.save(); ctx.globalAlpha = Math.max(0, a); ctx.fillStyle = 'rgba(255, 0, 0, 0.15)'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.translate(canvas.width/2, canvas.height/2); let s = 0.8 + this.p * 0.2; ctx.scale(s, s); ctx.font = "900 45px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineWidth = 6; ctx.strokeStyle = '#000'; ctx.strokeText("CRITICAL", 0, -40); ctx.fillStyle = '#facc15'; ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 15; ctx.fillText("CRITICAL", 0, -40); ctx.restore(); }
}

async function runBattle(c1A, c2A, hp1, hp2, st1, st2) {
    let p1Tot = 0, p2Tot = 0, m1=c1A[0], m2=c2A[0]; let p1WinCount = 0, p2WinCount = 0; let p1RoundWins = 0, p2RoundWins = 0; 
    let p1GuardElement = (c1A[0].element === c1A[1].element && c1A[1].element === c1A[2].element) ? c1A[0].element : null;
    let p2GuardElement = (c2A[0].element === c2A[1].element && c2A[1].element === c2A[2].element) ? c2A[0].element : null;

    const mk = c => { const e=ELEMENTS.find(x=>x.id===c.element); return `<div class="card-inner">${getCardBackHTML()}<div class="card-front element-${c.element}"><div class="text-xl mb-1">${e.icon}</div><div class="text-2xl font-black text-gray-900 power-val">${c.power}</div></div></div>`; };
    for(let i=0;i<3;i++){ document.getElementById(`p1-slot-${i}`)?.insertAdjacentHTML('beforeend', mk(c1A[i])); document.getElementById(`p2-slot-${i}`)?.insertAdjacentHTML('beforeend', mk(c2A[i])); }
    await sleep(300);

    const showGuardFx = async (playerPrefix, elId) => {
        const e = ELEMENTS.find(x=>x.id===elId); const cardEl = document.getElementById(`${playerPrefix}-player-card`); if(!cardEl || !canvas) return;
        const cbox = cardEl.getBoundingClientRect(); const cv = canvas.getBoundingClientRect();
        const cx = cbox.left - cv.left + cbox.width / 2; const cy = cbox.top - cv.top + cbox.height / 2;
        activeEffects.push(new PopUpText(cx, cy + 30, `[ ${e.icon} GUARD STANDBY ]`, e.color, 0.5));
        playSE('buff'); await sleep(300);
    };
    
    if(p1GuardElement) await showGuardFx('p1', p1GuardElement);
    if(p2GuardElement) await showGuardFx('p2', p2GuardElement);

    for(let i=0; i<3; i++) {
        playSE('open');
        document.getElementById(`p1-slot-${i}`)?.querySelector('.card-inner')?.classList.add('is-flipped'); 
        document.getElementById(`p2-slot-${i}`)?.querySelector('.card-inner')?.classList.add('is-flipped'); 
        await sleep(500);
        let adv = (c1A[i].element==='FIRE'&&c2A[i].element==='THUNDER')||(c1A[i].element==='THUNDER'&&c2A[i].element==='WATER')||(c1A[i].element==='WATER'&&c2A[i].element==='FIRE')?1:(c1A[i].element===c2A[i].element?0:-1);
        let p1=c1A[i].power, p2=c2A[i].power; const bonus = ((c1A[i].power * 7 + c2A[i].power * 3 + i * 5) % 5) + 1;

        const buff = async (sl, pw, el, bns) => { 
            if(!sl || !canvas) return; playSE('buff'); const f = sl.querySelector('.card-front'); const ed = ELEMENTS.find(e=>e.id===el);
            const flash = document.createElement('div'); flash.className = "glow-overlay"; f.appendChild(flash); flash.offsetHeight; flash.style.opacity = '1'; await sleep(200);
            const pVal = f.querySelector('.power-val'); if(pVal) { pVal.textContent = pw; pVal.style.color = ed.color; } f.style.color = ed.color; f.style.borderColor = ed.color; f.style.borderWidth = '4px';
            const r = sl.getBoundingClientRect(), c = canvas.getBoundingClientRect(); activeEffects.push(new PopUpText(r.left-c.left+r.width/2, r.top-c.top-10, `+${bns}`, ed.color, 0.7)); flash.style.opacity = '0'; await sleep(300); flash.remove();
        };
        
        if (adv===1) { p1+=bonus; p1WinCount++; await buff(document.getElementById(`p1-slot-${i}`), p1, c1A[i].element, bonus); } 
        else if (adv===-1) { p2+=bonus; p2WinCount++; await buff(document.getElementById(`p2-slot-${i}`), p2, c2A[i].element, bonus); }
        p1Tot+=p1; p2Tot+=p2; if(p1>m1.power) m1={element:c1A[i].element,power:p1}; if(p2>m2.power) m2={element:c2A[i].element,power:p2};
        
        const addStar = (slotId) => { const slot = document.getElementById(slotId); if(!slot) return; const star = document.createElement('div'); star.className = "absolute -bottom-5 left-1/2 transform -translate-x-1/2 text-yellow-400 text-lg drop-shadow-[0_0_8px_rgba(250,204,21,1)] z-20 animate-pulse"; star.textContent = "★"; slot.appendChild(star); playSE('select'); };
        
        if (p1 > p2) { p1RoundWins++; addStar(`p1-slot-${i}`); } else if (p2 > p1) { p2RoundWins++; addStar(`p2-slot-${i}`); } else {
            const drawTxt = document.createElement('div'); drawTxt.className = "absolute -bottom-4 left-1/2 transform -translate-x-1/2 text-gray-500 text-[9px] font-bold z-20 tracking-widest bg-black/60 px-1 rounded border border-gray-700"; drawTxt.textContent = "DRAW";
            document.getElementById(`p1-slot-${i}`)?.appendChild(drawTxt.cloneNode(true)); document.getElementById(`p2-slot-${i}`)?.appendChild(drawTxt);
        }
        const p1t = document.getElementById('p1-total'); if(p1t) p1t.innerHTML = `<span class="text-yellow-400">${p1RoundWins}勝</span> <span class="text-[10px] text-gray-400">(計${p1Tot})</span>`; 
        const p2t = document.getElementById('p2-total'); if(p2t) p2t.innerHTML = `<span class="text-yellow-400">${p2RoundWins}勝</span> <span class="text-[10px] text-gray-400">(計${p2Tot})</span>`; 
        await sleep(400);
    }
    await sleep(500);

    let p1Win = false, p2Win = false, isDraw = false;
    if (p1RoundWins > p2RoundWins) p1Win = true; else if (p2RoundWins > p1RoundWins) p2Win = true;
    else { if (p1Tot > p2Tot) p1Win = true; else if (p2Tot > p1Tot) p2Win = true; else isDraw = true; }

    const atk = (sId, eId, el) => new Promise(res => {
        const sEl = document.getElementById(sId), eEl = document.getElementById(eId); if(!sEl || !eEl || !canvas) { res(); return; }
        const s = sEl.getBoundingClientRect(), e = eEl.getBoundingClientRect(), c = canvas.getBoundingClientRect();
        const sx=s.left+s.width/2-c.left, sy=s.top+s.height/2-c.top, ex=e.left+e.width/2-c.left, ey=e.top+e.height/2-c.top;
        const ed=ELEMENTS.find(x=>x.id===el); activeEffects.push(new FlashBang());
        if(el==='THUNDER') playSE('thunder'); else if(el==='FIRE') playSE('fire'); else playSE('water');
        const onHit = () => { document.body.classList.add('earthquake'); setTimeout(()=>document.body.classList.remove('earthquake'), 400); for(let i=0;i<30;i++) activeEffects.push(new Particle(ex, ey, ed)); res(); };
        if(el==='THUNDER') activeEffects.push(new Lightning(sx,sy,ex,ey,onHit)); else activeEffects.push(new Projectile(sx,sy,ex,ey,ed,onHit));
    });

    if (!isDraw) {
        let isCritical = (p1Win && (p1WinCount === 3 || p1RoundWins === 3)) || (!p1Win && (p2WinCount === 3 || p2RoundWins === 3));
        if (isCritical) { activeEffects.push(new CriticalFlash()); playSE('alert'); await sleep(800); }
        await atk(p1Win?'p1-player-card':'p2-player-card', p1Win?'p2-player-card':'p1-player-card', p1Win?m1.element:m2.element);
        
        const targetCard = document.getElementById(p1Win?'p2-player-card':'p1-player-card');
        if(targetCard) { targetCard.classList.add('shake'); setTimeout(()=>targetCard.classList.remove('shake'), 400); }
        
        let wStat = p1Win ? st1 : st2; let lStat = p1Win ? st2 : st1;
        let diff = Math.abs(p1Tot - p2Tot); if (diff === 0) diff = 10;
        let baseDmg = Math.max(diff * 20, (diff * 100) + wStat.atk - Math.floor(lStat.def / 2));
        if (isCritical) baseDmg = Math.floor(baseDmg * 1.5);
        
        // 壊れる前のシンプルなガードロジック（そのまま数値を引き算）
        let loserGuard = p1Win ? p2GuardElement : p1GuardElement;
        let loserGuardPower = p1Win ? p2Tot : p1Tot; 
        if (loserGuard) {
            const ed = ELEMENTS.find(x=>x.id===loserGuard);
            if(targetCard && canvas) {
                const r2 = targetCard.getBoundingClientRect(), c2 = canvas.getBoundingClientRect();
                activeEffects.push(new PopUpText(r2.left-c2.left+r2.width/2, r2.top-c2.top+30, `[GUARD] -${loserGuardPower}`, ed.color, 0.8));
            }
            playSE('buff'); await sleep(600);
            baseDmg = Math.max(10, baseDmg - loserGuardPower);
        }

        if(targetCard && canvas) { const r=targetCard.getBoundingClientRect(), c=canvas.getBoundingClientRect(); activeEffects.push(new PopUpText(r.left-c.left+r.width/2, r.top-c.top-10, `-${baseDmg}`, '#ef4444', 1.2)); }
        if(p1Win) hp2=Math.max(0,hp2-baseDmg); else hp1=Math.max(0,hp1-baseDmg);
    } else { 
        if(canvas) { const c=canvas.getBoundingClientRect(); activeEffects.push(new PopUpText(c.width/2, c.height/2, 'DRAW!', '#9ca3af', 1.5)); }
    }

    const tHp1 = document.getElementById('p1-hp-text'); if(tHp1) tHp1.textContent = hp1; const tHp2 = document.getElementById('p2-hp-text'); if(tHp2) tHp2.textContent = hp2;
    const bHp1 = document.getElementById('p1-hp-bar'); if(bHp1) bHp1.style.width = `${Math.max(0, (hp1 / (st1.hp||1500)) * 100)}%`; const bHp2 = document.getElementById('p2-hp-bar'); if(bHp2) bHp2.style.width = `${Math.max(0, (hp2 / (st2.hp||1500)) * 100)}%`;

    await sleep(1500); return { hp1: hp1, hp2: hp2 };
}

function applyPlayerUI(prefix, info, defName) {
    try {
        if(!info) {
            const dn = document.getElementById(`${prefix}-name`); if(dn) dn.textContent = defName;
            const di = document.getElementById(`${prefix}-icon`); if(di) di.innerHTML = `<span class="text-[8px] text-white font-bold">${defName.charAt(0)}</span>`;
            document.getElementById(`${prefix}-card-img`)?.classList.add('hidden');
            document.getElementById(`${prefix}-stats-badge`)?.classList.add('hidden');
            document.getElementById(`${prefix}-rarity-badge`)?.classList.add('hidden');
            if(prefix === 'p2') document.getElementById('p2-status')?.classList.add('opacity-0');
            return;
        }
        if(prefix === 'p2') document.getElementById('p2-status')?.classList.remove('opacity-0');
        const safeName = (info.name && typeof info.name === 'string' && info.name.trim() !== '') ? info.name : defName;
        const dn = document.getElementById(`${prefix}-name`); if(dn) dn.textContent = safeName;
        
        let iconHtml = `<span class="text-[8px] text-white font-bold">${safeName.charAt(0).toUpperCase()}</span>`;
        if(info.iconData && typeof info.iconData === 'string') {
            if(info.iconData.startsWith('http') || info.iconData.startsWith('data:image')) iconHtml = `<img src="${info.iconData}" class="w-full h-full object-cover" onerror="this.style.display='none'">`;
            else iconHtml = `<span class="text-[12px]">${info.iconData}</span>`;
        }
        const di = document.getElementById(`${prefix}-icon`); if(di) di.innerHTML = iconHtml;
        
        const ci = document.getElementById(`${prefix}-card-img`); if(ci && info.cardData) { ci.src = info.cardData; ci.classList.remove('hidden'); }
        
        const stats = info.stats || defaultStats;
        document.getElementById(`${prefix}-stats-badge`)?.classList.remove('hidden');
        const sa = document.getElementById(`${prefix}-atk-val`); if(sa) sa.textContent = stats.atk || 0;
        const sd = document.getElementById(`${prefix}-def-val`); if(sd) sd.textContent = stats.def || 0;
        const ss = document.getElementById(`${prefix}-spd-val`); if(ss) ss.textContent = stats.spd || 0;
        
        const rb = document.getElementById(`${prefix}-rarity-badge`);
        if(rb) {
            const rar = stats.rarity || 'N'; rb.textContent = rar; rb.classList.remove('hidden');
            rb.className = "text-[8px] px-1 bg-black rounded border font-black ";
            if(rar === 'EX') rb.className += "bg-gradient-to-r from-purple-500 via-pink-500 to-red-500 text-white border-white shadow-[0_0_15px_rgba(236,72,153,1)] animate-pulse";
            else if(rar === 'UR++') rb.className += "text-red-500 border-red-500 shadow-[0_0_5px_rgba(239,68,68,0.8)]";
            else if(rar === 'UR+') rb.className += "text-orange-500 border-orange-500 shadow-[0_0_5px_rgba(249,115,22,0.8)]";
            else if(typeof rar === 'string' && (rar.includes('UR') || rar.includes('SSR'))) rb.className += "text-brand-rare border-brand-rare shadow-[0_0_5px_rgba(234,179,8,0.8)]";
            else if(typeof rar === 'string' && rar.includes('SR')) rb.className += "text-brand-epic border-brand-epic shadow-[0_0_5px_rgba(168,85,247,0.8)]";
            else rb.className += "text-gray-400 border-gray-600";
        }
    } catch(e) { console.warn("Player UI Apply Error:", e); }
}

function startListener(id) {
    if(window._roomUnsub) window._roomUnsub();
    window._roomUnsub = onSnapshot(doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, id), async snap => {
        const d = snap.data(); if(!d) return;
        if (isHost && isPlayingVsCpu && d.guestId && d.guestId !== 'CPU_BOT') {
            isPlayingVsCpu = false; playSE('alert'); playBattleBgm();
            if(navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 500, 200, 500]); 
            const flash = document.createElement('div'); flash.className = "fixed inset-0 bg-red-600/90 z-[9999] flex flex-col items-center justify-center pointer-events-none transition-opacity duration-300 alert-siren backdrop-blur-sm";
            flash.innerHTML = `<div class="text-7xl font-black text-white tracking-widest drop-shadow-[0_0_20px_rgba(0,0,0,1)] mb-4">NEW CHALLENGER!</div><div class="text-2xl font-bold text-yellow-400 drop-shadow-[0_0_10px_rgba(0,0,0,0.8)]">乱入者が現れました！仕切り直します！</div>`;
            document.body.appendChild(flash);
            isAnimating = false; currentPhase = 'interrupted'; pendingSnapshot = null;
            await updateDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, currentRoomId), { p1Cards: null, p2Cards: null, phase: 'waiting', updatedAt: new Date() });
            setTimeout(() => { flash.style.opacity = '0'; setTimeout(() => flash.remove(), 500); }, 3000); 
        }
        if (isHost && !isPlayingVsCpu && !currentRoomData?.guestId && d.guestId) { playSE('alert'); if(navigator.vibrate) navigator.vibrate([100, 50, 100]); }
        if(isAnimating) { pendingSnapshot = d; return; }
        await processGameData(d);
    });
}

async function processGameData(d) {
    currentRoomData = d; applyPlayerUI('p1', d.p1Info, 'HOST'); applyPlayerUI('p2', d.p2Info, 'GUEST');
    if(d.phase === 'closed' && !isHost) { alert("解散されました。"); location.reload(); return; }
    
    if (currentRoomId && currentPhase !== 'lobby' && d.phase !== 'result' && d.phase !== 'closed') document.getElementById('btn-surrender')?.classList.remove('hidden'); 
    else document.getElementById('btn-surrender')?.classList.add('hidden'); 

    if (d.phase !== 'action') {
        const safeP1Hp = typeof d.p1Hp === 'number' && !isNaN(d.p1Hp) ? d.p1Hp : 0;
        const safeP2Hp = typeof d.p2Hp === 'number' && !isNaN(d.p2Hp) ? d.p2Hp : 0;
        const safeP1MaxHp = typeof d.p1MaxHp === 'number' && !isNaN(d.p1MaxHp) && d.p1MaxHp > 0 ? d.p1MaxHp : 1500;
        const safeP2MaxHp = typeof d.p2MaxHp === 'number' && !isNaN(d.p2MaxHp) && d.p2MaxHp > 0 ? d.p2MaxHp : 1500;
        const h1t = document.getElementById('p1-hp-text'); if(h1t) h1t.textContent = Math.max(0, safeP1Hp);
        const h2t = document.getElementById('p2-hp-text'); if(h2t) h2t.textContent = Math.max(0, safeP2Hp);
        const b1 = document.getElementById('p1-hp-bar'); if(b1) b1.style.width = `${Math.max(0, (safeP1Hp / safeP1MaxHp) * 100)}%`;
        const b2 = document.getElementById('p2-hp-bar'); if(b2) b2.style.width = `${Math.max(0, (safeP2Hp / safeP2MaxHp) * 100)}%`;
    }

    if ((d.p1Hp <= 0 || d.p2Hp <= 0) && d.phase !== 'result' && d.phase !== 'closed' && !isAnimating) {
        if(isHost) {
            let hostWon = d.p1Hp > 0;
            if(hostWon) await updateRankingStats(currentUser.uid, myPlayerInfo.name, myPlayerInfo.iconData);
            else if(d.guestId) {
                const guestName = d.p2Info ? d.p2Info.name : 'GUEST'; const guestIcon = d.p2Info ? d.p2Info.iconData : null;
                await updateRankingStats(d.guestId, guestName, guestIcon);
            }
            await updateDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, currentRoomId), { phase: 'result', updatedAt: new Date() }); 
        }
        return; 
    }

    if (d.phase === 'waiting') {
        battleResolved = false; 
        if (currentPhase !== 'waiting') {
            if (currentPhase === 'result') playBattleBgm();
            currentPhase = 'waiting';
            document.getElementById('result-message')?.classList.add('hidden', 'opacity-0');
            for(let i=0;i<3;i++){ const s1=document.getElementById(`p1-slot-${i}`); if(s1) s1.innerHTML=''; const s2=document.getElementById(`p2-slot-${i}`); if(s2) s2.innerHTML=''; }
            const p1Tot=document.getElementById('p1-total'); if(p1Tot) p1Tot.textContent="0"; 
            const p2Tot=document.getElementById('p2-total'); if(p2Tot) p2Tot.textContent="0";
            drawHand(); switchView('hand');
            const bc = document.getElementById('btn-confirm');
            if(bc) { bc.disabled = true; bc.className = "w-full max-w-sm bg-gray-800 text-gray-500 font-bold py-3 rounded-lg cursor-not-allowed text-sm transition-all duration-200 tracking-widest"; bc.textContent = `SELECT CARDS (0/3)`; }
        }
        
        if(isHost) {
            if (!d.guestId) showWaiting(true, true);
            else if (d.p1Cards && !d.p2Cards) showWaiting(true, false);
            else if (!d.p1Cards && d.p2Cards) showWaiting(false);
            else if (!d.p1Cards && !d.p2Cards) showWaiting(false);
            else showWaiting(false);
            if(d.p1Cards && d.p2Cards) await updateDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, currentRoomId), { phase: 'action', updatedAt: new Date() });
        } else { 
            if (d.p2Cards && !d.p1Cards) showWaiting(true, false); else showWaiting(false); 
        }
        
        renderHand(); 
        if (d.p1Cards) for(let i=0;i<3;i++) { const s=document.getElementById(`p1-slot-${i}`); if(s && !s.innerHTML.includes('card-inner')) s.innerHTML = `<div class="card-inner">${getCardBackHTML()}</div>`; }
        if (d.p2Cards) for(let i=0;i<3;i++) { const s=document.getElementById(`p2-slot-${i}`); if(s && !s.innerHTML.includes('card-inner')) s.innerHTML = `<div class="card-inner">${getCardBackHTML()}</div>`; }
    }

    if(d.phase === 'action' && d.p1Cards && d.p2Cards && currentPhase !== 'action') {
        currentPhase = 'action'; isAnimating = true; showWaiting(false); renderHand(); 
        const resultHPs = await runBattle(d.p1Cards, d.p2Cards, d.p1Hp, d.p2Hp, d.p1Info?.stats||defaultStats, d.p2Info?.stats||defaultStats);
        isAnimating = false;
        if(isHost) {
            if (resultHPs.hp1 > 0 && resultHPs.hp2 > 0) {
                await updateDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, currentRoomId), { p1Hp: resultHPs.hp1, p2Hp: resultHPs.hp2, p1Cards: null, p2Cards: null, phase: 'waiting', updatedAt: new Date() });
                if (isPlayingVsCpu) setTimeout(async () => { await updateDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, currentRoomId), { p2Cards: getCpuHand(), updatedAt: new Date() }); }, 500);
            } else {
                await updateDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, currentRoomId), { p1Hp: resultHPs.hp1, p2Hp: resultHPs.hp2, updatedAt: new Date() });
            }
        }
        if (pendingSnapshot) { const ns = pendingSnapshot; pendingSnapshot = null; if (ns.phase !== 'action') await processGameData(ns); }
    }

    if(d.phase === 'result') {
        currentPhase = 'result'; fadeOutBattleBgm();
        if(!battleResolved) { battleResolved = true; if (!isPlayingVsCpu) { myPlayerInfo.bp = (myPlayerInfo.bp || 0) + 1; saveProfile(); } }

        const rMsg = document.getElementById('result-message');
        if(rMsg) {
            rMsg.classList.remove('hidden');
            setTimeout(() => {
                rMsg.classList.remove('opacity-0');
                let win = isHost ? d.p1Hp > 0 : d.p2Hp > 0;
                playSE(win ? 'win' : 'lose');
                const tMain = document.getElementById('result-text-main');
                if(tMain) {
                    tMain.textContent = win ? "WIN!" : "LOSE...";
                    tMain.className = win ? "text-6xl font-black text-yellow-400 drop-shadow-[0_0_20px_#facc15]" : "text-6xl font-black text-blue-400 drop-shadow-[0_0_20px_#60a5fa]";
                }
                
                // 過去のUI（対戦終了時のボタン）
                if (isHost) {
                    document.getElementById('host-controls')?.classList.remove('hidden'); document.getElementById('host-controls')?.classList.add('flex');
                    const notice = document.getElementById('host-rematch-notice'); const br = document.getElementById('btn-restart');
                    if(isPlayingVsCpu) {
                        if(notice) notice.classList.add('hidden'); if(br) br.textContent = "CPUともう一度"; 
                    } else if(!d.guestId) { 
                        if(notice) { notice.textContent = "対戦相手が退出しました"; notice.className = "text-red-400 font-bold text-sm"; notice.classList.remove('hidden'); }
                        if(br) br.textContent = "次を募集"; 
                    } else if(d.guestWantsRematch) { 
                        if(notice) { notice.textContent = "対戦相手が再戦を希望！"; notice.className = "text-yellow-400 font-bold text-sm animate-pulse"; notice.classList.remove('hidden'); }
                        if(br) br.textContent = "再戦する"; 
                    } else { 
                        if(notice) notice.classList.add('hidden'); if(br) br.textContent = "もう一度プレイ"; 
                    }
                } else {
                    document.getElementById('guest-controls')?.classList.remove('hidden'); document.getElementById('guest-controls')?.classList.add('flex');
                }
            }, 100);
        }
    }
}

setClick('btn-restart', async () => {
    playSE('btn'); document.getElementById('host-controls')?.classList.add('hidden'); document.getElementById('host-controls')?.classList.remove('flex');
    document.getElementById('host-rematch-notice')?.classList.add('hidden');
    const hp1 = myPlayerInfo.stats.hp || 1500; 
    const ref = doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, currentRoomId);
    
    if (isPlayingVsCpu && !isStoryBattle) {
        const cpuInfo = getCpuPlayer(); const hp2 = cpuInfo.stats.hp || 1500;
        await updateDoc(ref, { p1Hp: hp1, p2Hp: hp2, p2Info: cpuInfo, p2MaxHp: hp2, p1Cards: null, p2Cards: getCpuHand(), phase: 'waiting', guestWantsRematch: false, updatedAt: new Date() });
    } else {
        const snap = await getDoc(ref); const d = snap.exists() ? snap.data() : null;
        const hp2 = (d && d.p2Info && d.p2Info.stats) ? (d.p2Info.stats.hp || 1500) : 1500;
        await updateDoc(ref, { guestId: null, p2Info: null, p2Cards: null, p1Hp: hp1, p2Hp: hp2, phase: 'waiting', guestWantsRematch: false, updatedAt: new Date() });
    }
});
setClick('btn-exit-host', async () => { playSE('btn'); if(confirm("解散しますか？")) { await updateDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, currentRoomId), { phase: 'closed', updatedAt: new Date() }); location.reload(); } });
setClick('btn-request-rematch', async () => { playSE('btn'); document.getElementById('btn-request-rematch')?.classList.add('hidden'); document.getElementById('wait-restart-text')?.classList.remove('hidden'); await updateDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, currentRoomId), { guestWantsRematch: true, updatedAt: new Date() }); });
setClick('btn-exit-guest', async () => { playSE('btn'); if(confirm("退出しますか？")) { await updateDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, currentRoomId), { guestId: null, p2Info: null, p2Cards: null, updatedAt: new Date() }); location.reload(); } });
setClick('btn-wait-exit', () => document.getElementById('btn-exit-host')?.click());
setClick('btn-wait-show-qr', () => { document.getElementById('waiting-qr-container')?.classList.toggle('hidden'); document.getElementById('waiting-qr-container')?.classList.toggle('flex'); });
setClick('btn-wait-copy-link', () => document.getElementById('btn-copy-url')?.click());

let isDisconnecting = false;
const handleDisconnect = () => {
    if (isDisconnecting || !currentRoomId) return;
    isDisconnecting = true; const ref = doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, currentRoomId);
    if (isHost) updateDoc(ref, { phase: 'closed', updatedAt: new Date() }).catch(()=>{}); else updateDoc(ref, { guestId: null, p2Info: null, p2Cards: null, updatedAt: new Date() }).catch(()=>{});
};
window.addEventListener('pagehide', handleDisconnect);
window.addEventListener('beforeunload', handleDisconnect);

initAuth();

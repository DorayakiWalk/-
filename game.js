import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot, getDoc, updateDoc, increment, collection, query, orderBy, limit, getDocs, deleteDoc, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const firebaseConfig = { apiKey: "AIzaSyB0WCtYTz2ychi5K7WaE1iXjN65VpLwWac", authDomain: "voice-chat-streamer.firebaseapp.com", projectId: "voice-chat-streamer", storageBucket: "voice-chat-streamer.firebasestorage.app", messagingSenderId: "403894004803", appId: "1:403894004803:web:c75b2d63b57f5f4ab978f6" };
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const ROOM_COL = 'rooms_v10'; 
const appIdStr = 'streamer-card-game';

// ★絶対安全なクリック設定ヘルパー
const setClick = (id, fn) => { const el = document.getElementById(id); if(el) el.onclick = fn; };

// ★QRコード関数
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
        if(modal) { modal.classList.remove('hidden'); document.getElementById('btn-welcome-close').classList.add('hidden'); }
    }
}

window.editUserName = function() {
    playSE('btn');
    const modal = document.getElementById('modal-welcome');
    if(modal) {
        modal.classList.remove('hidden');
        document.getElementById('welcome-title').textContent = "CHANGE NAME";
        document.getElementById('input-welcome-name').value = myPlayerInfo.name;
        document.getElementById('btn-welcome-close').classList.remove('hidden');
    }
};

setClick('name-display-container', window.editUserName);
setClick('btn-welcome-close', () => { playSE('btn'); document.getElementById('modal-welcome').classList.add('hidden'); document.getElementById('input-welcome-name').value = myPlayerInfo.name; });
setClick('btn-welcome-submit', () => {
    playSE('btn'); const n = document.getElementById('input-welcome-name').value.trim();
    if(n) { myPlayerInfo.name = n; saveProfile(); document.getElementById('modal-welcome').classList.add('hidden'); } else alert("名前を入力してください！");
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
// 【パート2】ここまで（次はパート3をこの下に貼る）
// ==========================================
// ==========================================
// 【パート3】ここから下をコピーして貼り付け
// ==========================================
// --- Canvas Effects & Battle ---
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

// ★ 神秘的に大きく明滅する常駐ハニカムシールド
class HoneycombShield {
    constructor(x, y, color) { this.x = x; this.y = y; this.color = color; this.st = performance.now(); this.isDead = false; this.fadePhase = 'in'; }
    kill() { this.fadePhase = 'out'; this.fadeOutStart = performance.now(); }
    update(t) {
        let elapsed = t - this.st;
        if (this.fadePhase === 'in') { this.alphaBase = Math.min(1, elapsed / 800) * 0.3; if (elapsed > 800) this.fadePhase = 'active'; } 
        else if (this.fadePhase === 'active') { this.alphaBase = 0.3; } 
        else if (this.fadePhase === 'out') { let outElapsed = t - (this.fadeOutStart || t); this.alphaBase = Math.max(0, 0.3 - (outElapsed / 400) * 0.3); if (outElapsed > 400) this.isDead = true; }
        this.pulse = (Math.sin(elapsed / 400) + 1) / 2; // 早めの明滅
    }
    draw(ctx) {
        ctx.save(); ctx.globalAlpha = this.alphaBase + (this.pulse * 0.2); ctx.translate(this.x, this.y); ctx.strokeStyle = this.color; ctx.lineWidth = 2 + (this.pulse * 2); ctx.shadowColor = this.color; ctx.shadowBlur = 15 + this.pulse * 20; 
        const drawHex = (hx, hy, r) => { ctx.beginPath(); for(let i=0; i<6; i++) { let angle = Math.PI / 3 * i; let px = hx + r * Math.cos(angle); let py = hy + r * Math.sin(angle); if(i===0) ctx.moveTo(px, py); else ctx.lineTo(px, py); } ctx.closePath(); ctx.stroke(); };
        const r = 35; const dx = r * 1.5; const dy = r * Math.sqrt(3);
        for (let row = -2; row <= 2; row++) { for (let col = -2; col <= 2; col++) { let hx = col * dx; let hy = row * dy + (col % 2 !== 0 ? dy / 2 : 0); if (Math.hypot(hx, hy) < 90) { drawHex(hx, hy, r * 0.85); } } } ctx.restore();
    }
}
class AbsorbFlash {
    constructor(x, y, w, h) { this.x=x; this.y=y; this.w=w; this.h=h; this.st=performance.now(); this.isDead=false; }
    update(t) { this.p = (t - this.st) / 600; if(this.p >= 1) this.isDead = true; }
    draw(ctx) { let a = this.p < 0.2 ? this.p * 5 : 1 - (this.p - 0.2) * 1.25; ctx.save(); ctx.globalAlpha = Math.max(0, a) * 0.7; ctx.fillStyle = '#f97316'; ctx.shadowColor = '#f97316'; ctx.shadowBlur = 30; ctx.beginPath(); ctx.roundRect(this.x - this.w/2, this.y - this.h/2, this.w, this.h, 10); ctx.fill(); ctx.restore(); }
}
class ShieldBreakEffect {
    constructor(x, y, color) {
        this.x=x; this.y=y; this.color=color; this.st=performance.now(); this.isDead=false; this.shards=[];
        for (let i = 0; i < 30; i++) { let angle = Math.random() * Math.PI * 2; let speed = 5 + Math.random() * 10; let size = 6 + Math.random() * 15; let rotSpeed = (Math.random() - 0.5) * 0.8; this.shards.push({ x:0, y:0, vx:Math.cos(angle)*speed, vy:Math.sin(angle)*speed, size:size, angle:Math.random()*Math.PI*2, rotSpeed:rotSpeed }); }
    }
    update(t) { this.p = (t - this.st) / 600; if (this.p >= 1) this.isDead = true; for (let shard of this.shards) { shard.x += shard.vx; shard.y += shard.vy; shard.angle += shard.rotSpeed; } }
    draw(ctx) { let a = 1 - this.p; ctx.save(); ctx.globalAlpha = Math.max(0, a); ctx.translate(this.x, this.y); ctx.fillStyle = this.color; ctx.shadowColor = this.color; ctx.shadowBlur = 15; for (let shard of this.shards) { ctx.save(); ctx.translate(shard.x, shard.y); ctx.rotate(shard.angle); ctx.beginPath(); ctx.moveTo(0, -shard.size); ctx.lineTo(shard.size * 0.8, shard.size * 0.5); ctx.lineTo(-shard.size * 0.8, shard.size * 0.5); ctx.closePath(); ctx.fill(); ctx.restore(); } ctx.restore(); }
}

async function runBattle(c1A, c2A, hp1, hp2, st1, st2) {
    let p1Tot = 0, p2Tot = 0, m1=c1A[0], m2=c2A[0]; let p1WinCount = 0, p2WinCount = 0; let p1RoundWins = 0, p2RoundWins = 0; 
    let p1GuardElement = (c1A[0].element === c1A[1].element && c1A[1].element === c1A[2].element) ? c1A[0].element : null;
    let p2GuardElement = (c2A[0].element === c2A[1].element && c2A[1].element === c2A[2].element) ? c2A[0].element : null;
    let p1ShieldFx = null; let p2ShieldFx = null;

    const mk = c => { const e=ELEMENTS.find(x=>x.id===c.element); return `<div class="card-inner">${getCardBackHTML()}<div class="card-front element-${c.element}"><div class="text-xl mb-1">${e.icon}</div><div class="text-2xl font-black text-gray-900 power-val">${c.power}</div></div></div>`; };
    for(let i=0;i<3;i++){ document.getElementById(`p1-slot-${i}`)?.insertAdjacentHTML('beforeend', mk(c1A[i])); document.getElementById(`p2-slot-${i}`)?.insertAdjacentHTML('beforeend', mk(c2A[i])); }
    await sleep(300);

    const showGuardFx = async (playerPrefix, elId) => {
        const e = ELEMENTS.find(x=>x.id===elId); const cardEl = document.getElementById(`${playerPrefix}-player-card`); if(!cardEl || !canvas) return;
        const cbox = cardEl.getBoundingClientRect(); const cv = canvas.getBoundingClientRect();
        const cx = cbox.left - cv.left + cbox.width / 2; const cy = cbox.top - cv.top + cbox.height / 2;
        const shield = new HoneycombShield(cx, cy, e.color); activeEffects.push(shield);
        if(playerPrefix === 'p1') p1ShieldFx = shield; else p2ShieldFx = shield;
        activeEffects.push(new PopUpText(cx, cy + 50, `[ ${e.icon} FIELD ${e.icon} ]`, e.color, 0.7));
        playSE('buff'); await sleep(400);
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
        
        let loserGuard = p1Win ? p2GuardElement : p1GuardElement;
        let winnerMainElement = p1Win ? m1.element : m2.element; let loserGuardPower = p1Win ? p2Tot : p1Tot; 

        if (loserGuard && targetCard && canvas) {
            let gAdv = 0;
            if ((loserGuard==='FIRE'&&winnerMainElement==='THUNDER')||(loserGuard==='THUNDER'&&winnerMainElement==='WATER')||(loserGuard==='WATER'&&winnerMainElement==='FIRE')) { gAdv = 1; } 
            else if (loserGuard === winnerMainElement) { gAdv = 0; } else { gAdv = -1; }

            const r2 = targetCard.getBoundingClientRect(), c2 = canvas.getBoundingClientRect();
            const cx = r2.left - c2.left + r2.width / 2, cy = r2.top - c2.top + r2.height / 2;
            const guardEl = ELEMENTS.find(e => e.id === loserGuard);
            let reduction = 0; let guardText = "";

            if (gAdv === 1) { let cutPercent = Math.min(loserGuardPower, 90); reduction = Math.floor(baseDmg * (cutPercent / 100)); guardText = `GUARD! -${cutPercent}%`; } 
            else if (gAdv === 0) { reduction = loserGuardPower; guardText = `GUARD! -${reduction}`; } 
            else { guardText = "SHIELD BROKEN!"; }

            if (gAdv === -1) {
                if(p1Win && p2ShieldFx) p2ShieldFx.kill(); if(!p1Win && p1ShieldFx) p1ShieldFx.kill();
                // ★ タイミング0秒でガラス破壊音を完全同期再生
                playSE('glassBreak'); 
                activeEffects.push(new ShieldBreakEffect(cx, cy, guardEl.color));
                activeEffects.push(new PopUpText(cx, cy + 30, guardText, '#9ca3af', 0.8));
                targetCard.classList.add('shake'); setTimeout(()=>targetCard.classList.remove('shake'), 300);
                await sleep(500);
            } else {
                if (reduction > 0) {
                    activeEffects.push(new AbsorbFlash(cx, cy, r2.width, r2.height));
                    activeEffects.push(new PopUpText(cx, cy + 30, guardText, '#f97316', 0.6));
                    playSE('buff'); await sleep(600); baseDmg = Math.max(10, baseDmg - reduction);
                }
            }
        }
        if(targetCard && canvas) { const r=targetCard.getBoundingClientRect(), c=canvas.getBoundingClientRect(); activeEffects.push(new PopUpText(r.left-c.left+r.width/2, r.top-c.top-10, `-${baseDmg}`, '#ef4444', 1.2)); }
        if(p1Win) hp2=Math.max(0,hp2-baseDmg); else hp1=Math.max(0,hp1-baseDmg);
    } else { 
        if(canvas) { const c=canvas.getBoundingClientRect(); activeEffects.push(new PopUpText(c.width/2, c.height/2, 'DRAW!', '#9ca3af', 1.5)); }
    }

    const tHp1 = document.getElementById('p1-hp-text'); if(tHp1) tHp1.textContent = hp1; const tHp2 = document.getElementById('p2-hp-text'); if(tHp2) tHp2.textContent = hp2;
    const bHp1 = document.getElementById('p1-hp-bar'); if(bHp1) bHp1.style.width = `${Math.max(0, (hp1 / (st1.hp||1500)) * 100)}%`; const bHp2 = document.getElementById('p2-hp-bar'); if(bHp2) bHp2.style.width = `${Math.max(0, (hp2 / (st2.hp||1500)) * 100)}%`;

    if(p1ShieldFx) p1ShieldFx.kill(); if(p2ShieldFx) p2ShieldFx.kill();
    await sleep(1500); return { hp1: hp1, hp2: hp2 };
}
// ----------------------------------------------------
// イベントリスナー登録・他処理
// ----------------------------------------------------
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

// ==========================================
// 【パート1 / 3】ここからコピーして game.js の先頭に貼り付け
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot, getDoc, updateDoc, increment, collection, query, orderBy, limit, getDocs, deleteDoc, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const firebaseConfig = { apiKey: "AIzaSyB0WCtYTz2ychi5K7WaE1iXjN65VpLwWac", authDomain: "voice-chat-streamer.firebaseapp.com", projectId: "voice-chat-streamer", storageBucket: "voice-chat-streamer.firebasestorage.app", messagingSenderId: "403894004803", appId: "1:403894004803:web:c75b2d63b57f5f4ab978f6" };
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const ROOM_COL = 'rooms_v10'; 
const appIdStr = 'streamer-card-game';

const battleBgm = new Howl({
    src: ["https://dorayakiwalk.github.io/-/audio/Thebugcan'tbefixed.mp3"],
    loop: true,
    volume: 0.25
});
let isBgmMuted = false;
let bgmFadeOutTimer = null;

function playBattleBgm() {
    if (bgmFadeOutTimer) {
        clearTimeout(bgmFadeOutTimer);
        bgmFadeOutTimer = null;
    }
    battleBgm.stop();
    battleBgm.volume(0.25);
    if(!isBgmMuted) battleBgm.play();
}

function fadeOutBattleBgm() {
    if(battleBgm.playing()) {
        battleBgm.fade(0.25, 0, 2000);
        if (bgmFadeOutTimer) clearTimeout(bgmFadeOutTimer);
        bgmFadeOutTimer = setTimeout(() => {
            battleBgm.stop();
            bgmFadeOutTimer = null;
        }, 2000);
    }
}

let currentUser = null, isHost = false, currentRoomId = null, isAnimating = false, currentPhase = 'lobby';
let myHand = [], selectedIndices = [];
let globalSettings = { anyoneCanHost: false, subPasswords: [], adminUid: null, adminPassHash: null, campaigns: [] };
let currentAdminCampId = null; 

let isMainHost = false;
let isSubHost = false;
let authAction = null; 
let isHostPrivilegeMode = false;
let battleResolved = false; 

let isPlayingVsCpu = false; 
let isStoryBattle = false;
let currentCampaign = null;
let currentStoryStage = 0;
let isStoryTyping = false;
let cancelStoryType = false;
let isWaitingForNext = false;
let isStoryTransition = false; 

let currentRoomData = null; 
let pendingSnapshot = null;

let isCloudMode = false;
let currentUserAccount = null;

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

const getCardBackHTML = () => {
    const url = globalCardBackUrl;
    if (url) {
        return `<div class="card-back overflow-hidden border border-gray-600"><img src="${url}" class="absolute inset-0 w-full h-full object-cover"></div>`;
    }
    return `<div class="card-back flex justify-center items-center"><span class="text-gray-500 opacity-50 text-[10px] font-bold rotate-[-45deg] tracking-widest">SET</span></div>`;
};

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
    walk: new Audio('https://assets.mixkit.co/active_storage/sfx/2114/2114-preview.mp3'),
    run: new Audio('https://assets.mixkit.co/active_storage/sfx/2113/2113-preview.mp3'),
    water_step: new Audio('https://assets.mixkit.co/active_storage/sfx/2115/2115-preview.mp3'),
    rain: new Audio('https://assets.mixkit.co/active_storage/sfx/2396/2396-preview.mp3'),
    wind: new Audio('https://assets.mixkit.co/active_storage/sfx/2403/2403-preview.mp3'),
    blizzard: new Audio('https://assets.mixkit.co/active_storage/sfx/2400/2400-preview.mp3'),
    glassBreak: new Audio('https://assets.mixkit.co/active_storage/sfx/2686/2686-preview.mp3')
};
const playSE = (name) => { try { SE[name].volume = 0.5; SE[name].currentTime = 0; SE[name].play().catch(()=>{}); } catch(e){} };

const ELEMENTS = [
    { id: 'FIRE', icon: '🔥', color: '#ef4444', shadow: '#f97316' },
    { id: 'THUNDER', icon: '⚡', color: '#eab308', shadow: '#fef08a' },
    { id: 'WATER', icon: '💧', color: '#3b82f6', shadow: '#60a5fa' }
];

const sleep = ms => new Promise(r => setTimeout(r, ms));
const uiName = document.getElementById('input-welcome-name');

function checkAndShowWelcome() {
    if (!myPlayerInfo.name || myPlayerInfo.name.trim() === "") {
        const m = document.getElementById('modal-welcome');
        if (m) m.classList.remove('hidden');
        const t = document.getElementById('welcome-title');
        if (t) t.textContent = "WELCOME!";
        const d = document.getElementById('welcome-desc');
        if (d) d.innerHTML = "ELEMENTAL CLASHへようこそ！<br>まずはあなたのプレイヤー名を教えてください。";
        const c = document.getElementById('btn-welcome-close');
        if (c) c.classList.add('hidden');
    }
}

window.editUserName = function() {
    playSE('btn');
    const m = document.getElementById('modal-welcome');
    if (m) m.classList.remove('hidden');
    const t = document.getElementById('welcome-title');
    if (t) t.textContent = "CHANGE NAME";
    const d = document.getElementById('welcome-desc');
    if (d) d.innerHTML = "新しいプレイヤー名を入力してください。";
    const i = document.getElementById('input-welcome-name');
    if (i) i.value = myPlayerInfo.name;
    const c = document.getElementById('btn-welcome-close');
    if (c) c.classList.remove('hidden');
};

const nameDisp = document.getElementById('name-display-container');
if (nameDisp) nameDisp.onclick = window.editUserName;

const welcomeCloseBtn = document.getElementById('btn-welcome-close');
if (welcomeCloseBtn) {
    welcomeCloseBtn.onclick = () => {
        playSE('btn');
        const m = document.getElementById('modal-welcome');
        if (m) m.classList.add('hidden');
        const i = document.getElementById('input-welcome-name');
        if (i) i.value = myPlayerInfo.name;
    };
}

const welcomeSubBtn = document.getElementById('btn-welcome-submit');
if (welcomeSubBtn) {
    welcomeSubBtn.onclick = () => {
        playSE('btn');
        const inputName = document.getElementById('input-welcome-name');
        const n = inputName ? inputName.value.trim() : '';
        if(n) {
            myPlayerInfo.name = n;
            saveProfile();
            const m = document.getElementById('modal-welcome');
            if (m) m.classList.add('hidden');
        } else {
            alert("名前を入力してください！");
        }
    };
}

window.editUserIcon = function() {
    playSE('btn');
    const currentIcon = myPlayerInfo.iconData || '👤';
    const defaultPrompt = currentIcon === '👤' ? '' : currentIcon;
    const newIcon = prompt("好きな絵文字（🐶, 🍄, 👑など）を入力してください。\n※画像URL（https://...）を貼ることも可能です。", defaultPrompt);
    
    if(newIcon !== null) {
        const cleanIcon = newIcon.trim() || '👤';
        myPlayerInfo.iconData = cleanIcon; 
        saveProfile(); 
    }
};

window.openLoginModal = function() { 
    playSE('btn'); 
    const m = document.getElementById('modal-login');
    if (m) m.classList.remove('hidden'); 
};

window.logoutPass = async function() {
    playSE('btn');
    if(confirm("ログアウトしてゲスト状態に戻りますか？\n（デッキや名前はそのままですが、同期は解除されます）")) {
        try { await signOut(auth); location.reload(); } catch(e){}
    }
};

window.signInWithGoogle = async function() {
    playSE('btn');
    const provider = new GoogleAuthProvider();
    try {
        const m = document.getElementById('modal-login');
        if (m) m.classList.add('hidden');
        await signInWithPopup(auth, provider);
        location.reload();
    } catch (error) {
        console.error(error);
        alert("ログインに失敗しました。");
    }
};

function loadProfile() {
    const saved = localStorage.getItem('elem_clash_ai_profile_v3');
    if(saved) {
        try {
            myPlayerInfo = JSON.parse(saved);
            myPlayerInfo.bp = myPlayerInfo.bp || 0;
            myPlayerInfo.clearCounts = myPlayerInfo.clearCounts || {};
            if (uiName) uiName.value = myPlayerInfo.name;
            updateLobbyPreview();
        } catch(e) {}
    }
    checkAndShowWelcome();
}

function saveProfile() {
    localStorage.setItem('elem_clash_ai_profile_v3', JSON.stringify(myPlayerInfo));
    updateLobbyPreview();
    
    if (isCloudMode && currentUserAccount) {
        updateDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', 'accounts', currentUserAccount.id), {
            name: myPlayerInfo.name,
            coins: myPlayerInfo.bp,
            icon: myPlayerInfo.iconData,
            clearCounts: myPlayerInfo.clearCounts || {}
        }).catch(()=>{});
    }
}

function updateLobbyPreview() {
    try {
        const dispName = document.getElementById('display-name');
        if (dispName) dispName.textContent = myPlayerInfo.name || "PLAYER";

        const lobbyCardImg = document.getElementById('lobby-card-img');
        if(myPlayerInfo.cardData && lobbyCardImg) {
            lobbyCardImg.src = myPlayerInfo.cardData;
            lobbyCardImg.classList.remove('hidden');
        }
        
        const iconContainer = document.getElementById('mypage-user-icon'); 
        if (iconContainer) {
            if(myPlayerInfo.iconData) {
                const iData = myPlayerInfo.iconData;
                if (iData.startsWith('http') || iData.startsWith('data:image')) {
                    iconContainer.innerHTML = `<img src="${iData}" class="w-full h-full object-cover" onerror="this.style.display='none'">`;
                } else {
                    iconContainer.innerHTML = iData;
                }
            } else {
                iconContainer.innerHTML = '👤';
            }
        }
        
        const stats = myPlayerInfo.stats || defaultStats;
        const lobbyHp = document.getElementById('lobby-hp');
        if (lobbyHp) lobbyHp.textContent = stats.hp || 0;
        const lobbyAtk = document.getElementById('lobby-atk');
        if (lobbyAtk) lobbyAtk.textContent = stats.atk || 0;
        const lobbyDef = document.getElementById('lobby-def');
        if (lobbyDef) lobbyDef.textContent = stats.def || 0;
        const lobbyBp = document.getElementById('lobby-bp');
        if (lobbyBp) lobbyBp.textContent = myPlayerInfo.bp || 0;
        
        const rBadge = document.getElementById('lobby-rarity');
        if (rBadge) {
            const rar = stats.rarity || 'UNRANKED';
            rBadge.textContent = rar;
            rBadge.className = "px-2 py-0.5 bg-black rounded text-[9px] font-black text-gray-500 border border-gray-600 tracking-wider";
            
            if (rar === 'EX') rBadge.className = "px-2 py-0.5 rounded text-[9px] font-black border bg-gradient-to-r from-purple-500 via-pink-500 to-red-500 text-white border-white shadow-[0_0_15px_rgba(236,72,153,1)] tracking-wider animate-pulse";
            else if (rar === 'UR++') rBadge.className = "px-2 py-0.5 rounded text-[9px] font-black border bg-red-500/20 text-red-500 border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)] tracking-wider";
            else if (rar === 'UR+') rBadge.className = "px-2 py-0.5 rounded text-[9px] font-black border bg-orange-500/20 text-orange-500 border-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.8)] tracking-wider";
            else if (typeof rar === 'string' && (rar.includes('UR') || rar.includes('SSR'))) rBadge.className = "px-2 py-0.5 rounded text-[9px] font-black border bg-brand-rare/20 text-brand-rare border-brand-rare tracking-wider";
            else if (typeof rar === 'string' && rar.includes('SR')) rBadge.className = "px-2 py-0.5 rounded text-[9px] font-black border bg-brand-epic/20 text-brand-epic border-brand-epic tracking-wider";
        }
    } catch (e) {
        console.warn("UI更新エラーを回避:", e);
    }
}

function updateLoginUI() {
    const badge = document.getElementById('pass-status-badge');
    const btnLogin = document.getElementById('btn-show-login');
    
    if (isCloudMode && currentUserAccount) {
        if(badge) badge.classList.remove('hidden');
        if(btnLogin) btnLogin.classList.add('hidden');
    } else {
        if(badge) badge.classList.add('hidden');
        if(btnLogin) btnLogin.classList.remove('hidden');
    }
}
// ==========================================
// AI Card Studio & Collection Methods
// ==========================================
const GEMINI_TEXT_MODEL = "gemini-3.6-flash";
const GEMINI_IMAGE_MODEL = "gemini-3.1-flash-image";

let aiTempData = null; 

const aiModal = document.getElementById('modal-ai-generator');
const apiKeyInput = document.getElementById('apiKeyInput');
const apiStatus = document.getElementById('apiStatus');
const apiDemoDesc = document.getElementById('apiDemoDesc');

const savedApiKey = localStorage.getItem('ai_card_gen_apikey_v2');
if(savedApiKey && apiKeyInput) { 
    apiKeyInput.value = savedApiKey; 
    setApiUIState(true);
}

function renderCollection() {
    try {
        const grid = document.getElementById('collection-grid');
        const empty = document.getElementById('collection-empty');
        const title = document.getElementById('collection-title');
        
        if (!grid || !empty || !title) return;

        if (isCloudMode) title.textContent = "MY DECK (クラウド同期中)";
        else title.textContent = "MY COLLECTION (ゲスト)";

        grid.innerHTML = '';
        
        if (!myCollection || myCollection.length === 0) {
            grid.classList.add('hidden');
            empty.classList.remove('hidden');
            return;
        }
        grid.classList.remove('hidden');
        empty.classList.add('hidden');
        
        myCollection.forEach(item => {
            if (!item || !item.stats) return;
            const rar = item.stats.rarity || 'N';
            let colColors = 'border-slate-500 text-slate-300';
            
            if (rar === 'UR++') colColors = 'border-red-500 text-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]';
            else if (rar === 'UR+') colColors = 'border-orange-500 text-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)]';
            else if (typeof rar === 'string' && (rar.includes('UR') || rar.includes('SSR'))) colColors = 'border-brand-rare text-brand-rare shadow-[0_0_8px_rgba(234,179,8,0.6)]';
            else if (typeof rar === 'string' && rar.includes('SR')) colColors = 'border-brand-epic text-brand-epic shadow-[0_0_8px_rgba(168,85,247,0.6)]';
            
            const card = document.createElement('div');
            card.className = "bg-slate-800 border border-slate-600 rounded-lg p-2 flex flex-col items-center shadow-lg relative cursor-pointer hover:border-brand-accent transition";
            card.innerHTML = `
                <img src="${item.origImage}" class="w-full h-32 object-cover rounded mb-1 border border-slate-700" onerror="this.style.display='none'">
                <div class="text-[10px] font-black text-white truncate w-full text-center mt-1">${item.stats.name || '?'}</div>
                <div class="text-[9px] font-black ${colColors.split(' ')[0]} ${colColors.split(' ')[1]} border px-1 rounded mt-0.5">${rar}</div>
            `;
            
            card.onclick = async () => {
                playSE('btn');
                if(confirm(`「${item.stats.name || 'このカード'}」をプロフィールに設定しますか？`)) {
                    myPlayerInfo.cardData = item.origImage;
                    myPlayerInfo.iconData = item.iconImage;
                    myPlayerInfo.stats = item.stats;
                    saveProfile();
                    
                    aiTempData = { stats: item.stats, origImage: item.origImage, iconImage: item.iconImage };
                    updateAiCardUI(item.stats, item.origImage, item.iconImage);

                    const modalCol = document.getElementById('modal-collection');
                    if (modalCol) modalCol.classList.add('hidden');
                    alert("プロフィールを変更しました！");
                }
            };
            grid.appendChild(card);
        });
    } catch(e) { console.warn("コレクション描画エラーを回避", e); }
}

const btnGotoVault = document.getElementById('btn-goto-vault');
if (btnGotoVault) btnGotoVault.onclick = () => {
    playSE('btn');
    window.location.href = "https://dorayakiwalk.github.io/-/CollectionBox.html";
};

const btnOpenCollectionSub = document.getElementById('btn-open-collection-sub');
if (btnOpenCollectionSub) btnOpenCollectionSub.onclick = () => {
    playSE('btn'); renderCollection(); 
    const modalCol = document.getElementById('modal-collection');
    if (modalCol) modalCol.classList.remove('hidden');
};

const btnAiCollection = document.getElementById('btn-ai-collection');
if (btnAiCollection) btnAiCollection.onclick = () => { 
    playSE('btn'); renderCollection(); 
    const modalCol = document.getElementById('modal-collection');
    if (modalCol) modalCol.classList.remove('hidden'); 
};

const btnCollectionClose = document.getElementById('btn-collection-close');
if (btnCollectionClose) btnCollectionClose.onclick = () => { 
    playSE('btn'); 
    const modalCol = document.getElementById('modal-collection');
    if (modalCol) modalCol.classList.add('hidden'); 
};

const btnSaveKey = document.getElementById('btn-save-key');
if (btnSaveKey) btnSaveKey.addEventListener('click', () => {
    const val = apiKeyInput ? apiKeyInput.value.trim() : '';
    if(val) {
        localStorage.setItem('ai_card_gen_apikey_v2', val);
        setApiUIState(true);
        alert("APIキーを保存しました。全機能が利用可能です！");
    } else {
        localStorage.removeItem('ai_card_gen_apikey_v2');
        setApiUIState(false);
    }
});

function setApiUIState(hasKey) {
    if(!apiStatus) return;
    if(hasKey) {
        apiStatus.textContent = "✅ 接続済み";
        apiStatus.className = "text-[10px] text-emerald-400 font-mono";
        if (apiDemoDesc) apiDemoDesc.classList.add('hidden');
        const apiInputContainer = document.getElementById('apiInputContainer');
        if (apiInputContainer) apiInputContainer.classList.add('hidden'); 
        apiStatus.parentElement.classList.add('cursor-pointer');
        apiStatus.parentElement.onclick = () => {
            const container = document.getElementById('apiInputContainer');
            if (container) container.classList.toggle('hidden');
        };
    } else {
        apiStatus.textContent = "⚠️ デモモード";
        apiStatus.className = "text-[10px] text-yellow-400 font-mono";
        if (apiDemoDesc) apiDemoDesc.classList.remove('hidden');
        const apiInputContainer = document.getElementById('apiInputContainer');
        if (apiInputContainer) apiInputContainer.classList.remove('hidden');
        apiStatus.parentElement.onclick = null;
        apiStatus.parentElement.classList.remove('cursor-pointer');
    }
}

function checkAiLimit() {
    if(!apiKeyInput || !apiKeyInput.value.trim() || isHostPrivilegeMode) return true;
    const last = localStorage.getItem('ai_card_gen_last_date');
    if(last !== new Date().toDateString()) { return true; }
    return false;
}

function updateAiStudioUIForPrivilege() {
    const btnEvolve = document.getElementById('btn-ai-evolve');
    if (!btnEvolve) return;
    if (isHostPrivilegeMode) {
        btnEvolve.innerHTML = `<span class="relative z-10">🔥 ホスト特権 覚醒</span><span class="relative z-10 text-[8px] font-normal opacity-70">(確定大成功 / BP消費0)</span>`;
        btnEvolve.className = "py-2 bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-500 hover:to-yellow-400 text-white rounded text-[11px] font-bold border border-yellow-300 shadow-[0_0_15px_rgba(234,179,8,0.6)] transition flex flex-col items-center justify-center leading-tight relative overflow-hidden";
    } else {
        btnEvolve.innerHTML = `<span class="relative z-10">🔥 上位進化生成</span><span class="relative z-10 text-[8px] font-normal opacity-70">(コスト: 10 BP)</span>`;
        btnEvolve.className = "py-2 bg-purple-900/80 hover:bg-purple-800 text-purple-100 rounded text-[11px] font-bold border border-purple-500/50 shadow transition flex flex-col items-center justify-center leading-tight relative overflow-hidden";
    }
}

const btnAdminAiStudio = document.getElementById('btn-admin-ai-studio');
if (btnAdminAiStudio) btnAdminAiStudio.onclick = () => { 
    playSE('btn'); 
    isHostPrivilegeMode = true; 
    updateAiStudioUIForPrivilege(); 
    const modalAdmin = document.getElementById('modal-admin');
    if (modalAdmin) modalAdmin.classList.add('hidden'); 
    
    if(myPlayerInfo.cardData && myPlayerInfo.stats) {
        updateAiCardUI(myPlayerInfo.stats, myPlayerInfo.cardData, myPlayerInfo.iconData);
    }
    if (aiModal) aiModal.classList.remove('hidden'); 
};

const btnOpenAiSub = document.getElementById('btn-open-ai-sub');
if (btnOpenAiSub) btnOpenAiSub.onclick = () => {
    playSE('btn');
    isHostPrivilegeMode = false;
    updateAiStudioUIForPrivilege();
    if(myPlayerInfo.cardData && myPlayerInfo.stats) {
        updateAiCardUI(myPlayerInfo.stats, myPlayerInfo.cardData, myPlayerInfo.iconData);
    }
    if (aiModal) aiModal.classList.remove('hidden');
};

const btnAiClose = document.getElementById('btn-ai-close');
if (btnAiClose) btnAiClose.onclick = () => { 
    playSE('btn'); 
    if (aiModal) aiModal.classList.add('hidden'); 
};

const fileToBase64 = (file) => new Promise((resolve) => { const r = new FileReader(); r.readAsDataURL(file); r.onload = () => resolve(r.result); });

const compressImage = (base64Str, maxW, maxH, quality = 0.8) => new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
        let w = img.width, h = img.height;
        if(w > h) { if(w > maxW) { h *= maxW / w; w = maxW; } } else { if(h > maxH) { w *= maxH / h; h = maxH; } }
        const canvasEl = document.createElement('canvas'); canvasEl.width = w; canvasEl.height = h;
        canvasEl.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvasEl.toDataURL('image/jpeg', quality));
    };
    img.src = base64Str;
});

const extractCustomIcon = (base64Str, tapXRatio = 0.5, tapYRatio = 0.5, zoom = 1.0) => new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
        const canvasEl = document.createElement('canvas'); canvasEl.width = 100; canvasEl.height = 100;
        const ctxEl = canvasEl.getContext('2d');
        
        const minSide = Math.min(img.width, img.height);
        const cropSize = minSide / zoom;
        
        let sx = (img.width * tapXRatio) - (cropSize / 2);
        let sy = (img.height * tapYRatio) - (cropSize / 2);
        
        if (sx < 0) sx = 0;
        if (sy < 0) sy = 0;
        if (sx + cropSize > img.width) sx = img.width - cropSize;
        if (sy + cropSize > img.height) sy = img.height - cropSize;
        
        ctxEl.drawImage(img, sx, sy, cropSize, cropSize, 0, 0, 100, 100);
        resolve(canvasEl.toDataURL('image/jpeg', 0.8));
    };
    img.src = base64Str;
});

let currentTapX = 0.5; let currentTapY = 0.5; let currentZoom = 1.0;

const cropSlider = document.getElementById('cropSlider');
const cropValText = document.getElementById('cropValText');
const aiImageWrapper = document.getElementById('aiImageWrapper');
const btnToggleZoom = document.getElementById('btn-toggle-zoom');
const zoomLabel = document.getElementById('zoom-label');

if (cropSlider) {
    cropSlider.addEventListener('input', async (e) => {
        currentZoom = e.target.value / 10;
        if (cropValText) cropValText.textContent = `${currentZoom.toFixed(1)}x`;
        if (zoomLabel) zoomLabel.textContent = `x${currentZoom.toFixed(1)}`;
        if (aiTempData && aiTempData.origImage) {
            const newIcon = await extractCustomIcon(aiTempData.origImage, currentTapX, currentTapY, currentZoom);
            const aiCardIcon = document.getElementById('aiCardIcon');
            if (aiCardIcon) aiCardIcon.src = newIcon;
            aiTempData.iconImage = newIcon;
        }
    });
}

if (btnToggleZoom) {
    btnToggleZoom.addEventListener('click', async () => {
        currentZoom += 0.5;
        if (currentZoom > 2.5) currentZoom = 1.0; 
        
        if (cropSlider) cropSlider.value = currentZoom * 10;
        if (cropValText) cropValText.textContent = `${currentZoom.toFixed(1)}x`;
        if (zoomLabel) zoomLabel.textContent = `x${currentZoom.toFixed(1)}`;
        
        if (aiTempData && aiTempData.origImage) {
            const newIcon = await extractCustomIcon(aiTempData.origImage, currentTapX, currentTapY, currentZoom);
            const aiCardIcon = document.getElementById('aiCardIcon');
            if (aiCardIcon) aiCardIcon.src = newIcon;
            aiTempData.iconImage = newIcon;
        }
    });
}

if (aiImageWrapper) {
    aiImageWrapper.addEventListener('click', async (e) => {
        if (!aiTempData || !aiTempData.origImage) return;
        
        const rect = aiImageWrapper.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        currentTapX = x / rect.width;
        currentTapY = y / rect.height;
        
        const ripple = document.createElement('div');
        ripple.className = "absolute w-6 h-6 border-2 border-brand-accent rounded-full bg-brand-glow/30 animate-ping pointer-events-none transform -translate-x-1/2 -translate-y-1/2";
        ripple.style.left = `${x}px`;
        ripple.style.top = `${y}px`;
        aiImageWrapper.appendChild(ripple);
        setTimeout(() => ripple.remove(), 1000);

        const newIcon = await extractCustomIcon(aiTempData.origImage, currentTapX, currentTapY, currentZoom);
        const aiCardIcon = document.getElementById('aiCardIcon');
        if (aiCardIcon) aiCardIcon.src = newIcon;
        aiTempData.iconImage = newIcon;
    });
}

function showAiLoading(msg) {
    const aiLoadingText = document.getElementById('aiLoadingText');
    if (aiLoadingText) aiLoadingText.textContent = msg;
    const aiLoadingOverlay = document.getElementById('aiLoadingOverlay');
    if (aiLoadingOverlay) aiLoadingOverlay.classList.remove('hidden');
    const aiCardContent = document.getElementById('aiCardContent');
    if (aiCardContent) aiCardContent.classList.add('opacity-0', 'pointer-events-none');
    const iconCropControl = document.getElementById('iconCropControl');
    if (iconCropControl) iconCropControl.classList.add('hidden'); 
}

function hideAiLoading() {
    const aiLoadingOverlay = document.getElementById('aiLoadingOverlay');
    if (aiLoadingOverlay) aiLoadingOverlay.classList.add('hidden');
    const aiCardContent = document.getElementById('aiCardContent');
    if (aiCardContent) aiCardContent.classList.remove('opacity-0', 'pointer-events-none');
    const aiCardShine = document.getElementById('aiCardShine');
    if (aiCardShine) {
        aiCardShine.classList.remove('hidden');
        setTimeout(() => aiCardShine.classList.add('hidden'), 2000);
    }
    const iconCropControl = document.getElementById('iconCropControl');
    if (iconCropControl) iconCropControl.classList.remove('hidden'); 
}

async function updateAiCardUI(data, b64Img, preIconB64 = null) {
    try {
        aiTempData = { stats: data, origImage: b64Img };
        
        const aiCardPlaceholder = document.getElementById('aiCardPlaceholder');
        if (aiCardPlaceholder) aiCardPlaceholder.classList.add('hidden');
        const aiCardImage = document.getElementById('aiCardImage');
        if (aiCardImage) {
            aiCardImage.src = b64Img;
            aiCardImage.classList.remove('hidden');
        }
        
        let iconB64 = preIconB64;
        if(!iconB64) {
            currentTapX = 0.5; currentTapY = 0.2; currentZoom = 1.0;
            if (cropSlider) cropSlider.value = 10; 
            if (cropValText) cropValText.textContent = "1.0x"; 
            if (zoomLabel) zoomLabel.textContent = "x1.0";
            iconB64 = await extractCustomIcon(b64Img, currentTapX, currentTapY, currentZoom);
        }
        
        const aiCardIcon = document.getElementById('aiCardIcon');
        if (aiCardIcon) {
            aiCardIcon.src = iconB64;
            aiCardIcon.classList.remove('hidden');
        }
        aiTempData.iconImage = iconB64;

        const aiCardName = document.getElementById('aiCardName');
        if (aiCardName) aiCardName.textContent = data.name || '?';
        const aiCardClass = document.getElementById('aiCardClass');
        if (aiCardClass) aiCardClass.textContent = data.jobClass || '?';
        
        const rBadge = document.getElementById('aiCardRarity');
        const rar = data.rarity || 'N';
        const aiCardContainer = document.getElementById('aiCardContainer');
        if (rBadge) {
            rBadge.textContent = rar;
            rBadge.className = "px-1.5 py-0.5 bg-black/80 border rounded text-[10px] font-black italic tracking-wider shadow ";
            
            if (rar === 'UR++') { rBadge.className += "text-red-500 border-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)] bg-red-500/20"; if (aiCardContainer) aiCardContainer.style.borderColor="#ef4444"; }
            else if (rar === 'UR+') { rBadge.className += "text-orange-500 border-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)] bg-orange-500/20"; if (aiCardContainer) aiCardContainer.style.borderColor="#f97316"; }
            else if(typeof rar === 'string' && (rar.includes('UR')||rar.includes('SSR'))) { rBadge.className += "text-brand-rare border-brand-rare shadow-[0_0_8px_rgba(234,179,8,0.6)]"; if (aiCardContainer) aiCardContainer.style.borderColor="#eab308"; }
            else if(typeof rar === 'string' && rar.includes('SR')) { rBadge.className += "text-brand-epic border-brand-epic shadow-[0_0_8px_rgba(168,85,247,0.6)]"; if (aiCardContainer) aiCardContainer.style.borderColor="#a855f7"; }
            else { rBadge.className += "text-slate-300 border-slate-500"; if (aiCardContainer) aiCardContainer.style.borderColor="#334155"; }
        }

        const aiStatHp = document.getElementById('aiStatHp');
        if (aiStatHp) aiStatHp.textContent = data.hp || 0;
        const aiStatAtk = document.getElementById('aiStatAtk');
        if (aiStatAtk) aiStatAtk.textContent = data.atk || 0;
        const aiStatDef = document.getElementById('aiStatDef');
        if (aiStatDef) aiStatDef.textContent = data.def || 0;
        const aiStatSpd = document.getElementById('aiStatSpd');
        if (aiStatSpd) aiStatSpd.textContent = data.spd || 0;

        const btnApply = document.getElementById('btn-ai-apply');
        if (btnApply) {
            btnApply.disabled = false;
            btnApply.classList.remove('opacity-50', 'cursor-not-allowed');
            btnApply.classList.add('animate-pulse');
        }
    } catch(e) { console.warn("AIプレビュー描画エラー", e); }
}

async function analyzeWithGemini(key, base64Img, theme, isEvolution = false, isPrivilege = false) {
    const sys = `あなたはTRPG・カードゲームの熟練データメイカーです。画像からファンタジー風のステータスを出力してください。
ルール (デフレ調整版):
1. レアリティ排出率の目安: N(約45%), R(約35%), SR(約15%), SSR(約4%), UR(約1%)。※UR+やUR++は絶対に出さないでください。
2. HP基準: N(1000-1500), R(1500-2500), SR(2500-3500), SSR(3500-5000), UR(5000-7000)。
3. ステータスを極端に盛りすぎないこと。HPがインフレするとゲームが泥沼化するため、厳格なゲームバランサーとして判定してください。防御力(DEF)も高すぎないよう配慮してください。
JSONフォーマット厳守:
{"name":"キャラ名","jobClass":"職業/通り名","rarity":"N,R,SR,SSR,URのいずれか","hp":数値(1000-7000),"atk":数値(150-700),"def":数値(50-600),"spd":数値(50-600)}
${isEvolution ? (isPrivilege ? '今回は「ホスト特権による確定覚醒」です。無条件でSSR以上(できればUR)の圧倒的な極限ステータスを与えてください。' : '今回は「覚醒」です。ステータスを大幅に強化しますが、極端なインフレは避けてください。') : ''}`;
    
    const parts = [{ text: `画像解析要求。追加テーマ・希望:${theme||'なし'}` }];
    if(base64Img) parts.push({ inlineData: { mimeType: "image/jpeg", data: base64Img.split(',')[1] } });
    
    const payload = { contents:[{parts}], systemInstruction:{parts:[{text:sys}]}, generationConfig:{responseMimeType:"application/json"} };
    
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TEXT_MODEL}:generateContent?key=${key}`, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    if(!res.ok) { const err = await res.json(); throw new Error(err.error?.message || "API request failed"); }
    const jsonRes = await res.json();
    return JSON.parse(jsonRes.candidates[0].content.parts[0].text);
}

async function generateImageWithGeminiFlash(key, textPrompt, base64Img = null) {
    let fullPrompt = `${textPrompt}, photorealistic, 3D render style, cinematic lighting, upper body portrait, face focus, highly detailed full environment background, masterpiece, 8k resolution`;
    let parts = [{ text: fullPrompt }];
    
    if (base64Img) {
        fullPrompt = `このキャラクターを究極覚醒・上位進化した姿に描き直してください。より豪華で、オーラを纏ったような強大な力を持つデザインにしてください。追加テーマ: ${fullPrompt}`;
        parts = [
            { text: fullPrompt },
            { inlineData: { mimeType: "image/jpeg", data: base64Img.split(',')[1] } }
        ];
    }

    const payload = {
        contents: [{ parts: parts }],
        generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "3:4" } }
    };
    
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${key}`, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    if(!res.ok) { const err = await res.json(); throw new Error(err.error?.message || "API request failed"); }
    const jsonRes = await res.json();
    
    const part = jsonRes?.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (!part) throw new Error("画像の生成結果が空でした。プロンプトを見直してください。");
    return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
}

const runAiDemo = async (type, b64, theme) => {
    const isEvo = (type === 'evolve') || (theme && theme.includes('覚醒'));
    
    if (isEvo && !isHostPrivilegeMode) {
        if ((myPlayerInfo.bp || 0) < 10) return alert(`覚醒には 10 BP が必要です。(現在: ${myPlayerInfo.bp || 0} BP)`);
        myPlayerInfo.bp -= 10;
        saveProfile();
        
        if (Math.random() < 0.2) {
            showAiLoading("EVOLVING... BUT FAILED!");
            await sleep(1500);
            alert("覚醒失敗…！エネルギーが暴走し、ステータスがダウンしてしまった！");
            const prevStats = aiTempData?.stats || myPlayerInfo.stats;
            const failedData = { name: "失敗した " + (prevStats.name||"影"), jobClass: "敗れし者", rarity: "N", hp: Math.max(800, Math.floor(prevStats.hp * 0.7)), atk: Math.max(100, Math.floor(prevStats.atk * 0.7)), def: Math.max(50, Math.floor(prevStats.def * 0.7)), spd: Math.max(50, Math.floor(prevStats.spd * 0.7)) };
            await updateAiCardUI(failedData, b64);
            hideAiLoading();
            return;
        }
    }

    showAiLoading("DEMO MODE..."); await sleep(1500);
    
    const rng = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
    let hp, atk, def, spd, rarity, job;
    const r = Math.random();

    if (isEvo) {
        rarity = isHostPrivilegeMode ? "UR" : (r > 0.5 ? "UR" : "SSR");
        hp = rng(5000, 7000); atk = rng(500, 700); def = rng(400, 600); spd = rng(400, 600);
        job = "覚醒者";
    } else {
        if (r < 0.01) { rarity = "UR"; hp = rng(5000, 7000); atk = rng(600, 700); def = rng(400, 600); spd = rng(400, 600); job = "神々しき者"; }
        else if (r < 0.05) { rarity = "SSR"; hp = rng(3500, 5000); atk = rng(450, 600); def = rng(300, 450); spd = rng(300, 450); job = "英雄"; }
        else if (r < 0.20) { rarity = "SR"; hp = rng(2500, 3500); atk = rng(300, 450); def = rng(200, 350); spd = rng(200, 350); job = "熟練者"; }
        else if (r < 0.55) { rarity = "R"; hp = rng(1500, 2500); atk = rng(200, 300); def = rng(100, 200); spd = rng(100, 200); job = "冒険者"; }
        else { rarity = "N"; hp = rng(1000, 1500); atk = rng(150, 200); def = rng(50, 150); spd = rng(50, 150); job = "村人"; }
    }

    const data = { name: isEvo ? "覚醒せし者" : "名もなき勇者", jobClass: job, rarity: rarity, hp: hp, atk: atk, def: def, spd: spd };
    let img = b64 || (isEvo ? "https://images.unsplash.com/photo-1514316454349-750a7fd3da3a?q=80&w=400&auto=format&fit=crop" : "https://images.unsplash.com/photo-1605806616949-1e87b487cb2a?q=80&w=400&auto=format&fit=crop"); 
    
    if(!b64) {
        try {
            const response = await fetch(img);
            const blob = await response.blob();
            img = await fileToBase64(blob);
        } catch(e) {
            const c = document.createElement('canvas'); c.width=300; c.height=400; const ctx=c.getContext('2d');
            ctx.fillStyle='#1e293b'; ctx.fillRect(0,0,300,400); ctx.fillStyle='#eab308'; ctx.font='20px sans-serif'; ctx.fillText('DEMO IMAGE', 80, 200);
            img = c.toDataURL('image/jpeg');
        }
    }
    await updateAiCardUI(data, img);
    hideAiLoading();
};

const btnAiAnalyze = document.getElementById('btn-ai-analyze');
if (btnAiAnalyze) btnAiAnalyze.onclick = async () => {
    playSE('btn');
    const aiImageInput = document.getElementById('aiImageInput');
    const file = aiImageInput && aiImageInput.files ? aiImageInput.files[0] : null;
    if(!file) return alert("画像をアップロードしてください。");
    const key = apiKeyInput ? apiKeyInput.value.trim() : ''; 
    const aiPromptInput = document.getElementById('aiPromptInput');
    const theme = aiPromptInput ? aiPromptInput.value : '';
    const b64 = await fileToBase64(file);
    if(!key) return runAiDemo('analyze', b64, theme); 
    try { 
        showAiLoading("ANALYZING IMAGE..."); 
        const data = await analyzeWithGemini(key, b64, theme); 
        await updateAiCardUI(data, b64); 
    } catch(e){ 
        alert("エラー: " + e.message); 
    } finally {
        hideAiLoading();
    }
};

const btnAiGenerate = document.getElementById('btn-ai-generate');
if (btnAiGenerate) btnAiGenerate.onclick = async () => {
    playSE('btn');
    const aiPromptInput = document.getElementById('aiPromptInput');
    const theme = aiPromptInput ? aiPromptInput.value.trim() : '';
    if(!theme) return alert("追加テーマを入力してください。");
    const key = apiKeyInput ? apiKeyInput.value.trim() : '';
    if(!key) return runAiDemo('generate', null, theme);
    if(!checkAiLimit()) return alert("1日1回制限に達しています(ホスト特権で制限なし)。");

    try {
        showAiLoading("GENERATING IMAGE...");
        if(!isHostPrivilegeMode) localStorage.setItem('ai_card_gen_last_date', new Date().toDateString());
        
        const b64 = await generateImageWithGeminiFlash(key, theme);
        
        showAiLoading("ANALYZING STATS...");
        const data = await analyzeWithGemini(key, b64, theme);
        await updateAiCardUI(data, b64); 
    } catch(e) { 
        alert("生成エラー: " + e.message); 
    } finally {
        hideAiLoading();
    }
};

const btnAiEvolve = document.getElementById('btn-ai-evolve');
if (btnAiEvolve) btnAiEvolve.onclick = async () => {
    playSE('btn');
    const aiImageInput = document.getElementById('aiImageInput');
    const file = aiImageInput && aiImageInput.files ? aiImageInput.files[0] : null;
    const baseImg = file ? await fileToBase64(file) : myPlayerInfo.cardData; 
    
    if(!baseImg) return alert("ベースとなる画像をアップロードするか、プロフィールにカードを設定してください。");
    
    if (!isHostPrivilegeMode) {
        if ((myPlayerInfo.bp || 0) < 10) return alert(`覚醒には 10 BP が必要です。(現在: ${myPlayerInfo.bp || 0} BP)`);
    }
    
    const aiPromptInput = document.getElementById('aiPromptInput');
    const theme = aiPromptInput ? aiPromptInput.value.trim() : '';
    const key = apiKeyInput ? apiKeyInput.value.trim() : '';
    
    if(!key) return runAiDemo('evolve', baseImg, theme);
    if(!checkAiLimit()) return alert("1日1回制限に達しています(ホスト特権で制限なし)。");

    if (!isHostPrivilegeMode) {
        myPlayerInfo.bp -= 10;
        saveProfile();
        if (Math.random() < 0.2) {
            showAiLoading("EVOLVING... BUT FAILED!");
            await sleep(1500);
            alert("覚醒失敗…！エネルギーが暴走し、ステータスがダウンしてしまった！");
            const prevStats = aiTempData?.stats || myPlayerInfo.stats;
            const failedData = { name: "失敗した " + (prevStats.name||"影"), jobClass: "敗れし者", rarity: "N", hp: Math.max(800, Math.floor(prevStats.hp * 0.7)), atk: Math.max(100, Math.floor(prevStats.atk * 0.7)), def: Math.max(50, Math.floor(prevStats.def * 0.7)), spd: Math.max(50, Math.floor(prevStats.spd * 0.7)) };
            await updateAiCardUI(failedData, baseImg);
            hideAiLoading();
            return;
        }
    }

    try {
        showAiLoading("EVOLVING IMAGE...");
        if(!isHostPrivilegeMode) localStorage.setItem('ai_card_gen_last_date', new Date().toDateString());
        
        let targetTheme = theme || '覚醒, 神々しい';
        if (isHostPrivilegeMode) targetTheme += ", 最高レアリティ, 圧倒的な力";
        
        const evolvedB64 = await generateImageWithGeminiFlash(key, targetTheme, baseImg);
        
        showAiLoading("ANALYZING EVOLVED STATS...");
        const data = await analyzeWithGemini(key, evolvedB64, theme, true, isHostPrivilegeMode);
        await updateAiCardUI(data, evolvedB64); 
    } catch(e) { 
        alert("進化生成エラー: " + e.message); 
    } finally {
        hideAiLoading();
    }
};

const btnAiApply = document.getElementById('btn-ai-apply');
if (btnAiApply) btnAiApply.onclick = async () => {
    playSE('btn');
    if(!aiTempData) return;
    
    const compressedCard = await compressImage(aiTempData.origImage, 400, 560, 0.7);
    const compressedIcon = await compressImage(aiTempData.iconImage, 100, 100, 0.8);
    
    myPlayerInfo.cardData = compressedCard;
    myPlayerInfo.iconData = compressedIcon;
    myPlayerInfo.stats = aiTempData.stats;
    saveProfile();
    
    const newCardData = { 
        stats: aiTempData.stats, 
        origImage: compressedCard, 
        iconImage: compressedIcon, 
        id: Date.now() 
    };
    await saveToCollection(newCardData);
    alert("プロフィールにAIカードをセットし、図鑑にも追加しました！");

    btnAiApply.classList.remove('animate-pulse');
    if (aiModal) aiModal.classList.add('hidden');
};

async function saveToCollection(newCardData) {
    const isDupe = myCollection.some(c => 
        c.stats && 
        c.stats.name === newCardData.stats.name && 
        c.stats.hp === newCardData.stats.hp
    );
    
    if(!isDupe) {
        if (isCloudMode && currentUserAccount) {
            try {
                const cardRef = doc(db, 'artifacts', appIdStr, 'public', 'data', 'accounts', currentUserAccount.id, 'cards', String(newCardData.id));
                await setDoc(cardRef, newCardData);
                
                let newDeckIds = [newCardData.id, ...(currentUserAccount.deckIds || [])];
                if(newDeckIds.length > 20) newDeckIds = newDeckIds.slice(0, 20); 
                
                await updateDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', 'accounts', currentUserAccount.id), {
                    deckIds: newDeckIds,
                    cardCount: increment(1)
                });
                
                myCollection.unshift(newCardData);
                if(myCollection.length > 20) myCollection.pop();
            } catch(e) { console.error(e); }
        } else {
            myCollection.unshift(newCardData);
            if(myCollection.length > 20) myCollection.pop(); 
            localStorage.setItem('elem_clash_ai_col_v1', JSON.stringify(myCollection));
            
            let vault = JSON.parse(localStorage.getItem('elem_clash_vault_v1') || '[]');
            vault.unshift(newCardData);
            if(vault.length > 100) vault.pop();
            localStorage.setItem('elem_clash_vault_v1', JSON.stringify(vault));
        }
    }
}
// ==========================================
// 【パート1 / 3】ここまで（すぐ下にパート2を貼り付けてください）
// ==========================================
async function initAuth() { 
    try {
        onSnapshot(doc(db, 'artifacts', appIdStr, 'public', 'data', 'global', 'settings'), async snap => {
            if(snap.exists()) {
                globalSettings = { ...globalSettings, ...snap.data() };
                
                if (globalSettings.campaigns && globalSettings.campaigns.length > 0) {
                    const oldCamps = [...globalSettings.campaigns];
                    globalSettings.campaigns = []; 
                    for (const camp of oldCamps) {
                        const cid = camp.id || Date.now().toString() + Math.random().toString(36).substr(2, 5);
                        await setDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', 'campaigns', cid), { ...camp, id: cid });
                    }
                    updateDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', 'global', 'settings'), { campaigns: [] }).catch(()=>{});
                }

                if (globalSettings.cardBackUrl !== undefined) {
                    globalCardBackUrl = globalSettings.cardBackUrl;
                    updateAllCardBacks(); 
                }

                const tgl = document.getElementById('btn-toggle-anyone');
                if(tgl && tgl.firstChild) {
                    if(globalSettings.anyoneCanHost) { tgl.classList.replace('bg-red-500', 'bg-green-500'); tgl.firstChild.classList.replace('left-1', 'left-7'); } 
                    else { tgl.classList.replace('bg-green-500', 'bg-red-500'); tgl.firstChild.classList.replace('left-7', 'left-1'); }
                }
                
                renderSubpassList(); 
            } else { 
                setDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', 'global', 'settings'), { anyoneCanHost: false, subPasswords: [] }); 
            }
        });

        onSnapshot(collection(db, 'artifacts', appIdStr, 'public', 'data', 'campaigns'), snap => {
            let camps = [];
            snap.forEach(d => { camps.push(d.data()); });
            camps.sort((a,b) => a.id.localeCompare(b.id)); 
            globalSettings.campaigns = camps;
            window.renderStoryAdminUI();
            
            const storyModal = document.getElementById('modal-story-select');
            if(storyModal && !storyModal.classList.contains('hidden')) {
                window.openStorySelectModal(); 
            }
        });
        
        startPublicRoomsListener(); 

        onAuthStateChanged(auth, async (user) => {
            if (user) {
                currentUser = user; 
                
                if (!user.isAnonymous) {
                    isCloudMode = true;
                    const userRef = doc(db, 'artifacts', appIdStr, 'public', 'data', 'accounts', user.uid);
                    onSnapshot(userRef, async (docSnap) => {
                        if (docSnap.exists()) {
                            currentUserAccount = { id: user.uid, ...docSnap.data() };
                            
                            const saved = localStorage.getItem('elem_clash_ai_profile_v3');
                            if(saved) {
                                try {
                                    const p = JSON.parse(saved);
                                    myPlayerInfo = { 
                                        ...p, 
                                        name: currentUserAccount.name || p.name, 
                                        bp: currentUserAccount.coins || p.bp,
                                        iconData: currentUserAccount.icon || p.iconData,
                                        clearCounts: currentUserAccount.clearCounts || p.clearCounts || {}
                                    };
                                } catch(e) {}
                            } else {
                                myPlayerInfo.name = currentUserAccount.name || '';
                                myPlayerInfo.bp = currentUserAccount.coins || 0;
                                myPlayerInfo.iconData = currentUserAccount.icon || null;
                                myPlayerInfo.clearCounts = currentUserAccount.clearCounts || {};
                            }
                            
                            const deckIds = currentUserAccount.deckIds || [];
                            if (deckIds.length > 0) {
                                let loadedDeck = [];
                                for (let cid of deckIds) {
                                    const cSnap = await getDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', 'accounts', user.uid, 'cards', String(cid)));
                                    if(cSnap.exists()) loadedDeck.push(cSnap.data());
                                }
                                myCollection = loadedDeck;
                            } else {
                                myCollection = [];
                            }
                            updateLobbyPreview();
                            updateLoginUI();
                            checkAndShowWelcome(); 
                        } else {
                            await setDoc(userRef, {
                                name: myPlayerInfo.name || "PLAYER",
                                coins: myPlayerInfo.bp || 0,
                                icon: myPlayerInfo.iconData || "👤",
                                deckIds: [],
                                cardCount: 0,
                                clearCounts: {}
                            });
                        }
                    });
                } else {
                    isCloudMode = false;
                    currentUserAccount = null;
                    loadProfile(); 
                    myCollection = JSON.parse(localStorage.getItem('elem_clash_ai_col_v1') || '[]');
                    updateLoginUI();
                }
            } else {
                isCloudMode = false;
                currentUserAccount = null;
                await signInAnonymously(auth);
            }
        });
    } catch(e){ console.error(e); } 
}

// --- Player Story Select Logic ---
window.openStorySelectModal = function() {
    playSE('btn');
    const modal = document.getElementById('modal-story-select');
    const list = document.getElementById('story-select-list');
    if (!modal || !list) return;
    list.innerHTML = '';
    
    if(!globalSettings.campaigns || globalSettings.campaigns.length === 0) {
        list.innerHTML = '<div class="text-center text-gray-500 py-4 text-xs font-bold">現在公開されているストーリーはありません</div>';
    } else {
        // ★ 追加ロジック: 他のストーリーの「次章」として設定されているIDをすべて集める
        const linkedCampIds = globalSettings.campaigns
            .map(c => c.nextCampId)
            .filter(id => id); // null や 空文字 を除外
            
        // ★ 追加ロジック: リンク先に指定されていない「最初の章」だけを抽出する
        const rootCampaigns = globalSettings.campaigns.filter(c => !linkedCampIds.includes(c.id));

        if (rootCampaigns.length === 0) {
            list.innerHTML = '<div class="text-center text-gray-500 py-4 text-xs font-bold">プレイ可能なストーリーがありません</div>';
        }

        // 抽出した最初の章だけをリストに描画する
        rootCampaigns.forEach((camp) => {
            const campId = camp.id || camp.title;
            let cleared = 0;
            let total = camp.stages ? camp.stages.length : 0;
            let hasNew = false;
            
            if(camp.stages) {
                camp.stages.forEach((stg, sIdx) => {
                    const stageKey = `${campId}_stage_${sIdx}`;
                    if (myPlayerInfo.clearCounts && myPlayerInfo.clearCounts[stageKey]) {
                        cleared++;
                    }
                });
                if (cleared < total) hasNew = true;
            }

            const newBadge = hasNew ? `<span class="text-[9px] bg-red-600 text-white px-1.5 rounded animate-pulse shadow-[0_0_5px_rgba(220,38,38,0.8)] ml-2">UP!</span>` : '';

            const btn = document.createElement('button');
            btn.className = "bg-gray-700 hover:bg-gray-600 border border-gray-600 p-3 rounded-lg flex justify-between items-center transition shadow-lg w-full text-left mb-2";
            btn.innerHTML = `
                <div class="flex flex-col">
                    <span class="text-sm font-bold text-white mb-1 flex items-center">${camp.title} ${newBadge}</span>
                    <span class="text-[10px] text-gray-400">進行度: ${cleared} / ${total} STAGE</span>
                </div>
                <div class="bg-black/50 px-3 py-1.5 rounded-full border border-gray-500 text-xs font-bold text-purple-400 shrink-0 shadow-inner">
                    ${camp.fee > 0 ? camp.fee + ' BP' : 'FREE'}
                </div>
            `;
            btn.onclick = () => window.startCampaign(camp.id);
            list.appendChild(btn);
        });
    }
    modal.classList.remove('hidden');
};

window.startCampaign = async function(campId) {
    playSE('btn');
    const camp = globalSettings.campaigns.find(c => c.id === campId);
    if(!camp || !camp.stages || camp.stages.length === 0) return alert("このストーリーにはまだステージがありません。");
    
    if (camp.fee > 0) {
        if ((myPlayerInfo.bp || 0) < camp.fee) {
            return alert(`BPが足りません！\n(必要: ${camp.fee} BP / 現在: ${myPlayerInfo.bp || 0} BP)`);
        }
        if(!confirm(`「${camp.title}」をプレイします。\n${camp.fee} BPを消費しますがよろしいですか？`)) return;
        myPlayerInfo.bp -= camp.fee;
        saveProfile();
    } else {
        if(!confirm(`「${camp.title}」をプレイしますか？`)) return;
    }
    
    const sm = document.getElementById('modal-story-select');
    if (sm) sm.classList.add('hidden');
    
    currentCampaign = camp;
    currentStoryStage = 0;
    isStoryBattle = true;
    isStoryTransition = true; 
    
    await doCreateRoom(true); 
};

// --- Story Admin Methods ---
let currentStoryTagSet = 1;
window.toggleStoryTags = function() {
    playSE('btn');
    const t1 = document.getElementById(`story-tags-${currentStoryTagSet}`);
    if (t1) t1.classList.add('hidden');
    currentStoryTagSet = currentStoryTagSet >= 4 ? 1 : currentStoryTagSet + 1;
    const t2 = document.getElementById(`story-tags-${currentStoryTagSet}`);
    if (t2) t2.classList.remove('hidden');
};

window.insertStoryTag = function(tag) {
    playSE('btn');
    const txtArea = document.getElementById('admin-story-msg');
    if(!txtArea) return;
    
    const start = txtArea.selectionStart;
    const end = txtArea.selectionEnd;
    const text = txtArea.value;
    
    const before = text.substring(0, start);
    const after = text.substring(end, text.length);
    
    txtArea.value = before + tag + after;
    
    txtArea.selectionStart = txtArea.selectionEnd = start + tag.length;
    txtArea.focus();
};

window.onAdminCampaignSelect = function() {
    playSE('btn');
    const adminCampSelect = document.getElementById('admin-campaign-select');
    currentAdminCampId = adminCampSelect ? adminCampSelect.value : null;
    
    if (currentAdminCampId === "-1" || !currentAdminCampId) {
        currentAdminCampId = null;
        const sTitle = document.getElementById('admin-story-title');
        if (sTitle) sTitle.value = "";
        const sFee = document.getElementById('admin-story-fee');
        if (sFee) sFee.value = "";
        renderStoryAdminStages([]);
        
        const selectNext = document.getElementById('admin-story-next');
        if (selectNext) selectNext.value = "";
    } else {
        const camp = globalSettings.campaigns.find(c => c.id === currentAdminCampId);
        if(camp) {
            const sTitle = document.getElementById('admin-story-title');
            if (sTitle) sTitle.value = camp.title || "";
            const sFee = document.getElementById('admin-story-fee');
            if (sFee) sFee.value = camp.fee || 0;
            renderStoryAdminStages(camp.stages || []);
            
            const selectNext = document.getElementById('admin-story-next');
            if (selectNext) selectNext.value = camp.nextCampId || "";
        }
    }
};

window.saveStoryCampaign = async function() {
    playSE('btn');
    const sTitle = document.getElementById('admin-story-title');
    const sFee = document.getElementById('admin-story-fee');
    const selectNext = document.getElementById('admin-story-next');
    
    const title = sTitle ? sTitle.value.trim() : '';
    const fee = sFee ? (parseInt(sFee.value) || 0) : 0;
    const nextCampId = selectNext ? selectNext.value : '';
    
    if(!title) return alert("タイトルを入力してください");
    
    try {
        if (!currentAdminCampId) {
            const newRef = doc(collection(db, 'artifacts', appIdStr, 'public', 'data', 'campaigns'));
            await setDoc(newRef, { id: newRef.id, title: title, fee: fee, nextCampId: nextCampId || null, stages: [] });
            currentAdminCampId = newRef.id;
            alert("ストーリーを作成しました。");
        } else {
            await updateDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', 'campaigns', currentAdminCampId), {
                title: title,
                fee: fee,
                nextCampId: nextCampId || null
            });
            alert("ストーリー情報を保存しました。");
        }
    } catch(e) { alert("エラー: " + e.message); }
};

window.deleteStoryCampaign = async function() {
    playSE('btn');
    if (!currentAdminCampId) return;
    if(!confirm("このストーリー全体を削除しますか？")) return;
    
    const targetId = currentAdminCampId;
    currentAdminCampId = null;
    
    try {
        await deleteDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', 'campaigns', targetId));
        const sTitle = document.getElementById('admin-story-title');
        if (sTitle) sTitle.value = "";
        const sFee = document.getElementById('admin-story-fee');
        if (sFee) sFee.value = "";
    } catch(e) { alert("エラー: " + e.message); }
};

window.renderStoryAdminUI = function() {
    const selectCard = document.getElementById('admin-story-card');
    if(selectCard) {
        selectCard.innerHTML = '<option value="">▼ 敵カードを選択</option><option value="scenario_only" class="text-blue-400 font-bold">📖 [バトルなし] シナリオのみ</option>';
        myCollection.forEach((c, idx) => {
            selectCard.innerHTML += `<option value="${idx}">${c.stats?.name || '不明'}</option>`;
        });
    }
    
    const selectCamp = document.getElementById('admin-campaign-select');
    if(selectCamp) {
        selectCamp.innerHTML = '<option value="-1">＋ 新規ストーリー作成</option>';
        (globalSettings.campaigns || []).forEach((c) => {
            selectCamp.innerHTML += `<option value="${c.id}" ${c.id === currentAdminCampId ? 'selected' : ''}>${c.title}</option>`;
        });
    }
    
    const selectNext = document.getElementById('admin-story-next');
    if (selectNext) {
        selectNext.innerHTML = '<option value="">(なし) 連結しない</option>';
        (globalSettings.campaigns || []).forEach((c) => {
            if (c.id !== currentAdminCampId) { 
                selectNext.innerHTML += `<option value="${c.id}">${c.title}</option>`;
            }
        });
    }
    
    if (currentAdminCampId) {
        const camp = globalSettings.campaigns.find(c => c.id === currentAdminCampId);
        if (camp && selectNext) selectNext.value = camp.nextCampId || "";
        renderStoryAdminStages(camp ? (camp.stages || []) : []);
    } else {
        renderStoryAdminStages([]);
    }
};

function renderStoryAdminStages(stages) {
    const list = document.getElementById('admin-story-list');
    if(!list) return;
    list.innerHTML = '';
    if(!stages || stages.length === 0) {
        list.innerHTML = '<div class="text-[10px] text-gray-500 text-center">ステージ未設定</div>';
    } else {
        stages.forEach((stg, i) => {
            const div = document.createElement('div');
            div.className = "flex justify-between items-center bg-gray-800 p-1.5 rounded mb-1 border border-gray-700";
            const enemyName = stg.enemy ? stg.enemy.stats?.name : '<span class="text-blue-400">シナリオのみ</span>';
            div.innerHTML = `
                <div class="flex items-center gap-2 overflow-hidden">
                    <span class="text-[10px] font-black text-yellow-400 bg-black/50 px-1 rounded border border-yellow-500 shrink-0">ST.${i+1}</span>
                    <span class="text-[11px] text-white truncate font-bold">${enemyName}</span>
                </div>
                <button class="text-[10px] bg-red-600 hover:bg-red-500 text-white px-2 py-0.5 rounded transition shadow shrink-0" onclick="window.deleteStoryStage(${i})">削除</button>
            `;
            list.appendChild(div);
        });
    }
}

window.addStoryStage = async function() {
    playSE('btn');
    if (!currentAdminCampId) return alert("先にストーリーを作成して「保存」してください。");
    
    const cardSelect = document.getElementById('admin-story-card');
    const bgUrlInput = document.getElementById('admin-story-bg-url');
    const bgFileInput = document.getElementById('admin-story-bg-file');
    const msgInput = document.getElementById('admin-story-msg');
    const unlockInput = document.getElementById('admin-stage-unlock');
    const priceInput = document.getElementById('admin-stage-price');
    
    const selIdx = cardSelect ? cardSelect.value : '';
    let bgUrl = bgUrlInput ? bgUrlInput.value.trim() : '';
    const bgFile = bgFileInput && bgFileInput.files ? bgFileInput.files[0] : null;
    const msg = msgInput ? msgInput.value.trim() : '';
    const unlockCount = unlockInput ? (parseInt(unlockInput.value) || 1) : 1;
    const priceBP = priceInput ? (parseInt(priceInput.value) || 0) : 0;
    
    if(selIdx === "") return alert("敵カード（またはシナリオのみ）を選択してください");
    if(msg === "") return alert("登場メッセージを入力してください");
    
    const btnAdd = document.getElementById('btn-add-stage');
    const origText = btnAdd ? btnAdd.textContent : '';
    if (btnAdd) {
        btnAdd.textContent = "処理中...";
        btnAdd.disabled = true;
    }
    
    try {
        if (bgFile) {
            const b64 = await fileToBase64(bgFile);
            bgUrl = await compressImage(b64, 640, 640, 0.5); 
        }
        
        let enemyData = null;
        if (selIdx !== "scenario_only") {
            enemyData = myCollection[selIdx];
            if(!enemyData) throw new Error("カード情報の取得に失敗しました");
        }
        
        const newStage = {
            enemy: enemyData,
            bgUrl: bgUrl || 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=1000&auto=format&fit=crop',
            message: msg,
            unlockCount: unlockCount,
            priceBP: priceBP
        };
        
        const camp = globalSettings.campaigns.find(c => c.id === currentAdminCampId);
        const updatedStages = [...(camp.stages || []), newStage];
        
        await updateDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', 'campaigns', currentAdminCampId), { 
            stages: updatedStages 
        });
        
        alert("ステージを追加しました！");
        
        if (cardSelect) cardSelect.value = "";
        if (bgUrlInput) bgUrlInput.value = "";
        if (bgFileInput) bgFileInput.value = "";
        if (msgInput) msgInput.value = "";
        if (unlockInput) unlockInput.value = "";
        if (priceInput) priceInput.value = "";
    } catch(e) {
        alert("エラー: " + e.message);
    } finally {
        if (btnAdd) {
            btnAdd.textContent = origText;
            btnAdd.disabled = false;
        }
    }
};

window.deleteStoryStage = async function(idx) {
    playSE('btn');
    if (!currentAdminCampId) return;
    if(!confirm(`STAGE ${idx+1} を削除しますか？`)) return;
    
    const camp = globalSettings.campaigns.find(c => c.id === currentAdminCampId);
    let updatedStages = [...(camp.stages || [])];
    updatedStages.splice(idx, 1);
    
    try {
        await updateDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', 'campaigns', currentAdminCampId), { 
            stages: updatedStages 
        });
    } catch(e) {
        alert("削除エラー: " + e.message);
    }
};

function renderSubpassList() {
    const list = document.getElementById('subpass-list');
    if (!list) return;
    list.innerHTML = '';
    if (!globalSettings.subPasswords || globalSettings.subPasswords.length === 0) {
        list.innerHTML = '<div class="text-[10px] text-gray-500 text-center">登録なし</div>';
        return;
    }
    globalSettings.subPasswords.forEach((hash, idx) => {
        const pass = shiftDecode(hash);
        const d = document.createElement('div');
        d.className = "flex justify-between items-center bg-gray-800 p-1 px-2 rounded mb-1";
        d.innerHTML = `<span class="text-xs text-white font-mono">${pass}</span>
                       <button class="text-[10px] bg-red-600 hover:bg-red-500 text-white px-2 py-0.5 rounded transition" data-idx="${idx}">削除</button>`;
        d.querySelector('button').onclick = async (e) => {
            const i = e.target.getAttribute('data-idx');
            playSE('btn');
            if (confirm(`「${pass}」を削除しますか？`)) {
                const newArray = [...globalSettings.subPasswords];
                newArray.splice(i, 1);
                try {
                    await updateDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', 'global', 'settings'), { subPasswords: newArray });
                } catch(err) { alert("削除エラー: " + err.message); }
            }
        };
        list.appendChild(d);
    });
}

let unsubscribeRooms = null;

function startPublicRoomsListener() {
    if(unsubscribeRooms) unsubscribeRooms();
    const listEl = document.getElementById('public-rooms-list');
    if (!listEl) return;
    
    const q = query(
        collection(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL),
        where('isPublic', '==', true)
    );

    unsubscribeRooms = onSnapshot(q, (snapshot) => {
        listEl.innerHTML = '';
        
        const tenMinsAgo = Date.now() - 600000;
        let activeRooms = [];
        
        snapshot.forEach(docSnap => {
            try {
                const d = docSnap.data();
                if(!d) return;
                
                let lastTime = 0;
                try {
                    if (d.updatedAt) {
                        lastTime = typeof d.updatedAt.toMillis === 'function' ? d.updatedAt.toMillis() : (typeof d.updatedAt.getTime === 'function' ? d.updatedAt.getTime() : Date.now());
                    } else if (d.createdAt) {
                        lastTime = typeof d.createdAt.toMillis === 'function' ? d.createdAt.toMillis() : (typeof d.createdAt.getTime === 'function' ? d.createdAt.getTime() : Date.now());
                    }
                } catch(e) { lastTime = Date.now() - 99999999; }
                
                if (isNaN(lastTime)) lastTime = 0;

                if (d.phase !== 'closed' && (d.phase === 'waiting' || d.phase === 'action') && (!d.guestId || d.guestId === 'CPU_BOT') && lastTime >= tenMinsAgo) {
                    activeRooms.push({ id: docSnap.id, data: d, time: lastTime });
                }
            } catch (err) { console.warn("壊れた部屋データをスキップしました", err); }
        });
        
        activeRooms.sort((a, b) => b.time - a.time);
        activeRooms = activeRooms.slice(0, 10);

        if(activeRooms.length === 0) {
            listEl.innerHTML = '<div class="text-[10px] text-gray-600 text-center py-4 font-bold tracking-widest absolute inset-0 flex items-center justify-center">NO ROOMS AVAILABLE</div>';
            return;
        }

        activeRooms.forEach(roomInfo => {
            try {
                const d = roomInfo.data;
                const roomId = roomInfo.id;
                
                const p1 = d.p1Info || {};
                const safeName = (p1.name && typeof p1.name === 'string' && p1.name.trim() !== '') ? p1.name : 'UNKNOWN';
                const safeStats = p1.stats || defaultStats;
                
                let rColor = 'text-gray-400 border-gray-500 bg-black';
                const rar = safeStats.rarity || 'N';
                
                if (rar === 'EX') rColor = 'text-white border-white bg-gradient-to-r from-purple-500 via-pink-500 to-red-500';
                else if (rar === 'UR++') rColor = 'text-red-500 border-red-500 bg-red-500/20';
                else if (rar === 'UR+') rColor = 'text-orange-500 border-orange-500 bg-orange-500/20';
                else if (typeof rar === 'string' && (rar.includes('UR') || rar.includes('SSR'))) rColor = 'text-brand-rare border-brand-rare bg-brand-rare/20';
                else if (typeof rar === 'string' && rar.includes('SR')) rColor = 'text-brand-epic border-brand-epic bg-brand-epic/20';
                
                let iconHtml = `<div class="w-full h-full flex items-center justify-center text-[10px] font-bold text-white">${safeName.charAt(0).toUpperCase()}</div>`;
                if (p1.iconData && typeof p1.iconData === 'string') {
                    if (p1.iconData.startsWith('http') || p1.iconData.startsWith('data:image')) {
                        iconHtml = `<img src="${p1.iconData}" class="w-full h-full object-cover" onerror="this.style.display='none'">`;
                    } else {
                        iconHtml = `<div class="w-full h-full flex items-center justify-center text-sm">${p1.iconData}</div>`;
                    }
                }
                
                const el = document.createElement('div');
                el.className = "flex items-center justify-between bg-gray-800 p-1.5 rounded mb-1.5 border border-gray-600 shadow-sm hover:border-blue-500 transition";
                el.innerHTML = `
                    <div class="flex items-center gap-2">
                        <div class="w-8 h-8 rounded-full bg-gray-700 overflow-hidden border border-gray-500 shrink-0 relative shadow-inner">
                            ${iconHtml}
                            <div class="absolute bottom-0 right-0 bg-black/80 ${rColor.split(' ')[0]} text-[7px] font-black px-1 rounded-sm border ${rColor.split(' ')[1]} shadow-sm">${rar}</div>
                        </div>
                        <div class="flex flex-col leading-none">
                            <span class="text-[11px] font-bold text-white truncate max-w-[100px] mb-0.5">${safeName}</span>
                            <div class="flex gap-1 items-center">
                                <span class="text-[8px] px-1 rounded border font-bold ${rColor}">${rar}</span>
                                <span class="text-[8px] text-gray-400 font-mono">ID: ${roomId}</span>
                            </div>
                        </div>
                    </div>
                    <button class="bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold px-4 py-2 rounded shadow transition btn-quick-join" data-id="${roomId}">参加</button>
                `;
                el.querySelector('.btn-quick-join').onclick = (e) => {
                    playSE('btn');
                    const inputRoom = document.getElementById('input-room');
                    if (inputRoom) inputRoom.value = e.target.getAttribute('data-id');
                    const btnJoin = document.getElementById('btn-join');
                    if (btnJoin) btnJoin.click();
                };
                listEl.appendChild(el);
            } catch(err) { console.warn("部屋のUI描画エラーを回避", err); }
        });
    });
}

// --- QR Code Generation Helper (Restored) ---
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

const appUrl = window.location.origin + window.location.pathname;
const urlParams2 = new URLSearchParams(window.location.search);
const roomParam2 = urlParams2.get('room');
if (roomParam2) { 
    const inputRoom = document.getElementById('input-room');
    if (inputRoom) inputRoom.value = roomParam2; 
}

const toggleBgmBtn = document.getElementById('btn-toggle-bgm');
if (toggleBgmBtn) toggleBgmBtn.onclick = () => {
    playSE('btn');
    isBgmMuted = !isBgmMuted;
    toggleBgmBtn.textContent = isBgmMuted ? "🔇" : "🔊";
    if(isBgmMuted) battleBgm.pause();
    else if(currentPhase !== 'lobby' && currentPhase !== 'result') battleBgm.play();
};

const showQrBtn = document.getElementById('btn-show-qr');
if (showQrBtn) showQrBtn.onclick = () => { 
    playSE('btn'); 
    const modalQr = document.getElementById('modal-qr');
    if (modalQr) modalQr.classList.remove('hidden'); 
    const inputAppUrl = document.getElementById('input-app-url');
    if (inputAppUrl) inputAppUrl.value = appUrl;
    generateSafeQR("qrcode-app", appUrl);
};

const qrCloseBtn = document.getElementById('btn-qr-close');
if (qrCloseBtn) qrCloseBtn.onclick = () => { 
    playSE('btn'); 
    const modalQr = document.getElementById('modal-qr');
    if (modalQr) modalQr.classList.add('hidden'); 
};

const copyUrlBtn = document.getElementById('btn-copy-url');
if (copyUrlBtn) copyUrlBtn.onclick = async () => { 
    playSE('btn');
    const inputAppUrl = document.getElementById('input-app-url');
    const u = inputAppUrl ? inputAppUrl.value : appUrl;
    try {
        if(navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(u); }
        else { const t = document.createElement("textarea"); t.value = u; t.style.position = "fixed"; t.style.left = "-999999px"; t.style.top = "-999999px"; document.body.appendChild(t); t.focus(); t.select(); document.execCommand('copy'); t.remove(); }
        setTimeout(() => alert("URLをコピーしました！"), 100);
    } catch(e) { alert("コピーに失敗しました。URLを長押しして手動でコピーしてください。"); }
};

const adminCloseBtn = document.getElementById('btn-admin-close');
if (adminCloseBtn) adminCloseBtn.onclick = () => { 
    playSE('btn'); 
    const modalAdmin = document.getElementById('modal-admin');
    if (modalAdmin) modalAdmin.classList.add('hidden'); 
};

const greenbackBtn = document.getElementById('btn-greenback');
if (greenbackBtn) greenbackBtn.addEventListener('click', () => { 
    playSE('btn'); 
    const ba = document.getElementById('battle-area'); 
    const lu = document.getElementById('lobby-ui');
    const appEl = document.querySelector('.app-container');
    
    if (ba && ba.classList.contains('bg-[#00FF00]')) {
        ba.classList.remove('bg-[#00FF00]');
        ba.classList.add('bg-transparent');
        if (appEl) appEl.style.backgroundColor = '#111827';
        if (lu) lu.classList.replace('bg-transparent', 'bg-gray-900/95');
        greenbackBtn.classList.remove('bg-green-700', 'text-white', 'opacity-100');
        greenbackBtn.classList.add('bg-gray-800/50', 'text-transparent', 'opacity-50');
    } else if (ba) {
        ba.classList.replace('bg-transparent', 'bg-[#00FF00]');
        if (appEl) appEl.style.backgroundColor = '#00FF00';
        if (lu) lu.classList.replace('bg-gray-900/95', 'bg-transparent');
        greenbackBtn.classList.add('bg-green-700', 'text-white', 'opacity-100');
        greenbackBtn.classList.remove('bg-gray-800/50', 'text-transparent', 'opacity-50');
    }
});

const showAdminBtn = document.getElementById('btn-show-admin');
if (showAdminBtn) showAdminBtn.onclick = async () => { 
    playSE('btn'); 
    
    window.renderStoryAdminUI();
    
    const aiStudioBtn = document.getElementById('btn-admin-ai-studio');
    const modalAdmin = document.getElementById('modal-admin');

    if (globalSettings.adminUid && currentUserAccount && currentUserAccount.id === globalSettings.adminUid) {
        isMainHost = true;
        if (aiStudioBtn) aiStudioBtn.classList.remove('hidden');
        if (modalAdmin) modalAdmin.classList.remove('hidden');
        return;
    }
    
    const savedAuth = sessionStorage.getItem('elem_clash_host_auth');
    if (savedAuth === 'main') {
        isMainHost = true;
        if (aiStudioBtn) aiStudioBtn.classList.remove('hidden');
        if (modalAdmin) modalAdmin.classList.remove('hidden');
        return;
    } else if (savedAuth === 'sub') {
        isSubHost = true;
        if (aiStudioBtn) aiStudioBtn.classList.add('hidden'); 
        if (modalAdmin) modalAdmin.classList.remove('hidden');
        return;
    }

    if (!globalSettings.adminUid) {
        if (!currentUserAccount) {
            alert("【初期設定】\nまずは「DORA-PASS連携」からGoogleアカウントでログインしてください。\n最初のログイン者が管理者として登録されます。");
            return;
        }
        if (confirm(`【初期設定】\n現在のアカウント（${currentUserAccount.name}）を管理者として登録しますか？`)) {
            const settingsRef = doc(db, 'artifacts', appIdStr, 'public', 'data', 'global', 'settings');
            await setDoc(settingsRef, { adminUid: currentUserAccount.id }, { merge: true });
            alert("管理者として登録されました！\n緊急用パスワードも必ず設定しておいてください。");
            isMainHost = true;
            if (aiStudioBtn) aiStudioBtn.classList.remove('hidden');
            if (modalAdmin) modalAdmin.classList.remove('hidden');
        }
        return;
    }

    authAction = 'admin';
    const inputEmergencyPass = document.getElementById('input-emergency-pass');
    if (inputEmergencyPass) inputEmergencyPass.value = '';
    const modalEmergencyAuth = document.getElementById('modal-emergency-auth');
    if (modalEmergencyAuth) modalEmergencyAuth.classList.remove('hidden');
};

const btnCreate = document.getElementById('btn-create');
if (btnCreate) btnCreate.addEventListener('click', () => {
    playSE('btn'); if(!currentUser) return; saveProfile();
    
    if (globalSettings.anyoneCanHost || isMainHost || isSubHost) {
        doCreateRoom();
        return;
    }
    
    if (globalSettings.adminUid && currentUserAccount && currentUserAccount.id === globalSettings.adminUid) {
        isMainHost = true;
        doCreateRoom();
        return;
    }
    
    authAction = 'create'; 
    const inputEmergencyPass = document.getElementById('input-emergency-pass');
    if (inputEmergencyPass) inputEmergencyPass.value = '';
    const modalEmergencyAuth = document.getElementById('modal-emergency-auth');
    if (modalEmergencyAuth) modalEmergencyAuth.classList.remove('hidden'); 
});

window.submitEmergencyAuth = function() {
    playSE('btn');
    const inputEmergencyPass = document.getElementById('input-emergency-pass');
    const pass = inputEmergencyPass ? inputEmergencyPass.value : '';
    const hashed = shiftEncode(pass);
    
    const modalEmergencyAuth = document.getElementById('modal-emergency-auth');
    const aiStudioBtn = document.getElementById('btn-admin-ai-studio');
    const modalAdmin = document.getElementById('modal-admin');

    if (globalSettings.adminPassHash && hashed === globalSettings.adminPassHash) {
        isMainHost = true;
        sessionStorage.setItem('elem_clash_host_auth', 'main');
        if (modalEmergencyAuth) modalEmergencyAuth.classList.add('hidden');
        if (authAction === 'admin') {
            if (aiStudioBtn) aiStudioBtn.classList.remove('hidden');
            if (modalAdmin) modalAdmin.classList.remove('hidden');
        } else if (authAction === 'create') {
            doCreateRoom();
        }
    } else if (globalSettings.subPasswords && globalSettings.subPasswords.includes(hashed)) {
        isSubHost = true;
        sessionStorage.setItem('elem_clash_host_auth', 'sub');
        if (modalEmergencyAuth) modalEmergencyAuth.classList.add('hidden');
        if (authAction === 'admin') {
            if (aiStudioBtn) aiStudioBtn.classList.add('hidden');
            if (modalAdmin) modalAdmin.classList.remove('hidden');
        } else if (authAction === 'create') {
            doCreateRoom();
        }
    } else {
        alert("パスワードが違います。");
    }
};

const toggleAnyoneBtn = document.getElementById('btn-toggle-anyone');
if (toggleAnyoneBtn) toggleAnyoneBtn.onclick = async () => {
    playSE('btn');
    const newVal = !globalSettings.anyoneCanHost;
    try { 
        await updateDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', 'global', 'settings'), { anyoneCanHost: newVal }); 
    } catch(e) { alert("切替エラー: " + e.message); }
};

const addSubpassBtn = document.getElementById('btn-add-subpass');
if (addSubpassBtn) addSubpassBtn.onclick = async () => {
    playSE('btn');
    const inputSubpass = document.getElementById('input-subpass');
    const pass = inputSubpass ? inputSubpass.value.trim() : '';
    if(!pass) return alert("パスワードを入力してください");
    const hashed = shiftEncode(pass);
    if(globalSettings.subPasswords && globalSettings.subPasswords.includes(hashed)) return alert("すでに追加されています");
    
    const newArray = [...(globalSettings.subPasswords || []), hashed];
    try {
        await updateDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', 'global', 'settings'), { subPasswords: newArray });
        alert("サブホストパスワードを追加しました。");
        if (inputSubpass) inputSubpass.value = '';
    } catch(e) { alert("追加エラー: " + e.message); }
};

const deleteZombiesBtn = document.getElementById('btn-delete-zombies');
if (deleteZombiesBtn) deleteZombiesBtn.onclick = async () => {
    playSE('btn');
    if(!confirm("古い部屋（5分以上更新がない部屋）や、解散済みの部屋を一括削除しますか？")) return;
    try {
        const snap = await getDocs(collection(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL));
        let count = 0;
        const promises = [];
        const fiveMinsAgo = Date.now() - 300000;
        
        snap.forEach(d => { 
            const data = d.data();
            const lastTime = data.updatedAt ? (data.updatedAt.toMillis ? data.updatedAt.toMillis() : data.updatedAt.getTime()) : 
                            (data.createdAt ? (data.createdAt.toMillis ? data.createdAt.toMillis() : data.createdAt.getTime()) : 0);
            
            if (data.phase === 'closed' || (lastTime > 0 && lastTime < fiveMinsAgo)) {
                promises.push(deleteDoc(d.ref)); 
                count++;
            }
        });
        
        if (count === 0) {
            alert("削除対象の部屋はありませんでした。");
            return;
        }
        
        await Promise.all(promises);
        alert(`${count}件の古い部屋を削除しました。`);
    } catch(e) {
        alert("削除エラー: " + e.message);
    }
};

const resetRankingBtn = document.getElementById('btn-reset-ranking');
if (resetRankingBtn) resetRankingBtn.onclick = async () => {
    playSE('btn');
    if(!confirm("本当にランキングデータをすべてリセットしますか？")) return;
    try {
        const snap = await getDocs(collection(db, 'artifacts', appIdStr, 'public', 'data', 'rankings'));
        const promises = [];
        snap.forEach(d => { promises.push(deleteDoc(d.ref)); });
        await Promise.all(promises);
        alert("ランキングをリセットしました。");
    } catch(e) { alert("リセットエラー: " + e.message); }
};

const showRankingBtn = document.getElementById('btn-show-ranking');
if (showRankingBtn) showRankingBtn.onclick = async () => { 
    playSE('btn'); 
    const modalRanking = document.getElementById('modal-ranking');
    if (modalRanking) modalRanking.classList.remove('hidden'); 
    const listEl = document.getElementById('ranking-list');
    if (!listEl) return;
    listEl.innerHTML = '<div class="text-center text-gray-500 py-4 text-sm animate-pulse">読み込み中...</div>';
    
    try {
        const q = query(collection(db, 'artifacts', appIdStr, 'public', 'data', 'rankings'), orderBy('wins', 'desc'), limit(15));
        const snap = await getDocs(q);
        if(snap.empty) {
            listEl.innerHTML = '<div class="text-center text-gray-500 py-4 text-sm font-bold">まだ対戦記録がありません</div>';
            return;
        }
        let html = '';
        let rank = 1;
        snap.forEach(documentSnapshot => {
            const d = documentSnapshot.data();
            let rankColor = 'text-gray-500';
            if(rank === 1) rankColor = 'text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.8)]';
            else if(rank === 2) rankColor = 'text-gray-300 drop-shadow-[0_0_5px_rgba(209,213,219,0.8)]';
            else if(rank === 3) rankColor = 'text-orange-400 drop-shadow-[0_0_5px_rgba(251,146,60,0.8)]';
            
            html += `
                <div class="flex items-center justify-between bg-gray-900 p-3 rounded mb-2 border border-gray-700 shadow-md">
                    <div class="flex items-center gap-3">
                        <div class="text-xl font-black ${rankColor} w-6 text-center italic">${rank}</div>
                        <div class="w-10 h-10 rounded-full bg-gray-700 overflow-hidden border-2 border-gray-50 flex items-center justify-center shadow-inner relative">
                            ${d.iconData ? (d.iconData.startsWith('http') || d.iconData.startsWith('data:image') ? `<img src="${d.iconData}" class="w-full h-full object-cover">` : `<div class="w-full h-full flex items-center justify-center text-xl">${d.iconData}</div>`) : `<span class="text-xs font-bold text-white">${(d.name||'?').charAt(0).toUpperCase()}</span>`}
                        </div>
                        <div class="font-bold text-sm text-white truncate max-w-[120px]">${d.name || 'UNKNOWN'}</div>
                    </div>
                    <div class="font-black text-yellow-400 drop-shadow-md text-xl">${d.wins} <span class="text-[10px] text-gray-500 font-bold">WINS</span></div>
                </div>
            `;
            rank++;
        });
        listEl.innerHTML = html;
    } catch(e) {
        listEl.innerHTML = '<div class="text-center text-red-500 py-4 text-sm">エラーが発生しました</div>';
        console.error(e);
    }
};

const rankingCloseBtn = document.getElementById('btn-ranking-close');
if (rankingCloseBtn) rankingCloseBtn.onclick = () => {
    playSE('btn'); 
    const modalRanking = document.getElementById('modal-ranking');
    if (modalRanking) modalRanking.classList.add('hidden'); 
};

async function updateRankingStats(uid, name, iconData) {
    if(!uid || uid === 'CPU_BOT') return; 
    try {
        const ref = doc(db, 'artifacts', appIdStr, 'public', 'data', 'rankings', uid);
        await setDoc(ref, { 
            name: name || 'NO NAME', 
            iconData: iconData || null, 
            wins: increment(1), 
            lastUpdate: new Date() 
        }, { merge: true });
    } catch(e) { console.error("Ranking update failed:", e); }
}

const showEmotesBtn = document.getElementById('btn-show-emotes');
if (showEmotesBtn) showEmotesBtn.onclick = () => {
    playSE('btn');
    const modalEmotes = document.getElementById('modal-emotes');
    if (modalEmotes) modalEmotes.classList.toggle('hidden');
};
const closeEmotesBtn = document.getElementById('btn-close-emotes');
if (closeEmotesBtn) closeEmotesBtn.onclick = () => {
    playSE('btn');
    const modalEmotes = document.getElementById('modal-emotes');
    if (modalEmotes) modalEmotes.classList.add('hidden');
};

document.querySelectorAll('.emote-btn').forEach(btn => {
    btn.onclick = async (e) => {
        playSE('btn');
        const modalEmotes = document.getElementById('modal-emotes');
        if (modalEmotes) modalEmotes.classList.add('hidden');
        if(!currentRoomId) return;
        const emote = e.target.getAttribute('data-emote');
        const field = isHost ? 'p1Emote' : 'p2Emote';
        
        try {
            await setDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, currentRoomId, 'emotes', 'latest'), {
                [field]: { emoji: emote, time: Date.now() }
            }, { merge: true });
        } catch(err) { console.error("Emote error", err); }
    };
});

let emoteUnsub = null;
let lastP1EmoteTime = 0;
let lastP2EmoteTime = 0;

function startEmoteListener(roomId) {
    if(emoteUnsub) emoteUnsub();
    lastP1EmoteTime = 0; lastP2EmoteTime = 0;
    
    emoteUnsub = onSnapshot(doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, roomId, 'emotes', 'latest'), snap => {
        const d = snap.data();
        if(!d) return;

        if (d.p1Emote && d.p1Emote.time > lastP1EmoteTime) {
            lastP1EmoteTime = d.p1Emote.time;
            if (Date.now() - d.p1Emote.time < 5000) showEmote('p1', d.p1Emote.emoji);
        }
        if (d.p2Emote && d.p2Emote.time > lastP2EmoteTime) {
            lastP2EmoteTime = d.p2Emote.time;
            if (Date.now() - d.p2Emote.time < 5000) showEmote('p2', d.p2Emote.emoji);
        }
    });
}

function showEmote(player, emoji) {
    const container = document.getElementById(`${player}-area`);
    if(!container) return;
    const bubble = document.createElement('div');
    bubble.className = 'emote-bubble';
    bubble.textContent = emoji;
    bubble.style.left = '50%';
    bubble.style.top = '-10px';
    bubble.style.marginLeft = '-1rem'; 
    container.appendChild(bubble);
    setTimeout(() => { if(bubble.parentNode) bubble.remove(); }, 2000);
}

function switchView(v) {
    const lobbyUi = document.getElementById('lobby-ui');
    const battleField = document.getElementById('battle-field');
    const handUi = document.getElementById('hand-ui');
    const topBtns = document.getElementById('top-buttons');
    
    if (lobbyUi) lobbyUi.classList.add('hidden'); 
    if (battleField) battleField.classList.add('hidden'); 
    if (handUi) handUi.classList.add('hidden');
    
    if(v==='lobby') { 
        if (lobbyUi) lobbyUi.classList.remove('hidden'); 
        showWaiting(false); 
        const btnSurrender = document.getElementById('btn-surrender');
        if (btnSurrender) btnSurrender.classList.add('hidden'); 
        const btnShowEmotes = document.getElementById('btn-show-emotes');
        if (btnShowEmotes) btnShowEmotes.classList.add('hidden');
        if(topBtns) topBtns.classList.remove('hidden');
    }
    else if(v==='hand') { 
        if (battleField) battleField.classList.remove('hidden'); 
        if (handUi) handUi.classList.remove('hidden'); 
        showWaiting(false); 
        const btnShowEmotes = document.getElementById('btn-show-emotes');
        if (btnShowEmotes) btnShowEmotes.classList.remove('hidden');
        if(topBtns) topBtns.classList.add('hidden');
    }
}

function showWaiting(s, withQR = false) { 
    const ov = document.getElementById('waiting-overlay'); 
    const ctr = document.getElementById('waiting-invite-controls');
    if (!ov) return;
    s ? ov.classList.remove('hidden') : ov.classList.add('hidden');
    if(withQR) { 
        if (ctr) ctr.classList.remove('hidden'); 
        const waitingRoomDisplay = document.getElementById('waiting-room-display');
        if (waitingRoomDisplay) waitingRoomDisplay.classList.remove('hidden');
        const waitingRoomText = document.getElementById('waiting-room-text');
        if (waitingRoomText) waitingRoomText.textContent = currentRoomId;
        generateSafeQR("qrcode-room", appUrl + "?room=" + currentRoomId); 
    }
    else { 
        if (ctr) ctr.classList.add('hidden'); 
        const waitingRoomDisplay = document.getElementById('waiting-room-display');
        if (waitingRoomDisplay) waitingRoomDisplay.classList.add('hidden');
    }

    const waitingTitle = document.getElementById('waiting-title');
    if (s && isHost && isStoryBattle) {
        if (waitingTitle) waitingTitle.textContent = "WAITING FOR BATTLE...";
        if (ctr) ctr.classList.add('hidden');
    } else {
        if (waitingTitle) waitingTitle.textContent = "WAITING FOR OPPONENT...";
    }
}
// ==========================================
// 【パート2 / 3】ここまで（すぐ下にパート3を貼り付けてください）
// ==========================================

// --- Story Mode Actions ---
window.startStoryStage = async function() {
    if(!currentCampaign || !currentCampaign.stages || currentCampaign.stages.length === 0) {
        alert("ステージが設定されていません。");
        return;
    }
    
    if (currentStoryStage >= currentCampaign.stages.length) {
        currentStoryStage = 0;
    }

    const stage = currentCampaign.stages[currentStoryStage];
    const overlay = document.getElementById('story-overlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    overlay.classList.add('flex');
    
    const storyBg = document.getElementById('story-bg');
    if (storyBg) storyBg.src = stage.bgUrl || 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=1000&auto=format&fit=crop';
    
    const imgEl = document.getElementById('story-enemy-img');
    const enemyNameEl = document.getElementById('story-enemy-name');
    if (stage.enemy && stage.enemy.origImage && imgEl) {
        imgEl.src = stage.enemy.origImage;
        imgEl.style.transform = "translateY(0)";
        imgEl.style.opacity = "1";
        imgEl.classList.remove('hidden');
        if (enemyNameEl) enemyNameEl.textContent = stage.enemy.stats?.name || '???';
    } else if (imgEl) {
        imgEl.classList.add('hidden');
        if (enemyNameEl) enemyNameEl.innerHTML = '<span class="text-blue-400">SCENARIO</span>';
    }
    
    const msgBox = document.getElementById('story-message');
    if (!msgBox) return;
    msgBox.innerHTML = '';
    
    cancelStoryType = true;
    isWaitingForNext = false;
    await sleep(50);
    cancelStoryType = false;
    isStoryTyping = true;

    const text = stage.message || '......';
    let i = 0;
    let currentHTML = "";

    while(i < text.length) {
        if(cancelStoryType) {
            let remaining = text.substring(i);
            remaining = remaining.replace(/\[.*?\]/g, ''); 
            currentHTML += remaining.replace(/\n/g, '<br>');
            msgBox.innerHTML = currentHTML;
            msgBox.scrollTop = msgBox.scrollHeight;
            if(stage.enemy && imgEl) {
                imgEl.style.opacity = "1";
                imgEl.style.transition = "";
            }
            break;
        }

        if (text.charAt(i) === '[') {
            let endIndex = text.indexOf(']', i);
            if (endIndex !== -1) {
                let tag = text.substring(i + 1, endIndex);
                i = endIndex + 1;
                await processActionTag(tag, imgEl, msgBox, currentHTML, !!stage.enemy);
                continue;
            }
        }

        currentHTML += text.charAt(i) === '\n' ? '<br>' : text.charAt(i);
        msgBox.innerHTML = currentHTML;
        msgBox.scrollTop = msgBox.scrollHeight;
        i++;
        await sleep(60); 
    }
    isStoryTyping = false;
};

async function processActionTag(tag, imgEl, msgBox, currentHTML, hasEnemy) {
    const t = tag.toLowerCase();
    if (t === 'shake') {
        document.body.classList.add('earthquake');
        playSE('alert');
        setTimeout(()=>document.body.classList.remove('earthquake'), 400);
    } else if (t === 'flash') {
        activeEffects.push(new FlashBang());
        playSE('thunder');
    } else if (t === 'boom') {
        document.body.classList.add('earthquake');
        setTimeout(()=>document.body.classList.remove('earthquake'), 400);
        playSE('fire');
        if (canvas) {
            const c = canvas.getBoundingClientRect();
            const ed = ELEMENTS.find(x=>x.id==='FIRE');
            for(let i=0;i<30;i++) activeEffects.push(new Particle(c.width/2, c.height/2 - 50, ed));
        }
    } else if (t === 'splash') {
        playSE('water');
        if (canvas) {
            const c = canvas.getBoundingClientRect();
            const ed = ELEMENTS.find(x=>x.id==='WATER');
            for(let i=0;i<30;i++) activeEffects.push(new Particle(c.width/2, c.height/2, ed));
        }
    } else if (t === 'walk') {
        playSE('walk');
    } else if (t === 'run') {
        playSE('run');
    } else if (t === 'water') {
        playSE('water_step');
    } else if (t === 'rain') {
        playSE('rain');
    } else if (t === 'wind') {
        playSE('wind');
    } else if (t === 'blizzard') {
        playSE('blizzard');
    } else if (t === 'danger') {
        playSE('alert');
        const flash = document.createElement('div');
        flash.className = "absolute inset-0 bg-red-600/50 z-50 pointer-events-none transition-opacity duration-100";
        const overlay = document.getElementById('story-overlay');
        if (overlay) overlay.appendChild(flash);
        document.body.classList.add('earthquake');
        setTimeout(() => { flash.style.opacity = '0'; document.body.classList.remove('earthquake'); }, 200);
        setTimeout(() => flash.remove(), 400);
    } else if (t === 'jump' && hasEnemy && imgEl) {
        imgEl.style.transition = "transform 0.1s ease-out";
        imgEl.style.transform = "translateY(-40px)"; 
        setTimeout(() => { imgEl.style.transform = "translateY(0)"; }, 150); 
    } else if (t === 'hide' && hasEnemy && imgEl) {
        imgEl.style.transition = "opacity 0.2s";
        imgEl.style.opacity = "0";
    } else if (t === 'fadein' && hasEnemy && imgEl) {
        imgEl.style.transition = "opacity 1s ease-in";
        imgEl.style.opacity = "1";
    } else if (t === 'next') {
        isWaitingForNext = true;
        const nextMarker = document.createElement('span');
        nextMarker.id = "next-marker";
        nextMarker.className = "animate-pulse text-yellow-400";
        nextMarker.textContent = " ▼";
        msgBox.innerHTML = currentHTML + nextMarker.outerHTML;
        msgBox.scrollTop = msgBox.scrollHeight;
        while(isWaitingForNext && !cancelStoryType) {
            await sleep(100);
        }
        const marker = document.getElementById('next-marker');
        if(marker) marker.remove();
    } else if (t.startsWith('wait')) {
        let ms = 1000;
        let parts = t.split(':');
        if (parts.length > 1) ms = parseInt(parts[1]) || 1000;
        let waited = 0;
        while(waited < ms && !cancelStoryType && !isWaitingForNext) {
            await sleep(50);
            waited += 50;
        }
    }
}

window.startStoryBattle = async function() {
    if (isWaitingForNext) {
        playSE('select');
        isWaitingForNext = false;
        return;
    }
    if (isStoryTyping) {
        cancelStoryType = true;
        return;
    }

    playSE('btn');
    
    if(!currentRoomId || !isHost || !currentCampaign) return;
    const stage = currentCampaign.stages[currentStoryStage];

    if (!stage.enemy) {
        const overlay = document.getElementById('story-overlay');
        if (overlay) {
            overlay.classList.add('hidden');
            overlay.classList.remove('flex');
        }
        
        const campId = currentCampaign.id || currentCampaign.title;
        const stageKey = `${campId}_stage_${currentStoryStage}`;
        myPlayerInfo.clearCounts = myPlayerInfo.clearCounts || {};
        myPlayerInfo.clearCounts[stageKey] = (myPlayerInfo.clearCounts[stageKey] || 0) + 1;
        saveProfile();
        
        if (currentStoryStage + 1 < currentCampaign.stages.length) {
            currentStoryStage++;
            window.startStoryStage();
        } else {
            showWaiting(false); 
            if (currentCampaign.nextCampId) {
                window.goNextCampaign(); 
            } else {
                window.exitStoryMode();  
            }
        }
        return;
    }
    
    const overlay = document.getElementById('story-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
        overlay.classList.remove('flex');
    }
    
    isPlayingVsCpu = true;
    isStoryBattle = true;
    
    isStoryTransition = false; 
    playBattleBgm(); 
    
    const cpuInfo = {
        name: `[BOSS] ${stage.enemy.stats.name}`,
        iconData: stage.enemy.iconImage,
        cardData: stage.enemy.origImage,
        stats: stage.enemy.stats
    };
    const cpuHp = cpuInfo.stats.hp || 2000;
    const hp1 = myPlayerInfo.stats.hp || 1500;
    
    const ref = doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, currentRoomId);
    await updateDoc(ref, { 
        guestId: 'CPU_BOT',
        p1Hp: hp1,
        p1MaxHp: hp1,
        p2Info: cpuInfo, 
        p2Hp: cpuHp, 
        p2MaxHp: cpuHp,
        p1Cards: null,
        p2Cards: getCpuHand(),
        updatedAt: new Date()
    });
};

window.buyBossCard = async function() {
    playSE('btn');
    const stageInfo = currentCampaign.stages[currentStoryStage];
    if (!stageInfo) return;
    
    if ((myPlayerInfo.bp || 0) < stageInfo.priceBP) {
        return alert(`BPが足りません！\n(必要: ${stageInfo.priceBP} BP / 現在: ${myPlayerInfo.bp || 0} BP)`);
    }
    if (!confirm(`ボスのカードを ${stageInfo.priceBP} BP で購入しますか？`)) return;
    
    myPlayerInfo.bp -= stageInfo.priceBP;
    saveProfile();
    
    const newCardData = { 
        stats: stageInfo.enemy.stats, 
        origImage: stageInfo.enemy.origImage, 
        iconImage: stageInfo.enemy.iconImage, 
        id: Date.now() 
    };
    
    await saveToCollection(newCardData);
    const btnBuy = document.getElementById('btn-buy-boss-card');
    if (btnBuy) btnBuy.classList.add('hidden');
    alert("ボスのカードを図鑑に追加しました！");
};

window.goNextStage = async function() {
    playSE('btn');
    
    isStoryTransition = true; 
    
    const resMsg = document.getElementById('result-message');
    if (resMsg) resMsg.classList.add('hidden', 'opacity-0');
    const storyCtrls = document.getElementById('story-controls');
    if (storyCtrls) {
        storyCtrls.classList.add('hidden');
        storyCtrls.classList.remove('flex');
    }
    
    const hp1 = myPlayerInfo.stats.hp || 1500;
    
    const ref = doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, currentRoomId);
    await updateDoc(ref, { 
        guestId: null, 
        p1Hp: hp1, 
        p2Hp: 9999, 
        p2Info: null, 
        p2Cards: null, 
        phase: 'waiting', 
        updatedAt: new Date() 
    });
    
    currentStoryStage++;
    window.startStoryStage();
};

window.goNextCampaign = async function() {
    playSE('btn');
    
    isStoryTransition = true;
    
    const nextId = currentCampaign.nextCampId;
    const nextCamp = globalSettings.campaigns.find(c => c.id === nextId);
    
    if(!nextCamp || !nextCamp.stages || nextCamp.stages.length === 0) {
        alert("次のストーリーデータが見つかりませんでした。\nロビーに戻ります。");
        return window.exitStoryMode();
    }
    
    if (nextCamp.fee > 0) {
        if ((myPlayerInfo.bp || 0) < nextCamp.fee) {
            alert(`次の章に進むためのBPが足りません！\n(必要: ${nextCamp.fee} BP / 現在: ${myPlayerInfo.bp || 0} BP)\nロビーに帰還します。`);
            return window.exitStoryMode();
        }
        if(!confirm(`次の章「${nextCamp.title}」へ進みます。\n${nextCamp.fee} BPを消費しますがよろしいですか？`)) return window.exitStoryMode();
        myPlayerInfo.bp -= nextCamp.fee;
        saveProfile();
    } else {
        if(!confirm(`次の章「${nextCamp.title}」へ進みますか？`)) return window.exitStoryMode();
    }
    
    const resMsg = document.getElementById('result-message');
    if (resMsg) resMsg.classList.add('hidden', 'opacity-0');
    const storyCtrls = document.getElementById('story-controls');
    if (storyCtrls) {
        storyCtrls.classList.add('hidden');
        storyCtrls.classList.remove('flex');
    }
    const btnNextCamp = document.getElementById('btn-next-campaign');
    if (btnNextCamp) btnNextCamp.classList.add('hidden');
    
    currentCampaign = nextCamp;
    currentStoryStage = 0;
    
    const hp1 = myPlayerInfo.stats.hp || 1500;
    
    const ref = doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, currentRoomId);
    await updateDoc(ref, { 
        guestId: null, 
        p1Hp: hp1, 
        p2Hp: 9999, 
        p2Info: null, 
        p2Cards: null, 
        phase: 'waiting', 
        updatedAt: new Date() 
    });
    
    window.startStoryStage();
};

window.exitStoryMode = async function() {
    playSE('btn');
    const ref = doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, currentRoomId);
    await updateDoc(ref, { phase: 'closed', updatedAt: new Date() });
    location.reload();
};

function getCpuPlayer() {
    if (myCollection && myCollection.length > 0) {
        const r = Math.floor(Math.random() * myCollection.length);
        return { 
            name: `[CPU] ${myCollection[r].stats.name}`,
            iconData: myCollection[r].iconImage, 
            cardData: myCollection[r].origImage, 
            stats: myCollection[r].stats 
        };
    }
    return { 
        name: "訓練用ダミー", 
        stats: { hp: 3000, atk: 400, def: 200, spd: 300, rarity: "R", jobClass: "FIGHTER" } 
    };
}

function getCpuHand() {
    return [rndCard(), rndCard(), rndCard()];
}

const btnPlayCpu = document.getElementById('btn-play-cpu');
if (btnPlayCpu) btnPlayCpu.onclick = async () => {
    playSE('btn');
    if(!currentRoomId || !isHost) return;
    isPlayingVsCpu = true;
    isStoryBattle = false;
    
    const cpuInfo = getCpuPlayer();
    const cpuHp = cpuInfo.stats.hp || 2000;
    const hp1 = myPlayerInfo.stats.hp || 1500;
    
    const ref = doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, currentRoomId);
    await updateDoc(ref, { 
        guestId: 'CPU_BOT', 
        p1Hp: hp1,
        p2Info: cpuInfo, 
        p2Hp: cpuHp, 
        p2MaxHp: cpuHp,
        p1Cards: null,
        p2Cards: getCpuHand(),
        updatedAt: new Date()
    });
};

window.continueCpuBattle = async function() {
    playSE('btn');
    const resMsg = document.getElementById('result-message');
    if (resMsg) resMsg.classList.add('hidden', 'opacity-0');
    const hostCtrls = document.getElementById('host-controls');
    if (hostCtrls) {
        hostCtrls.classList.add('hidden'); 
        hostCtrls.classList.remove('flex');
    }
    const btnRestartCpu = document.getElementById('btn-restart-cpu');
    if (btnRestartCpu) btnRestartCpu.classList.add('hidden'); 
    
    if(!currentRoomId || !isHost) return;
    isPlayingVsCpu = true;
    isStoryBattle = false;
    
    const cpuInfo = getCpuPlayer();
    const cpuHp = cpuInfo.stats.hp || 2000;
    const hp1 = myPlayerInfo.stats.hp || 1500;
    
    const ref = doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, currentRoomId);
    await updateDoc(ref, { 
        guestId: 'CPU_BOT', 
        p1Hp: hp1,
        p2Info: cpuInfo, 
        p2Hp: cpuHp, 
        p2MaxHp: cpuHp,
        p1Cards: null,
        p2Cards: getCpuHand(),
        phase: 'waiting',
        updatedAt: new Date()
    });
};

async function doCreateRoom(isStoryMode = false) {
    try {
        const q = query(collection(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL), where('hostId', '==', currentUser.uid));
        const snap = await getDocs(q);
        snap.forEach(d => {
            if (d.data().phase !== 'closed') {
                updateDoc(d.ref, { phase: 'closed', updatedAt: new Date() }).catch(()=>{});
            }
        });
    } catch(e) { console.warn("Cleanup error", e); }

    currentRoomId = Math.floor(1000 + Math.random() * 9000).toString(); isHost = true; currentPhase = 'waiting'; currentRoomData = null;
    isPlayingVsCpu = false; 
    
    const roomIdText = document.getElementById('room-id-text');
    if (roomIdText) roomIdText.textContent = currentRoomId; 
    const roomDisplay = document.getElementById('room-display');
    if (roomDisplay) roomDisplay.classList.remove('hidden');
    
    const hp = (myPlayerInfo.stats && myPlayerInfo.stats.hp) ? myPlayerInfo.stats.hp : 1500;
    const checkPublic = document.getElementById('check-public');
    const isPublic = checkPublic ? checkPublic.checked : true;
    
    await setDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, currentRoomId), { 
        hostId: currentUser.uid, 
        guestId: null, 
        p1Info: myPlayerInfo, 
        p2Info: null, 
        p1Hp: hp, p2Hp: hp, p1MaxHp: hp, p2MaxHp: hp, 
        p1Cards: null, p2Cards: null, 
        phase: 'waiting',
        isPublic: isStoryMode ? false : isPublic, 
        createdAt: new Date(),
        updatedAt: new Date()
    });
    
    const p1Status = document.getElementById('p1-status');
    const p2Status = document.getElementById('p2-status');
    if (p1Status) {
        p1Status.textContent="YOU"; 
        p1Status.className="text-[10px] font-black bg-blue-900/80 px-2 py-0.5 rounded border border-blue-500 mb-2";
    }
    if (p2Status) {
        p2Status.textContent="OPPONENT";
        p2Status.className="text-[10px] font-black bg-red-900/80 px-2 py-0.5 rounded border border-red-500 mb-2 opacity-0";
    }
    
    startListener(currentRoomId); 
    startEmoteListener(currentRoomId); 
    drawHand(); switchView('hand'); 
    
    if (isStoryMode) {
        showWaiting(false);
        window.startStoryStage();
    } else {
        showWaiting(true, true); 
        playBattleBgm();
    }
}

const btnJoin = document.getElementById('btn-join');
if (btnJoin) btnJoin.addEventListener('click', async () => {
    playSE('btn'); if(!currentUser) return; saveProfile();
    const inputRoom = document.getElementById('input-room');
    const id = inputRoom ? inputRoom.value.trim() : ''; 
    if(!id) return;
    const ref = doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, id);
    const snap = await getDoc(ref);
    
    if (snap.exists() && snap.data().phase !== 'closed') {
        const d = snap.data();
        
        if (!d.guestId || d.guestId === 'CPU_BOT') {
            isHost = false; currentRoomId = id; currentPhase = 'waiting'; currentRoomData = null;
            isPlayingVsCpu = false;
            isStoryBattle = false;
            
            const roomIdText = document.getElementById('room-id-text');
            if (roomIdText) roomIdText.textContent = id; 
            const roomDisplay = document.getElementById('room-display');
            if (roomDisplay) roomDisplay.classList.remove('hidden');
            
            const p1Status = document.getElementById('p1-status');
            const p2Status = document.getElementById('p2-status');
            if (p1Status) {
                p1Status.textContent="OPPONENT"; 
                p1Status.className="text-[10px] font-black bg-red-900/80 px-2 py-0.5 rounded border border-red-500 mb-2";
            }
            if (p2Status) {
                p2Status.textContent="YOU";
                p2Status.className="text-[10px] font-black bg-blue-900/80 px-2 py-0.5 rounded border border-blue-500 mb-2";
            }
            
            const myHp = (myPlayerInfo.stats && myPlayerInfo.stats.hp) ? myPlayerInfo.stats.hp : 1500;
            
            await updateDoc(ref, { 
                guestId: currentUser.uid, 
                p2Info: myPlayerInfo, 
                p2Hp: myHp, p2MaxHp: myHp,
                p1Hp: d.p1Hp, 
                p1Cards: null, p2Cards: null, phase: 'waiting',
                updatedAt: new Date()
            });
            
            startListener(id); 
            startEmoteListener(id); 
            drawHand(); switchView('hand'); playBattleBgm();
        } else {
            alert("満員です");
        }
    } else {
        alert("部屋が存在しません");
    }
});

const btnSurrender = document.getElementById('btn-surrender');
if (btnSurrender) btnSurrender.onclick = async () => {
    playSE('btn');
    if (isAnimating) return alert("バトル中は降伏できません！\nターン終了をお待ちください。");
    if (!confirm("降伏して退出しますか？（相手の勝利になります）")) return;
    if (!currentRoomId) return;
    const ref = doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, currentRoomId);
    await updateDoc(ref, Object.assign(isHost ? { p1Hp: 0 } : { p2Hp: 0 }, { updatedAt: new Date() }));
};

function applyPlayerUI(prefix, info, defName) {
    try {
        const nameEl = document.getElementById(`${prefix}-name`);
        const iconEl = document.getElementById(`${prefix}-icon`);
        const cardImgEl = document.getElementById(`${prefix}-card-img`);
        const statsBadgeEl = document.getElementById(`${prefix}-stats-badge`);
        const rarityBadgeEl = document.getElementById(`${prefix}-rarity-badge`);
        const p2StatusEl = document.getElementById('p2-status');

        if(!info) {
            if (nameEl) nameEl.textContent = defName;
            if (iconEl) iconEl.innerHTML = `<span class="text-[8px] text-white font-bold">${defName.charAt(0)}</span>`;
            if (cardImgEl) cardImgEl.classList.add('hidden');
            if (statsBadgeEl) statsBadgeEl.classList.add('hidden');
            if (rarityBadgeEl) rarityBadgeEl.classList.add('hidden');
            if(prefix === 'p2' && p2StatusEl) p2StatusEl.classList.add('opacity-0');
            return;
        }
        if(prefix === 'p2' && p2StatusEl) p2StatusEl.classList.remove('opacity-0');
        
        const safeName = (info.name && typeof info.name === 'string' && info.name.trim() !== '') ? info.name : defName;
        if (nameEl) nameEl.textContent = safeName;
        
        let iconHtml = `<span class="text-[8px] text-white font-bold">${safeName.charAt(0).toUpperCase()}</span>`;
        if(info.iconData && typeof info.iconData === 'string') {
            if(info.iconData.startsWith('http') || info.iconData.startsWith('data:image')) {
                iconHtml = `<img src="${info.iconData}" class="w-full h-full object-cover" onerror="this.style.display='none'">`;
            } else {
                iconHtml = `<span class="text-[12px]">${info.iconData}</span>`;
            }
        }
        if (iconEl) iconEl.innerHTML = iconHtml;
        
        if(info.cardData && cardImgEl) { 
            cardImgEl.src = info.cardData; 
            cardImgEl.classList.remove('hidden'); 
        }
        
        const stats = info.stats || defaultStats;
        if (statsBadgeEl) statsBadgeEl.classList.remove('hidden');
        const atkVal = document.getElementById(`${prefix}-atk-val`);
        if (atkVal) atkVal.textContent = stats.atk || 0;
        const defVal = document.getElementById(`${prefix}-def-val`);
        if (defVal) defVal.textContent = stats.def || 0;
        const spdVal = document.getElementById(`${prefix}-spd-val`);
        if (spdVal) spdVal.textContent = stats.spd || 0;
        
        const rar = stats.rarity || 'N';
        if (rarityBadgeEl) {
            rarityBadgeEl.textContent = rar; 
            rarityBadgeEl.classList.remove('hidden');
            rarityBadgeEl.className = "text-[8px] px-1 bg-black rounded border font-black ";
            
            if (rar === 'EX') rarityBadgeEl.className += "bg-gradient-to-r from-purple-500 via-pink-500 to-red-500 text-white border-white shadow-[0_0_15px_rgba(236,72,153,1)] animate-pulse";
            else if(rar === 'UR++') rarityBadgeEl.className += "text-red-500 border-red-500 shadow-[0_0_5px_rgba(239,68,68,0.8)]";
            else if(rar === 'UR+') rarityBadgeEl.className += "text-orange-500 border-orange-500 shadow-[0_0_5px_rgba(249,115,22,0.8)]";
            else if(typeof rar === 'string' && (rar.includes('UR') || rar.includes('SSR'))) rarityBadgeEl.className += "text-brand-rare border-brand-rare shadow-[0_0_5px_rgba(234,179,8,0.8)]";
            else if(typeof rar === 'string' && rar.includes('SR')) rarityBadgeEl.className += "text-brand-epic border-brand-epic shadow-[0_0_5px_rgba(168,85,247,0.8)]";
            else rarityBadgeEl.className += "text-gray-400 border-gray-600";
        }
    } catch(e) { console.warn("Player UI Apply Error:", e); }
}

function startListener(id) {
    if(window._roomUnsub) window._roomUnsub();
    window._roomUnsub = onSnapshot(doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, id), async snap => {
        const d = snap.data(); if(!d) return;
        
        if (isHost && (isPlayingVsCpu || isStoryBattle) && d.guestId && d.guestId !== 'CPU_BOT') {
            isPlayingVsCpu = false;
            isStoryBattle = false;
            
            cancelStoryType = true;
            const overlay = document.getElementById('story-overlay');
            if (overlay) {
                overlay.classList.add('hidden');
                overlay.classList.remove('flex');
            }

            playSE('alert');
            playBattleBgm();
            if(navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 500, 200, 500]); 
            
            const flash = document.createElement('div');
            flash.className = "fixed inset-0 bg-red-600/90 z-[9999] flex flex-col items-center justify-center pointer-events-none transition-opacity duration-300 alert-siren backdrop-blur-sm";
            flash.innerHTML = `
                <div class="text-7xl font-black text-white tracking-widest drop-shadow-[0_0_20px_rgba(0,0,0,1)] mb-4">NEW CHALLENGER!</div>
                <div class="text-2xl font-bold text-yellow-400 drop-shadow-[0_0_10px_rgba(0,0,0,0.8)]">乱入者が現れました！仕切り直します！</div>
            `;
            document.body.appendChild(flash);
            
            isAnimating = false;
            currentPhase = 'interrupted';
            pendingSnapshot = null;
            
            await updateDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, currentRoomId), {
                p1Cards: null,
                p2Cards: null,
                phase: 'waiting',
                updatedAt: new Date()
            });

            setTimeout(() => {
                flash.style.opacity = '0';
                setTimeout(() => flash.remove(), 500);
            }, 3000); 
        }

        if (isHost && !isPlayingVsCpu && !currentRoomData?.guestId && d.guestId) {
            playSE('alert');
            if(navigator.vibrate) navigator.vibrate([100, 50, 100]); 
        }

        if(isAnimating) {
            pendingSnapshot = d;
            return;
        }
        
        await processGameData(d);
    });
}

async function processGameData(d) {
    currentRoomData = d; 
    applyPlayerUI('p1', d.p1Info, 'HOST');
    applyPlayerUI('p2', d.p2Info, 'GUEST');

    if(d.phase === 'closed' && !isHost) { alert("解散されました。"); location.reload(); return; }

    const surrenderBtn = document.getElementById('btn-surrender');
    if (surrenderBtn) {
        if (currentRoomId && currentPhase !== 'lobby' && d.phase !== 'result' && d.phase !== 'closed') { 
            surrenderBtn.classList.remove('hidden'); 
        } else { 
            surrenderBtn.classList.add('hidden'); 
        }
    }

    if (d.phase !== 'action') {
        const safeP1Hp = typeof d.p1Hp === 'number' && !isNaN(d.p1Hp) ? d.p1Hp : 0;
        const safeP2Hp = typeof d.p2Hp === 'number' && !isNaN(d.p2Hp) ? d.p2Hp : 0;
        const safeP1MaxHp = typeof d.p1MaxHp === 'number' && !isNaN(d.p1MaxHp) && d.p1MaxHp > 0 ? d.p1MaxHp : 1500;
        const safeP2MaxHp = typeof d.p2MaxHp === 'number' && !isNaN(d.p2MaxHp) && d.p2MaxHp > 0 ? d.p2MaxHp : 1500;

        const p1HpText = document.getElementById('p1-hp-text');
        if (p1HpText) p1HpText.textContent = Math.max(0, safeP1Hp);
        const p2HpText = document.getElementById('p2-hp-text');
        if (p2HpText) p2HpText.textContent = Math.max(0, safeP2Hp);
        const p1HpBar = document.getElementById('p1-hp-bar');
        if (p1HpBar) p1HpBar.style.width = `${Math.max(0, (safeP1Hp / safeP1MaxHp) * 100)}%`;
        const p2HpBar = document.getElementById('p2-hp-bar');
        if (p2HpBar) p2HpBar.style.width = `${Math.max(0, (safeP2Hp / safeP2MaxHp) * 100)}%`;
    }

    if (!isStoryTransition && (d.p1Hp <= 0 || d.p2Hp <= 0) && d.phase !== 'result' && d.phase !== 'closed' && !isAnimating) {
        if(isHost) {
            let hostWon = d.p1Hp > 0;
            if(hostWon && !isStoryBattle && !isPlayingVsCpu) {
                await updateRankingStats(currentUser.uid, myPlayerInfo.name, myPlayerInfo.iconData);
            } else if(!hostWon && d.guestId && d.guestId !== 'CPU_BOT') {
                const guestName = d.p2Info ? d.p2Info.name : 'GUEST';
                const guestIcon = d.p2Info ? d.p2Info.iconData : null;
                await updateRankingStats(d.guestId, guestName, guestIcon);
            }
            await updateDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, currentRoomId), { phase: 'result', updatedAt: new Date() }); 
        }
        return; 
    }

    if (d.phase === 'waiting') {
        battleResolved = false; 
        
        if (currentPhase !== 'waiting') {
            if (currentPhase === 'result'&& !isStoryTransition) playBattleBgm(); 
            
            currentPhase = 'waiting';
            const resMsg = document.getElementById('result-message');
            if (resMsg) resMsg.classList.add('hidden', 'opacity-0');
            for(let i=0;i<3;i++){ 
                const s1 = document.getElementById(`p1-slot-${i}`);
                const s2 = document.getElementById(`p2-slot-${i}`);
                if (s1) s1.innerHTML=''; 
                if (s2) s2.innerHTML=''; 
            }
            const p1Total = document.getElementById('p1-total');
            if (p1Total) p1Total.textContent="0"; 
            const p2Total = document.getElementById('p2-total');
            if (p2Total) p2Total.textContent="0";
            drawHand(); switchView('hand');

            const bc = document.getElementById('btn-confirm');
            if (bc) {
                bc.disabled = true;
                bc.className = "w-full max-w-sm bg-gray-800 text-gray-500 font-bold py-3 rounded-lg cursor-not-allowed text-sm transition-all duration-200 tracking-widest";
                bc.textContent = `SELECT CARDS (0/3)`;
            }
        }
        
        if(isHost) {
            if (!d.guestId) {
                showWaiting(true, true);
            } else if (d.p1Cards && !d.p2Cards) {
                showWaiting(true, false);
            } else if (!d.p1Cards && d.p2Cards) {
                showWaiting(false);
            } else if (!d.p1Cards && !d.p2Cards) {
                showWaiting(false);
            } else {
                showWaiting(false);
            }

            if(d.p1Cards && d.p2Cards) await updateDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, currentRoomId), { phase: 'action', updatedAt: new Date() });
        } else { 
            if (d.p2Cards && !d.p1Cards) {
                showWaiting(true, false);
            } else {
                showWaiting(false); 
            }
        }
        
        renderHand(); 

        if (d.p1Cards) for(let i=0;i<3;i++) {
            const slot = document.getElementById(`p1-slot-${i}`);
            if (slot && !slot.innerHTML.includes('card-inner')) slot.innerHTML = `<div class="card-inner">${getCardBackHTML()}</div>`;
        }
        if (d.p2Cards) for(let i=0;i<3;i++) {
            const slot = document.getElementById(`p2-slot-${i}`);
            if (slot && !slot.innerHTML.includes('card-inner')) slot.innerHTML = `<div class="card-inner">${getCardBackHTML()}</div>`;
        }
    }

    if(d.phase === 'action' && d.p1Cards && d.p2Cards && currentPhase !== 'action') {
        currentPhase = 'action'; isAnimating = true; showWaiting(false); renderHand(); 
        
        const resultHPs = await runBattle(d.p1Cards, d.p2Cards, d.p1Hp, d.p2Hp, d.p1Info?.stats||defaultStats, d.p2Info?.stats||defaultStats);
        
        isAnimating = false;

        if(isHost) {
            if (resultHPs.hp1 > 0 && resultHPs.hp2 > 0) {
                await updateDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, currentRoomId), { 
                    p1Hp: resultHPs.hp1, p2Hp: resultHPs.hp2, p1Cards: null, p2Cards: null, phase: 'waiting', updatedAt: new Date() 
                });
                
                if (isPlayingVsCpu || isStoryBattle) {
                    setTimeout(async () => {
                        await updateDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, currentRoomId), { p2Cards: getCpuHand(), updatedAt: new Date() });
                    }, 500);
                }
            } else {
                await updateDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, currentRoomId), { 
                    p1Hp: resultHPs.hp1, p2Hp: resultHPs.hp2, updatedAt: new Date()
                });
            }
        }

        if (pendingSnapshot) {
            const ns = pendingSnapshot;
            pendingSnapshot = null;
            if (ns.phase !== 'action') {
                await processGameData(ns);
            }
        }
    }

    if(d.phase === 'result') {
        currentPhase = 'result';
        
        showWaiting(false);
        fadeOutBattleBgm();
        
        let win = isHost ? d.p1Hp > 0 : d.p2Hp > 0;
        
        if(!battleResolved) {
            battleResolved = true;
            if (!isPlayingVsCpu && !isStoryBattle) {
                myPlayerInfo.bp = (myPlayerInfo.bp || 0) + 1;
                saveProfile();
            }
        }

        const resMsg = document.getElementById('result-message');
        if (resMsg) resMsg.classList.remove('hidden');
        setTimeout(() => {
            if (resMsg) resMsg.classList.remove('opacity-0');
            playSE(win ? 'win' : 'lose');
            const resTextMain = document.getElementById('result-text-main');
            if (resTextMain) {
                resTextMain.textContent = win ? "WIN!" : "LOSE...";
                resTextMain.className = win ? "text-6xl font-black text-yellow-400 drop-shadow-[0_0_20px_#facc15]" : "text-6xl font-black text-blue-400 drop-shadow-[0_0_20px_#60a5fa]";
            }
            
            const storyControls = document.getElementById('story-controls');
            const hostControls = document.getElementById('host-controls');
            const guestControls = document.getElementById('guest-controls');

            if (isHost && isStoryBattle) {
                if (storyControls) {
                    storyControls.classList.remove('hidden');
                    storyControls.classList.add('flex');
                }
                if (hostControls) {
                    hostControls.classList.add('hidden');
                    hostControls.classList.remove('flex');
                }
                
                const btnNext = document.getElementById('btn-next-stage');
                const btnClear = document.getElementById('btn-story-clear');
                const btnNextCamp = document.getElementById('btn-next-campaign');
                const btnBuy = document.getElementById('btn-buy-boss-card');
                
                if (btnBuy) btnBuy.classList.add('hidden');
                
                if (win) {
                    const campId = currentCampaign.id || currentCampaign.title;
                    const stageInfo = currentCampaign.stages[currentStoryStage];
                    const stageKey = `${campId}_stage_${currentStoryStage}`;
                    
                    myPlayerInfo.clearCounts = myPlayerInfo.clearCounts || {};
                    myPlayerInfo.clearCounts[stageKey] = (myPlayerInfo.clearCounts[stageKey] || 0) + 1;
                    saveProfile();
                    
                    if (currentStoryStage + 1 < currentCampaign.stages.length) {
                        if (btnNext) btnNext.classList.remove('hidden');
                        if (btnClear) btnClear.classList.add('hidden');
                        if (btnNextCamp) btnNextCamp.classList.add('hidden');
                    } else {
                        if (btnNext) btnNext.classList.add('hidden');
                        if (currentCampaign.nextCampId) {
                            if (btnNextCamp) btnNextCamp.classList.remove('hidden');
                            if (btnClear) btnClear.classList.add('hidden');
                        } else {
                            if (btnNextCamp) btnNextCamp.classList.add('hidden');
                            if (btnClear) btnClear.classList.remove('hidden');
                        }
                    }
                    
                    if (stageInfo && stageInfo.priceBP > 0 && myPlayerInfo.clearCounts[stageKey] >= (stageInfo.unlockCount || 1)) {
                        if (btnBuy) {
                            btnBuy.textContent = `💳 BOSSカードを入手 (${stageInfo.priceBP} BP)`;
                            btnBuy.classList.remove('hidden');
                        }
                    }
                } else {
                    if (btnNext) btnNext.classList.add('hidden');
                    if (btnNextCamp) btnNextCamp.classList.add('hidden');
                    if (btnClear) {
                        btnClear.classList.remove('hidden');
                        btnClear.textContent = "敗北 (帰還)";
                    }
                }

            } else if (isHost) {
                if (storyControls) {
                    storyControls.classList.add('hidden');
                    storyControls.classList.remove('flex');
                }
                if (hostControls) {
                    hostControls.classList.remove('hidden'); 
                    hostControls.classList.add('flex');
                }
                
                const notice = document.getElementById('host-rematch-notice'); 
                const br = document.getElementById('btn-restart');
                const bCpu = document.getElementById('btn-restart-cpu');
                
                if(isPlayingVsCpu) {
                    if (notice) notice.classList.add('hidden'); 
                    if (br) br.textContent = "部屋で待機"; 
                    if(bCpu) bCpu.classList.remove('hidden'); 
                } else if(!d.guestId) { 
                    if (notice) {
                        notice.textContent = "対戦相手が退出しました"; 
                        notice.className = "text-red-400 font-bold text-sm"; 
                        notice.classList.remove('hidden'); 
                    }
                    if (br) br.textContent = "次を募集"; 
                    if(bCpu) bCpu.classList.add('hidden');
                } else if(d.guestWantsRematch) { 
                    if (notice) {
                        notice.textContent = "対戦相手が再戦を希望！"; 
                        notice.className = "text-yellow-400 font-bold text-sm animate-pulse"; 
                        notice.classList.remove('hidden'); 
                    }
                    if (br) br.textContent = "再戦する"; 
                    if(bCpu) bCpu.classList.add('hidden');
                } else { 
                    if (notice) notice.classList.add('hidden'); 
                    if (br) br.textContent = "もう一度プレイ"; 
                    if(bCpu) bCpu.classList.add('hidden');
                }
            } else {
                if (storyControls) storyControls.classList.add('hidden');
                if (guestControls) {
                    guestControls.classList.remove('hidden'); 
                    guestControls.classList.add('flex');
                }
            }
        }, 100);
    }
}

const rndCard = () => { const e = ELEMENTS[Math.floor(Math.random()*3)]; return { element: e.id, power: Math.floor(Math.random()*9)+1 }; };

function drawHand() { myHand = [rndCard(), rndCard(), rndCard(), rndCard(), rndCard()]; selectedIndices = []; renderHand(); }

function renderHand() {
    const hc = document.getElementById('hand-cards'); 
    if (!hc) return;
    hc.innerHTML = '';
    
    const isActive = (
        currentPhase === 'waiting' && 
        !isAnimating && 
        currentRoomData && 
        currentRoomData.guestId && 
        (isHost ? !currentRoomData.p1Cards : !currentRoomData.p2Cards)
    );
    
    myHand.forEach((c, i) => {
        const el = ELEMENTS.find(e => e.id === c.element); const d = document.createElement('div');
        d.className = `hand-card element-${c.element} ${!isActive?'disabled':''}`;
        let idx = selectedIndices.indexOf(i);
        d.innerHTML = `<div class="text-2xl leading-none mb-1">${el.icon}</div><div class="text-3xl font-black text-gray-900 leading-none">${c.power}</div>`;
        if(idx !== -1) { d.classList.add('selected'); d.innerHTML += `<div class="absolute -top-2 -right-2 bg-red-600 text-white font-black rounded-full w-6 h-6 flex items-center justify-center text-xs shadow border-2 border-white z-10">${idx + 1}</div>`; }
        
        d.onclick = () => {
            if(!isActive) return; playSE('select');
            if(idx !== -1) selectedIndices.splice(idx,1); else if(selectedIndices.length<3) selectedIndices.push(i); renderHand();
        };
        hc.appendChild(d);
    });
    
    const bc = document.getElementById('btn-confirm');
    if (!bc) return;
    if(selectedIndices.length === 3 && isActive) { 
        bc.disabled = false; 
        bc.className = "w-full max-w-sm bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg shadow-[0_0_15px_rgba(59,130,246,0.8)] transition-all"; 
        bc.textContent = "CONFIRM 3 CARDS"; 
    } else { 
        bc.disabled = true; 
        bc.className = "w-full max-w-sm bg-gray-800 text-gray-500 font-bold py-3 rounded-lg cursor-not-allowed"; 
        bc.textContent = `SELECT CARDS (${selectedIndices.length}/3)`; 
    }
}

const btnConfirm = document.getElementById('btn-confirm');
if (btnConfirm) btnConfirm.addEventListener('click', async () => {
    playSE('btn'); if(selectedIndices.length !== 3 || currentPhase !== 'waiting') return;
    const sCards = selectedIndices.map(i => myHand[i]);
    
    if (currentRoomData) { if (isHost) currentRoomData.p1Cards = sCards; else currentRoomData.p2Cards = sCards; }
    renderHand();

    for(let i=0;i<3;i++) {
        const slot = document.getElementById(isHost?`p1-slot-${i}`:`p2-slot-${i}`);
        if (slot) slot.innerHTML = `<div class="card-inner">${getCardBackHTML()}</div>`;
    }
    
    showWaiting(true, (!currentRoomData.guestId && isHost)); 
    if (btnConfirm) {
        btnConfirm.textContent = "SET COMPLETED"; 
        btnConfirm.disabled = true;
    }
    
    const ref = doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, currentRoomId);
    await updateDoc(ref, Object.assign(isHost ? { p1Cards: sCards } : { p2Cards: sCards }, { updatedAt: new Date() }));
});

// --- Canvas Effects & Battle ---
const canvas = document.getElementById('effect-canvas');
const ctx = canvas ? canvas.getContext('2d') : null;
let activeEffects = [];
if (canvas) {
    window.addEventListener('resize', () => { canvas.width = canvas.clientWidth; canvas.height = canvas.clientHeight; });
    canvas.width = canvas.clientWidth; canvas.height = canvas.clientHeight;
}

function animateEffects(time) {
    if (ctx && canvas) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for(let i = activeEffects.length - 1; i >= 0; i--) { 
            activeEffects[i].update(time); 
            activeEffects[i].draw(ctx); 
            if(activeEffects[i].isDead) activeEffects.splice(i, 1); 
        }
    }
    requestAnimationFrame(animateEffects);
}
requestAnimationFrame(animateEffects);

class PopUpText {
    constructor(x, y, text, color, scale = 1) { this.x=x; this.y=y; this.text=text; this.color=color; this.scaleBase=scale; this.st=performance.now(); this.isDead=false; }
    update(t) { this.p = (t - this.st) / 1200; if(this.p >= 1) this.isDead = true; }
    draw(ctx) {
        let a = 1, dy = -40 * this.p, s = this.scaleBase * (this.p < 0.2 ? 0.5 + 2.5*this.p : (this.p > 0.8 ? 1 - (this.p-0.8)*5 : 1));
        if (this.p > 0.8) a = 1 - (this.p - 0.8)*5;
        ctx.save(); ctx.globalAlpha = a; ctx.translate(this.x, this.y + dy); ctx.scale(s, s);
        ctx.font = "900 40px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.lineWidth = 6; ctx.strokeStyle = '#000'; ctx.strokeText(this.text, 0, 0);
        ctx.fillStyle = this.color; ctx.shadowColor = this.color; ctx.shadowBlur = 15; ctx.fillText(this.text, 0, 0); ctx.restore();
    }
}
class FlashBang {
    constructor() { this.st = performance.now(); this.isDead = false; }
    update(t) { this.p = (t - this.st) / 300; if (this.p >= 1) this.isDead = true; }
    draw(ctx) { ctx.save(); ctx.fillStyle = `rgba(255,255,255,${this.p < 0.5 ? this.p*2 : 1 - (this.p-0.5)*2})`; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.restore(); }
}
class Projectile {
    constructor(sx, sy, ex, ey, el, onDone) {
        this.sx = sx; this.sy = sy; this.ex = ex; this.ey = ey; this.el = el; this.onDone = onDone;
        this.st = performance.now(); this.isDead = false; this.ang = Math.atan2(ey-sy, ex-sx);
    }
    update(t) { this.p = (t - this.st) / 400; this.p *= this.p; if(this.p >= 1) { this.p=1; this.isDead=true; this.onDone(); }
        this.x = this.sx + (this.ex-this.sx)*this.p; this.y = this.sy + (this.ey-this.sy)*this.p;
    }
    draw(ctx) {
        ctx.save(); ctx.translate(this.x, this.y); ctx.fillStyle = this.el.color; ctx.shadowColor = this.el.shadow; ctx.shadowBlur = 30;
        if (this.el.id === 'FIRE') { ctx.beginPath(); ctx.arc(0,0,30,0,Math.PI*2); ctx.fill(); }
        else if (this.el.id === 'WATER') { 
            ctx.rotate(this.ang); 
            ctx.beginPath(); 
            ctx.arc(0, 0, 20, -Math.PI/2, Math.PI/2); 
            ctx.lineTo(-35, 0); 
            ctx.closePath(); 
            ctx.fill(); 
        }
        ctx.restore();
    }
}
class Lightning {
    constructor(sx, sy, ex, ey, onDone) { this.st = performance.now(); this.isDead = false; this.onDone = onDone;
        this.pts = [{x:sx,y:sy}]; for(let i=1;i<10;i++) this.pts.push({x:sx+(ex-sx)*i/10+(Math.random()-0.5)*60, y:sy+(ey-sy)*i/10+(Math.random()-0.5)*60}); this.pts.push({x:ex,y:ey});
    }
    update(t) { if(t-this.st > 300) { this.isDead = true; this.onDone(); } }
    draw(ctx) {
        let a = 1 - (performance.now()-this.st)/300; ctx.save(); ctx.globalAlpha = a; ctx.beginPath(); ctx.moveTo(this.pts[0].x, this.pts[0].y);
        for(let i=1;i<this.pts.length;i++) ctx.lineTo(this.pts[i].x, this.pts[i].y);
        ctx.strokeStyle='#fff'; ctx.lineWidth=8; ctx.stroke(); ctx.strokeStyle='#fef08a'; ctx.lineWidth=16; ctx.shadowColor='#eab308'; ctx.shadowBlur=30; ctx.stroke(); ctx.restore();
    }
}
class Particle {
    constructor(x, y, el) { this.sx = x; this.sy = y; this.el = el; this.st = performance.now(); this.isDead = false;
        let a = Math.random()*Math.PI*2, d = 40+Math.random()*60; this.sz = 5+Math.random()*10;
        if(el.id==='FIRE'){ this.vx=Math.cos(a)*d*0.8; this.vy=-Math.abs(Math.sin(a)*d)-20; this.dur=600;}
        else if(el.id==='WATER'){ this.vx=Math.cos(a)*d*0.8; this.vy=Math.abs(Math.sin(a)*d)+20; this.dur=600;}
        else { this.vx=Math.cos(a)*d*1.5; this.vy=Math.sin(a)*d*1.5; this.dur=300;}
    }
    update(t) { this.p = (t - this.st) / this.dur; if(this.p>=1){this.p=1; this.isDead=true;} this.x=this.sx+this.vx*(this.el.id==='THUNDER'?this.p:1-(1-this.p)*(1-this.p)); this.y=this.sy+this.vy*(this.el.id==='THUNDER'?this.p:1-(1-this.p)*(1-this.p)); }
    draw(ctx) { ctx.save(); ctx.globalAlpha = 1-this.p; ctx.translate(this.x, this.y); ctx.fillStyle=this.el.color; ctx.shadowColor=this.el.shadow; ctx.shadowBlur=10; ctx.beginPath(); ctx.arc(0,0,this.sz,0,Math.PI*2); ctx.fill(); ctx.restore(); }
}

class CriticalFlash {
    constructor() { this.st = performance.now(); this.isDead = false; }
    update(t) { this.p = (t - this.st) / 1000; if(this.p >= 1) this.isDead = true; }
    draw(ctx) {
        let a = this.p < 0.2 ? this.p * 5 : 1 - (this.p - 0.2) * 1.25;
        ctx.save(); ctx.globalAlpha = Math.max(0, a);
        ctx.fillStyle = 'rgba(255, 0, 0, 0.15)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.translate(canvas.width/2, canvas.height/2);
        let s = 0.8 + this.p * 0.2; 
        ctx.scale(s, s);
        ctx.font = "900 45px sans-serif"; 
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.lineWidth = 6; ctx.strokeStyle = '#000'; ctx.strokeText("CRITICAL", 0, -40);
        ctx.fillStyle = '#facc15'; ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 15; ctx.fillText("CRITICAL", 0, -40);
        ctx.restore();
    }
}

class HoneycombShield {
    constructor(x, y, color) {
        this.x = x; this.y = y; 
        this.color = color;
        this.st = performance.now();
        this.isDead = false;
        this.fadePhase = 'in'; 
    }
    kill() {
        this.fadePhase = 'out';
        this.fadeOutStart = performance.now();
    }
    update(t) {
        let elapsed = t - this.st;
        
        if (this.fadePhase === 'in') {
            // ★ 追加：最初の一瞬だけ濃く光らせる演出 (400ms以内)
            if (elapsed < 400) {
                let p = elapsed / 400; // 0.0 ～ 1.0
                if (p < 0.3) {
                    // 最初の0.12秒(30%)で一気に濃く(透明度0.9)なる
                    this.alphaBase = p / 0.3 * 0.9;
                } else {
                    // 残りの時間でフワッと通常の濃さ(0.2)へ落ち着く
                    this.alphaBase = 0.9 - ((p - 0.3) / 0.7) * 0.7;
                }
            } else if (elapsed < 1000) {
                this.alphaBase = 0.2; // 通常時のベース透明度
            } else {
                this.fadePhase = 'active';
            }
        } else if (this.fadePhase === 'active') {
            this.alphaBase = 0.2;
        } else if (this.fadePhase === 'out') {
            let outElapsed = t - (this.fadeOutStart || t);
            this.alphaBase = Math.max(0, 0.2 - (outElapsed / 500) * 0.2);
            if (outElapsed > 500) this.isDead = true;
        }
        
        // 常時のゆっくりとした明滅
        this.pulse = (Math.sin(elapsed / 500) + 1) / 2;
    }
    draw(ctx) {
        ctx.save();
        // 透明度が1.0を超えたり0を下回らないように安全対策
        ctx.globalAlpha = Math.min(1.0, Math.max(0, this.alphaBase + (this.pulse * 0.15))); 
        ctx.translate(this.x, this.y);
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 1.5 + (this.pulse * 1.5);
        
        // ★ 追加：濃く光っている瞬間(alphaBaseが高い時)は、発光(Blur)も強くする
        ctx.shadowColor = this.color;
        ctx.shadowBlur = (this.alphaBase > 0.4 ? 30 : 10) + this.pulse * 15; 
        
        const drawHex = (hx, hy, r) => {
            ctx.beginPath();
            for(let i=0; i<6; i++) {
                let angle = Math.PI / 3 * i;
                let px = hx + r * Math.cos(angle);
                let py = hy + r * Math.sin(angle);
                if(i===0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.stroke();
        };

        const r = 18; 
        const dx = r * 1.5;
        const dy = r * Math.sqrt(3);
        
        for (let row = -4; row <= 4; row++) {
            for (let col = -4; col <= 4; col++) {
                let hx = col * dx;
                let hy = row * dy + (col % 2 !== 0 ? dy / 2 : 0);
                
                if (Math.hypot(hx, hy) < 100) { 
                    drawHex(hx, hy, r * 0.85);
                }
            }
        }
        ctx.restore();
    }
}

class AbsorbFlash {
    constructor(x, y, w, h) {
        this.x = x; this.y = y; this.w = w; this.h = h;
        this.st = performance.now();
        this.isDead = false;
    }
    update(t) {
        this.p = (t - this.st) / 600; 
        if(this.p >= 1) this.isDead = true;
    }
    draw(ctx) {
        let a = this.p < 0.2 ? this.p * 5 : 1 - (this.p - 0.2) * 1.25;
        ctx.save();
        ctx.globalAlpha = Math.max(0, a) * 0.7;
        ctx.fillStyle = '#f97316'; 
        ctx.shadowColor = '#f97316';
        ctx.shadowBlur = 30;
        ctx.beginPath();
        ctx.roundRect(this.x - this.w/2, this.y - this.h/2, this.w, this.h, 10);
        ctx.fill();
        ctx.restore();
    }
}

class ShieldBreakEffect {
    constructor(x, y, color) {
        this.x = x; this.y = y; this.color = color;
        this.st = performance.now();
        this.isDead = false;
        this.shards = [];
        
        for (let i = 0; i < 25; i++) {
            let angle = Math.random() * Math.PI * 2;
            let speed = 4 + Math.random() * 8; 
            let size = 6 + Math.random() * 15; 
            let rotSpeed = (Math.random() - 0.5) * 0.6; 
            this.shards.push({
                x: 0, y: 0,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: size,
                angle: Math.random() * Math.PI * 2,
                rotSpeed: rotSpeed
            });
        }
    }
    update(t) {
        this.p = (t - this.st) / 600; 
        if (this.p >= 1) this.isDead = true;
        
        for (let shard of this.shards) {
            shard.x += shard.vx;
            shard.y += shard.vy;
            shard.angle += shard.rotSpeed;
        }
    }
    draw(ctx) {
        let a = 1 - this.p; 
        ctx.save();
        ctx.globalAlpha = Math.max(0, a);
        ctx.translate(this.x, this.y);
        ctx.fillStyle = this.color;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 15;
        
        for (let shard of this.shards) {
            ctx.save();
            ctx.translate(shard.x, shard.y);
            ctx.rotate(shard.angle);
            ctx.beginPath();
            ctx.moveTo(0, -shard.size);
            ctx.lineTo(shard.size * 0.8, shard.size * 0.5);
            ctx.lineTo(-shard.size * 0.8, shard.size * 0.5);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
        ctx.restore();
    }
}

async function runBattle(c1A, c2A, hp1, hp2, st1, st2) {
    if (!SE.glass) {
        SE.glass = new Audio('https://assets.mixkit.co/active_storage/sfx/2686/2686-preview.mp3'); 
    }

    let p1Tot = 0, p2Tot = 0, m1=c1A[0], m2=c2A[0];
    let p1WinCount = 0, p2WinCount = 0; 
    let p1RoundWins = 0, p2RoundWins = 0; 
    
    let p1GuardElement = (c1A[0].element === c1A[1].element && c1A[1].element === c1A[2].element) ? c1A[0].element : null;
    let p2GuardElement = (c2A[0].element === c2A[1].element && c2A[1].element === c2A[2].element) ? c2A[0].element : null;

    let p1ShieldFx = null;
    let p2ShieldFx = null;

    const mk = c => { const e=ELEMENTS.find(x=>x.id===c.element); return `<div class="card-inner">${getCardBackHTML()}<div class="card-front element-${c.element}"><div class="text-xl mb-1">${e.icon}</div><div class="text-2xl font-black text-gray-900 power-val">${c.power}</div></div></div>`; };
    for(let i=0;i<3;i++){ 
        const s1 = document.getElementById(`p1-slot-${i}`);
        const s2 = document.getElementById(`p2-slot-${i}`);
        if (s1) s1.innerHTML=mk(c1A[i]); 
        if (s2) s2.innerHTML=mk(c2A[i]); 
    }
    const slot0 = document.getElementById('p1-slot-0');
    if (slot0) slot0.offsetWidth; 
    await sleep(300);

    const showGuardFx = async (playerPrefix, elId) => {
        const e = ELEMENTS.find(x=>x.id===elId);
        const cardEl = document.getElementById(`${playerPrefix}-player-card`);
        if (!cardEl || !canvas) return;
        const cbox = cardEl.getBoundingClientRect();
        const cv = canvas.getBoundingClientRect();
        const cx = cbox.left - cv.left + cbox.width / 2;
        const cy = cbox.top - cv.top + cbox.height / 2;

        const shield = new HoneycombShield(cx, cy, e.color);
        activeEffects.push(shield);
        if(playerPrefix === 'p1') p1ShieldFx = shield; else p2ShieldFx = shield;

        activeEffects.push(new PopUpText(cx, cy + 30, `[ ${e.icon} Field ${e.icon} ]`, e.color, 0.6));
        playSE('buff');
        await sleep(400);
    };
    
    if(p1GuardElement) await showGuardFx('p1', p1GuardElement);
    if(p2GuardElement) await showGuardFx('p2', p2GuardElement);

    for(let i=0; i<3; i++) {
        playSE('open');
        const s1 = document.getElementById(`p1-slot-${i}`);
        const s2 = document.getElementById(`p2-slot-${i}`);
        if (s1 && s1.querySelector('.card-inner')) s1.querySelector('.card-inner').classList.add('is-flipped'); 
        if (s2 && s2.querySelector('.card-inner')) s2.querySelector('.card-inner').classList.add('is-flipped'); 
        await sleep(500);
        
        let adv = (c1A[i].element==='FIRE'&&c2A[i].element==='THUNDER')||(c1A[i].element==='THUNDER'&&c2A[i].element==='WATER')||(c1A[i].element==='WATER'&&c2A[i].element==='FIRE')?1:(c1A[i].element===c2A[i].element?0:-1);
        let p1=c1A[i].power, p2=c2A[i].power;
        
        const bonus = ((c1A[i].power * 7 + c2A[i].power * 3 + i * 5) % 5) + 1;

        const buff = async (sl, pw, el, bns) => { 
            if (!sl) return;
            playSE('buff'); const f = sl.querySelector('.card-front'); const ed = ELEMENTS.find(e=>e.id===el);
            const flash = document.createElement('div'); flash.className = "glow-overlay";
            f.appendChild(flash); flash.offsetHeight; flash.style.opacity = '1'; await sleep(200);
            f.querySelector('.power-val').textContent = pw; f.querySelector('.power-val').style.color = ed.color; f.style.color = ed.color; f.style.borderColor = ed.color; f.style.borderWidth = '4px';
            if (canvas) {
                const r = sl.getBoundingClientRect(), c = canvas.getBoundingClientRect(); 
                activeEffects.push(new PopUpText(r.left-c.left+r.width/2, r.top-c.top-10, `+${bns}`, ed.color, 0.7)); 
            }
            flash.style.opacity = '0'; await sleep(300); flash.remove();
        };
        
        if (adv===1) { p1+=bonus; p1WinCount++; await buff(s1, p1, c1A[i].element, bonus); } 
        else if (adv===-1) { p2+=bonus; p2WinCount++; await buff(s2, p2, c2A[i].element, bonus); }
        
        p1Tot+=p1; p2Tot+=p2; 
        if(p1>m1.power) m1={element:c1A[i].element,power:p1}; 
        if(p2>m2.power) m2={element:c2A[i].element,power:p2};
        
        const addStar = (slotEl) => {
            if (!slotEl) return;
            const star = document.createElement('div');
            star.className = "absolute -bottom-5 left-1/2 transform -translate-x-1/2 text-yellow-400 text-lg drop-shadow-[0_0_8px_rgba(250,204,21,1)] z-20 animate-pulse";
            star.textContent = "★";
            slotEl.appendChild(star);
            playSE('select');
        };
        
        if (p1 > p2) {
            p1RoundWins++;
            addStar(s1);
        } else if (p2 > p1) {
            p2RoundWins++;
            addStar(s2);
        } else {
            const drawTxt = document.createElement('div');
            drawTxt.className = "absolute -bottom-4 left-1/2 transform -translate-x-1/2 text-gray-500 text-[9px] font-bold z-20 tracking-widest bg-black/60 px-1 rounded border border-gray-700";
            drawTxt.textContent = "DRAW";
            if (s1) s1.appendChild(drawTxt.cloneNode(true));
            if (s2) s2.appendChild(drawTxt);
        }

        const p1TotalEl = document.getElementById('p1-total');
        const p2TotalEl = document.getElementById('p2-total');
        if (p1TotalEl) p1TotalEl.innerHTML = `<span class="text-yellow-400">${p1RoundWins}勝</span> <span class="text-[10px] text-gray-400">(計${p1Tot})</span>`; 
        if (p2TotalEl) p2TotalEl.innerHTML = `<span class="text-yellow-400">${p2RoundWins}勝</span> <span class="text-[10px] text-gray-400">(計${p2Tot})</span>`; 
        await sleep(400);
    }
    await sleep(500);

    let p1Win = false, p2Win = false, isDraw = false;
    if (p1RoundWins > p2RoundWins) p1Win = true;
    else if (p2RoundWins > p1RoundWins) p2Win = true;
    else {
        if (p1Tot > p2Tot) p1Win = true;
        else if (p2Tot > p1Tot) p2Win = true;
        else isDraw = true;
    }

    const atk = (sId, eId, el) => new Promise(res => {
        const sEl = document.getElementById(sId), eEl = document.getElementById(eId);
        if (!sEl || !eEl || !canvas) { res(); return; }
        const s = sEl.getBoundingClientRect(), e = eEl.getBoundingClientRect(), c = canvas.getBoundingClientRect();
        const sx=s.left+s.width/2-c.left, sy=s.top+s.height/2-c.top, ex=e.left+e.width/2-c.left, ey=e.top+e.height/2-c.top;
        const ed=ELEMENTS.find(x=>x.id===el); activeEffects.push(new FlashBang());
        if(el==='THUNDER') playSE('thunder'); else if(el==='FIRE') playSE('fire'); else playSE('water');
        const onHit = () => { document.body.classList.add('earthquake'); setTimeout(()=>document.body.classList.remove('earthquake'), 400); for(let i=0;i<30;i++) activeEffects.push(new Particle(ex, ey, ed)); res(); };
        if(el==='THUNDER') activeEffects.push(new Lightning(sx,sy,ex,ey,onHit)); else activeEffects.push(new Projectile(sx,sy,ex,ey,ed,onHit));
    });

    if (!isDraw) {
        let isCritical = (p1Win && (p1WinCount === 3 || p1RoundWins === 3)) || (!p1Win && (p2WinCount === 3 || p2RoundWins === 3));
        if (isCritical) {
            activeEffects.push(new CriticalFlash());
            playSE('alert');
            await sleep(800);
        }

        await atk(p1Win?'p1-player-card':'p2-player-card', p1Win?'p2-player-card':'p1-player-card', p1Win?m1.element:m2.element);
        
        const targetCard = document.getElementById(p1Win?'p2-player-card':'p1-player-card');
        if (targetCard) {
            targetCard.classList.add('shake'); 
            setTimeout(()=>targetCard.classList.remove('shake'), 400);
        }
        
        let wStat = p1Win ? st1 : st2; let lStat = p1Win ? st2 : st1;
        
        let diff = Math.abs(p1Tot - p2Tot);
        if (diff === 0) diff = 10;
        let baseDmg = Math.max(diff * 20, (diff * 100) + wStat.atk - Math.floor(lStat.def / 2));
        if (isCritical) baseDmg = Math.floor(baseDmg * 1.5);
        
        let loserGuard = p1Win ? p2GuardElement : p1GuardElement;
        let winnerMainElement = p1Win ? m1.element : m2.element;
        let loserGuardPower = p1Win ? p2Tot : p1Tot; 

        if (loserGuard && targetCard && canvas) {
            let gAdv = 0;
            if ((loserGuard==='FIRE'&&winnerMainElement==='THUNDER')||(loserGuard==='THUNDER'&&winnerMainElement==='WATER')||(loserGuard==='WATER'&&winnerMainElement==='FIRE')) {
                gAdv = 1; 
            } else if (loserGuard === winnerMainElement) {
                gAdv = 0; 
            } else {
                gAdv = -1; 
            }

            const r2 = targetCard.getBoundingClientRect(), c2 = canvas.getBoundingClientRect();
            const cx = r2.left - c2.left + r2.width / 2;
            const cy = r2.top - c2.top + r2.height / 2;
            const guardEl = ELEMENTS.find(e => e.id === loserGuard);
            
            let reduction = 0;
            let guardText = "";

            if (gAdv === 1) {
                let cutPercent = Math.min(loserGuardPower, 90); 
                reduction = Math.floor(baseDmg * (cutPercent / 100));
                guardText = `GUARD! -${cutPercent}%`;
            } else if (gAdv === 0) {
                reduction = loserGuardPower;
                guardText = `GUARD! -${reduction}`;
            } else {
                guardText = "SHIELD BROKEN!";
            }

            if (gAdv === -1) {
                if(p1Win && p2ShieldFx) p2ShieldFx.kill();
                if(!p1Win && p1ShieldFx) p1ShieldFx.kill();

                playSE('glass'); 
                activeEffects.push(new ShieldBreakEffect(cx, cy, guardEl.color));
                activeEffects.push(new PopUpText(cx, cy + 30, guardText, '#9ca3af', 0.8));
                
                targetCard.classList.add('shake');
                setTimeout(()=>targetCard.classList.remove('shake'), 300);
                await sleep(400);
            } else {
                if (reduction > 0) {
                    activeEffects.push(new AbsorbFlash(cx, cy, r2.width, r2.height));
                    activeEffects.push(new PopUpText(cx, cy + 30, guardText, '#f97316', 0.6));
                    playSE('buff');
                    await sleep(600);
                    baseDmg = Math.max(10, baseDmg - reduction);
                }
            }
        }

        if (targetCard && canvas) {
            const r=targetCard.getBoundingClientRect(), c=canvas.getBoundingClientRect(); 
            activeEffects.push(new PopUpText(r.left-c.left+r.width/2, r.top-c.top-10, `-${baseDmg}`, '#ef4444', 1.2));
        }
        if(p1Win) hp2=Math.max(0,hp2-baseDmg); else hp1=Math.max(0,hp1-baseDmg);
    } else if (canvas) { 
        const c=canvas.getBoundingClientRect(); activeEffects.push(new PopUpText(c.width/2, c.height/2, 'DRAW!', '#9ca3af', 1.5)); 
    }

    const p1HpText = document.getElementById('p1-hp-text');
    const p2HpText = document.getElementById('p2-hp-text');
    const p1HpBar = document.getElementById('p1-hp-bar');
    const p2HpBar = document.getElementById('p2-hp-bar');
    if (p1HpText) p1HpText.textContent = hp1; 
    if (p2HpText) p2HpText.textContent = hp2;
    if (p1HpBar) p1HpBar.style.width = `${Math.max(0, (hp1 / (st1.hp||1500)) * 100)}%`;
    if (p2HpBar) p2HpBar.style.width = `${Math.max(0, (hp2 / (st2.hp||1500)) * 100)}%`;

    if(p1ShieldFx) p1ShieldFx.kill();
    if(p2ShieldFx) p2ShieldFx.kill();

    await sleep(1500);
    return { hp1: hp1, hp2: hp2 };
}

// Result Controls
const btnRestart = document.getElementById('btn-restart');
if (btnRestart) btnRestart.onclick = async () => {
    playSE('btn'); 
    const hostControls = document.getElementById('host-controls');
    if (hostControls) {
        hostControls.classList.add('hidden'); 
        hostControls.classList.remove('flex');
    }
    const rematchNotice = document.getElementById('host-rematch-notice');
    if (rematchNotice) rematchNotice.classList.add('hidden');
    
    const hp1 = myPlayerInfo.stats.hp || 1500; 
    const ref = doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, currentRoomId);
    
    await updateDoc(ref, { guestId: null, p2Info: null, p2Cards: null, p1Hp: hp1, phase: 'waiting', guestWantsRematch: false, updatedAt: new Date() });
};

const btnExitHost = document.getElementById('btn-exit-host');
if (btnExitHost) btnExitHost.onclick = async () => {
    playSE('btn'); if(confirm("解散しますか？")) { await updateDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, currentRoomId), { phase: 'closed', updatedAt: new Date() }); location.reload(); }
};
const btnReqRematch = document.getElementById('btn-request-rematch');
if (btnReqRematch) btnReqRematch.onclick = async () => {
    playSE('btn'); 
    btnReqRematch.classList.add('hidden'); 
    const waitRestartText = document.getElementById('wait-restart-text');
    if (waitRestartText) waitRestartText.classList.remove('hidden');
    await updateDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, currentRoomId), { guestWantsRematch: true, updatedAt: new Date() });
};
const btnExitGuest = document.getElementById('btn-exit-guest');
if (btnExitGuest) btnExitGuest.onclick = async () => {
    playSE('btn'); if(confirm("退出しますか？")) { await updateDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, currentRoomId), { guestId: null, p2Info: null, p2Cards: null, updatedAt: new Date() }); location.reload(); }
};
const btnWaitExit = document.getElementById('btn-wait-exit');
if (btnWaitExit) btnWaitExit.onclick = () => { if (btnExitHost) btnExitHost.click(); };
const btnWaitShowQr = document.getElementById('btn-wait-show-qr');
if (btnWaitShowQr) btnWaitShowQr.onclick = () => { 
    const qrc = document.getElementById('waiting-qr-container');
    if (qrc) {
        qrc.classList.toggle('hidden'); 
        qrc.classList.toggle('flex'); 
    }
};
const btnWaitCopyLink = document.getElementById('btn-wait-copy-link');
if (btnWaitCopyLink) btnWaitCopyLink.onclick = () => { if (copyUrlBtn) copyUrlBtn.click(); };

let isDisconnecting = false;
const handleDisconnect = () => {
    if (isDisconnecting || !currentRoomId) return;
    isDisconnecting = true;
    const ref = doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, currentRoomId);
    if (isHost) { updateDoc(ref, { phase: 'closed', updatedAt: new Date() }).catch(()=>{}); } 
    else { updateDoc(ref, { guestId: null, p2Info: null, p2Cards: null, updatedAt: new Date() }).catch(()=>{}); }
};
window.addEventListener('pagehide', handleDisconnect);
window.addEventListener('beforeunload', handleDisconnect);

initAuth();

// ==========================================
// 【パート1/3】Elemental Clash x AI - game.js
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
    src: ["https://dorayakiwalk.github.io/-/audio/Thebugcan%27tbefixed.mp3"],
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
let globalSettings = { anyoneCanHost: false, subPasswords: [], adminUid: null, adminPassHash: null };

let isMainHost = false;
let isSubHost = false;
let authAction = null; 
let isHostPrivilegeMode = false;
let battleResolved = false; 
let isPlayingVsCpu = false; 

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
let myPlayerInfo = { name: '', iconData: null, cardData: null, stats: { ...defaultStats }, bp: 0 };
let myCollection = [];

const SE = {
    btn: new Howl({src: ['https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3']}),
    select: new Howl({src: ['https://assets.mixkit.co/active_storage/sfx/2573/2573-preview.mp3']}),
    open: new Howl({src: ['https://assets.mixkit.co/active_storage/sfx/2000/2000-preview.mp3']}),
    buff: new Howl({src: ['https://assets.mixkit.co/active_storage/sfx/2003/2003-preview.mp3']}),
    fire: new Howl({src: ['https://assets.mixkit.co/active_storage/sfx/2144/2144-preview.mp3']}),
    thunder: new Howl({src: ['https://assets.mixkit.co/active_storage/sfx/2156/2156-preview.mp3']}),
    water: new Howl({src: ['https://assets.mixkit.co/active_storage/sfx/2149/2149-preview.mp3']}),
    win: new Howl({src: ['https://assets.mixkit.co/active_storage/sfx/2001/2001-preview.mp3']}),
    lose: new Howl({src: ['https://assets.mixkit.co/active_storage/sfx/2002/2002-preview.mp3']}),
    alert: new Howl({src: ['https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3']}),
    glass: new Howl({src: ['https://assets.mixkit.co/active_storage/sfx/2686/2686-preview.mp3']})
};
const playSE = (name) => { try { if(SE[name]) { SE[name].volume(0.5); SE[name].play(); } } catch(e){} };

const ELEMENTS = [
    { id: 'FIRE', icon: '🔥', color: '#ef4444', shadow: '#f97316' },
    { id: 'THUNDER', icon: '⚡', color: '#eab308', shadow: '#fef08a' },
    { id: 'WATER', icon: '💧', color: '#3b82f6', shadow: '#60a5fa' }
];

const uiName = document.getElementById('input-welcome-name');

function checkAndShowWelcome() {
    if (!myPlayerInfo.name || myPlayerInfo.name.trim() === "") {
        document.getElementById('modal-welcome').classList.remove('hidden');
        document.getElementById('welcome-title').textContent = "WELCOME!";
        document.getElementById('welcome-desc').innerHTML = "ELEMENTAL CLASHへようこそ！<br>まずはあなたのプレイヤー名を教えてください。";
        document.getElementById('btn-welcome-close').classList.add('hidden');
    }
}

window.editUserName = function() {
    playSE('btn');
    document.getElementById('modal-welcome').classList.remove('hidden');
    document.getElementById('welcome-title').textContent = "CHANGE NAME";
    document.getElementById('welcome-desc').innerHTML = "新しいプレイヤー名を入力してください。";
    document.getElementById('input-welcome-name').value = myPlayerInfo.name;
    document.getElementById('btn-welcome-close').classList.remove('hidden');
};

document.getElementById('name-display-container').onclick = window.editUserName;

document.getElementById('btn-welcome-close').onclick = () => {
    playSE('btn');
    document.getElementById('modal-welcome').classList.add('hidden');
    document.getElementById('input-welcome-name').value = myPlayerInfo.name;
};

document.getElementById('btn-welcome-submit').onclick = () => {
    playSE('btn');
    const n = document.getElementById('input-welcome-name').value.trim();
    if(n) {
        myPlayerInfo.name = n;
        saveProfile();
        document.getElementById('modal-welcome').classList.add('hidden');
    } else {
        alert("名前を入力してください！");
    }
};

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

function loadProfile() {
    const saved = localStorage.getItem('elem_clash_ai_profile_v3');
    if(saved) {
        try {
            myPlayerInfo = JSON.parse(saved);
            myPlayerInfo.bp = myPlayerInfo.bp || 0;
            uiName.value = myPlayerInfo.name;
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
            icon: myPlayerInfo.iconData 
        }).catch(()=>{});
    }
}

function updateLobbyPreview() {
    try {
        document.getElementById('display-name').textContent = myPlayerInfo.name || "PLAYER";

        if(myPlayerInfo.cardData) {
            document.getElementById('lobby-card-img').src = myPlayerInfo.cardData;
            document.getElementById('lobby-card-img').classList.remove('hidden');
        }
        
        const iconContainer = document.getElementById('mypage-user-icon'); 
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
        
        const stats = myPlayerInfo.stats || defaultStats;
        document.getElementById('lobby-hp').textContent = stats.hp || 0;
        document.getElementById('lobby-atk').textContent = stats.atk || 0;
        document.getElementById('lobby-def').textContent = stats.def || 0;
        document.getElementById('lobby-bp').textContent = myPlayerInfo.bp || 0;
        
        const rBadge = document.getElementById('lobby-rarity');
        const rar = stats.rarity || 'UNRANKED';
        rBadge.textContent = rar;
        rBadge.className = "px-2 py-0.5 bg-black rounded text-[9px] font-black text-gray-500 border border-gray-600 tracking-wider";
        
        if (rar === 'UR++') rBadge.className = "px-2 py-0.5 rounded text-[9px] font-black border bg-red-500/20 text-red-500 border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)] tracking-wider";
        else if (rar === 'UR+') rBadge.className = "px-2 py-0.5 rounded text-[9px] font-black border bg-orange-500/20 text-orange-500 border-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.8)] tracking-wider";
        else if (typeof rar === 'string' && (rar.includes('UR') || rar.includes('SSR'))) rBadge.className = "px-2 py-0.5 rounded text-[9px] font-black border bg-brand-rare/20 text-brand-rare border-brand-rare tracking-wider";
        else if (typeof rar === 'string' && rar.includes('SR')) rBadge.className = "px-2 py-0.5 rounded text-[9px] font-black border bg-brand-epic/20 text-brand-epic border-brand-epic tracking-wider";
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

window.openLoginModal = () => { playSE('btn'); document.getElementById('modal-login').classList.remove('hidden'); };
window.logoutPass = async () => {
    playSE('btn');
    if(confirm("ログアウトしてゲスト状態に戻りますか？\n（デッキや名前はそのままですが、同期は解除されます）")) {
        try { await signOut(auth); location.reload(); } catch(e){}
    }
};

window.signInWithGoogle = async () => {
    playSE('btn');
    const provider = new GoogleAuthProvider();
    try {
        document.getElementById('modal-login').classList.add('hidden');
        await signInWithPopup(auth, provider);
        location.reload();
    } catch (error) {
        console.error(error);
        alert("ログインに失敗しました。");
    }
};
// ==========================================
// 【パート2/3】Elemental Clash x AI - game.js
// ==========================================
const GEMINI_TEXT_MODEL = "gemini-3.6-flash";
const GEMINI_IMAGE_MODEL = "gemini-3.1-flash-image";

let aiTempData = null; 

const aiModal = document.getElementById('modal-ai-generator');
const apiKeyInput = document.getElementById('apiKeyInput');
const apiStatus = document.getElementById('apiStatus');
const apiDemoDesc = document.getElementById('apiDemoDesc');

const savedApiKey = localStorage.getItem('ai_card_gen_apikey_v2');
if(savedApiKey) { 
    apiKeyInput.value = savedApiKey; 
    setApiUIState(true);
}

function renderCollection() {
    try {
        const grid = document.getElementById('collection-grid');
        const empty = document.getElementById('collection-empty');
        const title = document.getElementById('collection-title');
        
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

                    document.getElementById('modal-collection').classList.add('hidden');
                    alert("プロフィールを変更しました！");
                }
            };
            grid.appendChild(card);
        });
    } catch(e) { console.warn("コレクション描画エラーを回避", e); }
}

document.getElementById('btn-goto-vault').onclick = () => {
    playSE('btn');
    window.location.href = "https://dorayakiwalk.github.io/-/CollectionBox.html";
};

document.getElementById('btn-open-collection-sub').onclick = () => {
    playSE('btn'); renderCollection(); document.getElementById('modal-collection').classList.remove('hidden');
};
document.getElementById('btn-ai-collection').onclick = () => { playSE('btn'); renderCollection(); document.getElementById('modal-collection').classList.remove('hidden'); };
document.getElementById('btn-collection-close').onclick = () => { playSE('btn'); document.getElementById('modal-collection').classList.add('hidden'); };

document.getElementById('btn-save-key').addEventListener('click', () => {
    const val = apiKeyInput.value.trim();
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
    if(hasKey) {
        apiStatus.textContent = "✅ 接続済み";
        apiStatus.className = "text-[10px] text-emerald-400 font-mono";
        apiDemoDesc.classList.add('hidden');
        document.getElementById('apiInputContainer').classList.add('hidden'); 
        apiStatus.parentElement.classList.add('cursor-pointer');
        apiStatus.parentElement.onclick = () => document.getElementById('apiInputContainer').classList.toggle('hidden');
    } else {
        apiStatus.textContent = "⚠️ デモモード";
        apiStatus.className = "text-[10px] text-yellow-400 font-mono";
        apiDemoDesc.classList.remove('hidden');
        document.getElementById('apiInputContainer').classList.remove('hidden');
        apiStatus.parentElement.onclick = null;
        apiStatus.parentElement.classList.remove('cursor-pointer');
    }
}

function checkAiLimit() {
    if(!apiKeyInput.value.trim() || isHostPrivilegeMode) return true;
    const last = localStorage.getItem('ai_card_gen_last_date');
    if(last !== new Date().toDateString()) { return true; }
    return false;
}

function updateAiStudioUIForPrivilege() {
    const btnEvolve = document.getElementById('btn-ai-evolve');
    if (isHostPrivilegeMode) {
        btnEvolve.innerHTML = `<span class="relative z-10">🔥 管理人特権 覚醒</span><span class="relative z-10 text-[8px] font-normal opacity-70">(確定EX / 消費0)</span>`;
        btnEvolve.className = "py-2 bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-500 hover:to-yellow-400 text-white rounded text-[11px] font-bold border border-yellow-300 shadow-[0_0_15px_rgba(234,179,8,0.6)] transition flex flex-col items-center justify-center leading-tight relative overflow-hidden";
    } else {
        btnEvolve.innerHTML = `<span class="relative z-10">🔥 上位進化生成</span><span class="relative z-10 text-[8px] font-normal opacity-70">(コスト: 10 BP)</span>`;
        btnEvolve.className = "py-2 bg-purple-900/80 hover:bg-purple-800 text-purple-100 rounded text-[11px] font-bold border border-purple-500/50 shadow transition flex flex-col items-center justify-center leading-tight relative overflow-hidden";
    }
}

document.getElementById('btn-admin-ai-studio').onclick = () => { 
    playSE('btn'); 
    isHostPrivilegeMode = true; 
    updateAiStudioUIForPrivilege(); 
    document.getElementById('modal-admin').classList.add('hidden'); 
    
    if(myPlayerInfo.cardData && myPlayerInfo.stats) {
        updateAiCardUI(myPlayerInfo.stats, myPlayerInfo.cardData, myPlayerInfo.iconData);
    }
    aiModal.classList.remove('hidden'); 
};
document.getElementById('btn-ai-close').onclick = () => { playSE('btn'); aiModal.classList.add('hidden'); };

const fileToBase64 = (file) => new Promise((resolve) => { const r = new FileReader(); r.readAsDataURL(file); r.onload = () => resolve(r.result); });

const compressImage = (base64Str, maxW, maxH, quality = 0.8) => new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
        let w = img.width, h = img.height;
        if(w > h) { if(w > maxW) { h *= maxW / w; w = maxW; } } else { if(h > maxH) { w *= maxH / h; h = maxH; } }
        const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.src = base64Str;
});

const extractCustomIcon = (base64Str, tapXRatio = 0.5, tapYRatio = 0.5, zoom = 1.0) => new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
        const canvas = document.createElement('canvas'); canvas.width = 100; canvas.height = 100;
        const ctx = canvas.getContext('2d');
        
        const minSide = Math.min(img.width, img.height);
        const cropSize = minSide / zoom;
        
        let sx = (img.width * tapXRatio) - (cropSize / 2);
        let sy = (img.height * tapYRatio) - (cropSize / 2);
        
        if (sx < 0) sx = 0;
        if (sy < 0) sy = 0;
        if (sx + cropSize > img.width) sx = img.width - cropSize;
        if (sy + cropSize > img.height) sy = img.height - cropSize;
        
        ctx.drawImage(img, sx, sy, cropSize, cropSize, 0, 0, 100, 100);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.src = base64Str;
});

let currentTapX = 0.5; let currentTapY = 0.5; let currentZoom = 1.0;

const cropSlider = document.getElementById('cropSlider');
const cropValText = document.getElementById('cropValText');
const aiImageWrapper = document.getElementById('aiImageWrapper');
const btnToggleZoom = document.getElementById('btn-toggle-zoom');
const zoomLabel = document.getElementById('zoom-label');

cropSlider.addEventListener('input', async (e) => {
    currentZoom = e.target.value / 10;
    cropValText.textContent = `${currentZoom.toFixed(1)}x`;
    zoomLabel.textContent = `x${currentZoom.toFixed(1)}`;
    if (aiTempData && aiTempData.origImage) {
        const newIcon = await extractCustomIcon(aiTempData.origImage, currentTapX, currentTapY, currentZoom);
        document.getElementById('aiCardIcon').src = newIcon;
        aiTempData.iconImage = newIcon;
    }
});

btnToggleZoom.addEventListener('click', async () => {
    currentZoom += 0.5;
    if (currentZoom > 2.5) currentZoom = 1.0; 
    
    cropSlider.value = currentZoom * 10;
    cropValText.textContent = `${currentZoom.toFixed(1)}x`;
    zoomLabel.textContent = `x${currentZoom.toFixed(1)}`;
    
    if (aiTempData && aiTempData.origImage) {
        const newIcon = await extractCustomIcon(aiTempData.origImage, currentTapX, currentTapY, currentZoom);
        document.getElementById('aiCardIcon').src = newIcon;
        aiTempData.iconImage = newIcon;
    }
});

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
    document.getElementById('aiCardIcon').src = newIcon;
    aiTempData.iconImage = newIcon;
});

function showAiLoading(msg) {
    document.getElementById('aiLoadingText').textContent = msg;
    document.getElementById('aiLoadingOverlay').classList.remove('hidden');
    document.getElementById('aiCardContent').classList.add('opacity-0', 'pointer-events-none');
    document.getElementById('iconCropControl').classList.add('hidden'); 
}
function hideAiLoading() {
    document.getElementById('aiLoadingOverlay').classList.add('hidden');
    document.getElementById('aiCardContent').classList.remove('opacity-0', 'pointer-events-none');
    document.getElementById('iconCropControl').classList.remove('hidden'); 
}

async function updateAiCardUI(data, b64Img, preIconB64 = null) {
    try {
        aiTempData = { stats: data, origImage: b64Img };
        
        document.getElementById('aiCardPlaceholder').classList.add('hidden');
        document.getElementById('aiCardImage').src = b64Img;
        document.getElementById('aiCardImage').classList.remove('hidden');
        
        let iconB64 = preIconB64;
        if(!iconB64) {
            currentTapX = 0.5; currentTapY = 0.2; currentZoom = 1.0;
            cropSlider.value = 10; cropValText.textContent = "1.0x"; zoomLabel.textContent = "x1.0";
            iconB64 = await extractCustomIcon(b64Img, currentTapX, currentTapY, currentZoom);
        }
        
        document.getElementById('aiCardIcon').src = iconB64;
        document.getElementById('aiCardIcon').classList.remove('hidden');
        aiTempData.iconImage = iconB64;

        document.getElementById('aiCardName').textContent = data.name || '?';
        document.getElementById('aiCardClass').textContent = data.jobClass || '?';
        const rBadge = document.getElementById('aiCardRarity');
        const rar = data.rarity || 'N';
        rBadge.textContent = rar;
        rBadge.className = "px-1.5 py-0.5 bg-black/80 border rounded text-[10px] font-black italic tracking-wider shadow ";
        
        if (rar === 'UR++') { rBadge.className += "text-red-500 border-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)] bg-red-500/20"; }
        else if (rar === 'UR+') { rBadge.className += "text-orange-500 border-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)] bg-orange-500/20"; }
        else if(typeof rar === 'string' && (rar.includes('UR')||rar.includes('SSR'))) { rBadge.className += "text-brand-rare border-brand-rare shadow-[0_0_8px_rgba(234,179,8,0.6)]"; }
        else if(typeof rar === 'string' && rar.includes('SR')) { rBadge.className += "text-brand-epic border-brand-epic shadow-[0_0_8px_rgba(168,85,247,0.6)]"; }
        else { rBadge.className += "text-slate-300 border-slate-500"; }

        document.getElementById('aiStatHp').textContent = data.hp || 0;
        document.getElementById('aiStatAtk').textContent = data.atk || 0;
        document.getElementById('aiStatDef').textContent = data.def || 0;
        document.getElementById('aiStatSpd').textContent = data.spd || 0;

        const btnApply = document.getElementById('btn-ai-apply');
        btnApply.disabled = false;
        btnApply.classList.remove('opacity-50', 'cursor-not-allowed');
        btnApply.classList.add('animate-pulse');
    } catch(e) { console.warn("AIプレビュー描画エラー", e); }
}

async function analyzeWithGemini(key, base64Img, theme, isEvolution = false, isPrivilege = false) {
    const sys = `TRPGカードゲームのデータメイカー。ステータスを出力してください。
JSONフォーマット厳守:
{"name":"キャラ名","jobClass":"職業","rarity":"N,R,SR,SSR,URのいずれか","hp":数値(1000-7000),"atk":数値(150-700),"def":数値(50-600),"spd":数値(50-600)}`;
    
    const parts = [{ text: `画像解析要求。追加テーマ・希望:${theme||'なし'}` }];
    if(base64Img) parts.push({ inlineData: { mimeType: "image/jpeg", data: base64Img.split(',')[1] } });
    
    const payload = { contents:[{parts}], systemInstruction:{parts:[{text:sys}]}, generationConfig:{responseMimeType:"application/json"} };
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TEXT_MODEL}:generateContent?key=${key}`, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    if(!res.ok) { const err = await res.json(); throw new Error(err.error?.message || "API request failed"); }
    const jsonRes = await res.json();
    return JSON.parse(jsonRes.candidates[0].content.parts[0].text);
}

async function generateImageWithGeminiFlash(key, textPrompt, base64Img = null) {
    let fullPrompt = `${textPrompt}, 3D render style, cinematic lighting, masterpiece`;
    let parts = [{ text: fullPrompt }];
    if (base64Img) {
        parts = [{ text: `このキャラクターを覚醒・進化した姿に描き直してください: ${fullPrompt}` }, { inlineData: { mimeType: "image/jpeg", data: base64Img.split(',')[1] } }];
    }
    const payload = { contents: [{ parts: parts }], generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "3:4" } } };
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${key}`, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    if(!res.ok) { const err = await res.json(); throw new Error(err.error?.message || "API request failed"); }
    const jsonRes = await res.json();
    const part = jsonRes?.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (!part) throw new Error("画像生成結果が空でした");
    return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
}

const runAiDemo = async (type, b64, theme) => {
    showAiLoading("DEMO MODE..."); await sleep(1500);
    const data = { name: "テスト勇者", jobClass: "FIGHTER", rarity: "SR", hp: 2500, atk: 350, def: 250, spd: 250 };
    let img = b64 || "https://images.unsplash.com/photo-1605806616949-1e87b487cb2a?q=80&w=400&auto=format&fit=crop";
    await updateAiCardUI(data, img);
    hideAiLoading();
};

document.getElementById('btn-ai-analyze').onclick = async () => {
    playSE('btn');
    const file = document.getElementById('aiImageInput').files[0];
    if(!file) return alert("画像をアップロードしてください。");
    const key = apiKeyInput.value.trim(); const theme = document.getElementById('aiPromptInput').value;
    const b64 = await fileToBase64(file);
    if(!key) return runAiDemo('analyze', b64, theme); 
    try { 
        showAiLoading("ANALYZING..."); 
        const data = await analyzeWithGemini(key, b64, theme); 
        await updateAiCardUI(data, b64); 
    } catch(e){ alert("エラー: " + e.message); } finally { hideAiLoading(); }
};

document.getElementById('btn-ai-generate').onclick = async () => {
    playSE('btn');
    const theme = document.getElementById('aiPromptInput').value.trim();
    if(!theme) return alert("追加テーマを入力してください。");
    const key = apiKeyInput.value.trim();
    if(!key) return runAiDemo('generate', null, theme);
    try {
        showAiLoading("GENERATING...");
        const b64 = await generateImageWithGeminiFlash(key, theme);
        const data = await analyzeWithGemini(key, b64, theme);
        await updateAiCardUI(data, b64); 
    } catch(e) { alert("生成エラー: " + e.message); } finally { hideAiLoading(); }
};

document.getElementById('btn-ai-evolve').onclick = async () => {
    playSE('btn');
    const file = document.getElementById('aiImageInput').files[0];
    const baseImg = file ? await fileToBase64(file) : myPlayerInfo.cardData; 
    if(!baseImg) return alert("ベースとなる画像がありません。");
    const theme = document.getElementById('aiPromptInput').value.trim();
    const key = apiKeyInput.value.trim();
    if(!key) return runAiDemo('evolve', baseImg, theme);
    try {
        showAiLoading("EVOLVING...");
        const evolvedB64 = await generateImageWithGeminiFlash(key, theme || '覚醒', baseImg);
        const data = await analyzeWithGemini(key, evolvedB64, theme, true, true);
        await updateAiCardUI(data, evolvedB64); 
    } catch(e) { alert("進化エラー: " + e.message); } finally { hideAiLoading(); }
};

document.getElementById('btn-ai-apply').onclick = async () => {
    playSE('btn');
    if(!aiTempData) return;
    const compressedCard = await compressImage(aiTempData.origImage, 400, 560, 0.7);
    const compressedIcon = await compressImage(aiTempData.iconImage, 100, 100, 0.8);
    myPlayerInfo.cardData = compressedCard;
    myPlayerInfo.iconData = compressedIcon;
    myPlayerInfo.stats = aiTempData.stats;
    saveProfile();
    
    const newCardData = { stats: aiTempData.stats, origImage: compressedCard, iconImage: compressedIcon, id: Date.now() };
    if (isCloudMode && currentUserAccount) {
        try {
            await setDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', 'accounts', currentUserAccount.id, 'cards', String(newCardData.id)), newCardData);
            let newDeckIds = [newCardData.id, ...(currentUserAccount.deckIds || [])];
            if(newDeckIds.length > 20) newDeckIds = newDeckIds.slice(0, 20); 
            await updateDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', 'accounts', currentUserAccount.id), { deckIds: newDeckIds, cardCount: increment(1) });
            myCollection.unshift(newCardData);
        } catch(e) { console.error(e); }
    } else {
        myCollection.unshift(newCardData);
        localStorage.setItem('elem_clash_ai_col_v1', JSON.stringify(myCollection));
    }
    alert("プロフィールにAIカードをセットし、図鑑にも追加しました！");
    aiModal.classList.add('hidden');
};

function generateSafeQR(elementId, text) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.innerHTML = ''; 
    try {
        if (text.length > 1000) {
            el.innerHTML = '<div class="text-[10px] text-red-500 text-center p-2">制限のためQR不可</div>';
            return;
        }
        new QRCode(el, { text: text, width: 128, height: 128, correctLevel: QRCode.CorrectLevel.L });
    } catch (e) { el.innerHTML = '<div class="text-[10px] text-red-500 text-center">QR生成エラー</div>'; }
}

async function initAuth() { 
    try {
        onSnapshot(doc(db, 'artifacts', appIdStr, 'public', 'data', 'global', 'settings'), snap => {
            if(snap.exists()) {
                globalSettings = snap.data();
                if (globalSettings.cardBackUrl !== undefined) {
                    globalCardBackUrl = globalSettings.cardBackUrl;
                    updateAllCardBacks(); 
                }
                const tgl = document.getElementById('btn-toggle-anyone');
                if(globalSettings.anyoneCanHost) { tgl.classList.replace('bg-red-500', 'bg-green-500'); tgl.firstChild.classList.replace('left-1', 'left-7'); } 
                else { tgl.classList.replace('bg-green-500', 'bg-red-500'); tgl.firstChild.classList.replace('left-7', 'left-1'); }
                renderSubpassList(); 
                
                const savedAuth = sessionStorage.getItem('elem_clash_host_auth');
                if (savedAuth === 'main') isMainHost = true;
                else if (savedAuth === 'sub') isSubHost = true;
            } else { setDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', 'global', 'settings'), { anyoneCanHost: false, subPasswords: [] }); }
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
                                    myPlayerInfo = { ...p, name: currentUserAccount.name || p.name, bp: currentUserAccount.coins || p.bp, iconData: currentUserAccount.icon || p.iconData };
                                } catch(e) {}
                            } else {
                                myPlayerInfo.name = currentUserAccount.name || '';
                                myPlayerInfo.bp = currentUserAccount.coins || 0;
                                myPlayerInfo.iconData = currentUserAccount.icon || null;
                            }
                            
                            const deckIds = currentUserAccount.deckIds || [];
                            if (deckIds.length > 0) {
                                let loadedDeck = [];
                                for (let cid of deckIds) {
                                    const cSnap = await getDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', 'accounts', user.uid, 'cards', String(cid)));
                                    if(cSnap.exists()) loadedDeck.push(cSnap.data());
                                }
                                myCollection = loadedDeck;
                            } else { myCollection = []; }
                            updateLobbyPreview();
                            updateLoginUI();
                            checkAndShowWelcome(); 
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

function renderSubpassList() {
    const list = document.getElementById('subpass-list');
    list.innerHTML = '';
    if (!globalSettings.subPasswords || globalSettings.subPasswords.length === 0) {
        list.innerHTML = '<div class="text-[10px] text-gray-500 text-center">登録なし</div>';
        return;
    }
    globalSettings.subPasswords.forEach((hash, idx) => {
        const pass = shiftDecode(hash);
        const d = document.createElement('div');
        d.className = "flex justify-between items-center bg-gray-800 p-1 px-2 rounded mb-1";
        d.innerHTML = `<span class="text-xs text-white font-mono">${pass}</span><button class="text-[10px] bg-red-600 text-white px-2 py-0.5 rounded" data-idx="${idx}">削除</button>`;
        d.querySelector('button').onclick = async (e) => {
            const i = e.target.getAttribute('data-idx');
            playSE('btn');
            const newArray = [...globalSettings.subPasswords];
            newArray.splice(i, 1);
            await updateDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', 'global', 'settings'), { subPasswords: newArray });
        };
        list.appendChild(d);
    });
}

let unsubscribeRooms = null;
function startPublicRoomsListener() {
    if(unsubscribeRooms) unsubscribeRooms();
    const listEl = document.getElementById('public-rooms-list');
    const q = query(collection(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL), where('isPublic', '==', true));

    unsubscribeRooms = onSnapshot(q, (snapshot) => {
        listEl.innerHTML = '';
        let activeRooms = [];
        snapshot.forEach(docSnap => {
            const d = docSnap.data();
            if(d && d.phase !== 'closed' && (d.phase === 'waiting' || d.phase === 'action') && (!d.guestId || d.guestId === 'CPU_BOT')) {
                activeRooms.push({ id: docSnap.id, data: d });
            }
        });
        if(activeRooms.length === 0) {
            listEl.innerHTML = '<div class="text-[10px] text-gray-600 text-center py-4 font-bold absolute inset-0 flex items-center justify-center">NO ROOMS AVAILABLE</div>';
            return;
        }
        activeRooms.forEach(roomInfo => {
            const d = roomInfo.data;
            const roomId = roomInfo.id;
            const p1 = d.p1Info || {};
            const safeName = p1.name || 'UNKNOWN';
            
            const el = document.createElement('div');
            el.className = "flex items-center justify-between bg-gray-800 p-1.5 rounded mb-1.5 border border-gray-600 shadow-sm";
            el.innerHTML = `
                <div class="flex items-center gap-2">
                    <div class="w-8 h-8 rounded-full bg-gray-700 overflow-hidden border flex items-center justify-center text-xs">${safeName.charAt(0)}</div>
                    <div class="flex flex-col"><span class="text-[11px] font-bold text-white">${safeName}</span><span class="text-[8px] text-gray-400 font-mono">ID: ${roomId}</span></div>
                </div>
                <button class="bg-blue-600 text-white text-[10px] font-bold px-4 py-2 rounded btn-quick-join" data-id="${roomId}">参加</button>
            `;
            el.querySelector('.btn-quick-join').onclick = (e) => {
                playSE('btn');
                document.getElementById('input-room').value = e.target.getAttribute('data-id');
                document.getElementById('btn-join').click();
            };
            listEl.appendChild(el);
        });
    });
                              }
// ==========================================
// 【パート3/3】Elemental Clash x AI - game.js
// ==========================================

const appUrl = window.location.origin + window.location.pathname;
const urlParams2 = new URLSearchParams(window.location.search);
const roomParam2 = urlParams2.get('room');
if (roomParam2) { document.getElementById('input-room').value = roomParam2; }

document.getElementById('btn-toggle-bgm').onclick = () => {
    playSE('btn');
    isBgmMuted = !isBgmMuted;
    document.getElementById('btn-toggle-bgm').textContent = isBgmMuted ? "🔇" : "🔊";
    if(isBgmMuted) battleBgm.pause();
    else if(currentPhase !== 'lobby' && currentPhase !== 'result') battleBgm.play();
};

document.getElementById('btn-show-qr').onclick = () => { playSE('btn'); document.getElementById('modal-qr').classList.remove('hidden'); };
document.getElementById('btn-qr-close').onclick = () => { playSE('btn'); document.getElementById('modal-qr').classList.add('hidden'); };

document.getElementById('btn-copy-url').onclick = async () => { 
    playSE('btn');
    const u = document.getElementById('input-app-url').value;
    try {
        if(navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(u); }
        else { const t = document.createElement("textarea"); t.value = u; t.style.position = "fixed"; t.style.left = "-999999px"; t.style.top = "-999999px"; document.body.appendChild(t); t.focus(); t.select(); document.execCommand('copy'); t.remove(); }
        setTimeout(() => alert("URLをコピーしました！"), 100);
    } catch(e) { alert("コピーに失敗しました。"); }
};

document.getElementById('btn-admin-close').onclick = () => { playSE('btn'); document.getElementById('modal-admin').classList.add('hidden'); };

document.getElementById('btn-show-admin').onclick = async () => { 
    playSE('btn'); 
    
    if (globalSettings.adminUid && currentUserAccount && currentUserAccount.id === globalSettings.adminUid) {
        isMainHost = true;
        document.getElementById('btn-admin-ai-studio').classList.remove('hidden');
        document.getElementById('modal-admin').classList.remove('hidden');
        return;
    }
    
    const savedAuth = sessionStorage.getItem('elem_clash_host_auth');
    if (savedAuth === 'main') {
        isMainHost = true;
        document.getElementById('btn-admin-ai-studio').classList.remove('hidden');
        document.getElementById('modal-admin').classList.remove('hidden');
        return;
    } else if (savedAuth === 'sub') {
        isSubHost = true;
        document.getElementById('btn-admin-ai-studio').classList.add('hidden'); 
        document.getElementById('modal-admin').classList.remove('hidden');
        return;
    }

    if (!globalSettings.adminUid) {
        if (!currentUserAccount) {
            alert("【初期設定】\nまずは「DORA-PASS連携」からGoogleアカウントでログインしてください。");
            return;
        }
        if (confirm(`【初期設定】\n現在のアカウント（${currentUserAccount.name}）を管理者として登録しますか？`)) {
            const settingsRef = doc(db, 'artifacts', appIdStr, 'public', 'data', 'global', 'settings');
            await setDoc(settingsRef, { adminUid: currentUserAccount.id }, { merge: true });
            alert("管理者として登録されました！");
            isMainHost = true;
            document.getElementById('btn-admin-ai-studio').classList.remove('hidden');
            document.getElementById('modal-admin').classList.remove('hidden');
        }
        return;
    }

    authAction = 'admin';
    document.getElementById('input-emergency-pass').value = '';
    document.getElementById('modal-emergency-auth').classList.remove('hidden');
};

document.getElementById('btn-create').addEventListener('click', () => {
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
    document.getElementById('input-emergency-pass').value = '';
    document.getElementById('modal-emergency-auth').classList.remove('hidden'); 
});

window.submitEmergencyAuth = () => {
    playSE('btn');
    const pass = document.getElementById('input-emergency-pass').value;
    const hashed = shiftEncode(pass);
    
    if (globalSettings.adminPassHash && hashed === globalSettings.adminPassHash) {
        isMainHost = true;
        sessionStorage.setItem('elem_clash_host_auth', 'main');
        document.getElementById('modal-emergency-auth').classList.add('hidden');
        if (authAction === 'admin') {
            document.getElementById('btn-admin-ai-studio').classList.remove('hidden');
            document.getElementById('modal-admin').classList.remove('hidden');
        } else if (authAction === 'create') { doCreateRoom(); }
    } else if (globalSettings.subPasswords && globalSettings.subPasswords.includes(hashed)) {
        isSubHost = true;
        sessionStorage.setItem('elem_clash_host_auth', 'sub');
        document.getElementById('modal-emergency-auth').classList.add('hidden');
        if (authAction === 'admin') {
            document.getElementById('btn-admin-ai-studio').classList.add('hidden');
            document.getElementById('modal-admin').classList.remove('hidden');
        } else if (authAction === 'create') { doCreateRoom(); }
    } else { alert("パスワードが違います。"); }
};

document.getElementById('btn-toggle-anyone').onclick = async () => {
    playSE('btn');
    const newVal = !globalSettings.anyoneCanHost;
    try { await updateDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', 'global', 'settings'), { anyoneCanHost: newVal }); } catch(e) {}
};

document.getElementById('btn-add-subpass').onclick = async () => {
    playSE('btn');
    const pass = document.getElementById('input-subpass').value.trim();
    if(!pass) return alert("パスワードを入力してください");
    const hashed = shiftEncode(pass);
    const newArray = [...(globalSettings.subPasswords || []), hashed];
    await updateDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', 'global', 'settings'), { subPasswords: newArray });
    document.getElementById('input-subpass').value = '';
    alert("追加しました");
};

document.getElementById('btn-delete-zombies').onclick = async () => {
    playSE('btn');
    if(!confirm("古い部屋を一括削除しますか？")) return;
    const snap = await getDocs(collection(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL));
    let count = 0; const promises = [];
    snap.forEach(d => { promises.push(deleteDoc(d.ref)); count++; });
    await Promise.all(promises);
    alert(`${count}件の部屋を削除しました。`);
};

document.getElementById('btn-reset-ranking').onclick = async () => {
    playSE('btn');
    if(!confirm("ランキングをリセットしますか？")) return;
    const snap = await getDocs(collection(db, 'artifacts', appIdStr, 'public', 'data', 'rankings'));
    const promises = [];
    snap.forEach(d => promises.push(deleteDoc(d.ref)));
    await Promise.all(promises);
    alert("ランキングをリセットしました。");
};

document.getElementById('btn-show-ranking').onclick = async () => { 
    playSE('btn'); 
    document.getElementById('modal-ranking').classList.remove('hidden'); 
    const listEl = document.getElementById('ranking-list');
    listEl.innerHTML = '<div class="text-center text-gray-500 py-4 text-sm animate-pulse">読み込み中...</div>';
    
    try {
        const q = query(collection(db, 'artifacts', appIdStr, 'public', 'data', 'rankings'), orderBy('wins', 'desc'), limit(15));
        const snap = await getDocs(q);
        if(snap.empty) { listEl.innerHTML = '<div class="text-center text-gray-500 py-4 text-sm">まだ対戦記録がありません</div>'; return; }
        let html = ''; let rank = 1;
        snap.forEach(documentSnapshot => {
            const d = documentSnapshot.data();
            html += `
                <div class="flex items-center justify-between bg-gray-900 p-3 rounded mb-2 border border-gray-700 shadow-md">
                    <div class="flex items-center gap-3">
                        <div class="text-xl font-black text-yellow-400 w-6 text-center">${rank}</div>
                        <div class="w-10 h-10 rounded-full bg-gray-700 overflow-hidden border flex items-center justify-center">
                            ${d.iconData ? (d.iconData.startsWith('http') || d.iconData.startsWith('data:image') ? `<img src="${d.iconData}" class="w-full h-full object-cover">` : d.iconData) : '👤'}
                        </div>
                        <div class="font-bold text-sm text-white">${d.name || 'UNKNOWN'}</div>
                    </div>
                    <div class="font-black text-yellow-400 text-xl">${d.wins} <span class="text-[10px] text-gray-500">WINS</span></div>
                </div>
            `;
            rank++;
        });
        listEl.innerHTML = html;
    } catch(e) { listEl.innerHTML = '<div class="text-center text-red-500 py-4 text-sm">エラーが発生しました</div>'; }
};

document.getElementById('btn-ranking-close').onclick = () => { playSE('btn'); document.getElementById('modal-ranking').classList.add('hidden'); };

async function updateRankingStats(uid, name, iconData) {
    if(!uid || uid === 'CPU_BOT') return; 
    try {
        const ref = doc(db, 'artifacts', appIdStr, 'public', 'data', 'rankings', uid);
        await setDoc(ref, { name: name || 'NO NAME', iconData: iconData || null, wins: increment(1), lastUpdate: new Date() }, { merge: true });
    } catch(e) {}
}

document.getElementById('btn-show-emotes').onclick = () => { playSE('btn'); document.getElementById('modal-emotes').classList.toggle('hidden'); };
document.getElementById('btn-close-emotes').onclick = () => { playSE('btn'); document.getElementById('modal-emotes').classList.add('hidden'); };

document.querySelectorAll('.emote-btn').forEach(btn => {
    btn.onclick = async (e) => {
        playSE('btn');
        document.getElementById('modal-emotes').classList.add('hidden');
        if(!currentRoomId) return;
        const emote = e.target.getAttribute('data-emote');
        const field = isHost ? 'p1Emote' : 'p2Emote';
        await setDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, currentRoomId, 'emotes', 'latest'), { [field]: { emoji: emote, time: Date.now() } }, { merge: true });
    };
});

let emoteUnsub = null; let lastP1EmoteTime = 0; let lastP2EmoteTime = 0;
function startEmoteListener(roomId) {
    if(emoteUnsub) emoteUnsub();
    lastP1EmoteTime = 0; lastP2EmoteTime = 0;
    emoteUnsub = onSnapshot(doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, roomId, 'emotes', 'latest'), snap => {
        const d = snap.data(); if(!d) return;
        if (d.p1Emote && d.p1Emote.time > lastP1EmoteTime) { lastP1EmoteTime = d.p1Emote.time; showEmote('p1', d.p1Emote.emoji); }
        if (d.p2Emote && d.p2Emote.time > lastP2EmoteTime) { lastP2EmoteTime = d.p2Emote.time; showEmote('p2', d.p2Emote.emoji); }
    });
}

function showEmote(player, emoji) {
    const container = document.getElementById(`${player}-area`);
    if(!container) return;
    const bubble = document.createElement('div');
    bubble.className = 'emote-bubble'; bubble.textContent = emoji;
    bubble.style.left = '50%'; bubble.style.top = '-10px'; bubble.style.marginLeft = '-1rem'; 
    container.appendChild(bubble);
    setTimeout(() => { if(bubble.parentNode) bubble.remove(); }, 2000);
}

function switchView(v) {
    document.getElementById('lobby-ui').classList.add('hidden'); 
    document.getElementById('battle-field').classList.add('hidden'); 
    document.getElementById('hand-ui').classList.add('hidden');
    const topBtns = document.getElementById('top-buttons');
    
    if(v==='lobby') { 
        document.getElementById('lobby-ui').classList.remove('hidden'); 
        showWaiting(false); 
        document.getElementById('btn-surrender').classList.add('hidden'); 
        document.getElementById('btn-show-emotes').classList.add('hidden');
        if(topBtns) topBtns.classList.remove('hidden');
    } else if(v==='hand') { 
        document.getElementById('battle-field').classList.remove('hidden'); 
        document.getElementById('hand-ui').classList.remove('hidden'); 
        showWaiting(false); 
        document.getElementById('btn-show-emotes').classList.remove('hidden');
        if(topBtns) topBtns.classList.add('hidden');
    }
}

function showWaiting(s, withQR = false) { 
    const ov = document.getElementById('waiting-overlay'); const ctr = document.getElementById('waiting-invite-controls');
    s ? ov.classList.remove('hidden') : ov.classList.add('hidden');
    if(withQR) { 
        ctr.classList.remove('hidden'); 
        document.getElementById('waiting-room-display').classList.remove('hidden');
        document.getElementById('waiting-room-text').textContent = currentRoomId;
        generateSafeQR("qrcode-room", appUrl + "?room=" + currentRoomId); 
    } else { 
        ctr.classList.add('hidden'); 
        document.getElementById('waiting-room-display').classList.add('hidden');
    }
}

function getCpuPlayer() {
    if (myCollection && myCollection.length > 0) {
        const r = Math.floor(Math.random() * myCollection.length);
        return { name: `[CPU] ${myCollection[r].stats.name}`, iconData: myCollection[r].iconImage, cardData: myCollection[r].origImage, stats: myCollection[r].stats };
    }
    return { name: "訓練用ダミー", stats: { hp: 3000, atk: 400, def: 200, spd: 300, rarity: "R", jobClass: "FIGHTER" } };
}

function getCpuHand() { return [rndCard(), rndCard(), rndCard()]; }

document.getElementById('btn-play-cpu').onclick = async () => {
    playSE('btn');
    if(!currentRoomId || !isHost) return;
    isPlayingVsCpu = true;
    const cpuInfo = getCpuPlayer();
    const cpuHp = cpuInfo.stats.hp || 2000;
    
    await updateDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, currentRoomId), { 
        guestId: 'CPU_BOT', p2Info: cpuInfo, p2Hp: cpuHp, p2MaxHp: cpuHp, p2Cards: getCpuHand(), updatedAt: new Date()
    });
};

async function doCreateRoom() {
    currentRoomId = Math.floor(1000 + Math.random() * 9000).toString(); isHost = true; currentPhase = 'waiting'; currentRoomData = null;
    isPlayingVsCpu = false; 
    document.getElementById('room-id-text').textContent = currentRoomId; document.getElementById('room-display').classList.remove('hidden');
    
    const hp = (myPlayerInfo.stats && myPlayerInfo.stats.hp) ? myPlayerInfo.stats.hp : 1500;
    const isPublic = document.getElementById('check-public').checked;
    
    await setDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, currentRoomId), { 
        hostId: currentUser.uid, guestId: null, p1Info: myPlayerInfo, p2Info: null, 
        p1Hp: hp, p2Hp: hp, p1MaxHp: hp, p2MaxHp: hp, p1Cards: null, p2Cards: null, 
        phase: 'waiting', isPublic: isPublic, createdAt: new Date(), updatedAt: new Date()
    });
    
    document.getElementById('p1-status').textContent="YOU"; 
    document.getElementById('p1-status').className="text-[10px] font-black bg-blue-900/80 px-2 py-0.5 rounded border border-blue-500 mb-2";
    
    startListener(currentRoomId); startEmoteListener(currentRoomId); 
    drawHand(); switchView('hand'); showWaiting(true, true); playBattleBgm();
}

document.getElementById('btn-join').addEventListener('click', async () => {
    playSE('btn'); if(!currentUser) return; saveProfile();
    const id = document.getElementById('input-room').value.trim(); if(!id) return;
    const ref = doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, id);
    const snap = await getDoc(ref);
    
    if (snap.exists() && snap.data().phase !== 'closed') {
        const d = snap.data();
        if (!d.guestId || d.guestId === 'CPU_BOT') {
            isHost = false; currentRoomId = id; currentPhase = 'waiting'; currentRoomData = null;
            isPlayingVsCpu = false;
            
            document.getElementById('room-id-text').textContent = id; document.getElementById('room-display').classList.remove('hidden');
            document.getElementById('p2-status').textContent="YOU"; 
            document.getElementById('p2-status').className="text-[10px] font-black bg-blue-900/80 px-2 py-0.5 rounded border border-blue-500 mb-2";
            
            const myHp = (myPlayerInfo.stats && myPlayerInfo.stats.hp) ? myPlayerInfo.stats.hp : 1500;
            await updateDoc(ref, { guestId: currentUser.uid, p2Info: myPlayerInfo, p2Hp: myHp, p2MaxHp: myHp, p1Hp: d.p1Hp, p1Cards: null, p2Cards: null, phase: 'waiting', updatedAt: new Date() });
            
            startListener(id); startEmoteListener(id); drawHand(); switchView('hand'); playBattleBgm();
        } else { alert("満員です"); }
    } else { alert("部屋が存在しません"); }
});

document.getElementById('btn-surrender').onclick = async () => {
    playSE('btn');
    if (isAnimating) return alert("バトル中は降伏できません！");
    if (!confirm("降伏して退出しますか？")) return;
    if (!currentRoomId) return;
    await updateDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, currentRoomId), Object.assign(isHost ? { p1Hp: 0 } : { p2Hp: 0 }, { updatedAt: new Date() }));
};

function applyPlayerUI(prefix, info, defName) {
    try {
        if(!info) {
            document.getElementById(`${prefix}-name`).textContent = defName;
            document.getElementById(`${prefix}-icon`).innerHTML = defName.charAt(0);
            document.getElementById(`${prefix}-card-img`).classList.add('hidden');
            document.getElementById(`${prefix}-stats-badge`).classList.add('hidden');
            document.getElementById(`${prefix}-rarity-badge`).classList.add('hidden');
            return;
        }
        document.getElementById(`${prefix}-name`).textContent = info.name || defName;
        let iconHtml = info.name ? info.name.charAt(0) : defName.charAt(0);
        if(info.iconData) {
            if(info.iconData.startsWith('http') || info.iconData.startsWith('data:image')) {
                iconHtml = `<img src="${info.iconData}" class="w-full h-full object-cover">`;
            } else { iconHtml = info.iconData; }
        }
        document.getElementById(`${prefix}-icon`).innerHTML = iconHtml;
        if(info.cardData) { document.getElementById(`${prefix}-card-img`).src = info.cardData; document.getElementById(`${prefix}-card-img`).classList.remove('hidden'); }
        
        const stats = info.stats || defaultStats;
        document.getElementById(`${prefix}-stats-badge`).classList.remove('hidden');
        document.getElementById(`${prefix}-atk-val`).textContent = stats.atk || 0;
        document.getElementById(`${prefix}-def-val`).textContent = stats.def || 0;
        document.getElementById(`${prefix}-spd-val`).textContent = stats.spd || 0;
        
        const rb = document.getElementById(`${prefix}-rarity-badge`);
        rb.textContent = stats.rarity || 'N'; rb.classList.remove('hidden');
    } catch(e) {}
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function startListener(id) {
    if(window._roomUnsub) window._roomUnsub();
    window._roomUnsub = onSnapshot(doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, id), async snap => {
        const d = snap.data(); if(!d) return;
        if(isAnimating) { pendingSnapshot = d; return; }
        await processGameData(d);
    });
}

async function processGameData(d) {
    currentRoomData = d; 
    applyPlayerUI('p1', d.p1Info, 'HOST');
    applyPlayerUI('p2', d.p2Info, 'GUEST');

    if(d.phase === 'closed' && !isHost) { alert("解散されました。"); location.reload(); return; }

    const surrenderBtn = document.getElementById('btn-surrender');
    if (currentRoomId && currentPhase !== 'lobby' && d.phase !== 'result' && d.phase !== 'closed') { surrenderBtn.classList.remove('hidden'); } else { surrenderBtn.classList.add('hidden'); }

    if (d.phase !== 'action') {
        const safeP1Hp = d.p1Hp || 0; const safeP2Hp = d.p2Hp || 0;
        const safeP1MaxHp = d.p1MaxHp || 1500; const safeP2MaxHp = d.p2MaxHp || 1500;
        document.getElementById('p1-hp-text').textContent = Math.max(0, safeP1Hp);
        document.getElementById('p2-hp-text').textContent = Math.max(0, safeP2Hp);
        document.getElementById('p1-hp-bar').style.width = `${Math.max(0, (safeP1Hp / safeP1MaxHp) * 100)}%`;
        document.getElementById('p2-hp-bar').style.width = `${Math.max(0, (safeP2Hp / safeP2MaxHp) * 100)}%`;
    }

    if ((d.p1Hp <= 0 || d.p2Hp <= 0) && d.phase !== 'result' && d.phase !== 'closed' && !isAnimating) {
        if(isHost) {
            let hostWon = d.p1Hp > 0;
            if(hostWon) await updateRankingStats(currentUser.uid, myPlayerInfo.name, myPlayerInfo.iconData);
            await updateDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, currentRoomId), { phase: 'result', updatedAt: new Date() }); 
        }
        return; 
    }

    if (d.phase === 'waiting') {
        battleResolved = false; 
        if (currentPhase !== 'waiting') {
            if (currentPhase === 'result') playBattleBgm();
            currentPhase = 'waiting';
            document.getElementById('result-message').classList.add('hidden', 'opacity-0');
            for(let i=0;i<3;i++){ document.getElementById(`p1-slot-${i}`).innerHTML=''; document.getElementById(`p2-slot-${i}`).innerHTML=''; }
            document.getElementById('p1-total').textContent="0"; document.getElementById('p2-total').textContent="0";
            drawHand(); switchView('hand');
        }
        if(isHost) {
            if (!d.guestId) showWaiting(true, true);
            else showWaiting(false);
            if(d.p1Cards && d.p2Cards) await updateDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, currentRoomId), { phase: 'action', updatedAt: new Date() });
        } else { showWaiting(false); }
        renderHand(); 
    }

    if(d.phase === 'action' && d.p1Cards && d.p2Cards && currentPhase !== 'action') {
        currentPhase = 'action'; isAnimating = true; showWaiting(false); renderHand(); 
        const resultHPs = await runBattle(d.p1Cards, d.p2Cards, d.p1Hp, d.p2Hp, d.p1Info?.stats||defaultStats, d.p2Info?.stats||defaultStats);
        isAnimating = false;

        if(isHost) {
            if (resultHPs.hp1 > 0 && resultHPs.hp2 > 0) {
                await updateDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, currentRoomId), { p1Hp: resultHPs.hp1, p2Hp: resultHPs.hp2, p1Cards: null, p2Cards: null, phase: 'waiting', updatedAt: new Date() });
                if (isPlayingVsCpu) {
                    setTimeout(async () => {
                        await updateDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, currentRoomId), { p2Cards: getCpuHand(), updatedAt: new Date() });
                    }, 500);
                }
            } else {
                await updateDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, currentRoomId), { p1Hp: resultHPs.hp1, p2Hp: resultHPs.hp2, updatedAt: new Date() });
            }
        }
        if (pendingSnapshot) { const ns = pendingSnapshot; pendingSnapshot = null; await processGameData(ns); }
    }

    if(d.phase === 'result') {
        currentPhase = 'result'; fadeOutBattleBgm();
        if(!battleResolved) {
            battleResolved = true;
            if (!isPlayingVsCpu) { myPlayerInfo.bp = (myPlayerInfo.bp || 0) + 1; saveProfile(); }
        }
        document.getElementById('result-message').classList.remove('hidden');
        setTimeout(() => {
            document.getElementById('result-message').classList.remove('opacity-0');
            let win = isHost ? d.p1Hp > 0 : d.p2Hp > 0;
            playSE(win ? 'win' : 'lose');
            document.getElementById('result-text-main').textContent = win ? "WIN!" : "LOSE...";
            if (isHost) {
                document.getElementById('host-controls').classList.remove('hidden'); document.getElementById('host-controls').classList.add('flex');
            } else {
                document.getElementById('guest-controls').classList.remove('hidden'); document.getElementById('guest-controls').classList.add('flex');
            }
        }, 100);
    }
}

const rndCard = () => { const e = ELEMENTS[Math.floor(Math.random()*3)]; return { element: e.id, power: Math.floor(Math.random()*9)+1 }; };
function drawHand() { myHand = [rndCard(), rndCard(), rndCard(), rndCard(), rndCard()]; selectedIndices = []; renderHand(); }

function renderHand() {
    const hc = document.getElementById('hand-cards'); hc.innerHTML = '';
    const isActive = (currentPhase === 'waiting' && !isAnimating && currentRoomData && currentRoomData.guestId && (isHost ? !currentRoomData.p1Cards : !currentRoomData.p2Cards));
    
    myHand.forEach((c, i) => {
        const el = ELEMENTS.find(e => e.id === c.element); const d = document.createElement('div');
        d.className = `hand-card element-${c.element} ${!isActive?'disabled':''}`;
        let idx = selectedIndices.indexOf(i);
        d.innerHTML = `<div class="text-2xl mb-1">${el.icon}</div><div class="text-3xl font-black text-gray-900">${c.power}</div>`;
        if(idx !== -1) { d.classList.add('selected'); d.innerHTML += `<div class="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs z-10">${idx + 1}</div>`; }
        d.onclick = () => {
            if(!isActive) return; playSE('select');
            if(idx !== -1) selectedIndices.splice(idx,1); else if(selectedIndices.length<3) selectedIndices.push(i); renderHand();
        };
        hc.appendChild(d);
    });
    
    const bc = document.getElementById('btn-confirm');
    if(selectedIndices.length === 3 && isActive) { bc.disabled = false; bc.className = "w-full max-w-sm bg-blue-600 text-white font-bold py-3 rounded-lg shadow-lg"; bc.textContent = "CONFIRM 3 CARDS"; }
    else { bc.disabled = true; bc.className = "w-full max-w-sm bg-gray-800 text-gray-500 font-bold py-3 rounded-lg cursor-not-allowed"; bc.textContent = `SELECT CARDS (${selectedIndices.length}/3)`; }
}

document.getElementById('btn-confirm').addEventListener('click', async () => {
    playSE('btn'); if(selectedIndices.length !== 3 || currentPhase !== 'waiting') return;
    const sCards = selectedIndices.map(i => myHand[i]);
    if (currentRoomData) { if (isHost) currentRoomData.p1Cards = sCards; else currentRoomData.p2Cards = sCards; }
    renderHand();

    showWaiting(true, (!currentRoomData.guestId && isHost)); 
    document.getElementById('btn-confirm').textContent = "SET COMPLETED"; document.getElementById('btn-confirm').disabled = true;
    await updateDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, currentRoomId), Object.assign(isHost ? { p1Cards: sCards } : { p2Cards: sCards }, { updatedAt: new Date() }));
});

const canvas = document.getElementById('effect-canvas');
const ctx = canvas.getContext('2d');
let activeEffects = [];
window.addEventListener('resize', () => { canvas.width = canvas.clientWidth; canvas.height = canvas.clientHeight; });
canvas.width = canvas.clientWidth; canvas.height = canvas.clientHeight;

function animateEffects(time) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for(let i = activeEffects.length - 1; i >= 0; i--) { activeEffects[i].update(time); activeEffects[i].draw(ctx); if(activeEffects[i].isDead) activeEffects.splice(i, 1); }
    requestAnimationFrame(animateEffects);
}
requestAnimationFrame(animateEffects);

class PopUpText {
    constructor(x, y, text, color, scale = 1) { this.x=x; this.y=y; this.text=text; this.color=color; this.scaleBase=scale; this.st=performance.now(); this.isDead=false; }
    update(t) { this.p = (t - this.st) / 1200; if(this.p >= 1) this.isDead = true; }
    draw(ctx) {
        let a = 1, dy = -40 * this.p, s = this.scaleBase * (this.p < 0.2 ? 0.5 + 2.5*this.p : 1);
        ctx.save(); ctx.globalAlpha = a; ctx.translate(this.x, this.y + dy); ctx.scale(s, s);
        ctx.font = "900 40px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.lineWidth = 6; ctx.strokeStyle = '#000'; ctx.strokeText(this.text, 0, 0);
        ctx.fillStyle = this.color; ctx.fillText(this.text, 0, 0); ctx.restore();
    }
}
class FlashBang {
    constructor() { this.st = performance.now(); this.isDead = false; }
    update(t) { this.p = (t - this.st) / 300; if (this.p >= 1) this.isDead = true; }
    draw(ctx) { ctx.save(); ctx.fillStyle = `rgba(255,255,255,${1 - this.p})`; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.restore(); }
}
class Particle {
    constructor(x, y, el) { this.sx = x; this.sy = y; this.el = el; this.st = performance.now(); this.isDead = false; this.vx = (Math.random()-0.5)*80; this.vy = (Math.random()-0.5)*80; this.sz = 8; }
    update(t) { this.p = (t - this.st) / 400; if(this.p>=1) this.isDead=true; this.x=this.sx+this.vx*this.p; this.y=this.sy+this.vy*this.p; }
    draw(ctx) { ctx.save(); ctx.globalAlpha = 1-this.p; ctx.fillStyle=this.el.color; ctx.beginPath(); ctx.arc(this.x,this.y,this.sz,0,Math.PI*2); ctx.fill(); ctx.restore(); }
}

async function runBattle(c1A, c2A, hp1, hp2, st1, st2) {
    let p1Tot = 0, p2Tot = 0;
    const mk = c => { const e=ELEMENTS.find(x=>x.id===c.element); return `<div class="card-inner">${getCardBackHTML()}<div class="card-front element-${c.element}"><div class="text-xl mb-1">${e.icon}</div><div class="text-2xl font-black text-gray-900 power-val">${c.power}</div></div></div>`; };
    for(let i=0;i<3;i++){ document.getElementById(`p1-slot-${i}`).innerHTML=mk(c1A[i]); document.getElementById(`p2-slot-${i}`).innerHTML=mk(c2A[i]); }
    await sleep(300);

    for(let i=0; i<3; i++) {
        playSE('open');
        document.getElementById(`p1-slot-${i}`).querySelector('.card-inner').classList.add('is-flipped'); 
        document.getElementById(`p2-slot-${i}`).querySelector('.card-inner').classList.add('is-flipped'); 
        await sleep(500);
        p1Tot += c1A[i].power; p2Tot += c2A[i].power;
        document.getElementById('p1-total').textContent = p1Tot; document.getElementById('p2-total').textContent = p2Tot;
        await sleep(300);
    }
    await sleep(500);

    if (p1Tot !== p2Tot) {
        let p1Win = p1Tot > p2Tot; let diff = Math.abs(p1Tot - p2Tot);
        let baseDmg = diff * 100 + 200;
        const targetCard = document.getElementById(p1Win ? 'p2-player-card' : 'p1-player-card');
        const r = targetCard.getBoundingClientRect(), c = canvas.getBoundingClientRect(); 
        activeEffects.push(new PopUpText(r.left-c.left+r.width/2, r.top-c.top-10, `-${baseDmg}`, '#ef4444', 1.2));
        if(p1Win) hp2 = Math.max(0, hp2 - baseDmg); else hp1 = Math.max(0, hp1 - baseDmg);
    }
    await sleep(1000);
    return { hp1: hp1, hp2: hp2 };
}

document.getElementById('btn-restart').onclick = async () => {
    playSE('btn'); document.getElementById('host-controls').classList.add('hidden');
    const hp1 = myPlayerInfo.stats.hp || 1500; 
    const ref = doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, currentRoomId);
    await updateDoc(ref, { p1Hp: hp1, p2Hp: hp1, p1Cards: null, p2Cards: null, phase: 'waiting', updatedAt: new Date() });
};

document.getElementById('btn-exit-host').onclick = async () => {
    playSE('btn'); if(confirm("解散しますか？")) { await updateDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, currentRoomId), { phase: 'closed', updatedAt: new Date() }); location.reload(); }
};
document.getElementById('btn-exit-guest').onclick = async () => {
    playSE('btn'); if(confirm("退出しますか？")) { await updateDoc(doc(db, 'artifacts', appIdStr, 'public', 'data', ROOM_COL, currentRoomId), { guestId: null, p2Info: null, p2Cards: null, updatedAt: new Date() }); location.reload(); }
};

initAuth();

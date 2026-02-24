// ==========================================
// 1. CẤU HÌNH FIREBASE
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyBvhRRIP3zyPL6htL2fgSAAhks5y6EJB7Y",
    authDomain: "rwparty-24391.firebaseapp.com",
    databaseURL: "https://rwparty-24391-default-rtdb.firebaseio.com",
    projectId: "rwparty-24391",
    storageBucket: "rwparty-24391.firebasestorage.app",
    messagingSenderId: "281506397324",
    appId: "1:281506397324:web:0c5af5bdbb7eeca0588fa9",
    measurementId: "G-HX95ZF61BE"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const wtClient = new WebTorrent();

// ==========================================
// 2. BIẾN TOÀN CỤC & DOM ELEMENTS
// ==========================================
let currentRoomId = null;
let isHost = false;
let currentMagnetUrl = null; 
let currentTorrent = null; 

let audioCtx = null;
let gainNode = null;

const video = document.getElementById('my-video');
const setupSection = document.getElementById('setup-section');
const roomSection = document.getElementById('room-section');
const displayRoomId = document.getElementById('display-room-id');
const roleBadge = document.getElementById('role-badge');
const hostPanel = document.getElementById('host-panel');
const inputVideoUrl = document.getElementById('input-video-url');
const btnLoadVideo = document.getElementById('btn-load-video');
const inputVideoFile = document.getElementById('input-video-file');
const btnUploadVideo = document.getElementById('btn-upload-video');
const uploadStatus = document.getElementById('upload-status');
const uploadText = document.getElementById('upload-text');
const volumeSlider = document.getElementById('volume-slider');
const volPercent = document.getElementById('vol-percent');
const downloadStatus = document.getElementById('download-status');
const downloadSpeed = document.getElementById('download-speed');
const btnFullscreen = document.getElementById('btn-fullscreen');

// ==========================================
// 3. KHUẾCH ĐẠI ÂM THANH & XỬ LÝ LỖI LUỒNG
// ==========================================
function initAudioBooster() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioCtx.createMediaElementSource(video);
        gainNode = audioCtx.createGain();
        source.connect(gainNode);
        gainNode.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    gainNode.gain.value = parseFloat(volumeSlider.value);
}

// Xóa luồng cũ để chống lỗi màn hình đen (Can only pipe to one destination)
function clearVideoSource() {
    if (currentTorrent) {
        currentTorrent.destroy();
        currentTorrent = null;
    }
    video.pause();
    video.removeAttribute('src');
    video.load();
}

volumeSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    volPercent.textContent = Math.round(val * 100) + '%';
    if (gainNode) {
        gainNode.gain.value = val;
    } else {
        video.volume = val > 1 ? 1 : val; // Fallback nếu chưa bật AudioCtx
    }
});

// ==========================================
// 4. LOGIC TOÀN MÀN HÌNH
// ==========================================
btnFullscreen.addEventListener('click', () => {
    if (video.requestFullscreen) {
        video.requestFullscreen();
    } else if (video.webkitRequestFullscreen) { 
        video.webkitRequestFullscreen();
    } else if (video.msRequestFullscreen) { 
        video.msRequestFullscreen();
    }
});

// ==========================================
// 5. LOGIC TẠO & VÀO PHÒNG
// ==========================================
document.getElementById('btn-create-room').addEventListener('click', () => {
    initAudioBooster();
    currentRoomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    isHost = true;

    db.ref('rooms/' + currentRoomId).set({
        videoUrl: '', isTorrent: false, state: 'pause', currentTime: 0, timestamp: Date.now()
    });

    enterRoomUI();
    setupHostFeatures();
});

document.getElementById('btn-join-room').addEventListener('click', () => {
    initAudioBooster();
    const id = document.getElementById('input-room-id').value.trim().toUpperCase();
    if (!id) return alert("Vui lòng nhập ID phòng!");

    db.ref('rooms/' + id).once('value').then(snapshot => {
        if (snapshot.exists()) {
            currentRoomId = id;
            isHost = false;
            enterRoomUI();
            setupViewerFeatures();
        } else {
            alert("Không tìm thấy phòng này!");
        }
    });
});

function enterRoomUI() {
    setupSection.classList.add('hidden');
    roomSection.classList.remove('hidden');
    displayRoomId.textContent = currentRoomId;
    roleBadge.textContent = isHost ? "👑 Chủ phòng" : "👀 Người xem";
}

// ==========================================
// 6. LOGIC CHỦ PHÒNG (HOST)
// ==========================================
function setupHostFeatures() {
    hostPanel.classList.remove('hidden');
    video.setAttribute('controls', 'true');

    // LINK THƯỜNG
    btnLoadVideo.addEventListener('click', () => {
        const url = inputVideoUrl.value.trim();
        if (url) {
            clearVideoSource();
            db.ref('rooms/' + currentRoomId).update({ videoUrl: url, isTorrent: false, state: 'pause', currentTime: 0 });
            video.src = url;
        }
    });

    // P2P (WEBTORRENT)
    btnUploadVideo.addEventListener('click', () => {
        const file = inputVideoFile.files[0];
        if (!file) return alert("Vui lòng chọn một file video!");

        clearVideoSource();
        uploadStatus.classList.remove('hidden');
        uploadText.textContent = "Đang tạo luồng P2P... Vui lòng đợi...";
        btnUploadVideo.disabled = true;

        wtClient.seed(file, (torrent) => {
            currentTorrent = torrent;
            uploadText.textContent = "✅ Đang phát sóng! VUI LÒNG KHÔNG ĐÓNG TAB NÀY.";
            btnUploadVideo.disabled = false;

            db.ref('rooms/' + currentRoomId).update({ 
                videoUrl: torrent.magnetURI, isTorrent: true, state: 'pause', currentTime: 0 
            });

            torrent.files[0].renderTo(video, { autoplay: false });
        });
    });

    // ĐỒNG BỘ
    video.addEventListener('play', () => db.ref('rooms/' + currentRoomId).update({ state: 'play', currentTime: video.currentTime, timestamp: Date.now() }));
    video.addEventListener('pause', () => db.ref('rooms/' + currentRoomId).update({ state: 'pause', currentTime: video.currentTime, timestamp: Date.now() }));
    video.addEventListener('seeked', () => db.ref('rooms/' + currentRoomId).update({ currentTime: video.currentTime, state: video.paused ? 'pause' : 'play', timestamp: Date.now() }));
}

// ==========================================
// 7. LOGIC NGƯỜI XEM (VIEWER) & ĐỒNG BỘ
// ==========================================
function setupViewerFeatures() {
    video.removeAttribute('controls');

    db.ref('rooms/' + currentRoomId).on('value', snapshot => {
        const data = snapshot.val();
        if (!data) return;

        if (data.videoUrl) {
            if (data.isTorrent) {
                if (currentMagnetUrl !== data.videoUrl) {
                    currentMagnetUrl = data.videoUrl;
                    downloadStatus.classList.remove('hidden');
                    clearVideoSource();
                    
                    wtClient.add(data.videoUrl, (torrent) => {
                        currentTorrent = torrent;
                        torrent.on('download', () => {
                            downloadSpeed.textContent = Math.round(torrent.downloadSpeed / 1024);
                        });
                        torrent.files[0].renderTo(video, { autoplay: false });
                    });
                }
            } else {
                downloadStatus.classList.add('hidden');
                if (video.src !== data.videoUrl) {
                    clearVideoSource();
                    video.src = data.videoUrl;
                }
            }
        }

        if (Math.abs(video.currentTime - data.currentTime) > 1.5) {
            video.currentTime = data.currentTime;
        }

        if (data.state === 'play' && video.paused) {
            video.play().catch(e => console.log("Lỗi tự phát: ", e));
        } else if (data.state === 'pause' && !video.paused) {
            video.pause();
        }
    });
}

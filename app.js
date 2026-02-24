// ==========================================
// 1. CẤU HÌNH FIREBASE (DÁN CỦA BẠN VÀO ĐÂY)
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

// Khởi tạo WebTorrent Client
const wtClient = new WebTorrent();

// ==========================================
// 2. BIẾN TOÀN CỤC & DOM ELEMENTS
// ==========================================
let currentRoomId = null;
let isHost = false;
let currentMagnetUrl = null; 
let currentTorrent = null; // Quản lý luồng P2P để dọn dẹp tránh lỗi đen màn hình

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

// ==========================================
// 3. LOGIC SIÊU KHUẾCH ĐẠI ÂM THANH (WEB AUDIO API)
// ==========================================
let audioCtx = null;
let gainNode = null;

function initAudioBooster() {
    // Trình duyệt yêu cầu phải có tương tác của người dùng (click) mới cho bật AudioContext
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
}

// Bắt sự kiện kéo thanh âm lượng cho cả 2 bên
volumeSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    volPercent.textContent = Math.round(val * 100) + '%';
    if (gainNode) {
        gainNode.gain.value = val; // val = 2 nghĩa là 200%, 3 là 300%
    }
});

// Hàm dọn dẹp video cũ để tránh lỗi "Can only pipe to one destination"
function clearVideoSource() {
    if (currentTorrent) {
        wtClient.remove(currentTorrent); // Xóa torrent cũ khỏi bộ nhớ
        currentTorrent = null;
    }
    video.pause();
    video.removeAttribute('src');
    video.load();
}

// ==========================================
// 4. LOGIC TẠO & VÀO PHÒNG
// ==========================================
document.getElementById('btn-create-room').addEventListener('click', () => {
    initAudioBooster(); // Khởi động AudioBooster khi người dùng click
    
    currentRoomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    isHost = true;

    db.ref('rooms/' + currentRoomId).set({
        videoUrl: '',
        isTorrent: false,
        state: 'pause',
        currentTime: 0,
        timestamp: Date.now()
    });

    enterRoomUI();
    setupHostFeatures();
});

document.getElementById('btn-join-room').addEventListener('click', () => {
    initAudioBooster(); // Khởi động AudioBooster khi người dùng click

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
// 5. LOGIC CHỦ PHÒNG (HOST)
// ==========================================
function setupHostFeatures() {
    hostPanel.classList.remove('hidden');
    video.setAttribute('controls', 'true');

    // DÁN LINK THƯỜNG
    btnLoadVideo.addEventListener('click', () => {
        const url = inputVideoUrl.value.trim();
        if (url) {
            clearVideoSource();
            db.ref('rooms/' + currentRoomId).update({ videoUrl: url, isTorrent: false, state: 'pause', currentTime: 0 });
            video.src = url;
        }
    });

    // PHÁT P2P (WEBTORRENT)
    btnUploadVideo.addEventListener('click', () => {
        const file = inputVideoFile.files[0];
        if (!file) return alert("Vui lòng chọn một file video!");

        clearVideoSource(); // Rất quan trọng: Xóa luồng cũ trước khi tạo luồng mới

        uploadStatus.classList.remove('hidden');
        uploadText.textContent = "Đang tạo luồng P2P... Vui lòng đợi...";
        btnUploadVideo.disabled = true;

        wtClient.seed(file, (torrent) => {
            currentTorrent = torrent;
            uploadText.textContent = "✅ Đang phát sóng! VUI LÒNG KHÔNG ĐÓNG TAB NÀY.";
            btnUploadVideo.disabled = false;

            db.ref('rooms/' + currentRoomId).update({ 
                videoUrl: torrent.magnetURI, 
                isTorrent: true, 
                state: 'pause', 
                currentTime: 0 
            });

            // Gắn video vào Host mà không tự động Play (để đồng bộ)
            torrent.files[0].renderTo(video, { autoplay: false });
        });
    });

    // Đồng bộ các sự kiện play/pause/tua
    video.addEventListener('play', () => {
        db.ref('rooms/' + currentRoomId).update({ state: 'play', currentTime: video.currentTime, timestamp: Date.now() });
    });

    video.addEventListener('pause', () => {
        db.ref('rooms/' + currentRoomId).update({ state: 'pause', currentTime: video.currentTime, timestamp: Date.now() });
    });

    video.addEventListener('seeked', () => {
        db.ref('rooms/' + currentRoomId).update({ 
            currentTime: video.currentTime, 
            state: video.paused ? 'pause' : 'play',
            timestamp: Date.now() 
        });
    });
}

// ==========================================
// 6. LOGIC NGƯỜI XEM (VIEWER) & ĐỒNG BỘ
// ==========================================
function setupViewerFeatures() {
    video.removeAttribute('controls');

    db.ref('rooms/' + currentRoomId).on('value', snapshot => {
        const data = snapshot.val();
        if (!data) return;

        // Xử lý nguồn Video
        if (data.videoUrl) {
            if (data.isTorrent) {
                // Chỉ xử lý nếu link P2P thực sự thay đổi
                if (currentMagnetUrl !== data.videoUrl) {
                    currentMagnetUrl = data.videoUrl;
                    downloadStatus.classList.remove('hidden');
                    clearVideoSource(); // Dọn dẹp trước khi nhận luồng mới
                    
                    wtClient.add(data.videoUrl, (torrent) => {
                        currentTorrent = torrent;
                        torrent.on('download', () => {
                            downloadSpeed.textContent = Math.round(torrent.downloadSpeed / 1024);
                        });
                        
                        // Đẩy luồng P2P vào thẻ video
                        torrent.files[0].renderTo(video, { autoplay: false });
                    });
                }
            } else {
                // Xử lý link thường
                downloadStatus.classList.add('hidden');
                if (video.src !== data.videoUrl) {
                    clearVideoSource();
                    video.src = data.videoUrl;
                }
            }
        }

        // Đồng bộ thời gian
        if (Math.abs(video.currentTime - data.currentTime) > 1.5) {
            video.currentTime = data.currentTime;
        }

        // Đồng bộ Play/Pause
        if (data.state === 'play' && video.paused) {
            video.play().catch(e => console.log("Lỗi tự phát: ", e));
        } else if (data.state === 'pause' && !video.paused) {
            video.pause();
        }
    });
}

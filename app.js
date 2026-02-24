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

// Khởi tạo WebTorrent Client
const wtClient = new WebTorrent();

// ==========================================
// 2. BIẾN TOÀN CỤC & DOM ELEMENTS
// ==========================================
let currentRoomId = null;
let isHost = false;
let currentMagnetUrl = null; // Lưu giữ link torrent hiện tại để tránh load lại

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

const viewerControls = document.getElementById('viewer-controls');
const volumeSlider = document.getElementById('volume-slider');
const downloadStatus = document.getElementById('download-status');
const downloadSpeed = document.getElementById('download-speed');

// ==========================================
// 3. LOGIC TẠO & VÀO PHÒNG
// ==========================================
document.getElementById('btn-create-room').addEventListener('click', () => {
    currentRoomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    isHost = true;

    db.ref('rooms/' + currentRoomId).set({
        videoUrl: '',
        isTorrent: false, // Cờ báo hiệu đây là link thường hay link P2P
        state: 'pause',
        currentTime: 0,
        timestamp: Date.now()
    });

    enterRoomUI();
    setupHostFeatures();
});

document.getElementById('btn-join-room').addEventListener('click', () => {
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
// 4. LOGIC CHỦ PHÒNG (HOST)
// ==========================================
function setupHostFeatures() {
    hostPanel.classList.remove('hidden');
    video.setAttribute('controls', 'true');

    // CÁCH 1: LINK TRỰC TIẾP
    btnLoadVideo.addEventListener('click', () => {
        const url = inputVideoUrl.value.trim();
        if (url) {
            db.ref('rooms/' + currentRoomId).update({ videoUrl: url, isTorrent: false, state: 'pause', currentTime: 0 });
            video.src = url;
        }
    });

    // CÁCH 2: PHÁT P2P (WEBTORRENT)
    btnUploadVideo.addEventListener('click', () => {
        const file = inputVideoFile.files[0];
        if (!file) return alert("Vui lòng chọn một file video!");

        uploadStatus.classList.remove('hidden');
        uploadText.textContent = "Đang tạo luồng P2P... Vui lòng đợi...";
        btnUploadVideo.disabled = true;

        // Seed file video cho mạng P2P
        wtClient.seed(file, (torrent) => {
            uploadText.textContent = "✅ Đang phát sóng! VUI LÒNG KHÔNG ĐÓNG TAB NÀY.";
            btnUploadVideo.disabled = false;

            // Lấy Magnet Link và đẩy lên Firebase
            db.ref('rooms/' + currentRoomId).update({ 
                videoUrl: torrent.magnetURI, 
                isTorrent: true, 
                state: 'pause', 
                currentTime: 0 
            });

            // Gắn video P2P vào thẻ video của Host
            torrent.files[0].renderTo(video);
        });
    });

    // Đồng bộ các sự kiện
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
// 5. LOGIC NGƯỜI XEM (VIEWER) & ĐỒNG BỘ
// ==========================================
function setupViewerFeatures() {
    video.removeAttribute('controls');
    viewerControls.classList.remove('hidden');

    volumeSlider.addEventListener('input', (e) => {
        video.volume = e.target.value;
    });

    db.ref('rooms/' + currentRoomId).on('value', snapshot => {
        const data = snapshot.val();
        if (!data) return;

        // Đồng bộ nguồn Video (Link thường hoặc P2P)
        if (data.videoUrl) {
            if (data.isTorrent) {
                // Xử lý P2P bằng WebTorrent
                if (currentMagnetUrl !== data.videoUrl) {
                    currentMagnetUrl = data.videoUrl;
                    downloadStatus.classList.remove('hidden');
                    
                    wtClient.add(data.videoUrl, (torrent) => {
                        // Hiển thị tốc độ tải
                        torrent.on('download', (bytes) => {
                            downloadSpeed.textContent = Math.round(torrent.downloadSpeed / 1024);
                        });
                        
                        // Gắn luồng vào thẻ video
                        torrent.files[0].renderTo(video);
                    });
                }
            } else {
                // Xử lý link thường
                downloadStatus.classList.add('hidden');
                if (video.src !== data.videoUrl) {
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

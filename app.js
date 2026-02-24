// ==========================================
// 1. CẤU HÌNH FIREBASE CỦA BẠN VÀO ĐÂY
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

// Khởi tạo Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ==========================================
// 2. BIẾN TOÀN CỤC & DOM ELEMENTS
// ==========================================
let currentRoomId = null;
let isHost = false;

const video = document.getElementById('my-video');
const setupSection = document.getElementById('setup-section');
const roomSection = document.getElementById('room-section');
const displayRoomId = document.getElementById('display-room-id');
const roleBadge = document.getElementById('role-badge');
const hostPanel = document.getElementById('host-panel');
const viewerControls = document.getElementById('viewer-controls');

// ==========================================
// 3. LOGIC TẠO & VÀO PHÒNG
// ==========================================
document.getElementById('btn-create-room').addEventListener('click', () => {
    // Tạo ID phòng ngẫu nhiên (6 ký tự)
    currentRoomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    isHost = true;

    // Khởi tạo dữ liệu phòng trên Firebase
    db.ref('rooms/' + currentRoomId).set({
        videoUrl: '',
        state: 'pause', // 'play' hoặc 'pause'
        currentTime: 0,
        timestamp: Date.now()
    });

    enterRoomUI();
    setupHostFeatures();
});

document.getElementById('btn-join-room').addEventListener('click', () => {
    const id = document.getElementById('input-room-id').value.trim().toUpperCase();
    if (!id) return alert("Vui lòng nhập ID phòng!");

    // Kiểm tra phòng có tồn tại không
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
    video.setAttribute('controls', 'true'); // Cấp quyền điều khiển cho Host

    // Load video mới
    document.getElementById('btn-load-video').addEventListener('click', () => {
        const url = document.getElementById('input-video-url').value;
        if (url) {
            db.ref('rooms/' + currentRoomId).update({ videoUrl: url, state: 'pause', currentTime: 0 });
            video.src = url;
        }
    });

    // Bắt sự kiện Host Play
    video.addEventListener('play', () => {
        db.ref('rooms/' + currentRoomId).update({ state: 'play', currentTime: video.currentTime, timestamp: Date.now() });
    });

    // Bắt sự kiện Host Pause
    video.addEventListener('pause', () => {
        db.ref('rooms/' + currentRoomId).update({ state: 'pause', currentTime: video.currentTime, timestamp: Date.now() });
    });

    // Bắt sự kiện Host Tua (Seek)
    video.addEventListener('seeked', () => {
        // Cập nhật lại thời gian sau khi host tua xong
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
    video.removeAttribute('controls'); // Ẩn thanh điều khiển mặc định, không cho tua
    viewerControls.classList.remove('hidden'); // Hiện thanh chỉnh âm lượng riêng

    // Logic chỉnh âm lượng cá nhân (không đẩy lên Firebase)
    const volumeSlider = document.getElementById('volume-slider');
    volumeSlider.addEventListener('input', (e) => {
        video.volume = e.target.value;
    });

    // Lắng nghe dữ liệu từ Firebase để đồng bộ
    db.ref('rooms/' + currentRoomId).on('value', snapshot => {
        const data = snapshot.val();
        if (!data) return;

        // 1. Đồng bộ Video URL
        if (data.videoUrl && video.src !== data.videoUrl) {
            video.src = data.videoUrl;
        }

        // 2. Đồng bộ thời gian (Tua)
        // Chỉ cập nhật nếu lệch quá 1.5 giây để tránh giật lag liên tục do ping mạng
        if (Math.abs(video.currentTime - data.currentTime) > 1.5) {
            video.currentTime = data.currentTime;
        }

        // 3. Đồng bộ trạng thái Play/Pause
        if (data.state === 'play' && video.paused) {
            // Lệnh play() có thể bị trình duyệt chặn nếu người dùng chưa tương tác với trang.
            // Nhưng vì người xem đã bấm nút "Vào phòng" trước đó, nên thường sẽ an toàn vượt qua.
            video.play().catch(err => console.log("Lỗi tự động phát: ", err));
        } else if (data.state === 'pause' && !video.paused) {
            video.pause();
        }
    });
}
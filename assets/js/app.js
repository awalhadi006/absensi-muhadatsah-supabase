// ==========================================
// 1. STATE & VARIABEL GLOBAL
// (Sangat penting ditaruh paling atas agar terbaca oleh api.js)
// ==========================================
let globalAdminName = "Admin";
let dbTeachers = []; // Variabel yang tadinya error not defined
let todayRecords = [];
let isOnline = navigator.onLine;
let html5QrcodeScanner;
let isScannerPaused = false;
let activeDashboardFilter = 'all'; // Menyimpan state filter saat ini

// ==========================================
// 2. MANAJEMEN TEMA (DARK/LIGHT)
// ==========================================
function initTheme() {
    const savedTheme = localStorage.getItem('absen_theme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = savedTheme || (prefersDark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
    const metaThemeColor = document.querySelector("meta[name=theme-color]");
    if(metaThemeColor) metaThemeColor.setAttribute("content", theme === 'dark' ? "#1f2937" : "#f8fafc");
    window.addEventListener('DOMContentLoaded', () => updateThemeIcon(theme));
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const newTheme = current === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('absen_theme', newTheme);
    const metaThemeColor = document.querySelector("meta[name=theme-color]");
    if(metaThemeColor) metaThemeColor.setAttribute("content", newTheme === 'dark' ? "#1f2937" : "#f8fafc");
    updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
    const icon = document.getElementById('theme-icon');
    if(icon) icon.className = theme === 'dark' ? 'fa-solid fa-sun text-xl opacity-70' : 'fa-solid fa-moon text-xl opacity-70';
}
initTheme(); // Panggil saat file dimuat

// ==========================================
// 3. UTILITAS UI & NAVIGASI
// ==========================================
function togglePassword() {
    const pwd = document.getElementById('password');
    const icon = document.getElementById('eyeIcon');
    if (pwd.type === 'password') {
        pwd.type = 'text';
        icon.classList.replace('fa-eye', 'fa-eye-slash');
    } else {
        pwd.type = 'password';
        icon.classList.replace('fa-eye-slash', 'fa-eye');
    }
}

function getExactTimestamp() {
    const now = new Date();
    return `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()} ${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
}

function parseTime(timeStr) {
    if(!timeStr || timeStr.includes("Offline")) return new Date(); 
    const d = new Date(timeStr);
    return isNaN(d.getTime()) ? new Date(0) : d;
}

function showModal(title, msg, onConfirm = null, isError = false, onCancel = null) {
    const modal = document.getElementById('globalModal');
    document.getElementById('modalTitle').innerText = title;
    document.getElementById('modalMessage').innerText = msg;
    
    const btnClass = isError ? 'btn-error bg-red-500 hover:bg-red-600' : 'btn-success bg-emerald-500 hover:bg-emerald-600';
    
    if(onConfirm) {
        document.getElementById('modalActions').innerHTML = `
            <button id="btnCM" class="btn btn-outline flex-1 border-2 border-base-300">Batal</button>
            <button id="btnOM" class="btn ${btnClass} border-0 text-white shadow-md flex-1">Ya</button>`;
        
        document.getElementById('btnCM').onclick = () => { modal.close(); if(onCancel) onCancel(); };
        document.getElementById('btnOM').onclick = () => { modal.close(); onConfirm(); };
    } else {
        let cancelStr = onCancel !== null ? `${onCancel.name || 'function(){}'}();` : '';
        document.getElementById('modalActions').innerHTML = `<button onclick="document.getElementById('globalModal').close(); ${cancelStr}" class="btn ${btnClass} border-0 text-white shadow-md w-full">OK</button>`;
    }
    
    document.getElementById('modalBackdropBtn').onclick = () => { if(onCancel) onCancel(); }
    modal.showModal();
}

function showToast(msg, type = 'success') {
    const cont = document.getElementById('toastContainer');
    cont.classList.remove('hide');
    const colors = { success: 'alert-success bg-emerald-500 text-white', error: 'alert-error bg-red-500 text-white', warning: 'alert-warning bg-yellow-500 text-white' };
    const icons = { success: 'fa-check-circle', error: 'fa-triangle-exclamation', warning: 'fa-sync' };
    
    const t = document.createElement('div');
    t.className = `alert ${colors[type]} shadow-xl mb-2 py-2 px-4 transition-all opacity-100 border-0 font-bold`;
    t.innerHTML = `<span class="text-sm"><i class="fa-solid ${icons[type]} mr-2"></i>${msg}</span>`;
    
    cont.appendChild(t);
    setTimeout(() => {
        t.style.opacity = '0';
        setTimeout(() => { t.remove(); if(cont.children.length === 0) cont.classList.add('hide'); }, 300);
    }, 2500);
}

function renderView(id) {
    ['loginView', 'dashboardView', 'scannerView', 'manualView', 'rekapView'].forEach(v => {
        let el = document.getElementById(v);
        if(el) el.classList.add('hide');
    });
    
    let target = document.getElementById(id);
    if(target) target.classList.remove('hide');
    
    if(id === 'dashboardView') {
        renderSmartList(); 
        silentFetchDashboard(); 
    }
}

function showView(id) {
    history.pushState({view: id}, '', '#' + id);
    renderView(id);
}

function goBack() {
    history.back();
}

// Tangkap event Swipe Back di HP Android agar tidak keluar dari web
window.addEventListener('popstate', (e) => {
    if(e.state && e.state.view) {
        if(e.state.view === 'dashboardView') {
            if(html5QrcodeScanner) stopScanner();
            filterSelect('clear'); 
        }
        renderView(e.state.view);
    } else {
        renderView('dashboardView');
    }
});

// ==========================================
// 4. OFFLINE STORAGE (INDEXED DB) & JARINGAN
// ==========================================
const dbName = "AbsensiDB";
function getDB() {
    return new Promise((resolve, reject) => {
        let request = indexedDB.open(dbName, 1);
        request.onupgradeneeded = (e) => {
            let db = e.target.result;
            if(!db.objectStoreNames.contains('pending')) db.createObjectStore('pending', { keyPath: 'id', autoIncrement: true });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}
async function saveOffline(payloads) {
    const db = await getDB();
    const tx = db.transaction('pending', 'readwrite');
    const store = tx.objectStore('pending');
    payloads.forEach(p => { 
        p.offlineTimestamp = new Date().toISOString(); 
        store.add(p); 
    });
    return new Promise(res => tx.oncomplete = res);
}
async function getOffline() {
    const db = await getDB();
    const tx = db.transaction('pending', 'readonly');
    return new Promise(resolve => {
        const req = tx.objectStore('pending').getAll();
        req.onsuccess = () => resolve(req.result);
    });
}
async function clearOffline() {
    const db = await getDB();
    const tx = db.transaction('pending', 'readwrite');
    tx.objectStore('pending').clear();
}

window.addEventListener('online', () => { isOnline = true; updateNetworkUI(); forceSync(); });
window.addEventListener('offline', () => { isOnline = false; updateNetworkUI(); });

async function updateNetworkUI() {
    const ind = document.getElementById('networkIndicator');
    const cnt = document.getElementById('offlineCount');
    if(!ind || !cnt) return; // Mencegah error jika dipanggil sebelum DOM siap

    const offData = await getOffline();
    if(isOnline) {
        if(offData.length > 0) {
            ind.className = "badge badge-warning gap-1 text-white text-xs border-0 py-3 shadow-sm cursor-pointer";
            cnt.innerText = `Sync ${offData.length} data...`;
        } else {
            ind.className = "badge badge-success bg-emerald-500 gap-1 text-white text-xs border-0 py-3 shadow-sm cursor-pointer";
            cnt.innerText = "Online";
        }
    } else {
        ind.className = "badge badge-error gap-1 text-white text-xs border-0 py-3 shadow-sm cursor-pointer";
        cnt.innerText = `Offline (${offData.length})`;
    }
}

async function forceSync() {
    if(!isOnline) return;
    const pendings = await getOffline();
    if(pendings.length === 0) return updateNetworkUI();

    showToast(`Mensinkronkan ${pendings.length} data...`, 'warning');
    try {
        const cleanPayloads = pendings.map(p => ({nama: p.nama, status: p.status, alasan: p.alasan, adminName: p.adminName, offlineTimestamp: p.offlineTimestamp, waktu: p.waktu}));
        // Memanggil fungsi dari api.js
        const res = await callAPI('submitAttendance', cleanPayloads);
        
        if(res.success) {
            await clearOffline();
            showToast('Data offline berhasil diupload!', 'success');
            silentFetchDashboard();
        }
    } catch (err) { console.error('Sync error', err); }
    updateNetworkUI();
}

// ==========================================
// 5. LOGIN & INISIALISASI
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const saved = localStorage.getItem('absen_admin_name');
    if (saved) {
        globalAdminName = saved;
        const disp = document.getElementById('userNameDisplay');
        if(disp) disp.innerText = globalAdminName;
        
        history.replaceState({view: 'dashboardView'}, '', '#dashboardView');
        renderView('dashboardView');
        updateNetworkUI();
    } else {
        history.replaceState({view: 'loginView'}, '', '#loginView');
        renderView('loginView');
    }

    // Pasang listener untuk form login
    const loginForm = document.getElementById('loginForm');
    if(loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if(!isOnline) return showModal('Offline', 'Anda butuh internet untuk login.', null, true);
            
            const btn = document.getElementById('btnLogin');
            btn.disabled = true; document.getElementById('loginLoader').classList.remove('hide');
            try {
                // Memanggil fungsi dari api.js
                const res = await callAPI('login', { username: document.getElementById('username').value, password: document.getElementById('password').value });
                if (res.success) {
                    localStorage.setItem('absen_admin_name', res.user);
                    globalAdminName = res.user;
                    document.getElementById('userNameDisplay').innerText = res.user;
                    showView('dashboardView');
                } else {
                    showModal('Gagal', res.message, null, true);
                }
            } catch (e) { showModal('Error', 'Periksa koneksi internet.', null, true); }
            btn.disabled = false; document.getElementById('loginLoader').classList.add('hide');
        });
    }
});

function logout() {
    showModal('Yakin ingin keluar?', 'Sesi Anda akan dihapus dari perangkat ini.', () => {
        localStorage.removeItem('absen_admin_name');
        history.replaceState({view: 'loginView'}, '', '#loginView');
        renderView('loginView');
    });
}

// ==========================================
// 6. LOGIKA DASHBOARD & SMART LIST
// ==========================================
async function silentFetchDashboard() {
    if(!isOnline) return;
    const cont = document.getElementById('smartListContainer');
    
    if(dbTeachers.length === 0) {
        cont.innerHTML = '<div class="flex items-center justify-center h-full w-full text-xs opacity-50 absolute inset-0"><span class="loading loading-spinner loading-md mr-2"></span> Memuat server...</div>';
    }
    
    try {
        const p1 = callAPI('getTeachers', {});
        const p2 = callAPI('getTodayAttendance', {});
        const [res1, res2] = await Promise.all([p1, p2]);
        
        if(res1.success) dbTeachers = res1.data;
        if(res2.success) todayRecords = res2.data;

        renderSmartList();
    } catch (e) {
        if(dbTeachers.length === 0) cont.innerHTML = '<div class="text-xs text-center text-error mt-4 w-full">Gagal memuat. Pastikan online.</div>';
    }
}

// Fungsi baru untuk dipanggil saat kotak statis diklik
function filterDashboardList(status) {
    // Jika filter yang diklik sama dengan yang aktif, maka reset (all). Jika beda, gunakan filter baru.
    activeDashboardFilter = (activeDashboardFilter === status) ? 'all' : status;
    renderSmartList();
}

function renderSmartList() {
    const cont = document.getElementById('smartListContainer');
    if (dbTeachers.length === 0) return;
    
    // --- PENGECEKAN HARI LIBUR & ADMIN BYPASS ---
    const hariIni = new Date().getDay(); // 0 = Minggu, 5 = Jumat, 6 = Sabtu
    const isLibur = hariIni === 5 || hariIni === 6 || hariIni === 0;
    const isAdmin = globalAdminName.toLowerCase() === 'admin'; 

    if (isLibur && !isAdmin) {
        cont.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full w-full opacity-70 p-4 text-center mt-6">
                <i class="fa-solid fa-mug-hot text-4xl mb-2 text-base-300"></i>
                <p class="font-bold text-sm">Kegiatan Muhadatsah Libur</p>
                <p class="text-[10px]">Silakan menikmati akhir pekan!</p>
            </div>`;
        return;
    }
    // --------------------------------------------

    cont.innerHTML = '';
    let stats = { h:0, s:0, i:0, a:0, belum:0 };
    
    let combined = dbTeachers.map(guru => {
        let rec = todayRecords.find(r => r.nama === guru.nama);
        return rec ? { ...guru, done: true, ...rec } : { ...guru, done: false };
    });

    getOffline().then(pendings => {
        let offNames = pendings.map(p => p.nama);
        combined.forEach(item => {
            if (offNames.includes(item.nama)) {
                let op = pendings.find(p=>p.nama === item.nama);
                item.done = true; item.status = op.status; item.alasan = op.alasan; item.waktu = "⏳ Offline";
            }
            if (!item.done) stats.belum++;
            else {
                let st = item.status.toLowerCase();
                let al = item.alasan ? item.alasan.toLowerCase() : '';
                if(st === 'hadir') stats.h++;
                else if(al === 'izin') stats.i++;
                else if(al === 'sakit') stats.s++;
                else stats.a++;
            }
        });

        // Update kotak angka di atas
        document.getElementById('statHadir').innerText = stats.h;
        document.getElementById('statIzin').innerText = stats.i;
        document.getElementById('statSakit').innerText = stats.s;
        document.getElementById('statAlfa').innerText = stats.a;
        document.getElementById('statBelum').innerText = `${stats.belum} Belum`;

        // --- LOGIKA FILTER ---
        let filteredCombined = combined;
        if (activeDashboardFilter !== 'all') {
            filteredCombined = combined.filter(item => {
                if (!item.done) return false; // Abaikan yang belum absen
                let st = item.status.toLowerCase();
                let al = item.alasan ? item.alasan.toLowerCase() : '';
                
                if (activeDashboardFilter === 'hadir') return st === 'hadir';
                if (activeDashboardFilter === 'izin') return al === 'izin';
                if (activeDashboardFilter === 'sakit') return al === 'sakit';
                if (activeDashboardFilter === 'alfa') return al === 'alfa' || st === 'alfa';
                return true;
            });
        }
        // ---------------------

        filteredCombined.sort((a,b) => {
            if (a.done !== b.done) return a.done - b.done; 
            if (a.done && b.done) {
                const timeA = parseTime(a.waktu).getTime();
                const timeB = parseTime(b.waktu).getTime();
                return timeB - timeA; 
            }
            return a.nama.localeCompare(b.nama);
        });

        filteredCombined.forEach(item => {
            let div = document.createElement('div');
            if(item.done) {
                let badge = item.status.toLowerCase() === 'hadir' ? 'badge-success text-white' : (item.alasan === 'Sakit' ? 'badge-warning text-black' : (item.alasan === 'Izin' ? 'badge-info text-white' : 'badge-error text-white'));
                let alasanTxt = item.status.toLowerCase() !== 'hadir' && item.alasan ? ` - ${item.alasan}` : '';
                div.className = "flex justify-between items-center p-2 rounded-lg bg-base-100 border border-base-200 opacity-70 transition-all";
                div.innerHTML = `
                    <div><p class="text-xs font-semibold line-through">${item.nama}</p></div>
                    <div class="text-right flex flex-col items-end">
                        <span class="badge ${badge} badge-sm text-[10px] border-0 font-bold shadow-sm">${item.status}${alasanTxt}</span>
                        <span class="text-[9px] font-mono mt-1 opacity-70">${item.waktu || ''}</span>
                    </div>`;
            } else {
                div.className = "flex justify-between items-center p-2 rounded-lg bg-base-100 border-l-4 border-l-warning shadow-sm transition-all";
                div.innerHTML = `<div><p class="text-xs font-semibold">${item.nama}</p><p class="text-[9px] opacity-60">${item.keterangan}</p></div>
                                 <div class="text-[10px] font-bold text-warning px-2 py-1 bg-warning/10 rounded">Belum Absen</div>`;
            }
            cont.appendChild(div);
        });
        
        // Tampilkan pesan kosong jika filter tidak menghasilkan apa-apa
        if(filteredCombined.length === 0 && activeDashboardFilter !== 'all') {
            cont.innerHTML = `<div class="text-center text-xs opacity-50 mt-10">Tidak ada data untuk status: ${activeDashboardFilter.toUpperCase()}</div>`;
        }
    });
}

// ==========================================
// 7. SCANNER QR
// ==========================================
function showScanner() {
    showView('scannerView');
    const readerContainer = document.getElementById('readerContainer');
    readerContainer.classList.remove('scan-error', 'scan-warning', 'scan-success');
    
    if(!html5QrcodeScanner) {
        html5QrcodeScanner = new Html5Qrcode("reader");
    }
    
    setTimeout(() => {
        if(!html5QrcodeScanner.isScanning) {
            html5QrcodeScanner.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } }, onScanSuccess).catch(e => {
                showModal('Kamera Error', 'Izinkan akses kamera di browser/aplikasi Anda.', null, true);
                goBack();
            });
        }
    }, 350);
}

function stopScanner() {
    if (html5QrcodeScanner && html5QrcodeScanner.isScanning) {
        html5QrcodeScanner.stop().catch(e => console.log(e));
    }
}

async function onScanSuccess(decodedText) {
    if(isScannerPaused) return;
    isScannerPaused = true;

    const readerContainer = document.getElementById('readerContainer');
    const scannedName = decodedText.trim();
    const matchedGuru = dbTeachers.find(g => g.nama.trim().toLowerCase() === scannedName.toLowerCase());
    
    if(dbTeachers.length > 0 && !matchedGuru) {
        readerContainer.classList.add('scan-error');
        showToast("Nama tidak dikenali / salah QR!", "error");
        setTimeout(() => { readerContainer.classList.remove('scan-error'); isScannerPaused = false; }, 1500);
        return;
    }

    const finalName = matchedGuru ? matchedGuru.nama : scannedName; 
    let isDupe = todayRecords.some(r => r.nama === finalName);
    const pendings = await getOffline();
    if (pendings.some(p => p.nama === finalName)) isDupe = true;

    if (isDupe) {
        readerContainer.classList.add('scan-warning');
        showToast(`${finalName} sudah absen hari ini!`, 'warning');
        setTimeout(() => { readerContainer.classList.remove('scan-warning'); isScannerPaused = false; }, 1500);
        return;
    }

    // --- LANGSUNG SUBMIT KE DATABASE (Auto-Submit) ---
    readerContainer.classList.add('scan-success');
    const timeStr = getExactTimestamp();
    const payload = { nama: finalName, status: 'Hadir', alasan: '', adminName: globalAdminName, waktu: timeStr };
    
    if(!isOnline) {
        await saveOffline([payload]);
        updateNetworkUI();
        showToast(`${finalName} otomatis hadir (Tersimpan Offline)`, 'success');
    } else {
        callAPI('submitAttendance', [payload]).catch(e => saveOffline([payload]));
        showToast(`${finalName} berhasil absen!`, 'success');
    }
    
    todayRecords.push(payload);
    
    // Jeda 1 detik agar scanner tidak langsung men-scan kode yang sama berkali-kali
    setTimeout(() => {
        readerContainer.classList.remove('scan-success');
        isScannerPaused = false;
    }, 1000);
}

// ==========================================
// 8. MANUAL & BULK INPUT
// ==========================================
function showManual() {
    showView('manualView');
    renderChecklist();
}

function renderChecklist(filterText = "") {
    const cont = document.getElementById('checklistContainer');
    if(dbTeachers.length === 0) {
        cont.innerHTML = '<div class="text-center text-sm opacity-50 mt-4">Database kosong. Pastikan online.</div>';
        return;
    }

    let combined = dbTeachers.map(guru => {
        let done = todayRecords.find(r => r.nama === guru.nama) !== undefined;
        return { ...guru, done };
    }).filter(g => !g.done);

    if(filterText) combined = combined.filter(g => g.nama.toLowerCase().includes(filterText.toLowerCase()));

    if(combined.length === 0) {
        cont.innerHTML = '<div class="text-center text-sm opacity-50 mt-4">Semua guru (di pencarian ini) sudah absen.</div>';
        updateSelectedCount();
        return;
    }

    cont.innerHTML = '';
    combined.forEach(item => {
        let div = document.createElement('label');
        div.className = "flex items-center gap-3 p-3 border-b border-base-200 cursor-pointer hover:bg-base-200 transition-colors guru-item";
        div.dataset.nama = item.nama; div.dataset.ket = item.keterangan.toLowerCase();
        
        div.innerHTML = `<input type="checkbox" class="checkbox checkbox-success checkbox-sm cb-guru" onchange="updateSelectedCount()" value="${item.nama}">
                         <div><p class="text-sm font-semibold leading-tight">${item.nama}</p><p class="text-[10px] opacity-60">${item.keterangan}</p></div>`;
        cont.appendChild(div);
    });
    updateSelectedCount();
}

function searchChecklist() { renderChecklist(document.getElementById('searchManual').value); }

function toggleFilter(type, btnObj) {
    const isActive = btnObj.classList.contains('btn-success');
    
    if (isActive) {
        btnObj.classList.remove('btn-success', 'text-white', 'bg-emerald-500', 'border-0'); btnObj.classList.add('btn-outline');
    } else {
        btnObj.classList.add('btn-success', 'text-white', 'bg-emerald-500', 'border-0'); btnObj.classList.remove('btn-outline');
    }

    const cbs = document.querySelectorAll('.cb-guru');
    cbs.forEach(cb => {
        let item = cb.closest('.guru-item');
        let nama = item.dataset.nama.toLowerCase();
        let ket = item.dataset.ket;
        let isMatch = false;
        
        if(type === 'ikhwan' && ket.includes('ikhwan')) isMatch = true;
        else if(type === 'akhwat' && ket.includes('akhwat')) isMatch = true;
        else if(type === 'ust' && (nama.startsWith('ust.') || nama.startsWith('ustadz '))) isMatch = true;
        else if(type === 'usth' && (nama.startsWith('usth.') || nama.startsWith('ustadzah '))) isMatch = true;
        else if(type === 'akh' && nama.startsWith('akh.')) isMatch = true;
        else if(type === 'ukh' && (nama.startsWith('ukh.') || nama.startsWith('ukhti '))) isMatch = true;

        if (isMatch) cb.checked = !isActive;
    });
    updateSelectedCount();
}

function filterSelect(type) {
    if(type === 'clear') {
        document.querySelectorAll('.filter-btn').forEach(b => { b.classList.remove('btn-success', 'text-white', 'bg-emerald-500', 'border-0'); b.classList.add('btn-outline'); });
        document.querySelectorAll('.cb-guru').forEach(cb => cb.checked = false);
    }
    updateSelectedCount();
}

function updateSelectedCount() {
    const cnt = document.getElementById('selectedCount');
    if(cnt) cnt.innerText = document.querySelectorAll('.cb-guru:checked').length;
}

function toggleBulkAlasan() {
    const checkedRadio = document.querySelector('input[name="bulkStatus"]:checked');
    if(!checkedRadio) return;
    
    const status = checkedRadio.value;
    const select = document.getElementById('bulkAlasan');
    if(select) {
        if (status === "Tidak Hadir") select.classList.remove('hide'); 
        else { select.classList.add('hide'); select.value = ""; }
    }
}

async function submitBulk() {
    const checkedBoxes = document.querySelectorAll('.cb-guru:checked');
    if(checkedBoxes.length === 0) return showToast('Pilih minimal 1 guru!', 'warning');

    const status = document.querySelector('input[name="bulkStatus"]:checked').value;
    const alasan = document.getElementById('bulkAlasan').value;
    if(status === "Tidak Hadir" && !alasan) return showToast('Pilih alasan absen!', 'warning');

    const btn = document.getElementById('btnBulk');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="loading loading-spinner loading-sm"></span> Menyimpan...'; btn.disabled = true;

    // --- LOGIKA MENGAMBIL TANGGAL MANUAL ---
    const dateInput = document.getElementById('manualDate').value;
    let timeStr;
    
    if (dateInput) {
        // Jika ada input (YYYY-MM-DD), ubah ke MM/DD/YYYY agar konsisten dengan getExactTimestamp()
        const [yyyy, mm, dd] = dateInput.split('-');
        const now = new Date();
        timeStr = `${mm}/${dd}/${yyyy} ${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    } else {
        // Jika kosong, gunakan waktu persis detik ini
        timeStr = getExactTimestamp(); 
    }
    // ---------------------------------------
    
    let payloads = [];
    checkedBoxes.forEach(cb => { 
        payloads.push({ nama: cb.value, status, alasan, adminName: globalAdminName, waktu: timeStr }); 
    });

    if(!isOnline) {
        await saveOffline(payloads); updateNetworkUI();
        showToast(`Tersimpan Offline (${payloads.length} data)`, 'success'); 
        resetBulkForm(timeStr); // Lempar timeStr ke fungsi reset
    } else {
        try {
            const res = await callAPI('submitAttendance', payloads);
            if(res.success) { showToast(res.message, 'success'); resetBulkForm(timeStr); }
            else showModal('Gagal', res.message, null, true);
        } catch(e) {
            await saveOffline(payloads); updateNetworkUI();
            showToast('Tersimpan offline.', 'warning'); 
            resetBulkForm(timeStr);
        }
    }
    btn.innerHTML = originalText; btn.disabled = false;
}

// Jangan lupa timpa juga fungsi resetBulkForm agar menerima parameter tanggal
function resetBulkForm(timeStr) {
    document.getElementById('searchManual').value = "";
    document.getElementById('manualDate').value = ""; // Bersihkan kolom tanggal
    document.querySelector('input[name="bulkStatus"][value="Hadir"]').checked = true;
    toggleBulkAlasan(); 
    filterSelect('clear'); 
    
    const checkedBoxes = document.querySelectorAll('.cb-guru:checked');
    checkedBoxes.forEach(cb => {
        todayRecords.push({nama: cb.value, status: document.querySelector('input[name="bulkStatus"]:checked').value, alasan: document.getElementById('bulkAlasan').value, waktu: timeStr});
    });
    
    goBack();
}

// ==========================================
// 9. REKAPAN BULANAN/KESELURUHAN
// ==========================================
function showRekap() {
    showView('rekapView');
    
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    
    // Set default value form ke bulan berjalan
    document.getElementById('startDate').value = firstDay.toISOString().split('T')[0];
    document.getElementById('endDate').value = today.toISOString().split('T')[0];
    
    document.getElementById('rekapContainer').innerHTML = `
        <div class="text-center text-sm opacity-50 mt-10">
            <i class="fa-solid fa-calendar-days text-3xl mb-2"></i><br>
            Tekan "Tampilkan Rekapan" untuk mulai memuat data.
        </div>`;
}

async function fetchRekapData() {
    const start = document.getElementById('startDate').value;
    const end = document.getElementById('endDate').value;
    const btn = document.getElementById('btnFilterRekap');
    const cont = document.getElementById('rekapContainer');

    if (!start || !end) return showToast('Pilih rentang tanggal terlebih dahulu!', 'warning');

    btn.innerHTML = '<span class="loading loading-spinner loading-sm"></span> Memuat...';
    btn.disabled = true;
    cont.innerHTML = '<div class="text-center mt-10"><span class="loading loading-spinner loading-md"></span></div>';

    try {
        const res = await callAPI('getRekap', { startDate: start, endDate: end });
        
        if (res.success && res.data.length > 0) {
            let rekapMap = {};
            
            res.data.forEach(item => {
                const nama = item.nama;
                const status = item.status.toLowerCase();
                
                if (!rekapMap[nama]) {
                    rekapMap[nama] = { hadir: 0, izin: 0, sakit: 0, alfa: 0 };
                }
                
                if (status === 'hadir') rekapMap[nama].hadir++;
                else if (status === 'izin' || item.alasan?.toLowerCase() === 'izin') rekapMap[nama].izin++;
                else if (status === 'sakit' || item.alasan?.toLowerCase() === 'sakit') rekapMap[nama].sakit++;
                else rekapMap[nama].alfa++;
            });

            const sortedData = Object.keys(rekapMap).map(nama => ({
                nama: nama, ...rekapMap[nama]
            })).sort((a, b) => a.nama.localeCompare(b.nama));

            renderRekapanKeLayar(sortedData);
        } else {
            cont.innerHTML = '<div class="text-center text-sm opacity-50 mt-10">Tidak ada data absensi pada tanggal tersebut.</div>';
        }
    } catch (e) {
        cont.innerHTML = '<div class="text-center text-error text-sm mt-10">Gagal menarik data. Periksa koneksi.</div>';
    }
    
    btn.innerHTML = '<i class="fa-solid fa-filter"></i> Tampilkan Rekapan';
    btn.disabled = false;
}

function renderRekapanKeLayar(dataArray) {
    const cont = document.getElementById('rekapContainer');
    cont.innerHTML = '';
    
    dataArray.forEach(guru => {
        const totalKehadiran = guru.hadir + guru.izin + guru.sakit + guru.alfa;
        const persentase = totalKehadiran === 0 ? 0 : Math.round((guru.hadir / totalKehadiran) * 100);

        let div = document.createElement('div');
        div.className = "card bg-base-100 shadow-sm border border-base-300 p-3";
        div.innerHTML = `
            <div class="flex justify-between items-center mb-2 border-b border-base-200 pb-2">
                <h3 class="font-bold text-sm text-base-content">${guru.nama}</h3>
                <div class="badge badge-neutral badge-sm font-bold">${persentase}% Hadir</div>
            </div>
            <div class="grid grid-cols-4 gap-1 text-center">
                <div class="bg-emerald-50 rounded p-1 border border-emerald-100"><div class="text-emerald-600 font-bold text-sm">${guru.hadir}</div><div class="text-[9px] text-emerald-600/70">Hadir</div></div>
                <div class="bg-blue-50 rounded p-1 border border-blue-100"><div class="text-blue-600 font-bold text-sm">${guru.izin}</div><div class="text-[9px] text-blue-600/70">Izin</div></div>
                <div class="bg-yellow-50 rounded p-1 border border-yellow-100"><div class="text-yellow-600 font-bold text-sm">${guru.sakit}</div><div class="text-[9px] text-yellow-600/70">Sakit</div></div>
                <div class="bg-red-50 rounded p-1 border border-red-100"><div class="text-red-600 font-bold text-sm">${guru.alfa}</div><div class="text-[9px] text-red-600/70">Alfa</div></div>
            </div>
        `;
        cont.appendChild(div);
    });
}
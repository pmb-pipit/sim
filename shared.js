// ===== STATE GLOBAL =====
const GAS_URL = 'https://script.google.com/macros/s/AKfycbzAn27qsikA5nve_zmxJh-6M1jzNVkO_8BIXBEAw2WBvADg11qMdpswtS4_CTFRwgJS/exec';
let currentUser = null;
let currentService = null;
let currentOpsTab = 'obat';
let allPasienData = [];
let stokData = JSON.parse(localStorage.getItem('pmb_stok') || '[]');
let mutasiData = JSON.parse(localStorage.getItem('pmb_mutasi') || '[]');

// ===== UTILS =====
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove('show'), 3000);
}

function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function noRM() {
  const now = new Date();
  const y = now.getFullYear().toString().slice(2);
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const r = Math.floor(Math.random() * 9000) + 1000;
  return `${y}${m}${r}`;
}

function hitungUsia(tglLahir) {
  const lahir = new Date(tglLahir);
  const sekarang = new Date();
  let tahun = sekarang.getFullYear() - lahir.getFullYear();
  let bulan = sekarang.getMonth() - lahir.getMonth();
  let hari = sekarang.getDate() - lahir.getDate();
  if (hari < 0) {
    bulan--;
    const haribulanLalu = new Date(sekarang.getFullYear(), sekarang.getMonth(), 0).getDate();
    hari += haribulanLalu;
  }
  if (bulan < 0) { tahun--; bulan += 12; }
  return `${tahun} tahun ${bulan} bulan ${hari} hari`;
}

function updateTopbarDate() {
  const el = document.getElementById('topbar-date');
  if (!el) return;
  const d = new Date();
  el.textContent = d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// ===== API CALL (JSONP - bypass CORS) =====
function callGAS(action, data, callback, silent = false) {
  if (!silent) showToast('Menyimpan data...', '');

  const callbackName = 'cb_' + Date.now();
  
  // Daftarkan callback global sementara
  window[callbackName] = function(res) {
    callback(res);
    delete window[callbackName];
    document.getElementById('gas-script')?.remove();
  };

  const params = new URLSearchParams({
    action: action,
    data: JSON.stringify(data),
    callback: callbackName
  });

  const script = document.createElement('script');
  script.id = 'gas-script';
  script.src = `${GAS_URL}?${params.toString()}`;
  script.onerror = function() {
    console.error('GAS script error');
    delete window[callbackName];
    script.remove();
    handleOffline(action, data, callback);
  };
  document.body.appendChild(script);
}

const demoUsers = [
  { username: 'admin', password: 'admin123', nama: 'Admin PMB', role: 'Bidan' },
  { username: 'pipit', password: 'pipit123', nama: 'Bidan Pipit', role: 'Bidan' }
];

function handleOffline(action, data, cb) {
  if (action === 'login') {
    const u = demoUsers.find(x => x.username === data.username && x.password === data.password);
    cb(u ? { success: true, user: u } : { success: false, message: 'Username/password salah' });
  } else if (action === 'savePasien') {
    const stored = JSON.parse(localStorage.getItem('pmb_pasien') || '[]');
    stored.push({ ...data.payload, noRM: noRM(), savedAt: new Date().toISOString(), savedBy: currentUser?.nama });
    localStorage.setItem('pmb_pasien', JSON.stringify(stored));
    cb({ success: true });
  } else if (action === 'getPasien') {
    const stored = JSON.parse(localStorage.getItem('pmb_pasien') || '[]');
    cb({ success: true, data: stored });
  } else if (action === 'saveStok') {
    cb({ success: true });
  } else {
    cb({ success: true, data: [] });
  }
}

// ===== LOGIN =====
function doLogin() {
  const u = document.getElementById('login-user').value.trim();
  const p = document.getElementById('login-pass').value.trim();
  if (!u || !p) { showLoginErr('Isi username dan password.'); return; }
  callGAS('login', { username: u, password: p }, (res) => {
    if (res.success) {
      currentUser = res.user;
      document.getElementById('login-screen').style.display = 'none';
      document.getElementById('app').classList.add('active');
      document.getElementById('sidebar-username').textContent = currentUser.nama || u;
      document.getElementById('sidebar-role').textContent = currentUser.role || 'Bidan';
      document.getElementById('user-avatar-text').textContent = (currentUser.nama || u).charAt(0).toUpperCase();
      updateTopbarDate();
      loadPage('dashboard.html');
    } else {
      showLoginErr(res.message || 'Login gagal.');
    }
  }, true);
}

function showLoginErr(msg) {
  const el = document.getElementById('login-err');
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 3000);
}

function doLogout() {
  currentUser = null;
  document.getElementById('app').classList.remove('active');
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
}

// ===== PAGE LOADER =====
function loadPage(file, navEl) {
  if (!currentUser) return;
  fetch(file)
    .then(r => r.text())
    .then(html => {
      document.getElementById('content-area').innerHTML = html;
      // Jalankan script di dalam halaman yang dimuat
      const scripts = document.getElementById('content-area').querySelectorAll('script');
      scripts.forEach(s => {
        const newScript = document.createElement('script');
        newScript.textContent = s.textContent;
        document.body.appendChild(newScript);
      });
    })
    .catch(() => {
      document.getElementById('content-area').innerHTML = `<div class="empty-state"><p>Gagal memuat halaman: ${file}</p></div>`;
    });

  // Update nav aktif
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (navEl) navEl.classList.add('active');

  // Update topbar title
  const titles = {
    'dashboard.html': 'Dashboard',
    'input-pasien.html': 'Input Pasien',
    'data-pasien.html': 'Data Pasien',
    'operasional.html': 'Operasional'
  };
  const el = document.getElementById('topbar-title');
  if (el) el.textContent = titles[file] || file;
}

// ===== MODAL & NOTIF =====
function openModal(id) { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

function toggleNotif() {
  document.getElementById('notif-panel')?.classList.toggle('open');
}

function checkStokNotif() {
  const low = stokData.filter(s => s.stok <= (s.minStok || 5));
  const badge = document.getElementById('notif-badge');
  const notifList = document.getElementById('notif-list');
  if (!badge) return;
  if (low.length > 0) {
    badge.style.display = 'inline-block';
    badge.textContent = `${low.length} Stok Menipis`;
    if (notifList) {
      notifList.innerHTML = low.map(s => `
        <div class="notif-item">
          <div class="notif-dot"></div>
          <div>
            <div class="notif-text"><strong>${s.nama}</strong> — stok tersisa ${s.stok} ${s.satuan || 'unit'}</div>
            <div class="notif-time">Kategori: ${s.kategori}</div>
          </div>
        </div>`).join('');
    }
  } else {
    badge.style.display = 'none';
    if (notifList) notifList.innerHTML = `<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:0.82rem">Tidak ada notifikasi</div>`;
  }
}

// ===== FORM DEFINITIONS =====
const serviceLabels = {
  ANC: 'ANC', INC: 'INC', PNC: 'PNC', KB: 'KB',
  IMUNISASI: 'Imunisasi', BAYI_BALITA: 'Bayi Balita Anak',
  UMUM: 'Umum', RAWAT_INAP: 'Rawat Inap'
};

const serviceBadgeColors = {
  ANC: 'background:#FDE8F4;color:#C0186C',
  INC: 'background:var(--rose-pale);color:var(--rose-dark)',
  PNC: 'background:#FEF1EA;color:#C06030',
  KB: 'background:var(--teal-pale);color:var(--teal)',
  IMUNISASI: 'background:#EBF2FD;color:#2050A0',
  BAYI_BALITA: 'background:#F5EAFD;color:#6B20A0',
  UMUM: 'background:var(--gold-pale);color:#906B00',
  RAWAT_INAP: 'background:#EEF1F7;color:var(--navy)'
};

const formDefs = {
  ANC: [
    { section: 'Data Kunjungan' },
    { id: 'tanggalKedatangan', label: 'Tanggal Kedatangan', type: 'date', req: true },
    { section: 'Data Pasien' },
    { id: 'namaPasien', label: 'Nama Pasien', type: 'text', req: true },
    { id: 'namaSuami', label: 'Nama Suami', type: 'text' },
    { id: 'tempatLahir', label: 'Tempat Lahir', type: 'text' },
    { id: 'tanggalLahir', label: 'Tanggal Lahir', type: 'date' },
    { id: 'usia', label: 'Usia', type: 'text', placeholder: 'Otomatis dari tanggal lahir' },
    { id: 'alamatLengkap', label: 'Alamat Lengkap', type: 'textarea', full: true },
    { id: 'desa', label: 'Desa/Kelurahan', type: 'text' },
    { id: 'kecamatan', label: 'Kecamatan', type: 'text' },
    { id: 'noHp', label: 'No HP', type: 'tel' },
    { section: 'Data Kehamilan' },
    { id: 'kehamilanKe', label: 'Kehamilan Ke-', type: 'number' },
    { id: 'keluhanPasien', label: 'Keluhan Pasien', type: 'textarea', full: true },
    { id: 'hpht', label: 'HPHT', type: 'date' },
    { id: 'taksiranPersalinan', label: 'Taksiran Persalinan', type: 'date' },
    { section: 'Pemeriksaan Fisik' },
    { id: 'tinggiBadan', label: 'Tinggi Badan (cm)', type: 'number' },
    { id: 'beratBadan', label: 'Berat Badan (kg)', type: 'number' },
    { id: 'lingkarLengan', label: 'Lingkar Lengan Atas (cm)', type: 'number' },
    { id: 'tekananDarah', label: 'Tekanan Darah', type: 'text', placeholder: '120/80 mmHg' },
    { id: 'usiaKehamilan', label: 'Usia Kehamilan', type: 'text', placeholder: 'minggu' },
    { id: 'tfu', label: 'TFU', type: 'text', placeholder: 'cm' },
    { id: 'letakJanin', label: 'Letak Janin', type: 'text' },
    { id: 'djj', label: 'DJJ', type: 'text', placeholder: 'x/menit' },
    { section: 'Pemeriksaan Lab' },
    { id: 'labHb', label: 'Haemoglobin', type: 'text', placeholder: 'g/dL' },
    { id: 'labGula', label: 'Gula Darah', type: 'text' },
    { id: 'labAsamUrat', label: 'Asam Urat', type: 'text' },
    { id: 'labCholesterol', label: 'Cholesterol', type: 'text' },
    { id: 'labTriple', label: 'Triple Eliminasi (HIV/Sifilis/HBsAg)', type: 'text' },
    { id: 'labProteinUrin', label: 'Protein Urin', type: 'text' },
    { id: 'golDarah', label: 'Golongan Darah', type: 'select', opts: ['', 'A', 'B', 'AB', 'O'] },
    { section: 'Penatalaksanaan' },
    { id: 'statusTT', label: 'Status Imunisasi TT', type: 'select', opts: ['', 'T1', 'T2', 'T3', 'T4', 'T5'] },
    { id: 'therapy', label: 'Therapy yang Diberikan', type: 'textarea', full: true },
    { id: 'nasihat', label: 'Nasihat/Penatalaksanaan/Kontrol Ulang', type: 'textarea', full: true },
    { id: 'tarif', label: 'Tarif (Rp)', type: 'number' },
    { id: 'keterangan', label: 'Keterangan', type: 'textarea', full: true },
  ],
  INC: [
    { section: 'Data Kunjungan' },
    { id: 'tanggalKunjungan', label: 'Tanggal Kunjungan', type: 'date', req: true },
    { id: 'noReg', label: 'No Registrasi', type: 'text' },
    { section: 'Data Pasien' },
    { id: 'namaPasien', label: 'Nama Pasien', type: 'text', req: true },
    { id: 'namaSuami', label: 'Nama Suami', type: 'text' },
    { id: 'tempatLahir', label: 'Tempat Lahir', type: 'text' },
    { id: 'tanggalLahir', label: 'Tanggal Lahir', type: 'date' },
    { id: 'usia', label: 'Usia', type: 'text', placeholder: 'Otomatis dari tanggal lahir' },
    { id: 'alamatLengkap', label: 'Alamat Lengkap', type: 'textarea', full: true },
    { id: 'desa', label: 'Desa/Kelurahan', type: 'text' },
    { id: 'kecamatan', label: 'Kecamatan', type: 'text' },
    { section: 'Data Persalinan' },
    { id: 'keluhanPasien', label: 'Keluhan', type: 'textarea', full: true },
    { id: 'kehamilanKe', label: 'Kehamilan Ke-', type: 'number' },
    { id: 'usiaKehamilan', label: 'Usia Kehamilan', type: 'text' },
    { section: 'Pemeriksaan' },
    { id: 'hasilPemeriksaan', label: 'Hasil Pemeriksaan', type: 'textarea', full: true },
    { id: 'tekananDarah', label: 'Tekanan Darah', type: 'text', placeholder: 'mmHg' },
    { id: 'nadi', label: 'Nadi', type: 'text', placeholder: 'x/menit' },
    { id: 'tfu', label: 'TFU', type: 'text' },
    { id: 'letakJanin', label: 'Letak Janin', type: 'text' },
    { id: 'djj', label: 'Denyut Jantung Janin', type: 'text' },
    { id: 'hisKontraksi', label: 'His/Kontraksi', type: 'text' },
    { section: 'Pemeriksaan Dalam' },
    { id: 'pemeriksaanDalam', label: 'Pemeriksaan Dalam', type: 'textarea', full: true },
    { id: 'vulvaVagina', label: 'Vulva/Vagina', type: 'text' },
    { id: 'pembukaan', label: 'Pembukaan', type: 'text' },
    { id: 'portio', label: 'Portio', type: 'text' },
    { id: 'ketuban', label: 'Ketuban', type: 'text' },
    { id: 'bagianTerendah', label: 'Bagian Terendah Janin', type: 'text' },
    { id: 'hodge', label: 'Hodge', type: 'select', opts: ['', 'H I', 'H II', 'H III', 'H IV'] },
    { section: 'Penatalaksanaan' },
    { id: 'penatalaksanaan', label: 'Penatalaksanaan', type: 'textarea', full: true },
    { id: 'tarif', label: 'Tarif (Rp)', type: 'number' },
    { id: 'keterangan', label: 'Keterangan', type: 'textarea' },
  ],
  PNC: [
    { section: 'Data Kunjungan' },
    { id: 'tanggalKedatangan', label: 'Tanggal Kedatangan', type: 'date', req: true },
    { section: 'Data Pasien' },
    { id: 'namaIbu', label: 'Nama Ibu / Nama Suami', type: 'text', req: true },
    { id: 'tempatTglLahir', label: 'Tempat Tanggal Lahir', type: 'text' },
    { id: 'tanggalLahir', label: 'Tanggal Lahir', type: 'date' },
    { id: 'usia', label: 'Usia', type: 'text', placeholder: 'Otomatis dari tanggal lahir' },
    { id: 'alamatLengkap', label: 'Alamat Lengkap', type: 'textarea', full: true },
    { id: 'noHp', label: 'No HP', type: 'tel' },
    { section: 'Data Nifas' },
    { id: 'persalinanKe', label: 'Persalinan Ke-', type: 'number' },
    { id: 'keluhanPasien', label: 'Keluhan Pasien', type: 'textarea', full: true },
    { id: 'tanggalPersalinan', label: 'Tanggal Persalinan', type: 'date' },
    { id: 'tempatBersalin', label: 'Tempat Bersalin', type: 'text' },
    { section: 'Pemeriksaan' },
    { id: 'tinggiBadan', label: 'Tinggi Badan (cm)', type: 'number' },
    { id: 'beratBadan', label: 'Berat Badan (kg)', type: 'number' },
    { id: 'tekananDarah', label: 'Tekanan Darah', type: 'text', placeholder: 'mmHg' },
    { id: 'kunjunganNifasKe', label: 'Kunjungan Nifas Ke-', type: 'number' },
    { id: 'tfu', label: 'TFU (Tinggi Fundus Uteri)', type: 'text' },
    { id: 'kontraksiUterus', label: 'Kontraksi Uterus', type: 'text' },
    { id: 'lochea', label: 'Lochea', type: 'text' },
    { id: 'laserasi', label: 'Laserasi', type: 'text' },
    { section: 'Penatalaksanaan' },
    { id: 'therapy', label: 'Therapy yang Diberikan', type: 'textarea', full: true },
    { id: 'nasihat', label: 'Nasihat/Penatalaksanaan/Kontrol Ulang', type: 'textarea', full: true },
    { id: 'tarif', label: 'Tarif (Rp)', type: 'number' },
  ],
  KB: [
    { section: 'Data Kunjungan' },
    { id: 'tanggalKedatangan', label: 'Tanggal Kedatangan', type: 'date', req: true },
    { section: 'Data Pasien' },
    { id: 'namaIstri', label: 'Nama Istri', type: 'text', req: true },
    { id: 'namaSuami', label: 'Nama Suami', type: 'text' },
    { id: 'noHp', label: 'No HP', type: 'tel' },
    { id: 'tempatTglLahir', label: 'Tempat Tanggal Lahir', type: 'text' },
    { id: 'tanggalLahir', label: 'Tanggal Lahir', type: 'date' },
    { id: 'usia', label: 'Usia', type: 'text', placeholder: 'Otomatis dari tanggal lahir' },
    { id: 'alamatLengkap', label: 'Alamat Lengkap', type: 'textarea', full: true },
    { section: 'Data KB' },
    { id: 'jenisKontrasepsi', label: 'Jenis Kontrasepsi', type: 'select', opts: ['', 'Pil', 'Suntik 1 Bulan', 'Suntik 3 Bulan', 'IUD/Spiral', 'Implant', 'Kondom', 'MOW', 'MOP'] },
    { section: 'Pemeriksaan' },
    { id: 'tekananDarah', label: 'Tekanan Darah', type: 'text' },
    { id: 'beratBadan', label: 'Berat Badan (kg)', type: 'number' },
    { id: 'tanggalKembali', label: 'Tanggal Kembali', type: 'date' },
    { id: 'tarif', label: 'Tarif (Rp)', type: 'number' },
  ],
  IMUNISASI: [
    { section: 'Data Kunjungan' },
    { id: 'tanggalKedatangan', label: 'Tanggal Kedatangan', type: 'date', req: true },
    { section: 'Data Bayi' },
    { id: 'namaBayi', label: 'Nama Lengkap Bayi', type: 'text', req: true },
    { id: 'tempatTglLahir', label: 'Tempat Tanggal Lahir', type: 'text' },
    { id: 'usia', label: 'Usia', type: 'text', placeholder: 'bulan' },
    { id: 'namaIbu', label: 'Nama Ibu', type: 'text' },
    { id: 'namaAyah', label: 'Nama Ayah', type: 'text' },
    { id: 'alamatLengkap', label: 'Alamat Lengkap', type: 'textarea', full: true },
    { id: 'noHp', label: 'No HP', type: 'tel' },
    { section: 'Pemeriksaan' },
    { id: 'beratBadan', label: 'Berat Badan (kg)', type: 'number' },
    { id: 'panjangBadan', label: 'Panjang Badan (cm)', type: 'number' },
    { id: 'suhu', label: 'Suhu (°C)', type: 'number', placeholder: '36.5' },
    { id: 'vaksin', label: 'Vaksin yang Diberikan', type: 'textarea', full: true },
    { id: 'tarif', label: 'Tarif (Rp)', type: 'number' },
  ],
  BAYI_BALITA: [
    { section: 'Data Kunjungan' },
    { id: 'tanggalKedatangan', label: 'Tanggal Kedatangan', type: 'date', req: true },
    { section: 'Data Anak' },
    { id: 'namaAnak', label: 'Nama Anak', type: 'text', req: true },
    { id: 'tempatTglLahir', label: 'Tempat Tanggal Lahir', type: 'text' },
    { id: 'usia', label: 'Usia', type: 'text' },
    { id: 'namaIbu', label: 'Nama Ibu', type: 'text' },
    { id: 'namaAyah', label: 'Nama Ayah', type: 'text' },
    { id: 'alamatLengkap', label: 'Alamat Lengkap', type: 'textarea', full: true },
    { id: 'noHp', label: 'No HP', type: 'tel' },
    { section: 'Pemeriksaan' },
    { id: 'keluhan', label: 'Keluhan', type: 'textarea', full: true },
    { id: 'beratBadan', label: 'Berat Badan (kg)', type: 'number' },
    { id: 'suhu', label: 'Suhu (°C)', type: 'number' },
    { id: 'terapi', label: 'Terapi yang Diberikan', type: 'textarea', full: true },
    { id: 'kunjunganUlang', label: 'Kunjungan Ulang', type: 'date' },
    { id: 'tarif', label: 'Tarif (Rp)', type: 'number' },
  ],
  UMUM: [
    { section: 'Data Kunjungan' },
    { id: 'tanggalKedatangan', label: 'Tanggal Kedatangan', type: 'date', req: true },
    { section: 'Data Pasien' },
    { id: 'namaPasien', label: 'Nama', type: 'text', req: true },
    { id: 'tempatTglLahir', label: 'Tempat Tanggal Lahir', type: 'text' },
    { id: 'tanggalLahir', label: 'Tanggal Lahir', type: 'date' },
    { id: 'usia', label: 'Usia', type: 'text', placeholder: 'Otomatis dari tanggal lahir' },
    { id: 'alamatLengkap', label: 'Alamat Lengkap', type: 'textarea', full: true },
    { id: 'noHp', label: 'No HP', type: 'tel' },
    { section: 'Pemeriksaan' },
    { id: 'keluhan', label: 'Keluhan', type: 'textarea', full: true },
    { id: 'tekananDarah', label: 'Tekanan Darah', type: 'text' },
    { id: 'beratBadan', label: 'Berat Badan (kg)', type: 'number' },
    { id: 'suhu', label: 'Suhu (°C)', type: 'number' },
    { id: 'terapi', label: 'Terapi yang Diberikan', type: 'textarea', full: true },
    { id: 'kunjunganUlang', label: 'Kunjungan Ulang', type: 'date' },
    { id: 'tarif', label: 'Tarif (Rp)', type: 'number' },
  ],
  RAWAT_INAP: [
    { section: 'Data Kunjungan' },
    { id: 'tanggalKedatangan', label: 'Tanggal Kedatangan', type: 'date', req: true },
    { section: 'Data Pasien' },
    { id: 'namaPasien', label: 'Nama', type: 'text', req: true },
    { id: 'tempatTglLahir', label: 'Tempat Tanggal Lahir', type: 'text' },
    { id: 'tanggalLahir', label: 'Tanggal Lahir', type: 'date' },
    { id: 'usia', label: 'Usia', type: 'text', placeholder: 'Otomatis dari tanggal lahir' },
    { id: 'alamatLengkap', label: 'Alamat Lengkap', type: 'textarea', full: true },
    { id: 'noHp', label: 'No HP', type: 'tel' },
    { section: 'Pemeriksaan' },
    { id: 'keluhan', label: 'Keluhan', type: 'textarea', full: true },
    { id: 'tekananDarah', label: 'Tekanan Darah', type: 'text' },
    { id: 'beratBadan', label: 'Berat Badan (kg)', type: 'number' },
    { id: 'suhu', label: 'Suhu (°C)', type: 'number' },
    { id: 'terapi', label: 'Terapi yang Diberikan', type: 'textarea', full: true },
    { id: 'kunjunganUlang', label: 'Kunjungan Ulang', type: 'date' },
    { id: 'tarif', label: 'Tarif (Rp)', type: 'number' },
  ]
};

// ===== FORM FUNCTIONS =====
function showFormInline(service) {
  currentService = service;
  const fields = formDefs[service];
  if (!fields) return;

  // Tandai tombol aktif
  document.querySelectorAll('.svc-side-btn').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`.svc-side-btn[data-service="${service}"]`);
  if (btn) btn.classList.add('active');

  let html = `
    <div class="form-card">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
        <h2 style="font-family:'Lora',serif;font-size:1.1rem;color:var(--navy)">${serviceLabels[service]}</h2>
        <span class="service-badge" style="${serviceBadgeColors[service]};padding:4px 12px;border-radius:20px;font-size:0.75rem;font-weight:700">${serviceLabels[service]}</span>
      </div>
      <div class="form-grid">`;

  fields.forEach(f => {
    if (f.section) {
      html += `</div><div class="form-section-title">${f.section}</div><div class="form-grid">`;
      return;
    }
    const fullClass = f.full ? ' full' : '';
    html += `<div class="form-group${fullClass}">`;
    html += `<label>${f.label}${f.req ? '<span class="req">*</span>' : ''}</label>`;
    if (f.type === 'textarea') {
      html += `<textarea id="f_${f.id}" placeholder="${f.placeholder || ''}"></textarea>`;
    } else if (f.type === 'select') {
      html += `<select id="f_${f.id}">${(f.opts || []).map(o => `<option value="${o}">${o || '— Pilih —'}</option>`).join('')}</select>`;
    } else {
      html += `<input type="${f.type}" id="f_${f.id}" placeholder="${f.placeholder || ''}">`;
    }
    html += `</div>`;
  });

  html += `</div>
      <div class="form-actions">
        <button class="btn btn-secondary" onclick="resetFormInline()">Reset</button>
        <button class="btn btn-primary" onclick="submitForm()">Simpan Data</button>
      </div>
    </div>`;

  document.getElementById('inline-form-area').innerHTML = html;

  // Set tanggal hari ini
  fields.filter(f => f.type === 'date').forEach(f => {
    const el = document.getElementById(`f_${f.id}`);
    if (el && !el.value) el.value = today();
  });

  // Auto hitung usia dari tanggal lahir
  const tglLahirEl = document.getElementById('f_tanggalLahir');
  const usiaEl = document.getElementById('f_usia');
  if (tglLahirEl && usiaEl) {
    tglLahirEl.addEventListener('change', function () {
      if (this.value) usiaEl.value = hitungUsia(this.value);
    });
  }
}

function resetFormInline() {
  if (!currentService) return;
  const fields = formDefs[currentService] || [];
  fields.filter(f => f.id).forEach(f => {
    const el = document.getElementById(`f_${f.id}`);
    if (el) el.value = f.type === 'date' ? today() : '';
  });
}

function submitForm() {
  if (!currentService) return;
  const fields = formDefs[currentService] || [];
  const required = fields.filter(f => f.req);
  for (const f of required) {
    const el = document.getElementById(`f_${f.id}`);
    if (el && !el.value.trim()) {
      showToast(`"${f.label}" wajib diisi`, 'error');
      el.focus();
      el.style.borderColor = 'var(--rose)';
      setTimeout(() => el.style.borderColor = '', 2000);
      return;
    }
  }
  const payload = { layanan: currentService, savedBy: currentUser?.nama || 'Admin' };
  fields.filter(f => f.id).forEach(f => {
    const el = document.getElementById(`f_${f.id}`);
    if (el) payload[f.id] = el.value;
  });
  payload.namaPasien = payload.namaPasien || payload.namaIbu || payload.namaIstri || payload.namaBayi || payload.namaAnak || '-';
  payload.tanggalKedatangan = payload.tanggalKedatangan || payload.tanggalKunjungan || today();
  callGAS('savePasien', { payload }, (res) => {
    if (res.success) {
      showToast('Data berhasil disimpan!', 'success');
      resetFormInline();
    } else {
      showToast(res.message || 'Gagal menyimpan data', 'error');
    }
  });
}

// ===== DATA PASIEN =====
function loadDataPasien() {
  callGAS('getPasien', {}, (res) => {
    if (!res.success) return;
    allPasienData = res.data || [];
    renderDataTable(allPasienData);
  }, true);
}

function renderDataTable(data) {
  const tbody = document.getElementById('data-table-body');
  if (!tbody) return;
  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:36px;color:var(--text-muted)">Tidak ada data ditemukan.</td></tr>`;
    return;
  }
  tbody.innerHTML = data.slice().reverse().slice(0, 100).map(p => {
    const svcKey = (p.layanan || 'umum').toLowerCase().replace('_', '');
    return `<tr>
      <td style="font-family:monospace;font-size:0.78rem">${p.noRM || '-'}</td>
      <td><strong>${p.namaPasien || '-'}</strong></td>
      <td><span class="tag tag-${svcKey}">${serviceLabels[p.layanan] || p.layanan || '-'}</span></td>
      <td>${formatDate(p.tanggalKedatangan) || '-'}</td>
      <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.keluhanPasien || p.keluhan || '-'}</td>
      <td style="color:var(--text-muted);font-size:0.78rem">${p.savedBy || '-'}</td>
    </tr>`;
  }).join('');
}

function searchPasien() {
  const q = (document.getElementById('search-input')?.value || '').toLowerCase();
  const svc = document.getElementById('search-service')?.value || '';
  let filtered = allPasienData;
  if (q) filtered = filtered.filter(p => (p.namaPasien || '').toLowerCase().includes(q) || (p.noRM || '').toLowerCase().includes(q));
  if (svc) filtered = filtered.filter(p => p.layanan === svc);
  renderDataTable(filtered);
}

// ===== OPERASIONAL =====
function renderStok() {
  const list = stokData.filter(s => s.kategori === currentOpsTab);
  const container = document.getElementById('stok-list');
  if (!container) return;
  if (!list.length) {
    container.innerHTML = `<div class="empty-state"><p>Belum ada item</p></div>`;
    return;
  }
  container.innerHTML = list.map(s => {
    const low = s.stok <= (s.minStok || 5);
    return `<div class="stok-item${low ? ' low' : ''}">
      <div class="stok-info">
        <div class="sitem-name">${s.nama}</div>
        <div class="sitem-detail">${s.satuan || 'unit'} · Min: ${s.minStok || 5}${low ? `<span class="stok-warn">⚠ Stok Menipis!</span>` : ''}</div>
      </div>
      <div class="stok-qty">${s.stok}</div>
    </div>`;
  }).join('');
  populateMutasiSelect();
  checkStokNotif();
}

function populateMutasiSelect() {
  const sel = document.getElementById('mutasi-item');
  if (!sel) return;
  const list = stokData.filter(s => s.kategori === currentOpsTab);
  sel.innerHTML = list.map(s => `<option value="${s.id}">${s.nama}</option>`).join('') || '<option value="">Tidak ada item</option>';
}

function renderMutasiHistory() {
  const container = document.getElementById('mutasi-history');
  if (!container) return;
  const history = mutasiData.filter(m => m.kategori === currentOpsTab).slice().reverse().slice(0, 20);
  if (!history.length) {
    container.innerHTML = `<p style="color:var(--text-muted);font-size:0.8rem;text-align:center;padding:16px">Belum ada mutasi</p>`;
    return;
  }
  container.innerHTML = history.map(m => `
    <div style="display:flex;gap:10px;align-items:center;padding:8px;background:var(--bg);border-radius:8px;border:1px solid var(--border)">
      <div style="width:28px;height:28px;border-radius:8px;background:${m.jenis === 'masuk' ? 'var(--teal-pale)' : 'var(--rose-pale)'};display:flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:700;color:${m.jenis === 'masuk' ? 'var(--teal)' : 'var(--rose)'};flex-shrink:0">${m.jenis === 'masuk' ? '+' : '-'}</div>
      <div style="flex:1">
        <div style="font-size:0.8rem;font-weight:600;color:var(--navy)">${m.itemNama}</div>
        <div style="font-size:0.72rem;color:var(--text-muted)">${m.qty} ${m.satuan || ''} · ${m.ket || ''} · ${formatDate(m.tanggal)}</div>
      </div>
    </div>`).join('');
}

function switchOpsTab(tab, el) {
  currentOpsTab = tab;
  document.querySelectorAll('.ops-tab').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
  renderStok();
  renderMutasiHistory();
  populateMutasiSelect();
}

function saveMutasi() {
  const itemId = document.getElementById('mutasi-item')?.value;
  const jenis = document.getElementById('mutasi-jenis')?.value;
  const qty = parseInt(document.getElementById('mutasi-qty')?.value) || 0;
  const ket = document.getElementById('mutasi-ket')?.value || '';
  if (!itemId || !qty) { showToast('Pilih item dan isi jumlah', 'error'); return; }
  const item = stokData.find(s => s.id === itemId);
  if (!item) { showToast('Item tidak ditemukan', 'error'); return; }
  if (jenis === 'keluar' && item.stok < qty) { showToast('Stok tidak mencukupi!', 'error'); return; }
  item.stok += jenis === 'masuk' ? qty : -qty;
  const mutasi = { id: Date.now().toString(), itemId, itemNama: item.nama, jenis, qty, ket, satuan: item.satuan, kategori: currentOpsTab, tanggal: today(), savedBy: currentUser?.nama };
  mutasiData.push(mutasi);
  localStorage.setItem('pmb_stok', JSON.stringify(stokData));
  localStorage.setItem('pmb_mutasi', JSON.stringify(mutasiData));
  callGAS('saveMutasi', { mutasi, stok: stokData }, () => { });
  document.getElementById('mutasi-qty').value = 1;
  document.getElementById('mutasi-ket').value = '';
  renderStok();
  renderMutasiHistory();
  showToast(`Stok ${jenis === 'masuk' ? 'masuk' : 'keluar'} berhasil disimpan`, 'success');
}

function openTambahStok() { openModal('modal-stok'); }

function saveNewItem() {
  const nama = document.getElementById('new-item-name')?.value.trim();
  const kat = document.getElementById('new-item-cat')?.value;
  const qty = parseInt(document.getElementById('new-item-qty')?.value) || 0;
  const minStok = parseInt(document.getElementById('new-item-min')?.value) || 5;
  const satuan = document.getElementById('new-item-unit')?.value.trim() || 'unit';
  if (!nama) { showToast('Nama item wajib diisi', 'error'); return; }
  const newItem = { id: Date.now().toString(), nama, kategori: kat, stok: qty, minStok, satuan };
  stokData.push(newItem);
  localStorage.setItem('pmb_stok', JSON.stringify(stokData));
  callGAS('saveStok', { stok: stokData }, () => { });
  closeModal('modal-stok');
  if (kat === currentOpsTab) renderStok();
  showToast('Item berhasil ditambahkan', 'success');
}

// ===== DASHBOARD =====
function loadDashboard() {
  callGAS('getPasien', {}, (res) => {
    if (!res.success) return;
    allPasienData = res.data || [];
    const todayStr = new Date().toDateString();
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    const pasienHari = allPasienData.filter(p => new Date(p.tanggalKedatangan || p.savedAt).toDateString() === todayStr);
    const pasienBulan = allPasienData.filter(p => {
      const d = new Date(p.tanggalKedatangan || p.savedAt);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    });
    const bumil = pasienBulan.filter(p => p.layanan === 'ANC');

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('dash-hari', pasienHari.length);
    set('dash-bulan', pasienBulan.length);
    set('dash-bumil', bumil.length);
    set('dash-total', allPasienData.length);
    set('dash-hari-sub', formatDate(new Date()));

    ['ANC', 'INC', 'PNC', 'KB', 'IMUNISASI', 'BAYI_BALITA', 'UMUM', 'RAWAT_INAP'].forEach(s => {
      set(`ss-${s}`, pasienBulan.filter(p => p.layanan === s).length);
    });

    const bumilList = document.getElementById('bumil-list');
    if (bumilList) {
      bumilList.innerHTML = bumil.length === 0
        ? `<div class="empty-state"><p>Belum ada data bumil aktif</p></div>`
        : bumil.slice(0, 5).map(p => `
          <div class="bumil-item">
            <div class="bumil-avatar">${(p.namaPasien || '?').charAt(0)}</div>
            <div class="bumil-info">
              <div class="bname">${p.namaPasien || '-'}</div>
              <div class="bdetail">UK: ${p.usiaKehamilan || '-'} | TP: ${p.taksiranPersalinan || '-'}</div>
            </div>
            <span class="bumil-usia">${p.usiaKehamilan || '-'}</span>
          </div>`).join('');
    }
  }, true);
  checkStokNotif();
}


import { GoogleGenAI } from "@google/genai";

declare var Chart: any;

// --- KONFIGURASI ---
const AUTH_CREDENTIALS = {
    username: 'admin',
    password: 'piket4'
};

const DEFAULT_GAS_URL = "https://script.google.com/macros/s/AKfycbw1V8Cg_saKE9010DL9ZyP6BH8hH9ArAnC6fvqFcairLfKnr-kZ2gWk3JkLxmJVqKE7/exec"; 

// --- MANAJEMEN DATA ---
interface LogSiswa { nama: string; kelas: string; jenis: string; keterangan: string; timestamp?: string; }
interface AbsenGuru { nama: string; mapel: string; status: string; inval: string; timestamp?: string; }
interface BukuTamu { nama: string; instansi: string; bertemu: string; keperluan: string; timestamp?: string; }
interface LogKejadian { kejadian: string; timestamp?: string; }

interface AppData {
    logSiswa: LogSiswa[];
    absenGuru: AbsenGuru[];
    bukuTamu: BukuTamu[];
    logKejadian: LogKejadian[];
    laporanAI: string;
}

let localData: AppData = { logSiswa: [], absenGuru: [], bukuTamu: [], logKejadian: [], laporanAI: '' };
let cloudDataStore: AppData = { logSiswa: [], absenGuru: [], bukuTamu: [], logKejadian: [], laporanAI: '' };
let displayData: AppData = { logSiswa: [], absenGuru: [], bukuTamu: [], logKejadian: [], laporanAI: '' };

let chartInstance: any = null;
let namaGuruPiket: string = "Belum diset";

// --- INISIALISASI ---
document.addEventListener('DOMContentLoaded', () => {
    setDefaultDates();
    checkAuth();
    setupEventListeners();
    loadSettings();
});

function setDefaultDates() {
    const today = new Date().toISOString().split('T')[0];
    const startInput = document.getElementById('filter-date-start') as HTMLInputElement;
    const endInput = document.getElementById('filter-date-end') as HTMLInputElement;
    if (startInput) startInput.value = today;
    if (endInput) endInput.value = today;
}

function getGasUrl() {
    return localStorage.getItem('piket_gas_url') || DEFAULT_GAS_URL;
}

function setupEventListeners() {
    document.getElementById('login-form')?.addEventListener('submit', handleLogin);
    
    const navButtons = {
        'nav-dashboard': 'dashboard',
        'nav-siswa': 'siswa',
        'nav-guru': 'guru',
        'nav-tamu': 'tamu',
        'nav-laporan': 'laporan',
        'nav-pengaturan': 'pengaturan'
    };

    Object.entries(navButtons).forEach(([id, pageId]) => {
        document.getElementById(id)?.addEventListener('click', () => router(pageId));
    });

    document.getElementById('form-siswa')?.addEventListener('submit', handleSiswaSubmit);
    document.getElementById('form-guru')?.addEventListener('submit', handleGuruSubmit);
    document.getElementById('form-tamu')?.addEventListener('submit', handleTamuSubmit);

    document.getElementById('btn-sync')?.addEventListener('click', syncData);
    document.getElementById('btn-ai-gen')?.addEventListener('click', generateAIReport);
    document.getElementById('btn-copy-report')?.addEventListener('click', copyReportToClipboard);
    document.getElementById('btn-save-settings')?.addEventListener('click', saveSettings);
    document.getElementById('btn-save-guru')?.addEventListener('click', saveGuruPiket);
    document.getElementById('btn-logout')?.addEventListener('click', handleLogout);

    const txtKejadian = document.getElementById('input-kejadian-penting') as HTMLTextAreaElement;
    txtKejadian?.addEventListener('input', (e) => {
        const val = (e.target as HTMLTextAreaElement).value;
        if (localData.logKejadian.length === 0) {
            localData.logKejadian.push({ kejadian: val, timestamp: new Date().toISOString() });
        } else {
            localData.logKejadian[0].kejadian = val;
        }
    });
}

function handleLogin(e: Event) {
    e.preventDefault();
    const user = (document.getElementById('login-user') as HTMLInputElement).value;
    const pass = (document.getElementById('login-pass') as HTMLInputElement).value;
    if (user === AUTH_CREDENTIALS.username && pass === AUTH_CREDENTIALS.password) {
        localStorage.setItem('piket_is_logged_in', 'true');
        showApp();
    } else {
        document.getElementById('login-error')?.classList.remove('hidden');
    }
}

function showApp() {
    document.getElementById('login-overlay')?.classList.add('hidden');
    document.getElementById('main-app')?.classList.remove('hidden');
    initChart();
    fetchInitialData();
    router('dashboard');
}

function checkAuth() {
    if (localStorage.getItem('piket_is_logged_in') === 'true') showApp();
}

function handleLogout() {
    if (confirm('Keluar dari aplikasi?')) {
        localStorage.removeItem('piket_is_logged_in');
        window.location.reload();
    }
}

async function fetchInitialData() {
    const url = getGasUrl();
    const statusEl = document.getElementById('sync-status');
    statusEl?.classList.remove('hidden');
    try {
        const res = await fetch(url);
        const data = await res.json();
        cloudDataStore = {
            logSiswa: data.logSiswa || [],
            absenGuru: data.absenGuru || [],
            bukuTamu: data.bukuTamu || [],
            logKejadian: data.logKejadian || [],
            laporanAI: ''
        };
        refreshDisplay();
    } catch (e) {
        console.error("Gagal ambil data awal");
    } finally {
        statusEl?.classList.add('hidden');
    }
}

function refreshDisplay() {
    displayData.logSiswa = [...cloudDataStore.logSiswa, ...localData.logSiswa];
    displayData.absenGuru = [...cloudDataStore.absenGuru, ...localData.absenGuru];
    displayData.bukuTamu = [...cloudDataStore.bukuTamu, ...localData.bukuTamu];
    displayData.logKejadian = [...cloudDataStore.logKejadian, ...localData.logKejadian];
    
    const s = document.getElementById('stat-siswa');
    const g = document.getElementById('stat-guru');
    const t = document.getElementById('stat-tamu');
    if (s) s.innerText = displayData.logSiswa.length.toString();
    if (g) g.innerText = displayData.absenGuru.length.toString();
    if (t) t.innerText = displayData.bukuTamu.length.toString();

    if (chartInstance) {
        const counts: any = {};
        displayData.logSiswa.forEach(x => counts[x.jenis] = (counts[x.jenis] || 0) + 1);
        chartInstance.data.labels = Object.keys(counts);
        chartInstance.data.datasets[0].data = Object.values(counts);
        chartInstance.update();
    }
}

function initChart() {
    const canvas = document.getElementById('chartPelanggaran') as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: { labels: [], datasets: [{ label: 'Jumlah', data: [], backgroundColor: '#3b82f6' }] },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function router(pageId: string) {
    document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));
    document.getElementById(`page-${pageId}`)?.classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`nav-${pageId}`)?.classList.add('active');
    
    const icons: any = { dashboard: 'chart-pie', siswa: 'user-shield', guru: 'chalkboard-user', tamu: 'id-card-clip', laporan: 'wand-sparkles', pengaturan: 'cog' };
    const titles: any = { dashboard: 'Dashboard', siswa: 'Siswa', guru: 'Guru', tamu: 'Tamu', laporan: 'Asisten AI', pengaturan: 'Pengaturan' };
    const ic = document.getElementById('page-icon');
    const pt = document.getElementById('page-title');
    if (ic) ic.className = `fas fa-${icons[pageId]}`;
    if (pt) pt.innerText = titles[pageId];
}

function handleSiswaSubmit(e: Event) {
    e.preventDefault();
    localData.logSiswa.push({
        nama: (document.getElementById('siswa-nama') as HTMLInputElement).value,
        kelas: (document.getElementById('siswa-kelas') as HTMLInputElement).value,
        jenis: (document.getElementById('siswa-jenis') as HTMLSelectElement).value,
        keterangan: (document.getElementById('siswa-ket') as HTMLInputElement).value,
        timestamp: new Date().toISOString()
    });
    refreshDisplay();
    (e.target as HTMLFormElement).reset();
    alert('Tersimpan lokal.');
}

function handleGuruSubmit(e: Event) {
    e.preventDefault();
    localData.absenGuru.push({
        nama: (document.getElementById('guru-nama') as HTMLInputElement).value,
        mapel: (document.getElementById('guru-mapel') as HTMLInputElement).value,
        status: (document.getElementById('guru-status') as HTMLSelectElement).value,
        inval: (document.getElementById('guru-inval') as HTMLInputElement).value,
        timestamp: new Date().toISOString()
    });
    refreshDisplay();
    (e.target as HTMLFormElement).reset();
    alert('Data guru tersimpan.');
}

function handleTamuSubmit(e: Event) {
    e.preventDefault();
    localData.bukuTamu.push({
        nama: (document.getElementById('tamu-nama') as HTMLInputElement).value,
        instansi: (document.getElementById('tamu-instansi') as HTMLInputElement).value,
        bertemu: (document.getElementById('tamu-bertemu') as HTMLInputElement).value,
        keperluan: (document.getElementById('tamu-keperluan') as HTMLInputElement).value,
        timestamp: new Date().toISOString()
    });
    refreshDisplay();
    (e.target as HTMLFormElement).reset();
    alert('Tamu terdaftar.');
}

// Fungsi filter tanggal yang lebih kuat
function filterByDateRange(data: any[], start: string, end: string) {
    if (!start || !end) return data;
    const startDate = new Date(start);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(end);
    endDate.setHours(23, 59, 59, 999);

    return data.filter(item => {
        if (!item.timestamp) return false;
        const itemDate = new Date(item.timestamp);
        return itemDate >= startDate && itemDate <= endDate;
    });
}

async function generateAIReport() {
    const startVal = (document.getElementById('filter-date-start') as HTMLInputElement).value;
    const endVal = (document.getElementById('filter-date-end') as HTMLInputElement).value;

    const filteredSiswa = filterByDateRange(displayData.logSiswa, startVal, endVal);
    const filteredGuru = filterByDateRange(displayData.absenGuru, startVal, endVal);
    const filteredTamu = filterByDateRange(displayData.bukuTamu, startVal, endVal);
    const filteredKejadian = filterByDateRange(displayData.logKejadian, startVal, endVal);

    if (filteredSiswa.length === 0 && filteredGuru.length === 0 && filteredTamu.length === 0 && filteredKejadian.length === 0) {
        alert("Tidak ditemukan data pada rentang tanggal tersebut (" + startVal + " s/d " + endVal + "). Pastikan data sudah disinkronkan ke database.");
        return;
    }

    const btn = document.getElementById('btn-ai-gen') as HTMLButtonElement;
    const loader = document.getElementById('ai-loading');
    const resultArea = document.getElementById('ai-result');

    btn.disabled = true;
    loader?.classList.remove('hidden');
    resultArea?.classList.add('hidden');

    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        const prompt = `
            Tugas: Buat laporan piket sekolah formal untuk UPT SMPN 4 MAPPEDECENG.
            Rentang Waktu Laporan: ${startVal} sampai ${endVal}
            Petugas Piket: ${namaGuruPiket}
            
            Gunakan data mentah berikut:
            - Pelanggaran Siswa: ${JSON.stringify(filteredSiswa)}
            - Ketidakhadiran Guru: ${JSON.stringify(filteredGuru)}
            - Tamu Sekolah: ${JSON.stringify(filteredTamu)}
            - Narasi Kejadian: ${JSON.stringify(filteredKejadian)}
            
            PERATURAN FORMAT SANGAT KETAT:
            1. JANGAN GUNAKAN SIMBOL MARKDOWN APAPUN. Dilarang keras menggunakan simbol: #, ##, ###, **, __, atau *.
            2. Gunakan Huruf Kapital untuk Judul Bagian.
            3. Gunakan penomoran manual (1., 2., 3.) untuk daftar.
            4. Gunakan Bahasa Indonesia yang sangat formal, rapi, dan santun.
            5. Struktur Laporan:
               - JUDUL: LAPORAN HARIAN GURU PIKET
               - BAGIAN 1: PENDAHULUAN (Cantumkan tanggal dan petugas)
               - BAGIAN 2: REKAPITULASI SISWA (Sebutkan nama siswa, kelas, dan jenis kendala)
               - BAGIAN 3: REKAPITULASI GURU & TAMU
               - BAGIAN 4: CATATAN PERISTIWA PENTING
               - BAGIAN 5: KESIMPULAN & SARAN TINDAK LANJUT
        `;
        
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
        });

        let text = response.text || "Gagal menghasilkan laporan.";
        
        // Pembersihan Paksa via Regex untuk memastikan tidak ada Markdown yang lolos
        const cleanText = text
            .replace(/[#*`_]/g, '') // Hapus pagar, bintang, backtick, underscore
            .replace(/^\s+|\s+$/g, ''); // Hapus spasi di awal/akhir

        localData.laporanAI = cleanText;
        if (resultArea) resultArea.innerText = cleanText;
        document.getElementById('btn-copy-report')?.classList.remove('hidden');
    } catch (e: any) {
        alert('Maaf, AI mengalami kendala: ' + e.message);
    } finally {
        loader?.classList.add('hidden');
        resultArea?.classList.remove('hidden');
        btn.disabled = false;
    }
}

async function syncData() {
    const url = getGasUrl();
    const statusEl = document.getElementById('sync-status');
    statusEl?.classList.remove('hidden');
    
    const payload = {
        logSiswa: localData.logSiswa,
        absenGuru: localData.absenGuru,
        bukuTamu: localData.bukuTamu,
        laporanKejadian: localData.logKejadian.map(l => l.kejadian).join("\n"),
        laporanAI: localData.laporanAI
    };

    try {
        await fetch(url, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify(payload)
        });
        alert('SINKRONISASI BERHASIL! Data sekarang tersimpan di Google Sheets.');
        localData = { logSiswa: [], absenGuru: [], bukuTamu: [], logKejadian: [], laporanAI: '' };
        (document.getElementById('input-kejadian-penting') as HTMLTextAreaElement).value = '';
        setTimeout(() => fetchInitialData(), 1500);
    } catch (e) {
        alert('Gagal mengirim data. Periksa koneksi internet atau URL API.');
    } finally {
        statusEl?.classList.add('hidden');
    }
}

function saveSettings() {
    const url = (document.getElementById('config-gas-url') as HTMLInputElement).value;
    localStorage.setItem('piket_gas_url', url);
    alert('URL Endpoint disimpan!');
}

function loadSettings() {
    const input = document.getElementById('config-gas-url') as HTMLInputElement;
    if (input) input.value = getGasUrl();
    namaGuruPiket = localStorage.getItem('piket_guru_nama') || "Belum diset";
    updateGuruDisplay();
}

function saveGuruPiket() {
    const input = document.getElementById('input-guru-piket') as HTMLInputElement;
    if (input.value) {
        namaGuruPiket = input.value;
        localStorage.setItem('piket_guru_nama', namaGuruPiket);
        updateGuruDisplay();
        alert('Nama Guru Piket berhasil diset!');
    }
}

function updateGuruDisplay() {
    const d = document.getElementById('display-guru-piket');
    if (d) d.innerText = `Guru Piket: ${namaGuruPiket}`;
}

function copyReportToClipboard() {
    const t = document.getElementById('ai-result')?.innerText;
    if (t) {
        navigator.clipboard.writeText(t).then(() => {
            alert('Laporan berhasil disalin ke papan klip! Silakan buka WhatsApp dan pilih Tempel/Paste.');
        });
    }
}

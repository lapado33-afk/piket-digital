
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
    
    // Pastikan chart dibuat di awal
    setTimeout(() => {
        initChart();
    }, 500);
});

function setDefaultDates() {
    const today = new Date().toISOString().split('T')[0];
    const startInput = document.getElementById('filter-date-start') as HTMLInputElement;
    const endInput = document.getElementById('filter-date-end') as HTMLInputElement;
    const dashboardDateInput = document.getElementById('dashboard-date-filter') as HTMLInputElement;

    if (startInput) startInput.value = today;
    if (endInput) endInput.value = today;
    if (dashboardDateInput) dashboardDateInput.value = today;
}

function getGasUrl() {
    return localStorage.getItem('piket_gas_url') || DEFAULT_GAS_URL;
}

function setupEventListeners() {
    document.getElementById('login-form')?.addEventListener('submit', handleLogin);
    
    // Panduan Modal Logic
    const btnOpenGuide = document.getElementById('btn-open-guide');
    const btnCloseGuide = document.getElementById('btn-close-guide');
    const modalGuide = document.getElementById('modal-guide');

    btnOpenGuide?.addEventListener('click', () => {
        modalGuide?.classList.add('active');
    });

    btnCloseGuide?.addEventListener('click', () => {
        modalGuide?.classList.remove('active');
    });

    // Close on overlay click
    modalGuide?.addEventListener('click', (e) => {
        if (e.target === modalGuide) {
            modalGuide.classList.remove('active');
        }
    });

    // Dashboard Date Filter
    document.getElementById('dashboard-date-filter')?.addEventListener('change', () => {
        refreshDisplay();
    });

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
        const err = document.getElementById('login-error');
        if (err) err.classList.remove('hidden');
    }
}

function showApp() {
    document.getElementById('login-overlay')?.classList.add('hidden');
    document.getElementById('main-app')?.classList.remove('hidden');
    fetchInitialData();
    router('dashboard');
}

function checkAuth() {
    if (localStorage.getItem('piket_is_logged_in') === 'true') showApp();
}

function handleLogout() {
    if (confirm('Keluar dari sistem Buku Piket?')) {
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
        console.error("Gagal ambil data cloud awal");
    } finally {
        statusEl?.classList.add('hidden');
    }
}

function refreshDisplay() {
    const dashboardDate = (document.getElementById('dashboard-date-filter') as HTMLInputElement)?.value;
    
    // Combine local and cloud data
    let allSiswa = [...cloudDataStore.logSiswa, ...localData.logSiswa];
    let allGuru = [...cloudDataStore.absenGuru, ...localData.absenGuru];
    let allTamu = [...cloudDataStore.bukuTamu, ...localData.bukuTamu];
    
    // Filter by Dashboard Date if set
    if (dashboardDate) {
        allSiswa = filterByDateRange(allSiswa, dashboardDate, dashboardDate);
        allGuru = filterByDateRange(allGuru, dashboardDate, dashboardDate);
        allTamu = filterByDateRange(allTamu, dashboardDate, dashboardDate);
    }

    displayData.logSiswa = allSiswa;
    displayData.absenGuru = allGuru;
    displayData.bukuTamu = allTamu;
    // Log kejadian normally only shows today's local entry for editing
    displayData.logKejadian = [...cloudDataStore.logKejadian, ...localData.logKejadian];
    
    const s = document.getElementById('stat-siswa');
    const g = document.getElementById('stat-guru');
    const t = document.getElementById('stat-tamu');
    if (s) s.innerText = displayData.logSiswa.length.toString();
    if (g) g.innerText = displayData.absenGuru.length.toString();
    if (t) t.innerText = displayData.bukuTamu.length.toString();

    updateChart();
}

function initChart() {
    const canvas = document.getElementById('chartPelanggaran') as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: { 
            labels: ['Terlambat', 'Izin', 'Sakit', 'Atribut', 'Berat'], 
            datasets: [{ 
                label: 'Jumlah Kejadian', 
                data: [0, 0, 0, 0, 0], 
                backgroundColor: '#3b82f6',
                borderRadius: 8
            }] 
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, grid: { display: false } } }
        }
    });
}

function updateChart() {
    if (!chartInstance) return;
    const counts: any = { 'Terlambat': 0, 'Izin': 0, 'Sakit': 0, 'Pelanggaran Atribut': 0, 'Pelanggaran Berat': 0 };
    displayData.logSiswa.forEach(x => {
        if (counts[x.jenis] !== undefined) counts[x.jenis]++;
    });
    
    chartInstance.data.labels = Object.keys(counts);
    chartInstance.data.datasets[0].data = Object.values(counts);
    chartInstance.update();
}

function router(pageId: string) {
    document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));
    document.getElementById(`page-${pageId}`)?.classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`nav-${pageId}`)?.classList.add('active');
    
    const icons: any = { dashboard: 'chart-pie', siswa: 'user-shield', guru: 'chalkboard-user', tamu: 'id-card-clip', laporan: 'wand-sparkles', pengaturan: 'cog' };
    const titles: any = { dashboard: 'Dashboard Utama', siswa: 'Log Siswa', guru: 'Data Guru', tamu: 'Buku Tamu', laporan: 'Asisten AI', pengaturan: 'Sistem' };
    const ic = document.getElementById('page-icon');
    const pt = document.getElementById('page-title');
    if (ic) ic.className = `fas fa-${icons[pageId]}`;
    if (pt) pt.innerText = titles[pageId];

    if (pageId === 'dashboard') {
        setTimeout(initChart, 200);
        refreshDisplay();
    }
}

function handleSiswaSubmit(e: Event) {
    e.preventDefault();
    localData.logSiswa.push({
        nama: (document.getElementById('siswa-nama') as HTMLInputElement).value,
        kelas: (document.getElementById('siswa-kelas') as HTMLInputElement).value,
        jenis: (document.getElementById('siswa-jenis') as HTMLSelectElement).value,
        keterangan: (document.getElementById('siswa-ket') as HTMLTextAreaElement).value,
        timestamp: new Date().toISOString()
    });
    refreshDisplay();
    (e.target as HTMLFormElement).reset();
    alert('Data siswa tercatat secara lokal.');
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
    alert('Data guru tercatat.');
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
    alert('Data tamu berhasil disimpan.');
}

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
        alert("Ops! Tidak ada data pada rentang " + startVal + " sampai " + endVal + ". Coba sinkronkan data atau ganti tanggal.");
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
            Tugas: Susun laporan resmi harian Guru Piket untuk UPT SMPN 4 MAPPEDECENG.
            Periode Laporan: ${startVal} s/d ${endVal}
            Petugas Piket Utama: ${namaGuruPiket}
            
            Gunakan data ini sebagai sumber:
            - Catatan Kedisiplinan Siswa: ${JSON.stringify(filteredSiswa)}
            - Absensi Guru & Pengganti (Inval): ${JSON.stringify(filteredGuru)}
            - Kunjungan Tamu: ${JSON.stringify(filteredTamu)}
            - Narasi Kejadian Khusus: ${JSON.stringify(filteredKejadian)}
            
            KETENTUAN FORMAT (SANGAT PENTING):
            1. DILARANG MENGGUNAKAN SIMBOL MARKDOWN (Tanpa #, tanpa *, tanpa **).
            2. Gunakan huruf kapital untuk setiap JUDUL BAGIAN.
            3. Gunakan penomoran manual seperti 1., 2., 3. atau a., b., c.
            4. Tulis dalam Bahasa Indonesia yang formal, santun, dan sangat rapi.
            5. Susunan Laporan:
               - LAPORAN HARIAN GURU PIKET UPT SMPN 4 MAPPEDECENG
               - I. IDENTITAS PETUGAS DAN WAKTU
               - II. REKAPITULASI KEDISIPLINAN SISWA (Rangkum secara jelas per kategori)
               - III. REKAPITULASI KEHADIRAN GURU & TAMU (Sebutkan siapa saja dan keperluannya)
               - IV. CATATAN PERISTIWA MENONJOL (Narasi dari kejadian khusus)
               - V. EVALUASI DAN REKOMENDASI UNTUK SEKOLAH
        `;
        
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
        });

        const rawText = response.text || "Terjadi kesalahan teknis saat AI menyusun laporan.";
        
        // Pembersihan simbol tambahan secara otomatis jika AI membandel
        const cleanText = rawText
            .replace(/[#*`_]/g, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

        localData.laporanAI = cleanText;
        if (resultArea) resultArea.innerText = cleanText;
        document.getElementById('btn-copy-report')?.classList.remove('hidden');
    } catch (e: any) {
        alert('Gagal Generate AI: ' + e.message);
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
        alert('DATA BERHASIL DISINKRONKAN KE GOOGLE SHEETS!');
        localData = { logSiswa: [], absenGuru: [], bukuTamu: [], logKejadian: [], laporanAI: '' };
        (document.getElementById('input-kejadian-penting') as HTMLTextAreaElement).value = '';
        setTimeout(() => fetchInitialData(), 1500);
    } catch (e) {
        alert('Gagal sinkronisasi. Pastikan URL Script sudah benar.');
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
        alert('Nama Guru Piket aktif hari ini telah disimpan.');
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
            alert('Laporan berhasil disalin! Silakan tempelkan (Paste) di WhatsApp.');
        });
    }
}

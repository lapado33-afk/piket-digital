
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
    
    setTimeout(() => {
        initChart();
    }, 500);
});

function setDefaultDates() {
    const today = new Date().toISOString().split('T')[0];
    const inputs = ['filter-date-start', 'filter-date-end', 'dashboard-date-filter'];
    inputs.forEach(id => {
        const el = document.getElementById(id) as HTMLInputElement;
        if (el) el.value = today;
    });
}

function getGasUrl() {
    return localStorage.getItem('piket_gas_url') || DEFAULT_GAS_URL;
}

function setupEventListeners() {
    document.getElementById('login-form')?.addEventListener('submit', handleLogin);
    
    // Panduan Modal
    const btnOpenGuide = document.getElementById('btn-open-guide');
    const btnCloseGuide = document.getElementById('btn-close-guide');
    const modalGuide = document.getElementById('modal-guide');

    btnOpenGuide?.addEventListener('click', () => modalGuide?.classList.replace('hidden', 'flex'));
    btnCloseGuide?.addEventListener('click', () => modalGuide?.classList.replace('flex', 'hidden'));
    modalGuide?.addEventListener('click', (e) => { if (e.target === modalGuide) modalGuide.classList.replace('flex', 'hidden'); });

    // Dashboard Date Filter
    document.getElementById('dashboard-date-filter')?.addEventListener('change', refreshDisplay);

    // Sidebar Nav (Desktop)
    const sidebarNavs = {
        'nav-dashboard': 'dashboard', 'nav-siswa': 'siswa', 'nav-guru': 'guru',
        'nav-tamu': 'tamu', 'nav-laporan': 'laporan', 'nav-pengaturan': 'pengaturan'
    };
    Object.entries(sidebarNavs).forEach(([id, pageId]) => {
        document.getElementById(id)?.addEventListener('click', () => router(pageId));
    });

    // Bottom Nav (Mobile)
    const mobileNavs = {
        'btn-mob-dashboard': 'dashboard', 'btn-mob-siswa': 'siswa', 'btn-mob-guru': 'guru',
        'btn-mob-tamu': 'tamu', 'btn-mob-laporan': 'laporan', 'btn-mob-pengaturan': 'pengaturan'
    };
    Object.entries(mobileNavs).forEach(([id, pageId]) => {
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
    document.getElementById('btn-logout-mobile')?.addEventListener('click', handleLogout);

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
        console.error("Gagal ambil data cloud");
    } finally {
        statusEl?.classList.add('hidden');
    }
}

function refreshDisplay() {
    const dashboardDate = (document.getElementById('dashboard-date-filter') as HTMLInputElement)?.value;
    let allSiswa = [...cloudDataStore.logSiswa, ...localData.logSiswa];
    let allGuru = [...cloudDataStore.absenGuru, ...localData.absenGuru];
    let allTamu = [...cloudDataStore.bukuTamu, ...localData.bukuTamu];
    
    if (dashboardDate) {
        allSiswa = filterByDateRange(allSiswa, dashboardDate, dashboardDate);
        allGuru = filterByDateRange(allGuru, dashboardDate, dashboardDate);
        allTamu = filterByDateRange(allTamu, dashboardDate, dashboardDate);
    }

    displayData.logSiswa = allSiswa;
    displayData.absenGuru = allGuru;
    displayData.bukuTamu = allTamu;
    displayData.logKejadian = [...cloudDataStore.logKejadian, ...localData.logKejadian];
    
    ['stat-siswa', 'stat-guru', 'stat-tamu'].forEach((id, idx) => {
        const el = document.getElementById(id);
        const data = [displayData.logSiswa, displayData.absenGuru, displayData.bukuTamu][idx];
        if (el) el.innerText = data.length.toString();
    });

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
            datasets: [{ data: [0, 0, 0, 0, 0], backgroundColor: '#3b82f6', borderRadius: 6 }] 
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
        }
    });
}

function updateChart() {
    if (!chartInstance) return;
    const counts: any = { 'Terlambat': 0, 'Izin': 0, 'Sakit': 0, 'Pelanggaran Atribut': 0, 'Pelanggaran Berat': 0 };
    displayData.logSiswa.forEach(x => { if (counts[x.jenis] !== undefined) counts[x.jenis]++; });
    chartInstance.data.datasets[0].data = Object.values(counts);
    chartInstance.update();
}

function router(pageId: string) {
    // Hide all sections
    document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));
    document.getElementById(`page-${pageId}`)?.classList.add('active');
    
    // Update Desktop Sidebar UI
    document.querySelectorAll('.nav-btn-sidebar').forEach(btn => btn.classList.remove('bg-white/20', 'text-white'));
    document.getElementById(`nav-${pageId}`)?.classList.add('bg-white/20', 'text-white');

    // Update Mobile Bottom Nav UI
    document.querySelectorAll('.nav-btn-mobile').forEach(btn => btn.classList.remove('text-blue-500'));
    const mobBtn = {
        dashboard: 'btn-mob-dashboard', siswa: 'btn-mob-siswa', guru: 'btn-mob-guru',
        tamu: 'btn-mob-tamu', laporan: 'btn-mob-laporan', pengaturan: 'btn-mob-pengaturan'
    }[pageId];
    document.getElementById(mobBtn || '')?.classList.add('text-blue-500');
    
    const meta: any = { 
        dashboard: ['chart-pie', 'Dashboard'], siswa: ['user-shield', 'Log Siswa'], 
        guru: ['chalkboard-user', 'Absensi Guru'], tamu: ['id-card-clip', 'Buku Tamu'], 
        laporan: ['wand-sparkles', 'Asisten AI'], pengaturan: ['cog', 'Sistem'] 
    };
    
    const ic = document.getElementById('page-icon');
    const pt = document.getElementById('page-title');
    if (ic) ic.className = `fas fa-${meta[pageId][0]}`;
    if (pt) pt.innerText = meta[pageId][1];

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
    alert('Data tersimpan.');
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
    alert('Data tersimpan.');
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
    alert('Data tamu tercatat.');
}

function filterByDateRange(data: any[], start: string, end: string) {
    if (!start || !end) return data;
    const s = new Date(start); s.setHours(0,0,0,0);
    const e = new Date(end); e.setHours(23,59,59,999);
    return data.filter(item => {
        if (!item.timestamp) return false;
        const d = new Date(item.timestamp);
        return d >= s && d <= e;
    });
}

async function generateAIReport() {
    const sVal = (document.getElementById('filter-date-start') as HTMLInputElement).value;
    const eVal = (document.getElementById('filter-date-end') as HTMLInputElement).value;

    const fs = filterByDateRange(displayData.logSiswa, sVal, eVal);
    const fg = filterByDateRange(displayData.absenGuru, sVal, eVal);
    const ft = filterByDateRange(displayData.bukuTamu, sVal, eVal);
    const fk = filterByDateRange(displayData.logKejadian, sVal, eVal);

    if (!fs.length && !fg.length && !ft.length && !fk.length) {
        alert("Tidak ada data untuk rentang ini.");
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
        const prompt = `Susun laporan resmi Guru Piket UPT SMPN 4 MAPPEDECENG. Periode: ${sVal} - ${eVal}. Piket: ${namaGuruPiket}. Data: Siswa ${JSON.stringify(fs)}, Guru ${JSON.stringify(fg)}, Tamu ${JSON.stringify(ft)}, Kejadian ${JSON.stringify(fk)}. Format: Kapital JUDUL BAGIAN, rapi, tanpa simbol markdown (* atau #). Gunakan bahasa formal Indonesia.`;
        
        const res = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: prompt });
        const cleanText = (res.text || "").replace(/[#*`_]/g, '').trim();

        localData.laporanAI = cleanText;
        if (resultArea) resultArea.innerText = cleanText;
        document.getElementById('btn-copy-report')?.classList.remove('hidden');
    } catch (e: any) {
        alert('AI Error: ' + e.message);
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
        await fetch(url, { method: 'POST', mode: 'no-cors', body: JSON.stringify(payload) });
        alert('Berhasil sinkron!');
        localData = { logSiswa: [], absenGuru: [], bukuTamu: [], logKejadian: [], laporanAI: '' };
        (document.getElementById('input-kejadian-penting') as HTMLTextAreaElement).value = '';
        setTimeout(fetchInitialData, 1000);
    } catch (e) {
        alert('Gagal sinkron.');
    } finally {
        statusEl?.classList.add('hidden');
    }
}

function saveSettings() {
    const url = (document.getElementById('config-gas-url') as HTMLInputElement).value;
    localStorage.setItem('piket_gas_url', url);
    alert('Simpan URL!');
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
        alert('Nama guru piket diset.');
    }
}

function updateGuruDisplay() {
    const d = document.getElementById('display-guru-piket');
    if (d) d.innerText = `Guru Piket: ${namaGuruPiket}`;
}

function copyReportToClipboard() {
    const t = document.getElementById('ai-result')?.innerText;
    if (t) {
        navigator.clipboard.writeText(t).then(() => alert('Teks laporan disalin!'));
    }
}

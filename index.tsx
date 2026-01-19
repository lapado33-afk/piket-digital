
import { GoogleGenAI } from "@google/genai";

declare var Chart: any;

// --- KONFIGURASI ---
const AUTH_CREDENTIALS = {
    username: 'admin',
    password: 'piket4'
};

const DEFAULT_GAS_URL = "https://script.google.com/macros/s/AKfycbw1V8Cg_saKE9010DL9ZyP6BH8hH9ArAnC6fvqFcairLfKnr-kZ2gWk3JkLxmJVqKE7/exec"; 

// --- MANAJEMEN DATA ---
interface LogSiswa { nama: string; kelas: string; jenis: string; keterangan: string; }
interface AbsenGuru { nama: string; mapel: string; status: string; inval: string; }
interface BukuTamu { nama: string; instansi: string; bertemu: string; keperluan: string; }

interface AppData {
    logSiswa: LogSiswa[];
    absenGuru: AbsenGuru[];
    bukuTamu: BukuTamu[];
    laporanKejadian: string;
    laporanAI: string;
}

let localData: AppData = { logSiswa: [], absenGuru: [], bukuTamu: [], laporanKejadian: '', laporanAI: '' };
let cloudDataStore: AppData = { logSiswa: [], absenGuru: [], bukuTamu: [], laporanKejadian: '', laporanAI: '' };
let displayData: AppData = { logSiswa: [], absenGuru: [], bukuTamu: [], laporanKejadian: '', laporanAI: '' };

let chartInstance: any = null;
let namaGuruPiket: string = "Belum diset";

// --- INISIALISASI ---
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    setupEventListeners();
    loadSettings();
});

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
    document.getElementById('btn-fullscreen')?.addEventListener('click', toggleFullscreen);

    const txtKejadian = document.getElementById('input-kejadian-penting') as HTMLTextAreaElement;
    txtKejadian?.addEventListener('input', (e) => {
        localData.laporanKejadian = (e.target as HTMLTextAreaElement).value;
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
            laporanKejadian: '',
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
}

function handleSiswaSubmit(e: Event) {
    e.preventDefault();
    localData.logSiswa.push({
        nama: (document.getElementById('siswa-nama') as HTMLInputElement).value,
        kelas: (document.getElementById('siswa-kelas') as HTMLInputElement).value,
        jenis: (document.getElementById('siswa-jenis') as HTMLSelectElement).value,
        keterangan: (document.getElementById('siswa-ket') as HTMLInputElement).value
    });
    refreshDisplay();
    (e.target as HTMLFormElement).reset();
    alert('Tersimpan di memori lokal.');
}

function handleGuruSubmit(e: Event) {
    e.preventDefault();
    localData.absenGuru.push({
        nama: (document.getElementById('guru-nama') as HTMLInputElement).value,
        mapel: (document.getElementById('guru-mapel') as HTMLInputElement).value,
        status: (document.getElementById('guru-status') as HTMLSelectElement).value,
        inval: (document.getElementById('guru-inval') as HTMLInputElement).value
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
        keperluan: (document.getElementById('tamu-keperluan') as HTMLInputElement).value
    });
    refreshDisplay();
    (e.target as HTMLFormElement).reset();
    alert('Tamu terdaftar.');
}

async function generateAIReport() {
    const btn = document.getElementById('btn-ai-gen') as HTMLButtonElement;
    const loader = document.getElementById('ai-loading');
    const resultArea = document.getElementById('ai-result');

    btn.disabled = true;
    loader?.classList.remove('hidden');
    resultArea?.classList.add('hidden');

    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const prompt = `Buat laporan piket formal untuk UPT SMPN 4 MAPPEDECENG. Guru Piket: ${namaGuruPiket}. Data: Siswa(${JSON.stringify(displayData.logSiswa)}), Guru(${JSON.stringify(displayData.absenGuru)}), Tamu(${JSON.stringify(displayData.bukuTamu)}), Kejadian(${localData.laporanKejadian}). Buat dalam 3 bagian: I. Narasi Kejadian, II. Analisis Situasi, III. Rekomendasi.`;
        
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
        });

        const text = response.text || "Gagal merangkum laporan.";
        localData.laporanAI = text;
        if (resultArea) resultArea.innerText = text;
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
    try {
        await fetch(url, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify(localData)
        });
        alert('SINKRONISASI BERHASIL!');
        localData = { logSiswa: [], absenGuru: [], bukuTamu: [], laporanKejadian: '', laporanAI: '' };
        setTimeout(() => fetchInitialData(), 1000);
    } catch (e) {
        alert('Gagal kirim ke cloud.');
    } finally {
        statusEl?.classList.add('hidden');
    }
}

function saveSettings() {
    const url = (document.getElementById('config-gas-url') as HTMLInputElement).value;
    localStorage.setItem('piket_gas_url', url);
    alert('URL disimpan!');
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
    }
}

function updateGuruDisplay() {
    const d = document.getElementById('display-guru-piket');
    if (d) d.innerText = `Guru Piket: ${namaGuruPiket}`;
}

function copyReportToClipboard() {
    const t = document.getElementById('ai-result')?.innerText;
    if (t) navigator.clipboard.writeText(t).then(() => alert('Tersalin!'));
}

function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
}

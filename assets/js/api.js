// assets/js/api.js

// Inisialisasi Supabase
const SUPABASE_URL = 'https://vmkhvgpxdsfuaaorlhhu.supabase.co'; 
const SUPABASE_KEY = 'sb_publishable_MQK8pGpvQ-A3Ld_qjX4akw__FIhoD_h'; 
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Fungsi sentral untuk menembak ke Supabase
async function callAPI(action, payload) {
    try {
        if (action === 'login') {
            const { data, error } = await supabaseClient
                .from('akun')
                .select('*')
                .eq('username', payload.username)
                .eq('password', payload.password)
                .maybeSingle(); 

            if (error || !data) return { success: false, message: "Username atau Password salah!" };
            return { success: true, user: data.nama_admin };
        } 
        
        else if (action === 'getTeachers') {
            const { data, error } = await supabaseClient.from('guru').select('nama, keterangan');
            if (error) throw error;
            return { success: true, data: data };
        } 
        
        else if (action === 'getTodayAttendance') {
            const today = new Date();
            today.setHours(0, 0, 0, 0); 
            const startOfDay = today.toISOString();
            
            const { data, error } = await supabaseClient.from('absensi').select('*').gte('waktu', startOfDay); 
            if (error) throw error;
            
            const formattedData = data.map(item => ({
                waktu: new Date(item.waktu).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
                nama: item.nama,
                status: item.status,
                alasan: item.alasan || "",
                petugas: item.admin_name
            }));
            return { success: true, data: formattedData };
        } 
        
        else if (action === 'submitAttendance') {
            const payloadArray = Array.isArray(payload) ? payload : [payload];
            const insertData = payloadArray.map(p => {
                const guru = dbTeachers.find(g => g.nama === p.nama);
                return {
                    waktu: p.offlineTimestamp ? new Date(p.offlineTimestamp).toISOString() : new Date().toISOString(),
                    nama: p.nama,
                    keterangan: guru ? guru.keterangan : "-",
                    status: p.status,
                    alasan: p.status === "Hadir" ? "" : (p.alasan || "Alfa"),
                    admin_name: p.adminName
                };
            });

            const { error } = await supabaseClient.from('absensi').insert(insertData);
            if (error) throw error;
            return { success: true, message: `Berhasil menyimpan data absensi.` };
        }
    } catch (error) {
        console.error("Supabase Error:", error);
        throw new Error("Gagal terhubung ke database.");
    }
}
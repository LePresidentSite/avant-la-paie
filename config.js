// ============================================================
// Configuration Supabase + API
// ============================================================

const SUPABASE_URL = 'https://rnfsvzhnxkajlldunmoo.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_KfX4KQtVUIA9PRlQLUdB5Q_zdol05LH';

// URL du serveur API (Vercel)
const API_URL = 'https://avant-la-paie.vercel.app';

// Initialiser le client Supabase
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

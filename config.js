// ============================================================
// Configuration Supabase
// Ce fichier contient les clés publiques (OK d'être public)
// ============================================================

const SUPABASE_URL = 'https://rnfsvzhnxkajlldunmoo.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_KfX4KQtVUIA9PRlQLUdB5Q_zdol05LH';

// Initialiser le client Supabase
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

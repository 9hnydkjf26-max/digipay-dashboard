// Supabase Configuration
// Replace YOUR_SUPABASE_ANON_KEY_HERE with your actual Supabase anon key
// Get it from: Supabase Dashboard → Settings → API → anon public

const SUPABASE_CONFIG = {
    url: 'https://hzdybwclwqkcobpwxzoo.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6ZHlid2Nsd3FrY29icHd4em9vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYxNzU4ODQsImV4cCI6MjA4MTc1MTg4NH0.e0mSI7Qp9sRaclOwP61guBNtwTVHYXc-TtVaUON67QU'
};

// Make config available to HTML files
// DO NOT declare 'supabase' here - that happens in the HTML file
if (typeof window !== 'undefined') {
    window.SUPABASE_CONFIG = SUPABASE_CONFIG;
}

// DEBUG: Log to confirm config is loaded
console.log('✓ Config loaded successfully');
console.log('✓ Supabase URL:', SUPABASE_CONFIG.url);
console.log('✓ Anon key configured:', SUPABASE_CONFIG.anonKey !== 'YOUR_SUPABASE_ANON_KEY_HERE' ? 'Yes' : 'No - Please update!');


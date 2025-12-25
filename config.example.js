// Supabase Configuration Template
// 
// Instructions:
// 1. Copy this file and rename it to "config.js"
// 2. Replace the placeholder values below with your actual Supabase credentials
// 3. Never commit config.js to git (it's in .gitignore)
//
// To get your credentials:
// - Go to your Supabase Dashboard: https://supabase.com/dashboard
// - Select your project
// - Navigate to Settings → API
// - Copy the "Project URL" and "anon public" key

const SUPABASE_CONFIG = {
    // Your Supabase project URL
    url: 'https://hzdybwclwqkcobpwxzoo.supabase.co',
    
    // Your Supabase anon (public) key
    // This is safe to use in frontend code as it's protected by RLS policies
    anonKey: 'YOUR_SUPABASE_ANON_KEY_HERE'
};

// Export for use in other files
if (typeof window !== 'undefined') {
    window.SUPABASE_CONFIG = SUPABASE_CONFIG;
}

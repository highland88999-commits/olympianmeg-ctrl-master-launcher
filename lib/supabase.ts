import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://amulgdbdvxpikpmldyoq.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFtdWxnZGJkdnhwaWtwbWxkeW9xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MDU3MzgsImV4cCI6MjEwMTk4MTczOH0.0eZ3SfWhUEzSLpDDKEE_3vp5siXF00akRp5jX1dM-dA';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);



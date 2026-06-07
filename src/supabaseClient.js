import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ycdgdzflmbpquskmlubs.supabase.co'
const supabaseAnonKey = 'sb_publishable_HIAw8EM_-uuL6OIqzF9L4w_tf0GxwNf'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
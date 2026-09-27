import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Создаёт клиент, который подставляет наш JWT-пропуск в каждый запрос к базе.
// Вызывается заново каждый раз, когда нужно "свежее" соединение с актуальным токеном.
export function getSupabaseClient() {
  const token = localStorage.getItem('supabase_jwt')

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  })
}
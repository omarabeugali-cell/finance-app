import { useEffect, useState } from 'react'

// Сообщаем TypeScript, что в браузере появится глобальный объект Telegram
declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        initData: string
        ready: () => void
        expand: () => void
      }
    }
  }
}

function App() {
  const [status, setStatus] = useState('Загрузка...')
  const [userName, setUserName] = useState<string | null>(null)

  useEffect(() => {
    async function authenticate() {
      const tg = window.Telegram?.WebApp

      if (!tg) {
        setStatus('Открой это приложение через кнопку бота в Telegram, а не в обычном браузере.')
        return
      }

      tg.ready()
      tg.expand()

      const initData = tg.initData

      if (!initData) {
        setStatus('Нет данных Telegram (initData пустой). Попробуй открыть заново через бота.')
        return
      }

      try {
        const response = await fetch(
          'https://eysltnmvtyjbudlbiybb.supabase.co/functions/v1/telegram-auth',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({ initData }),
          }
        )

        const data = await response.json()

        if (!response.ok) {
          setStatus('Ошибка авторизации: ' + data.error)
          return
        }

        localStorage.setItem('supabase_jwt', data.token)

        const params = new URLSearchParams(initData)
        const userJson = params.get('user')
        if (userJson) {
          const user = JSON.parse(userJson)
          setUserName(user.first_name ?? 'пользователь')
        }

        setStatus('Авторизация прошла успешно!')
      } catch (err) {
        setStatus('Ошибка сети: ' + String(err))
      }
    }

    authenticate()
  }, [])

  return (
    <div style={{ padding: '40px', fontFamily: 'sans-serif' }}>
      <h1>Финансовый помощник</h1>
      <p>{status}</p>
      {userName && <p>Привет, {userName}!</p>}
    </div>
  )
}

export default App
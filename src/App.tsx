import { useEffect, useState } from 'react'
import { getSupabaseClient } from './supabaseClient'

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

type Account = {
  id: number
  name: string
  balance: number
  currency: string
}

function App() {
  const [status, setStatus] = useState('Загрузка...')
  const [isAuthed, setIsAuthed] = useState(false)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [newAccountName, setNewAccountName] = useState('')

  useEffect(() => {
    async function authenticate() {
      const tg = window.Telegram?.WebApp

      if (!tg) {
        setStatus('Открой это приложение через кнопку бота в Telegram.')
        return
      }

      tg.ready()
      tg.expand()

      const initData = tg.initData

      if (!initData) {
        setStatus('Нет данных Telegram. Попробуй открыть заново через бота.')
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
        setIsAuthed(true)
        setStatus('')
        loadAccounts()
      } catch (err) {
        setStatus('Ошибка сети: ' + String(err))
      }
    }

    authenticate()
  }, [])

  async function loadAccounts() {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase.from('accounts').select('*')

    if (error) {
      setStatus('Ошибка загрузки счетов: ' + error.message)
      return
    }

    setAccounts(data as Account[])
  }

  async function createAccount() {
    if (!newAccountName.trim()) return

    const supabase = getSupabaseClient()

    // Находим свою собственную строку в users, чтобы указать user_id
    const { data: userRow, error: userError } = await supabase
      .from('users')
      .select('id')
      .single()

    if (userError || !userRow) {
      setStatus('Не удалось определить пользователя: ' + userError?.message)
      return
    }

    const { error } = await supabase.from('accounts').insert({
      user_id: userRow.id,
      name: newAccountName.trim(),
      balance: 0,
      currency: 'KZT',
    })

    if (error) {
      setStatus('Ошибка создания счёта: ' + error.message)
      return
    }

    setNewAccountName('')
    loadAccounts()
  }

  if (!isAuthed) {
    return (
      <div style={{ padding: '40px', fontFamily: 'sans-serif' }}>
        <p>{status}</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>Мои счета</h1>

      {status && <p style={{ color: 'red' }}>{status}</p>}

      {accounts.length === 0 && <p>Пока нет ни одного счёта.</p>}

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {accounts.map((acc) => (
          <li
            key={acc.id}
            style={{
              padding: '12px',
              marginBottom: '8px',
              background: '#1c1c1e',
              color: 'white',
              borderRadius: '8px',
            }}
          >
            <strong>{acc.name}</strong> — {acc.balance} {acc.currency}
          </li>
        ))}
      </ul>

      <div style={{ marginTop: '20px' }}>
        <input
          type="text"
          value={newAccountName}
          onChange={(e) => setNewAccountName(e.target.value)}
          placeholder="Например, Наличные"
          style={{ padding: '8px', marginRight: '8px' }}
        />
        <button onClick={createAccount} style={{ padding: '8px 16px' }}>
          Добавить счёт
        </button>
      </div>
    </div>
  )
}

export default App
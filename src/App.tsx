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

type Obligation = {
  id: number
  amount: number
  next_date: string
  is_active: boolean
}

type SavingsGoal = {
  id: number
  monthly_contribution: number | null
  is_active: boolean
}

function App() {
  const [status, setStatus] = useState('Загрузка...')
  const [isAuthed, setIsAuthed] = useState(false)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [newAccountName, setNewAccountName] = useState('')

  const [factualBalance, setFactualBalance] = useState(0)
  const [reservedObligations, setReservedObligations] = useState(0)
  const [reservedSavings, setReservedSavings] = useState(0)
  const [daysLeft, setDaysLeft] = useState(1)

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
        loadEverything()
      } catch (err) {
        setStatus('Ошибка сети: ' + String(err))
      }
    }

    authenticate()
  }, [])

  async function loadEverything() {
    await loadAccounts()
    await loadFinancialSummary()
  }

  async function loadAccounts() {
    const supabase = getSupabaseClient()
    const result = await supabase.from('accounts').select('*')

    if (result.error) {
      setStatus('Ошибка загрузки счетов: ' + result.error.message)
      return
    }

    setAccounts(result.data as Account[])
  }
  
  function getEndOfMonth(): Date {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth() + 1, 0)
  }

  async function loadFinancialSummary() {
    const supabase = getSupabaseClient()

    const accountsResult = await supabase.from('accounts').select('balance')

    if (accountsResult.error) {
      setStatus('Ошибка загрузки баланса: ' + accountsResult.error.message)
      return
    }

    let totalBalance = 0
    const accountsList = accountsResult.data as { balance: number }[]
    for (let i = 0; i < accountsList.length; i++) {
      totalBalance = totalBalance + Number(accountsList[i].balance)
    }
    setFactualBalance(totalBalance)

    const endOfMonth = getEndOfMonth()
    const endOfMonthStr = endOfMonth.toISOString().split('T')[0]

    const obligationsResult = await supabase
      .from('obligations')
      .select('id, amount, next_date, is_active')
      .eq('is_active', true)
      .lte('next_date', endOfMonthStr)

    if (obligationsResult.error) {
      setStatus('Ошибка загрузки платежей: ' + obligationsResult.error.message)
      return
    }

    let totalObligations = 0
    const obligationsList = obligationsResult.data as Obligation[]
    for (let i = 0; i < obligationsList.length; i++) {
      totalObligations = totalObligations + Number(obligationsList[i].amount)
    }
    setReservedObligations(totalObligations)

    const savingsResult = await supabase
      .from('savings_goals')
      .select('id, monthly_contribution, is_active')
      .eq('is_active', true)

    if (savingsResult.error) {
      setStatus('Ошибка загрузки накоплений: ' + savingsResult.error.message)
      return
    }

    let totalSavings = 0
    const savingsList = savingsResult.data as SavingsGoal[]
    for (let i = 0; i < savingsList.length; i++) {
      totalSavings = totalSavings + Number(savingsList[i].monthly_contribution ?? 0)
    }
    setReservedSavings(totalSavings)

    const now = new Date()
    const msLeft = endOfMonth.getTime() - now.getTime()
    const days = Math.max(1, Math.ceil(msLeft / (1000 * 60 * 60 * 24)))
    setDaysLeft(days)
  }

  async function createAccount() {
    if (!newAccountName.trim()) {
      return
    }

    const supabase = getSupabaseClient()

    const userResult = await supabase.from('users').select('id').single()

    if (userResult.error || !userResult.data) {
      setStatus('Не удалось определить пользователя')
      return
    }

    const insertResult = await supabase.from('accounts').insert({
      user_id: userResult.data.id,
      name: newAccountName.trim(),
      balance: 0,
      currency: 'KZT',
    })

    if (insertResult.error) {
      setStatus('Ошибка создания счёта: ' + insertResult.error.message)
      return
    }

    setNewAccountName('')
    loadEverything()
  }
  
  if (!isAuthed) {
    return (
      <div style={{ padding: '40px', fontFamily: 'sans-serif' }}>
        <p>{status}</p>
      </div>
    )
  }

  const freeMoney = factualBalance - reservedObligations - reservedSavings
  const dailyLimit = freeMoney / daysLeft

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>Главная</h1>

      {status && <p style={{ color: 'red' }}>{status}</p>}

      <div style={{ background: '#1c1c1e', color: 'white', borderRadius: '12px', padding: '16px', marginBottom: '20px' }}>
        <p>Фактический баланс: {factualBalance}</p>
        <p>Зарезервировано на платежи: {reservedObligations}</p>
        <p>Зарезервировано на накопления: {reservedSavings}</p>
        <p>Свободные деньги: {freeMoney}</p>
        <p>Дневной лимит: {Math.round(dailyLimit)} ({daysLeft} дн.)</p>
      </div>

      <h2>Мои счета</h2>

      {accounts.length === 0 && <p>Пока нет ни одного счёта.</p>}

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {accounts.map((acc) => (
          <li key={acc.id} style={{ padding: '12px', marginBottom: '8px', background: '#1c1c1e', color: 'white', borderRadius: '8px' }}>
            {acc.name} — {acc.balance} {acc.currency}
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
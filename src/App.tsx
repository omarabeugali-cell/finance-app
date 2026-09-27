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
    const { data, error } = await supabase.from('accounts').select('*')

    if (error) {
      setStatus('Ошибка загрузки счетов: ' + error.message)
      return
    }

    setAccounts(data as Account[])
  }

  function getEndOfMonth(): Date {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth() + 1, 0)
  }

  async function loadFinancialSummary() {
    const supabase = getSupabaseClient()

    // 1. Фактический баланс — сумма остатков по всем счетам
    const { data: accountsData, error: accountsError } = await supabase
      .from('accounts')
      .select('balance')

    if (accountsError) {
      setStatus('Ошибка загрузки баланса: ' + accountsError.message)
      return
    }

    const totalBalance = (accountsData as { balance: number }[]).reduce(
      (sum, acc) => sum + Number(acc.balance),
      0
    )
    setFactualBalance(totalBalance)

    // 2. Зарезервировано под обязательные платежи до конца месяца
    const endOfMonth = getEndOfMonth()
    const endOfMonthStr = endOfMonth.toISOString().split('T')[0]

    const { data: obligationsData, error: obligationsError } = await supabase
      .from('obligations')
      .select('id, amount, next_date, is_active')
      .eq('is_active', true)
      .lte('next_date', endOfMonthStr)

    if (obligationsError) {
      setStatus('Ошибка загрузки платежей: ' + obligationsError.message)
      return
    }

    const totalObligations = (obligationsData as Obligation[]).reduce(
      (sum, o) => sum + Number(o.amount),
      0
    )
    setReservedObligations(totalObligations)

    // 3. Зарезервировано под регулярные пополнения накоплений
    const { data: savingsData, error: savingsError } = await supabase
      .from('savings_goals')
      .select('id, monthly_contribution, is_active')
      .eq('is_active', true)

    if (savingsError) {
      setStatus('Ошибка загрузки накоплений: ' + savingsError.message)
      return
    }

    const totalSavings = (savingsData as SavingsGoal[]).reduce(
      (sum, g) => sum + Number(g.monthly_contribution ?? 0),
      0
    )
    setReservedSavings(totalSavings)

    // 4. Сколько дней осталось до конца периода (минимум 1, чтобы не делить на ноль)
    const now = new Date()
    const msLeft = endOfMonth.getTime() - now.getTime()
    const days = Math.max(1, Math.ceil(msLeft / (1000 * 60 * 60 * 24)))
    setDaysLeft(days)
  }

  async function createAccount() {
    if (!newAccountName.trim()) return

    const supabase = getSupabaseClient()

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

      <div
        style={{
          background: '#1c1c1e',
          color: 'white',
          borderRadius: '12px',
          padding: '16px',
          marginBottom: '20px',
        }}
      >
        <p style={{ margin: '4px 0' }}>Фактический баланс: <strong>{factualBalance.toLocaleString()} ₸</strong></p>
        <p style={{ margin: '4px 0', color: '#aaa' }}>Зарезервировано на платежи: {reservedObligations.toLocaleString()} ₸</p>
        <p style={{ margin: '4px 0', color: '#aaa' }}>Зарезервировано на накопления: {reservedSavings.toLocaleString()} ₸</p>
        <hr style={{ border: 'none', borderTop: '1px solid #333', margin: '8px 0' }} />
        <p style={{ margin: '4px 0' }}>Свободные деньги:
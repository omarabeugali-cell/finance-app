import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

function App() {
  const [status, setStatus] = useState('Проверяем соединение...')

  useEffect(() => {
    async function checkConnection() {
      const { data, error } = await supabase.from('accounts').select('*')

      if (error) {
        setStatus('Ошибка: ' + error.message)
      } else {
        setStatus('Соединение работает! Найдено записей: ' + data.length)
      }
    }

    checkConnection()
  }, [])

  return (
    <div style={{ padding: '40px', fontFamily: 'sans-serif' }}>
      <h1>Проверка подключения к Supabase</h1>
      <p>{status}</p>
    </div>
  )
}

export default App
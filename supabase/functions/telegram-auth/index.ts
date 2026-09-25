import { createClient } from 'npm:@supabase/supabase-js@2'

// Секреты, которые мы положили в Edge Function Secrets на прошлых шагах
const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!
const JWT_SECRET = Deno.env.get('JWT_SECRET')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Клиент с полным доступом к базе — работает только здесь, на сервере
const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

function base64url(input: Uint8Array): string {
  return btoa(String.fromCharCode(...input))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

async function hmacSha256(key: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, message)
  return new Uint8Array(signature)
}

// Проверяет, что данные реально пришли из Telegram, а не подделаны
async function verifyTelegramInitData(initData: string): Promise<Record<string, string> | null> {
  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  if (!hash) return null
  params.delete('hash')

  const dataCheckArr: string[] = []
  for (const [key, value] of [...params.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    dataCheckArr.push(`${key}=${value}`)
  }
  const dataCheckString = dataCheckArr.join('\n')

  const encoder = new TextEncoder()
  const secretKey = await hmacSha256(encoder.encode('WebAppData'), encoder.encode(BOT_TOKEN))
  const computedHashBytes = await hmacSha256(secretKey, encoder.encode(dataCheckString))
  const computedHash = Array.from(computedHashBytes).map(b => b.toString(16).padStart(2, '0')).join('')

  if (computedHash !== hash) return null

  const result: Record<string, string> = {}
  for (const [key, value] of params.entries()) result[key] = value
  return result
}

// Создаёт JWT-пропуск с telegram_id внутри
async function createJwt(payload: Record<string, unknown>): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' }
  const encoder = new TextEncoder()

  const headerB64 = base64url(encoder.encode(JSON.stringify(header)))
  const payloadB64 = base64url(encoder.encode(JSON.stringify(payload)))
  const signingInput = `${headerB64}.${payloadB64}`

  const signatureBytes = await hmacSha256(encoder.encode(JWT_SECRET), encoder.encode(signingInput))
  const signatureB64 = base64url(signatureBytes)

  return `${signingInput}.${signatureB64}`
}

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { initData } = await req.json()

    if (!initData) {
      return new Response(JSON.stringify({ error: 'initData отсутствует' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const verified = await verifyTelegramInitData(initData)

    if (!verified) {
      return new Response(JSON.stringify({ error: 'Подпись Telegram недействительна' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const userJson = verified.user
    if (!userJson) {
      return new Response(JSON.stringify({ error: 'Нет данных о пользователе' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const tgUser = JSON.parse(userJson)
    const telegramId = tgUser.id

    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('telegram_id', telegramId)
      .maybeSingle()

    if (!existingUser) {
      await supabaseAdmin.from('users').insert({
        telegram_id: telegramId,
        full_name: `${tgUser.first_name ?? ''} ${tgUser.last_name ?? ''}`.trim(),
        currency: 'KZT',
      })
    }

    const nowSec = Math.floor(Date.now() / 1000)
    const jwt = await createJwt({
      sub: String(telegramId),
      telegram_id: telegramId,
      role: 'authenticated',
      iat: nowSec,
      exp: nowSec + 60 * 60 * 24 * 7,
    })

    return new Response(JSON.stringify({ token: jwt }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
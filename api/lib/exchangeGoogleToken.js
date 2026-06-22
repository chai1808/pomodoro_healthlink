export const exchangeGoogleToken = async (body, clientSecret) => {
  const params = new URLSearchParams(body)

  if (!clientSecret) {
    return {
      status: 500,
      text: JSON.stringify({
        error: 'server_misconfigured',
        error_description: 'GOOGLE_CLIENT_SECRET is not configured',
      }),
    }
  }

  params.set('client_secret', clientSecret)

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  return { status: response.status, text: await response.text() }
}

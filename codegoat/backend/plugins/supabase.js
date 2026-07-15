'use strict'

const fp = require('fastify-plugin')

module.exports = fp(async function (fastify) {
  fastify.decorate('supabaseRequest', async function ({ method = 'GET', path, accessToken, body }) {
    const supabaseUrl = process.env.SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey) {
      const error = new Error('Supabase server configuration is incomplete')
      error.statusCode = 503
      throw error
    }

    const headers = {
      apikey: supabaseKey,
      Authorization: `Bearer ${accessToken || supabaseKey}`,
      Accept: 'application/json'
    }

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json'
      headers.Prefer = 'resolution=merge-duplicates,return=representation'
    }

    const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    })

    const text = await response.text()
    const data = text ? JSON.parse(text) : null

    if (!response.ok) {
      const error = new Error('Supabase database request failed')
      error.statusCode = response.status
      error.details = data
      throw error
    }

    return data
  })
})

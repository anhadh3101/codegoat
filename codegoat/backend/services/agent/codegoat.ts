import { ChatOpenAI } from '@langchain/openai'

export const codegoatModel = new ChatOpenAI({
  model: 'openai/gpt-5-mini',
  apiKey: process.env.OPENROUTER_API_KEY,
  streaming: true,
  configuration: {
    baseURL: 'https://openrouter.ai/api/v1'
  }
})

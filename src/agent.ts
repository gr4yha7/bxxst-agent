import dotenv from 'dotenv';
// Load environment variables
dotenv.config();

import { Agent } from '@openserv-labs/sdk';
import { TwitterApi } from 'twitter-api-v2';
import { z } from 'zod';
import OpenAI from 'openai'
import { logger } from './logger';

if (!process.env.OPENSERV_API_KEY) {
  throw new Error('OPENSERV_API_KEY environment variable is required')
}
if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY environment variable is required')
}
if (!process.env.TWITTER_BEARER_TOKEN) {
  throw new Error('TWITTER_BEARER_TOKEN environment variable is required')
}
const OPENSERV_API_KEY = process.env.OPENSERV_API_KEY
const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const TWITTER_BEARER_TOKEN = process.env.TWITTER_BEARER_TOKEN

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY
})
// Twitter client setup
const twitterClient = new TwitterApi(TWITTER_BEARER_TOKEN);

// Initialize the agent
const agent = new Agent({
  systemPrompt: 'You are an agent that compiles AIXBT tweets into shareable messages.',
  apiKey: OPENSERV_API_KEY
});

// Add capabilities to scrape tweets and analyze token market data
agent.addCapabilities([
  {
    name: 'scrapeTweets',
    description: 'Scrape tweets from AIXBT and compile them into messages.',
    schema: z.object({
      count: z.number().default(5).describe('Number of tweets to fetch')
    }),
    async run({ args }) {
      const tweets = await twitterClient.v2.userTimeline('aixbt_agent', { max_results: args.count });
      const messages = tweets.data.data.map(tweet => {
        const ticker = extractTicker(tweet.text);
        const dexscreenerLink = `https://dexscreener.com/${ticker}`;
        const twitterLink = `https://x.com/aixbt_agent/status/${tweet.id}`;
        const projectInfo = extractProjectInfo(tweet.text);

        return `Ticker: ${ticker}\nTweet: ${tweet.text}\nDexscreener: ${dexscreenerLink}\nTwitter: ${twitterLink}\nProject Info: ${projectInfo}`;
      });

      return messages.join('\n\n');
    }
  },
]);

// Start the agent server
agent.start();

// Helper functions
function extractTicker(text: string): string {
  // Implement logic to extract ticker from tweet text
  const match = text.match(/\$[A-Z]+/);
  return match ? match[0] : 'N/A';
}

async function extractProjectInfo(ticker: string): Promise<string> {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a cryptocurrency (project) analytics expert. Analyze the crypto ticker's project information and any latest news about it, compile and summarize all of the information into a single, digestible and well formatted message.

Provide:
1. market cap
2. holders count
3. Tvl, liquidity locked, transactions count
4. supply information
4. technical analysis
5. fundamental analysis`
      },
      {
        role: 'user',
        content: JSON.stringify(ticker)
      }
    ]
  })

  const analysis = completion.choices[0]?.message.content
  logger.info(`Generated project analysis for ${ticker}: ${analysis}`)

  return analysis || 'Failed to analyze project'
}
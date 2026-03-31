export interface EndpointDefinition {
  method: 'POST';
  path: string;
  description: string;
  price: string;
}

interface ServiceMeta {
  id: string;
  name: string;
  description: string;
  categories: string[];
}

export interface GatewayRouteConfig {
  service: string;
  path: string;
  description: string;
  price: string;
  requiredEnv?: string[];
  upstreamMethod?: 'GET' | 'POST';
  bodyToQuery?: boolean;
  resolveUpstream: (params: Record<string, string>) => string;
  resolveHeaders?: (params: Record<string, string>) => Record<string, string | undefined>;
}

export interface ResolvedGatewayRoute extends GatewayRouteConfig {
  params: Record<string, string>;
}

const serviceMeta: ServiceMeta[] = [
  { id: 'alphavantage', name: 'Alpha Vantage', description: 'Stock quotes, symbol search, and daily OHLCV.', categories: ['finance', 'market-data'] },
  { id: 'anthropic', name: 'Anthropic', description: 'Claude messages behind Solana x402.', categories: ['ai', 'llm'] },
  { id: 'assemblyai', name: 'AssemblyAI', description: 'Speech transcription and transcript lookup.', categories: ['ai', 'audio'] },
  { id: 'brave', name: 'Brave Search', description: 'Web, image, news, video, and summarizer search.', categories: ['search', 'web'] },
  { id: 'cohere', name: 'Cohere', description: 'Chat, embeddings, and reranking.', categories: ['ai', 'llm'] },
  { id: 'coingecko', name: 'CoinGecko', description: 'Crypto prices, markets, and trending assets.', categories: ['crypto', 'market-data'] },
  { id: 'deepl', name: 'DeepL', description: 'High-quality translation.', categories: ['translation', 'nlp'] },
  { id: 'deepseek', name: 'DeepSeek', description: 'DeepSeek chat completions.', categories: ['ai', 'llm'] },
  { id: 'elevenlabs', name: 'ElevenLabs', description: 'Speech and sound generation.', categories: ['ai', 'audio'] },
  { id: 'exa', name: 'Exa', description: 'Search and content retrieval APIs.', categories: ['search', 'web'] },
  { id: 'exchangerate', name: 'ExchangeRate', description: 'FX rates and currency conversion.', categories: ['finance', 'fx'] },
  { id: 'fal', name: 'fal.ai', description: 'Hosted generative media models.', categories: ['ai', 'image', 'audio'] },
  { id: 'firecrawl', name: 'Firecrawl', description: 'Scrape, crawl, map, and extract web data.', categories: ['web', 'data'] },
  { id: 'gemini', name: 'Google Gemini', description: 'Gemini generation and embeddings.', categories: ['ai', 'llm'] },
  { id: 'googlemaps', name: 'Google Maps', description: 'Geocoding, search, and directions.', categories: ['maps', 'data'] },
  { id: 'groq', name: 'Groq', description: 'Fast chat and transcription APIs.', categories: ['ai', 'llm'] },
  { id: 'hunter', name: 'Hunter', description: 'Email/domain discovery and verification.', categories: ['sales', 'data'] },
  { id: 'ipinfo', name: 'IPinfo', description: 'IP intelligence lookup.', categories: ['network', 'data'] },
  { id: 'jina', name: 'Jina AI', description: 'Reader endpoints for web content.', categories: ['web', 'ai'] },
  { id: 'judge0', name: 'Judge0', description: 'Code execution and language listing.', categories: ['compute', 'code'] },
  { id: 'mistral', name: 'Mistral', description: 'Chat completions and embeddings.', categories: ['ai', 'llm'] },
  { id: 'newsapi', name: 'NewsAPI', description: 'Headlines and article search.', categories: ['news', 'search'] },
  { id: 'openai', name: 'OpenAI', description: 'Chat, embeddings, images, and audio.', categories: ['ai', 'llm'] },
  { id: 'openweather', name: 'OpenWeather', description: 'Current weather and forecasts.', categories: ['weather', 'data'] },
  { id: 'pdfshift', name: 'PDFShift', description: 'HTML-to-PDF conversion.', categories: ['documents', 'rendering'] },
  { id: 'perplexity', name: 'Perplexity', description: 'Web-grounded chat completions.', categories: ['ai', 'search'] },
  { id: 'pushover', name: 'Pushover', description: 'Notification delivery API.', categories: ['notifications'] },
  { id: 'qrcode', name: 'QR Code', description: 'QR rendering API.', categories: ['utility', 'media'] },
  { id: 'replicate', name: 'Replicate', description: 'Prediction creation and status lookup.', categories: ['ai', 'media'] },
  { id: 'resend', name: 'Resend', description: 'Email send and batch send.', categories: ['communication', 'email'] },
  { id: 'screenshot', name: 'ScreenshotOne', description: 'Screenshot capture API.', categories: ['web', 'media'] },
  { id: 'serpapi', name: 'SerpApi', description: 'Search, locations, and flights.', categories: ['search', 'travel'] },
  { id: 'serper', name: 'Serper', description: 'Google search and image search.', categories: ['search'] },
  { id: 'stability', name: 'Stability AI', description: 'Image generation and editing.', categories: ['ai', 'image'] },
  { id: 'together', name: 'Together AI', description: 'Chat, embeddings, and image generation.', categories: ['ai', 'llm'] },
  { id: 'translate', name: 'Google Translate', description: 'Translation and language detection.', categories: ['translation', 'nlp'] },
  { id: 'virustotal', name: 'VirusTotal', description: 'File and URL scanning.', categories: ['security', 'utility'] },
];

// MVP gateway surface. Expand this set when you are ready to manage more upstream keys.
const enabledServiceIds = new Set([
  'openai',
  'anthropic',
  'gemini',
  'firecrawl',
  'brave',
]);

function bearer(envName: string) {
  return `Bearer ${process.env[envName] ?? ''}`;
}

function key(envName: string, prefix = 'Key ') {
  return `${prefix}${process.env[envName] ?? ''}`;
}

const jsonAccept = { accept: 'application/json' };

const allGatewayRoutes: GatewayRouteConfig[] = [
  { service: 'openai', path: '/v1/chat/completions', description: 'Chat completions', price: '0.01', requiredEnv: ['OPENAI_API_KEY'], resolveUpstream: () => 'https://api.openai.com/v1/chat/completions', resolveHeaders: () => ({ authorization: bearer('OPENAI_API_KEY') }) },
  { service: 'openai', path: '/v1/embeddings', description: 'Create embeddings', price: '0.001', requiredEnv: ['OPENAI_API_KEY'], resolveUpstream: () => 'https://api.openai.com/v1/embeddings', resolveHeaders: () => ({ authorization: bearer('OPENAI_API_KEY') }) },
  { service: 'openai', path: '/v1/images/generations', description: 'Generate images', price: '0.05', requiredEnv: ['OPENAI_API_KEY'], resolveUpstream: () => 'https://api.openai.com/v1/images/generations', resolveHeaders: () => ({ authorization: bearer('OPENAI_API_KEY') }) },
  { service: 'openai', path: '/v1/audio/transcriptions', description: 'Transcribe audio', price: '0.01', requiredEnv: ['OPENAI_API_KEY'], resolveUpstream: () => 'https://api.openai.com/v1/audio/transcriptions', resolveHeaders: () => ({ authorization: bearer('OPENAI_API_KEY') }) },
  { service: 'openai', path: '/v1/audio/speech', description: 'Generate speech', price: '0.02', requiredEnv: ['OPENAI_API_KEY'], resolveUpstream: () => 'https://api.openai.com/v1/audio/speech', resolveHeaders: () => ({ authorization: bearer('OPENAI_API_KEY') }) },
  { service: 'anthropic', path: '/v1/messages', description: 'Claude messages', price: '0.01', requiredEnv: ['ANTHROPIC_API_KEY'], resolveUpstream: () => 'https://api.anthropic.com/v1/messages', resolveHeaders: () => ({ 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': process.env.ANTHROPIC_VERSION ?? '2023-06-01' }) },
  { service: 'gemini', path: '/v1beta/models/gemini-2.5-flash', description: 'Gemini 2.5 Flash', price: '0.005', requiredEnv: ['GEMINI_API_KEY'], resolveUpstream: () => 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', resolveHeaders: () => ({ 'x-goog-api-key': process.env.GEMINI_API_KEY }) },
  { service: 'gemini', path: '/v1beta/models/gemini-2.5-pro', description: 'Gemini 2.5 Pro', price: '0.02', requiredEnv: ['GEMINI_API_KEY'], resolveUpstream: () => 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-preview-05-06:generateContent', resolveHeaders: () => ({ 'x-goog-api-key': process.env.GEMINI_API_KEY }) },
  { service: 'gemini', path: '/v1beta/models/embedding-001', description: 'Text embeddings', price: '0.001', requiredEnv: ['GEMINI_API_KEY'], resolveUpstream: () => 'https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent', resolveHeaders: () => ({ 'x-goog-api-key': process.env.GEMINI_API_KEY }) },
  { service: 'deepseek', path: '/v1/chat/completions', description: 'DeepSeek chat completions', price: '0.005', resolveUpstream: () => 'https://api.deepseek.com/chat/completions', resolveHeaders: () => ({ authorization: bearer('DEEPSEEK_API_KEY') }) },
  { service: 'groq', path: '/v1/chat/completions', description: 'Groq chat completions', price: '0.005', resolveUpstream: () => 'https://api.groq.com/openai/v1/chat/completions', resolveHeaders: () => ({ authorization: bearer('GROQ_API_KEY') }) },
  { service: 'groq', path: '/v1/audio/transcriptions', description: 'Groq transcription', price: '0.005', resolveUpstream: () => 'https://api.groq.com/openai/v1/audio/transcriptions', resolveHeaders: () => ({ authorization: bearer('GROQ_API_KEY') }) },
  { service: 'cohere', path: '/v1/chat', description: 'Cohere chat', price: '0.005', resolveUpstream: () => 'https://api.cohere.com/v2/chat', resolveHeaders: () => ({ authorization: bearer('COHERE_API_KEY') }) },
  { service: 'cohere', path: '/v1/embed', description: 'Cohere embeddings', price: '0.005', resolveUpstream: () => 'https://api.cohere.com/v2/embed', resolveHeaders: () => ({ authorization: bearer('COHERE_API_KEY') }) },
  { service: 'cohere', path: '/v1/rerank', description: 'Cohere rerank', price: '0.005', resolveUpstream: () => 'https://api.cohere.com/v2/rerank', resolveHeaders: () => ({ authorization: bearer('COHERE_API_KEY') }) },
  { service: 'mistral', path: '/v1/chat/completions', description: 'Mistral chat', price: '0.005', resolveUpstream: () => 'https://api.mistral.ai/v1/chat/completions', resolveHeaders: () => ({ authorization: bearer('MISTRAL_API_KEY') }) },
  { service: 'mistral', path: '/v1/embeddings', description: 'Mistral embeddings', price: '0.005', resolveUpstream: () => 'https://api.mistral.ai/v1/embeddings', resolveHeaders: () => ({ authorization: bearer('MISTRAL_API_KEY') }) },
  { service: 'perplexity', path: '/v1/chat/completions', description: 'Perplexity Sonar chat', price: '0.01', resolveUpstream: () => 'https://api.perplexity.ai/chat/completions', resolveHeaders: () => ({ authorization: bearer('PERPLEXITY_API_KEY') }) },
  { service: 'together', path: '/v1/chat/completions', description: 'Together chat completions', price: '0.005', resolveUpstream: () => 'https://api.together.xyz/v1/chat/completions', resolveHeaders: () => ({ authorization: bearer('TOGETHER_API_KEY') }) },
  { service: 'together', path: '/v1/images/generations', description: 'Together image generation', price: '0.03', resolveUpstream: () => 'https://api.together.xyz/v1/images/generations', resolveHeaders: () => ({ authorization: bearer('TOGETHER_API_KEY') }) },
  { service: 'together', path: '/v1/embeddings', description: 'Together embeddings', price: '0.001', resolveUpstream: () => 'https://api.together.xyz/v1/embeddings', resolveHeaders: () => ({ authorization: bearer('TOGETHER_API_KEY') }) },
  { service: 'fal', path: '/fal-ai/flux/dev', description: 'Flux Dev image generation', price: '0.03', resolveUpstream: () => 'https://fal.run/fal-ai/flux/dev', resolveHeaders: () => ({ authorization: key('FAL_KEY') }) },
  { service: 'fal', path: '/fal-ai/flux-pro', description: 'Flux Pro image generation', price: '0.05', resolveUpstream: () => 'https://fal.run/fal-ai/flux-pro', resolveHeaders: () => ({ authorization: key('FAL_KEY') }) },
  { service: 'fal', path: '/fal-ai/flux-realism', description: 'Flux Realism image generation', price: '0.03', resolveUpstream: () => 'https://fal.run/fal-ai/flux-realism', resolveHeaders: () => ({ authorization: key('FAL_KEY') }) },
  { service: 'fal', path: '/fal-ai/recraft-20b', description: 'Recraft 20B image generation', price: '0.03', resolveUpstream: () => 'https://fal.run/fal-ai/recraft-20b', resolveHeaders: () => ({ authorization: key('FAL_KEY') }) },
  { service: 'fal', path: '/fal-ai/whisper', description: 'Whisper transcription', price: '0.01', resolveUpstream: () => 'https://fal.run/fal-ai/whisper', resolveHeaders: () => ({ authorization: key('FAL_KEY') }) },
  { service: 'firecrawl', path: '/v1/scrape', description: 'Scrape a URL', price: '0.01', requiredEnv: ['FIRECRAWL_API_KEY'], resolveUpstream: () => 'https://api.firecrawl.dev/v1/scrape', resolveHeaders: () => ({ authorization: bearer('FIRECRAWL_API_KEY') }) },
  { service: 'firecrawl', path: '/v1/crawl', description: 'Crawl a site', price: '0.05', requiredEnv: ['FIRECRAWL_API_KEY'], resolveUpstream: () => 'https://api.firecrawl.dev/v1/crawl', resolveHeaders: () => ({ authorization: bearer('FIRECRAWL_API_KEY') }) },
  { service: 'firecrawl', path: '/v1/map', description: 'Map website URLs', price: '0.01', requiredEnv: ['FIRECRAWL_API_KEY'], resolveUpstream: () => 'https://api.firecrawl.dev/v1/map', resolveHeaders: () => ({ authorization: bearer('FIRECRAWL_API_KEY') }) },
  { service: 'firecrawl', path: '/v1/extract', description: 'Extract structured data', price: '0.02', requiredEnv: ['FIRECRAWL_API_KEY'], resolveUpstream: () => 'https://api.firecrawl.dev/v1/extract', resolveHeaders: () => ({ authorization: bearer('FIRECRAWL_API_KEY') }) },
  { service: 'brave', path: '/v1/web/search', description: 'Web search', price: '0.005', requiredEnv: ['BRAVE_SEARCH_API_KEY'], upstreamMethod: 'GET', bodyToQuery: true, resolveUpstream: () => 'https://api.search.brave.com/res/v1/web/search', resolveHeaders: () => ({ ...jsonAccept, 'x-subscription-token': process.env.BRAVE_SEARCH_API_KEY }) },
  { service: 'brave', path: '/v1/images/search', description: 'Image search', price: '0.005', requiredEnv: ['BRAVE_SEARCH_API_KEY'], upstreamMethod: 'GET', bodyToQuery: true, resolveUpstream: () => 'https://api.search.brave.com/res/v1/images/search', resolveHeaders: () => ({ ...jsonAccept, 'x-subscription-token': process.env.BRAVE_SEARCH_API_KEY }) },
  { service: 'brave', path: '/v1/news/search', description: 'News search', price: '0.005', requiredEnv: ['BRAVE_SEARCH_API_KEY'], upstreamMethod: 'GET', bodyToQuery: true, resolveUpstream: () => 'https://api.search.brave.com/res/v1/news/search', resolveHeaders: () => ({ ...jsonAccept, 'x-subscription-token': process.env.BRAVE_SEARCH_API_KEY }) },
  { service: 'brave', path: '/v1/videos/search', description: 'Video search', price: '0.005', requiredEnv: ['BRAVE_SEARCH_API_KEY'], upstreamMethod: 'GET', bodyToQuery: true, resolveUpstream: () => 'https://api.search.brave.com/res/v1/videos/search', resolveHeaders: () => ({ ...jsonAccept, 'x-subscription-token': process.env.BRAVE_SEARCH_API_KEY }) },
  { service: 'brave', path: '/v1/summarizer/search', description: 'Summarized search', price: '0.01', requiredEnv: ['BRAVE_SEARCH_API_KEY'], upstreamMethod: 'GET', bodyToQuery: true, resolveUpstream: () => 'https://api.search.brave.com/res/v1/summarizer/search', resolveHeaders: () => ({ ...jsonAccept, 'x-subscription-token': process.env.BRAVE_SEARCH_API_KEY }) },
  { service: 'exa', path: '/v1/search', description: 'Exa search', price: '0.005', resolveUpstream: () => 'https://api.exa.ai/search', resolveHeaders: () => ({ 'x-api-key': process.env.EXA_API_KEY }) },
  { service: 'exa', path: '/v1/contents', description: 'Exa contents', price: '0.005', resolveUpstream: () => 'https://api.exa.ai/contents', resolveHeaders: () => ({ 'x-api-key': process.env.EXA_API_KEY }) },
  { service: 'serper', path: '/v1/search', description: 'Serper web search', price: '0.005', resolveUpstream: () => 'https://google.serper.dev/search', resolveHeaders: () => ({ 'x-api-key': process.env.SERPER_API_KEY }) },
  { service: 'serper', path: '/v1/images', description: 'Serper image search', price: '0.005', resolveUpstream: () => 'https://google.serper.dev/images', resolveHeaders: () => ({ 'x-api-key': process.env.SERPER_API_KEY }) },
  { service: 'serpapi', path: '/v1/search', description: 'SerpApi search', price: '0.005', upstreamMethod: 'GET', bodyToQuery: true, resolveUpstream: () => `https://serpapi.com/search.json?engine=google&api_key=${process.env.SERPAPI_API_KEY ?? ''}`, resolveHeaders: () => jsonAccept },
  { service: 'serpapi', path: '/v1/locations', description: 'SerpApi locations', price: '0.005', upstreamMethod: 'GET', bodyToQuery: true, resolveUpstream: () => `https://serpapi.com/locations.json?api_key=${process.env.SERPAPI_API_KEY ?? ''}`, resolveHeaders: () => jsonAccept },
  { service: 'serpapi', path: '/v1/flights', description: 'SerpApi Google Flights', price: '0.01', upstreamMethod: 'GET', bodyToQuery: true, resolveUpstream: () => `https://serpapi.com/search.json?engine=google_flights&api_key=${process.env.SERPAPI_API_KEY ?? ''}`, resolveHeaders: () => jsonAccept },
  { service: 'newsapi', path: '/v1/headlines', description: 'Top headlines', price: '0.005', upstreamMethod: 'GET', bodyToQuery: true, resolveUpstream: () => 'https://newsapi.org/v2/top-headlines', resolveHeaders: () => ({ 'x-api-key': process.env.NEWSAPI_API_KEY }) },
  { service: 'newsapi', path: '/v1/search', description: 'Article search', price: '0.005', upstreamMethod: 'GET', bodyToQuery: true, resolveUpstream: () => 'https://newsapi.org/v2/everything', resolveHeaders: () => ({ 'x-api-key': process.env.NEWSAPI_API_KEY }) },
  { service: 'alphavantage', path: '/v1/quote', description: 'Global quote', price: '0.005', upstreamMethod: 'GET', bodyToQuery: true, resolveUpstream: () => `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&apikey=${process.env.ALPHAVANTAGE_API_KEY ?? ''}`, resolveHeaders: () => jsonAccept },
  { service: 'alphavantage', path: '/v1/search', description: 'Symbol search', price: '0.005', upstreamMethod: 'GET', bodyToQuery: true, resolveUpstream: () => `https://www.alphavantage.co/query?function=SYMBOL_SEARCH&apikey=${process.env.ALPHAVANTAGE_API_KEY ?? ''}`, resolveHeaders: () => jsonAccept },
  { service: 'alphavantage', path: '/v1/daily', description: 'Daily time series', price: '0.005', upstreamMethod: 'GET', bodyToQuery: true, resolveUpstream: () => `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&apikey=${process.env.ALPHAVANTAGE_API_KEY ?? ''}`, resolveHeaders: () => jsonAccept },
  { service: 'coingecko', path: '/v1/price', description: 'Simple price lookup', price: '0.005', upstreamMethod: 'GET', bodyToQuery: true, resolveUpstream: () => `https://api.coingecko.com/api/v3/simple/price?x_cg_demo_api_key=${process.env.COINGECKO_API_KEY ?? ''}`, resolveHeaders: () => jsonAccept },
  { service: 'coingecko', path: '/v1/markets', description: 'Coin markets', price: '0.005', upstreamMethod: 'GET', bodyToQuery: true, resolveUpstream: () => `https://api.coingecko.com/api/v3/coins/markets?x_cg_demo_api_key=${process.env.COINGECKO_API_KEY ?? ''}`, resolveHeaders: () => jsonAccept },
  { service: 'coingecko', path: '/v1/trending', description: 'Trending coins', price: '0.005', upstreamMethod: 'GET', bodyToQuery: true, resolveUpstream: () => `https://api.coingecko.com/api/v3/search/trending?x_cg_demo_api_key=${process.env.COINGECKO_API_KEY ?? ''}`, resolveHeaders: () => jsonAccept },
  { service: 'openweather', path: '/v1/weather', description: 'Current weather', price: '0.005', upstreamMethod: 'GET', bodyToQuery: true, resolveUpstream: () => `https://api.openweathermap.org/data/2.5/weather?appid=${process.env.OPENWEATHER_API_KEY ?? ''}&units=metric`, resolveHeaders: () => ({}) },
  { service: 'openweather', path: '/v1/forecast', description: '5-day forecast', price: '0.005', upstreamMethod: 'GET', bodyToQuery: true, resolveUpstream: () => `https://api.openweathermap.org/data/2.5/forecast?appid=${process.env.OPENWEATHER_API_KEY ?? ''}&units=metric`, resolveHeaders: () => ({}) },
  { service: 'googlemaps', path: '/v1/geocode', description: 'Geocoding', price: '0.01', upstreamMethod: 'GET', bodyToQuery: true, resolveUpstream: () => `https://maps.googleapis.com/maps/api/geocode/json?key=${process.env.GOOGLE_MAPS_API_KEY ?? ''}`, resolveHeaders: () => ({}) },
  { service: 'googlemaps', path: '/v1/places', description: 'Places text search', price: '0.01', upstreamMethod: 'GET', bodyToQuery: true, resolveUpstream: () => `https://maps.googleapis.com/maps/api/place/textsearch/json?key=${process.env.GOOGLE_MAPS_API_KEY ?? ''}`, resolveHeaders: () => ({}) },
  { service: 'googlemaps', path: '/v1/directions', description: 'Directions', price: '0.01', upstreamMethod: 'GET', bodyToQuery: true, resolveUpstream: () => `https://maps.googleapis.com/maps/api/directions/json?key=${process.env.GOOGLE_MAPS_API_KEY ?? ''}`, resolveHeaders: () => ({}) },
  { service: 'translate', path: '/v1/translate', description: 'Translate text', price: '0.005', upstreamMethod: 'GET', bodyToQuery: true, resolveUpstream: () => `https://translation.googleapis.com/language/translate/v2?key=${process.env.GOOGLE_TRANSLATE_API_KEY ?? ''}`, resolveHeaders: () => ({}) },
  { service: 'translate', path: '/v1/detect', description: 'Detect language', price: '0.005', upstreamMethod: 'GET', bodyToQuery: true, resolveUpstream: () => `https://translation.googleapis.com/language/translate/v2/detect?key=${process.env.GOOGLE_TRANSLATE_API_KEY ?? ''}`, resolveHeaders: () => ({}) },
  { service: 'deepl', path: '/v1/translate', description: 'DeepL translation', price: '0.005', resolveUpstream: () => 'https://api.deepl.com/v2/translate', resolveHeaders: () => ({ authorization: `DeepL-Auth-Key ${process.env.DEEPL_API_KEY ?? ''}` }) },
  { service: 'resend', path: '/v1/emails', description: 'Send one email', price: '0.005', resolveUpstream: () => 'https://api.resend.com/emails', resolveHeaders: () => ({ authorization: bearer('RESEND_API_KEY') }) },
  { service: 'resend', path: '/v1/emails/batch', description: 'Send batch emails', price: '0.01', resolveUpstream: () => 'https://api.resend.com/emails/batch', resolveHeaders: () => ({ authorization: bearer('RESEND_API_KEY') }) },
  { service: 'elevenlabs', path: '/v1/sound-generation', description: 'Sound generation', price: '0.05', resolveUpstream: () => 'https://api.elevenlabs.io/v1/sound-generation', resolveHeaders: () => ({ 'xi-api-key': process.env.ELEVENLABS_API_KEY }) },
  { service: 'elevenlabs', path: '/v1/text-to-speech/:voiceId', description: 'Text to speech', price: '0.05', resolveUpstream: (params) => `https://api.elevenlabs.io/v1/text-to-speech/${params.voiceId}`, resolveHeaders: () => ({ 'xi-api-key': process.env.ELEVENLABS_API_KEY }) },
  { service: 'assemblyai', path: '/v1/transcribe', description: 'Create transcript job', price: '0.02', resolveUpstream: () => 'https://api.assemblyai.com/v2/transcript', resolveHeaders: () => ({ authorization: process.env.ASSEMBLYAI_API_KEY }) },
  { service: 'assemblyai', path: '/v1/result/:id', description: 'Fetch transcript result', price: '0.001', upstreamMethod: 'GET', bodyToQuery: false, resolveUpstream: (params) => `https://api.assemblyai.com/v2/transcript/${params.id}`, resolveHeaders: () => ({ authorization: process.env.ASSEMBLYAI_API_KEY }) },
  { service: 'judge0', path: '/v1/languages', description: 'List Judge0 languages', price: '0.001', resolveUpstream: () => 'https://judge0-ce.p.rapidapi.com/languages', resolveHeaders: () => ({ 'x-rapidapi-host': 'judge0-ce.p.rapidapi.com', 'x-rapidapi-key': process.env.RAPIDAPI_KEY }) },
  { service: 'judge0', path: '/v1/submissions', description: 'Create Judge0 submission', price: '0.005', resolveUpstream: () => 'https://judge0-ce.p.rapidapi.com/submissions', resolveHeaders: () => ({ 'x-rapidapi-host': 'judge0-ce.p.rapidapi.com', 'x-rapidapi-key': process.env.RAPIDAPI_KEY }) },
  { service: 'hunter', path: '/v1/search', description: 'Domain search', price: '0.005', upstreamMethod: 'GET', bodyToQuery: true, resolveUpstream: () => `https://api.hunter.io/v2/domain-search?api_key=${process.env.HUNTER_API_KEY ?? ''}`, resolveHeaders: () => jsonAccept },
  { service: 'hunter', path: '/v1/verify', description: 'Email verifier', price: '0.005', upstreamMethod: 'GET', bodyToQuery: true, resolveUpstream: () => `https://api.hunter.io/v2/email-verifier?api_key=${process.env.HUNTER_API_KEY ?? ''}`, resolveHeaders: () => jsonAccept },
  { service: 'ipinfo', path: '/v1/lookup/:ip', description: 'IP info lookup', price: '0.005', upstreamMethod: 'GET', resolveUpstream: (params) => `https://ipinfo.io/${params.ip}?token=${process.env.IPINFO_API_KEY ?? ''}`, resolveHeaders: () => jsonAccept },
  { service: 'jina', path: '/v1/read/:target', description: 'Jina reader', price: '0.005', upstreamMethod: 'GET', resolveUpstream: (params) => `https://r.jina.ai/http://${params.target}`, resolveHeaders: () => ({ authorization: bearer('JINA_API_KEY') }) },
  { service: 'replicate', path: '/v1/predictions', description: 'Create prediction', price: '0.03', resolveUpstream: () => 'https://api.replicate.com/v1/predictions', resolveHeaders: () => ({ authorization: bearer('REPLICATE_API_KEY') }) },
  { service: 'replicate', path: '/v1/predictions/status/:id', description: 'Prediction status', price: '0.001', upstreamMethod: 'GET', resolveUpstream: (params) => `https://api.replicate.com/v1/predictions/${params.id}`, resolveHeaders: () => ({ authorization: bearer('REPLICATE_API_KEY') }) },
  { service: 'screenshot', path: '/v1/capture', description: 'Capture webpage screenshot', price: '0.01', upstreamMethod: 'GET', bodyToQuery: true, resolveUpstream: () => `https://api.screenshotone.com/take?access_key=${process.env.SCREENSHOTONE_API_KEY ?? ''}`, resolveHeaders: () => ({ accept: 'image/png' }) },
  { service: 'pdfshift', path: '/v1/convert', description: 'Convert HTML to PDF', price: '0.01', resolveUpstream: () => 'https://api.pdfshift.io/v3/convert/pdf', resolveHeaders: () => ({ 'x-api-key': process.env.PDFSHIFT_API_KEY }) },
];

export const gatewayRoutes = allGatewayRoutes.filter((route) => enabledServiceIds.has(route.service));

export function getMissingRequiredEnv(route: GatewayRouteConfig) {
  return (route.requiredEnv ?? []).filter((name) => {
    const value = process.env[name];
    return typeof value !== 'string' || value.trim().length === 0;
  });
}

export function isRouteConfigured(route: GatewayRouteConfig) {
  return getMissingRequiredEnv(route).length === 0;
}

interface MatchResult {
  params: Record<string, string>;
  matched: boolean;
}

function matchPath(pattern: string, actualPath: string): MatchResult {
  const patternParts = pattern.split('/').filter(Boolean);
  const actualParts = actualPath.split('/').filter(Boolean);

  if (patternParts.length !== actualParts.length) {
    return { matched: false, params: {} };
  }

  const params: Record<string, string> = {};
  for (let index = 0; index < patternParts.length; index += 1) {
    const expected = patternParts[index];
    const actual = actualParts[index];

    if (expected.startsWith(':')) {
      params[expected.slice(1)] = decodeURIComponent(actual);
      continue;
    }

    if (expected !== actual) {
      return { matched: false, params: {} };
    }
  }

  return { matched: true, params };
}

export function resolveGatewayRoute(actualPath: string): ResolvedGatewayRoute | null {
  for (const route of gatewayRoutes) {
    const match = matchPath(`/${route.service}${route.path}`, actualPath);
    if (match.matched) {
      return { ...route, params: match.params };
    }
  }

  return null;
}

export function buildServices(baseUrl: string) {
  return serviceMeta
    .filter((service) => enabledServiceIds.has(service.id))
    .map((service) => {
      const endpoints: EndpointDefinition[] = gatewayRoutes
        .filter((route) => route.service === service.id && isRouteConfigured(route))
        .map((route) => ({
          method: 'POST',
          path: route.path,
          description: route.description,
          price: route.price,
        }));

      return {
        id: service.id,
        name: service.name,
        basePath: `/${service.id}`,
        serviceUrl: `${baseUrl}/${service.id}`,
        description: service.description,
        chain: 'solana' as const,
        currency: 'USDC' as const,
        categories: service.categories,
        endpoints,
      };
    })
    .filter((service) => service.endpoints.length > 0)
    .sort((left, right) => left.name.localeCompare(right.name));
}

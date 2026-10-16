// 100 real tasks, said the messy ways people talk: ordering food, shopping, chained steps across sites,
// questions that need the page, and the same request in scrambled orders. Each check looks at what
// actually happened (URL, cart, the video, the spoken answer), not just that something ran.
// `setup` puts the app where the task starts (a video playing, a site open...).
// Check helpers (run in the app): url(re), js(code), answer(re), done(re) = a finished step matches,
// result(re) = the AI agent's final report, tabCount(), zoom().

const VIDEO = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';  // a normal (non-live) video, 3:33
const playing = { url: VIDEO, js: "(() => { const v = document.querySelector('video'); if (!v) return 'wait'; v.muted = false; v.volume = 0.5; v.playbackRate = 1; v.play(); return 'ok'; })()" };
const at = (url, js) => ({ url, js });

const WATCH = 'await url(/youtube\\.com\\/watch/)';
const YT = (q) => `await url(/youtube\\.com\\/results\\?search_query=${q}/i)`;
const AMAZON = (q) => `await url(/amazon\\.com\\/s\\?k=${q}/i)`;
const GOOGLE = (q) => `await url(/google\\.com\\/search\\?q=${q}/i)`;
const MAPS = (q) => `await url(/google\\.com\\/maps\\/search\\/${q}/i)`;
const video = (expr) => `(await js("(() => { const v = document.querySelector('video'); return String(!!v && (${expr})); })()")) === 'true'`;
const CART = "(await done(/cart/i))";

export const CASES = [
  // ---- ordering food (1-15) ----
  { say: 'go to Burger King and order me a Whopper', check: 'await url(/bk\\.com|burgerking/) && await done(/whopper/i)' },
  { say: 'go to Burger King order me a chicken burger', check: 'await url(/bk\\.com|burgerking/) && await done(/chicken/i)' },
  { say: 'order me a chicken burger from Burger King with no pickles', check: 'await url(/bk\\.com|burgerking/) && await done(/chicken/i)' },
  { say: 'I want a Big Mac from McDonalds', check: 'await url(/mcdonalds\\.com/) && await done(/big mac/i)' },
  { say: 'order a burrito bowl from Chipotle', check: 'await url(/chipotle\\.com/) && await done(/burrito/i)' },
  { say: "get me a large pepperoni pizza from Domino's", check: 'await url(/dominos\\.com/) && await done(/pepperoni/i)' },
  { say: 'order a caramel frappuccino from Starbucks', check: 'await url(/starbucks\\.com/) && await done(/frappuccino/i)' },
  { say: 'order me a burger', check: 'await url(/doordash\\.com.*burger/i)' },
  { say: "I'm hungry, find burger places near me", check: MAPS('burger') },
  { say: 'find sushi delivery near me on DoorDash', check: 'await url(/doordash\\.com.*sushi/i)' },
  { say: 'show me the Taco Bell menu', check: 'await url(/tacobell\\.com.*menu/i)' },
  { say: 'a chicken burger from Burger King, order it', check: 'await url(/bk\\.com|burgerking/) && await done(/chicken/i)' },
  { say: 'Burger King website, open it and order me fries', check: 'await url(/bk\\.com|burgerking/) && await done(/fries/i)' },
  { say: 'order chicken nuggets from Chick-fil-A', check: 'await url(/chick-fil-a\\.com/) && await done(/nugget/i)' },
  { say: 'find pizza places near me and open the first one', check: 'await url(/google\\.com\\/maps\\/(place|search)/)' },

  // ---- shopping, said every which way (16-35) ----
  { say: 'find AirPods on Amazon and add them to my cart', check: `${AMAZON('airpods')} && ${CART}` },
  { say: 'add AirPods to my cart on Amazon', check: `${AMAZON('airpods')} && ${CART}` },
  { say: 'AirPods, Amazon, add to cart', check: `${AMAZON('airpods')} && ${CART}` },
  { say: 'to my Amazon cart add a phone charger', check: `${AMAZON('phone')} && ${CART}` },
  { say: 'search Amazon for a USB C cable and add the second one to my cart', check: `${AMAZON('usb')} && ${CART}` },
  { say: 'buy me a phone charger', check: AMAZON('phone') },
  { say: 'get me some AA batteries on Amazon', check: AMAZON('aa') },
  { say: 'find a phone charger under 20 dollars on Amazon', check: AMAZON('phone') },
  { say: 'go to Amazon, search for headphones, and open the first result', check: 'await url(/amazon\\.com\\/.*(\\/dp\\/|\\/gp\\/)/)' },
  { say: 'look for a gaming laptop on Best Buy', check: 'await url(/bestbuy\\.com.*(laptop|searchpage)/i)' },
  { say: 'find a Nintendo Switch on Best Buy and open the first one', check: 'await url(/bestbuy\\.com\\/site\\//)' },
  { say: 'search eBay for an iPhone 15 case', check: 'await url(/ebay\\.com\\/sch.*iphone/i)' },
  { say: 'find running shoes on Nike', check: 'await url(/nike\\.com.*(running|shoe|search)/i)' },
  { say: 'show me TVs on Target', check: 'await url(/target\\.com.*(tv|search|searchTerm)/i)' },
  { say: 'um can you like find me cheap headphones on Amazon', check: AMAZON('.*headphones') },
  { say: 'headphones on Amazon, search them', check: AMAZON('headphones') },
  { say: 'on Amazon I want AirPods, put them in my cart', check: `${AMAZON('airpods')} && ${CART}` },
  { say: 'search Amazon for a desk lamp then open the first one then add it to my cart', check: CART },
  { say: 'find a coffee maker on Walmart', check: 'await url(/walmart\\.com.*(coffee|search)/i)' },
  { say: 'compare AirPods on Amazon and Best Buy', check: '(await result(/\\$|price|airpods/i)) || (await done(/airpods/i))' },

  // ---- media: several things to one video, any order (36-55) ----
  { say: 'play lofi beats on YouTube and turn it up', check: `${WATCH} && ${video('v.volume > 0.5 || !v.muted')}` },
  { say: 'search lofi on YouTube, play the first video and pause it', check: `${WATCH} && ${video('v.paused')}` },
  { say: 'play piano music on YouTube and make it faster', check: `${WATCH} && ${video('v.playbackRate > 1')}` },
  { say: 'put on some jazz and lower the volume', check: `${WATCH} && ${video('v.volume < 0.5 || v.muted')}` },
  { say: 'play the second lofi video on YouTube', check: WATCH },
  { say: 'on YouTube the first lofi video, play it', check: WATCH },
  { say: 'lofi beats YouTube play', check: WATCH },
  { say: 'play baby shark and mute it', check: `${WATCH} && ${video('v.muted')}` },
  { say: 'find the latest Mr Beast video and play it', check: WATCH },
  { say: 'play Never Gonna Give You Up and tell me how many views it has', check: `${WATCH} && await answer(/\\d/)` },
  { say: 'play rain sounds on YouTube and skip ahead', check: WATCH },
  { say: 'search cooking videos on YouTube and play the third one', check: WATCH },
  { say: 'pause it, turn it down, and slow it down', setup: playing, check: video('v.paused && v.volume < 0.5 && v.playbackRate < 1') },
  { say: 'mute this and then skip ahead', setup: playing, check: video('v.muted') },
  { say: 'turn it up and make it faster', setup: playing, check: video('v.volume > 0.5 && v.playbackRate > 1') },
  { say: 'restart the video and pause it', setup: at(VIDEO, "(() => { const v = document.querySelector('video'); if (!v) return 'wait'; v.currentTime = 60; v.play(); return 'ok'; })()"), check: video('v.paused && v.currentTime < 5') },
  { say: 'play the next video', setup: playing, check: `await url(/youtube\\.com\\/watch\\?v=(?!dQw4w9WgXcQ)/)` },
  { say: 'go back ten seconds', setup: at(VIDEO, "(() => { const v = document.querySelector('video'); if (!v) return 'wait'; v.currentTime = 60; v.pause(); return 'ok'; })()"), check: video('v.currentTime < 55') },
  { say: 'stop the video and tell me who made it', setup: playing, check: `${video('v.paused')} && await answer(/rick astley/i)` },
  { say: 'this video, how many views does it have', setup: playing, check: 'await answer(/\\d/)' },

  // ---- find out something (56-75) ----
  { say: 'go to Wikipedia, look up black holes, and tell me who discovered them', check: 'await url(/wikipedia\\.org.*black/i) && await answer(/./)' },
  { say: 'what is the weather in San Jose tomorrow', check: GOOGLE('.*weather') },
  { say: "what's Apple's stock price", check: GOOGLE('.*(apple|aapl)') },
  { say: 'who is the CEO of Tesla', check: GOOGLE('.*tesla') },
  { say: 'find the nearest Starbucks', check: MAPS('starbucks') },
  { say: 'look up flights from San Francisco to New York', check: 'await url(/google\\.com\\/(search|travel)/)' },
  { say: 'find a recipe for banana bread and tell me the ingredients', check: 'await answer(/banana|flour|egg/i)' },
  { say: 'search Reddit for the best budget laptop and open the top post', check: 'await url(/reddit\\.com\\/r\\/.*\\/comments\\//)' },
  { say: 'find the electron repo on GitHub and tell me how many stars it has', check: 'await url(/github\\.com\\/electron\\/electron/) && await answer(/\\d/)' },
  { say: 'how many subscribers does MrBeast have', check: `(await answer(/\\d/)) || ${GOOGLE('.*mrbeast')}` },
  { say: 'the weather in New York, what is it', check: GOOGLE('.*weather') },
  { say: 'compare the iPhone 15 and the Pixel 8', check: GOOGLE('.*iphone') },
  { say: 'look up the Eiffel Tower on Wikipedia and tell me how tall it is', check: 'await url(/wikipedia\\.org.*eiffel/i) && await answer(/\\d/)' },
  { say: 'open the Black Hole Wikipedia page and tell me who took the first picture of one', check: 'await url(/wikipedia\\.org.*black/i) && await answer(/./)' },
  { say: 'what time is it in Tokyo', check: GOOGLE('.*tokyo') },
  { say: 'how do I make pancakes', check: `${GOOGLE('.*pancake')} || ${YT('.*pancake')}` },
  { say: 'what does this page say about event horizons', setup: at('https://en.wikipedia.org/wiki/Black_hole'), check: 'await answer(/./)' },
  { say: 'summarize this page', setup: at('https://en.wikipedia.org/wiki/Black_hole'), check: 'await answer(/black hole|gravity|light/i)' },
  { say: 'who wrote this article and when was it updated', setup: at('https://en.wikipedia.org/wiki/Black_hole'), check: 'await answer(/./)' },
  { say: 'what is the price of this', setup: at('https://www.amazon.com/dp/B0D1XD1ZV3'), check: 'await answer(/\\$|price|not/i)' },

  // ---- chains across sites and tabs (76-90) ----
  { say: 'open YouTube, search lofi beats, play the first video, then open a new tab and search Amazon for headphones', check: `(await tabCount()) >= 2 && ${AMAZON('headphones')}` },
  { say: 'look up the Eiffel Tower on Wikipedia then show it on Google Maps', check: MAPS('.*eiffel') },
  { say: 'check the weather in San Jose then play some rain sounds on YouTube', check: WATCH },
  { say: 'search GitHub for react, open the first repo, then go back', check: 'await url(/github\\.com\\/search/)' },
  { say: 'go to Amazon search AirPods then go to Best Buy and search AirPods', check: 'await url(/bestbuy\\.com/)' },
  { say: 'open Reddit search for cats then open YouTube and search for cats', check: YT('cats') },
  { say: 'search lofi on YouTube, go back, then search jazz', check: YT('jazz') },
  { say: 'new tab, Wikipedia, black holes', check: '(await tabCount()) >= 2 && await url(/wikipedia\\.org.*black/i)' },
  { say: 'play lofi on YouTube then open a new tab and go to Gmail', check: '(await tabCount()) >= 2 && await url(/google\\.com/)' },
  { say: 'search Google for the best tacos in San Jose and open the first result', check: 'await url(/^https?:\\/\\/(?!www\\.google\\.)/)' },
  { say: 'open Wikipedia, search for dogs, scroll down, then go back to the top', check: `await url(/wikipedia\\.org.*dog/i) && Number(await js('window.scrollY')) < 50` },
  { say: 'find pizza on DoorDash then find burgers on Uber Eats', check: 'await url(/ubereats\\.com/)' },
  { say: 'go to YouTube, search Minecraft, play the second one and make it fullscreen', check: WATCH },
  { say: 'zoom in, scroll down, and then zoom back out', setup: at('https://en.wikipedia.org/wiki/Black_hole'), check: '(await zoom()) === 0 && Number(await js("window.scrollY")) > 100' },
  { say: 'open a new tab, go to YouTube, then switch back to the first tab', check: '(await tabCount()) >= 2' },

  // ---- scrambled, corrected, and half-said (91-100) ----
  { say: 'YouTube, lofi, first video', check: WATCH },
  { say: 'cart, Amazon, AirPods', check: `${AMAZON('airpods')} && ${CART}` },
  { say: 'search for cats on YouTube no wait dogs', check: YT('dogs') },
  { say: 'open Amazon actually open Best Buy', check: 'await url(/bestbuy\\.com/)' },
  { say: 'play the first video, I mean the second one', setup: at('https://www.youtube.com/results?search_query=lofi'), check: WATCH },
  { say: 'go to the Burger King site and get a Whopper meal', check: 'await url(/bk\\.com|burgerking/) && await done(/whopper/i)' },
  { say: 'that video on lofi beats, the first one, play it on YouTube', check: WATCH },
  { say: 'fries and a burger from McDonalds please', check: 'await url(/mcdonalds\\.com/) && await done(/fries|burger/i)' },
  { say: 'to New York flights from San Francisco find', check: 'await url(/google\\.com\\/(search|travel)/)' },
  { say: 'Amazon search headphones, the cheapest one, open it', check: 'await url(/amazon\\.com\\/.*(\\/dp\\/|\\/gp\\/|s\\?k=headphones)/)' },
];

require('dotenv').config();
const { Telegraf } = require('telegraf');
const axios = require('axios');
const dns = require('dns');

const { TELEGRAM_BOT_TOKEN, DIFY_API_URL, DIFY_API_KEY } = process.env;
const IS_CHATFLOW = process.env.IS_CHATFLOW === 'true';

if (!TELEGRAM_BOT_TOKEN || !DIFY_API_URL || !DIFY_API_KEY) {
  console.error("❌ ERROR: Missing required environment variables!");
  console.error("Please ensure TELEGRAM_BOT_TOKEN, DIFY_API_URL, and DIFY_API_KEY are set.");
  process.exit(1);
}

function escapeHtml(text) {
  if (!text) return text;
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatTelegramMessage(text) {
  if (!text) return "";

  const tableRegex = /((?:^\s*\|.*\|\s*$\r?\n?){2,})/gm;
  let textWithTables = text.replace(tableRegex, (match) => {
    if (match.includes('|-') || match.includes('|:')) {
      return "\n```\n" + match.trim() + "\n```\n";
    }
    return match;
  });

  const parts = textWithTables.split(/(```[\s\S]*?```|`[^`]+`)/g);

  return parts.map(part => {
    if (part.startsWith('```')) {
      let content = part.slice(3, -3); 
      return `<pre><code>${escapeHtml(content)}</code></pre>`;
    }
    
    if (part.startsWith('`')) {
      let content = part.slice(1, -1);
      return `<code>${escapeHtml(content)}</code>`;
    }

    let formatted = escapeHtml(part);

    formatted = formatted
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^>\s?(.*)$/gm, '<blockquote>$1</blockquote>')
      .replace(/\*\*([^\n*][\s\S]*?[^\n*])\*\*/g, '<b>$1</b>')
      .replace(/__([^\n_]+)__/g, '<b>$1</b>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      .replace(/^[-*] /gm, '• ');

    return formatted;
  }).join('');
}

async function sendLongMessage(ctx, text) {
  const MAX_LENGTH = 4000;
  
  const sendChunk = async (chunk) => {
    try {
      const html = formatTelegramMessage(chunk);
      await ctx.reply(html, { parse_mode: 'HTML', disable_web_page_preview: true });
    } catch (e) {
      console.warn("[WARN] HTML send failed, retrying plain text:", e.message);
      await ctx.reply(chunk); 
    }
  };

  if (text.length <= MAX_LENGTH) {
    await sendChunk(text);
    return;
  }

  const chunks = [];
  let currentChunk = "";
  
  const lines = text.split('\n');
  for (const line of lines) {
    if ((currentChunk + line).length > MAX_LENGTH) {
        chunks.push(currentChunk);
        currentChunk = "";
    }
    currentChunk += line + "\n";
  }
  if (currentChunk) chunks.push(currentChunk);

  for (const chunk of chunks) {
    await sendChunk(chunk);
  }
}

const bot = new Telegraf(TELEGRAM_BOT_TOKEN);
const userConversations = {};

bot.start((ctx) => {
  const chatId = ctx.from.id;
  delete userConversations[chatId];
  ctx.reply("🤖 Hello! I am connected to the Dify DevOps System. How can I help you regarding your HestiaCP server today?");
});

bot.help((ctx) => {
  ctx.reply("Send me any message or alert, and I will forward it to the AI DevOps Agent for analysis.");
});

bot.on('text', async (ctx) => {
  const chatId = ctx.from.id;
  const userText = ctx.message.text;
  const username = ctx.from.username || `user_${chatId}`;
  
  ctx.sendChatAction('typing');
  
  let statusMessageId = null;
  let currentThought = "🔄 Connecting to Agent...";
  let lastSentText = "";
  let fullAnswer = "";

  try {
    const sentMsg = await ctx.reply(currentThought);
    statusMessageId = sentMsg.message_id;
  } catch (e) {
    console.error("Failed to send initial status message", e);
  }

  const typingInterval = setInterval(() => {
    ctx.sendChatAction('typing').catch(() => {});
  }, 4000);

  const statusUpdateInterval = setInterval(async () => {
    let formattedText = formatTelegramMessage(fullAnswer);
    let textToSend = formattedText;
    
    if (currentThought && !fullAnswer) {
      textToSend = `<i>${currentThought}</i>`;
    } else if (currentThought && fullAnswer) {
      textToSend = `<i>${currentThought}</i>\n\n${formattedText}`;
    } else if (!currentThought && !fullAnswer) {
      textToSend = "🔄 Processing...";
    }

    if (textToSend.length > 4000) {
      textToSend = textToSend.substring(0, 4000) + "\n\n⏳ [Loading long response...]";
    }

    if (statusMessageId && textToSend !== lastSentText) {
      const textToCompare = textToSend;
      try {
        await ctx.telegram.editMessageText(chatId, statusMessageId, null, textToSend, { 
          parse_mode: 'HTML',
          disable_web_page_preview: true
        });
        lastSentText = textToCompare;
      } catch (e) {
        try {
          let plainText = textToSend.replace(/<\/?i>/g, '').replace(/<[^>]+>/g, '');
          await ctx.telegram.editMessageText(chatId, statusMessageId, null, plainText, {
            disable_web_page_preview: true
          });
          lastSentText = textToCompare;
        } catch (e2) {}
      }
    }
  }, 1500);

  try {
    let targetUrl = `${DIFY_API_URL}/chat-messages`;
    let requestHeaders = {
        'Authorization': `Bearer ${DIFY_API_KEY}`,
        'Content-Type': 'application/json'
    };

    try {
        dns.setServers(['8.8.8.8', '1.1.1.1']);
        const urlObj = new URL(DIFY_API_URL);
        const hostname = urlObj.hostname;
        
        console.log(`[DNS-DEBUG] Attempting manual resolution for ${hostname}...`);
        
        const resolveIp = () => new Promise((resolve, reject) => {
            dns.resolve4(hostname, (err, addresses) => {
                if (err) reject(err);
                else resolve(addresses[0]);
            });
        });

        const ip = await resolveIp();
        console.log(`[DNS-DEBUG] Manually resolved ${hostname} to ${ip}`);
        
        targetUrl = targetUrl.replace(hostname, ip);
        requestHeaders['Host'] = hostname;
        
    } catch (e) {
        console.error(`[DNS-DEBUG] Manual DNS resolution failed: ${e.message}. Falling back to system DNS.`);
    }
    
    console.log(`[DEBUG] Requesting Dify (Streaming Mode) at: ${targetUrl} | Mode: ${IS_CHATFLOW ? 'Chatflow' : 'Agent'}`);
    
    const difyPayload = {
      inputs: {},
      query: userText,
      response_mode: "streaming",
      user: username
    };

    if (userConversations[chatId]) {
      difyPayload.conversation_id = userConversations[chatId];
    }

    const response = await axios.post(targetUrl, difyPayload, {
      headers: requestHeaders,
      responseType: 'stream',
      timeout: 1200000
    });

    let conversationId = "";
    let buffer = "";
    
    let streamIdleTimeout;
    const resetIdleTimeout = () => {
        clearTimeout(streamIdleTimeout);
        streamIdleTimeout = setTimeout(() => {
            console.error("[IDLE TIMEOUT] No response from Dify in 60 seconds. Forcing stream closure.");
            response.data.destroy(new Error("Idle Timeout - No data received for 60 seconds"));
        }, 60000);
    };

    resetIdleTimeout();

    response.data.on('data', (chunk) => {
      resetIdleTimeout();
      buffer += chunk.toString();
      let lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.trim() || !line.startsWith('data:')) continue;
        
        try {
          const data = JSON.parse(line.substring(5));
          
          if (!IS_CHATFLOW && data.event === 'agent_thought') {
            if (data.thought) {
              const cleanThought = data.thought.replace(/\n/g, ' ').trim();
              const thoughtPreview = cleanThought.length > 100 ? cleanThought.substring(0, 100) + "..." : cleanThought;
              currentThought = `💭 Thinking: ${thoughtPreview}`;
            } else if (data.tool) {
               currentThought = `🛠️ Using tool: ${data.tool}...`;
            } else if (data.observation) {
               currentThought = `👀 Analyzing command result...`;
            }
          }
          
          if (IS_CHATFLOW && (data.event === 'node_started' || data.event === 'workflow_started')) {
            const nodeTitle = data.data?.title || data.data?.node_type || "Processing...";
            if (nodeTitle !== 'Start' && nodeTitle !== 'Answer' && nodeTitle !== 'User Input') {
                currentThought = `⏳ Step: ${nodeTitle}...`;
            }
          }
          
          if (data.event === 'message' || data.event === 'agent_message' || data.event === 'text_chunk') {
            fullAnswer += data.answer || data.text || "";
          }
          if (data.conversation_id) {
            conversationId = data.conversation_id;
          }
          if (data.event === 'error') {
            console.error("[DIFY-STREAM-ERROR]", data.message);
          }
        } catch (e) {}
      }
    });

    response.data.on('end', async () => {
      clearTimeout(streamIdleTimeout);
      clearInterval(typingInterval);
      clearInterval(statusUpdateInterval);

      if (statusMessageId) {
        try {
            await ctx.telegram.deleteMessage(chatId, statusMessageId);
        } catch (e) {
            console.error("Failed to delete status message", e);
        }
      }

      if (conversationId) userConversations[chatId] = conversationId;
      
      if (fullAnswer.trim()) {
        await sendLongMessage(ctx, fullAnswer);
      } else {
        console.warn("[WARN] Dify stream ended with empty answer.");
        await ctx.reply("⚠️ Cloud Dify processed the request but returned an empty answer.");
      }
    });

    // Capture the destroyed stream error manually if needed
    response.data.on('error', (err) => {
        clearTimeout(streamIdleTimeout);
        console.error("Stream Explicit Error:", err.message);
    });

  } catch (error) {
    clearInterval(typingInterval);
    clearInterval(statusUpdateInterval);
    if (statusMessageId) {
        try { await ctx.telegram.deleteMessage(chatId, statusMessageId); } catch(e){}
    }
    
    if (error.response) {
        console.error(`[ERROR] Dify API Response Status:`, error.response.status);
        try {
           if (error.response.data && typeof error.response.data.read === 'function') {
               error.response.data.on('data', d => console.error(`[ERROR BODY]: ${d.toString()}`));
           } else {
               console.error(`[ERROR] Dify API Response Data:`, JSON.stringify(error.response.data));
           }
        } catch(serializationError) {
           console.error(`[ERROR] Could not serialize response data:`, serializationError.message);
        }
    } else {
        console.error(`[ERROR] Dify API Failure:`, error.message);
    }
    
    await ctx.reply("❌ Sorry, I couldn't reach the AI brain. Check the logs for the specific error details.");
  }
});

bot.launch().then(() => {
  console.log("🚀 Telegram-Dify Node.js Bridge is running!");
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// worker/index.ts
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { NewMessage, NewMessageEvent } from "telegram/events";
import { getJobCategory } from "./filter";
import "dotenv/config";

const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH!;
const sessionString = process.env.TELEGRAM_SESSION!;

const CHANNELS = ["gotjobsych"]; 

const client = new TelegramClient(
  new StringSession(sessionString),
  apiId,
  apiHash,
  { connectionRetries: 5 }
);

function extractTitle(text: string): string {
  const firstLine = text.split("\n")[0].trim();
  return firstLine.length > 100 ? firstLine.slice(0, 100) + "..." : firstLine;
}

function getChatTitle(chat: any): string {
  if (!chat) return "Channel";
  if ('title' in chat && chat.title) return chat.title;
  if ('firstName' in chat && chat.firstName) return chat.firstName;
  return "Channel";
}

// معالج الرسائل الجديدة
async function handler(event: NewMessageEvent) {
  const message = event.message;
  const text = message.text;

  if (!text || text.length < 10) return;

  // ⚠️ تم تعطيل الفلترة مؤقتاً
  // if (!isTechJob(text)) { ... return; }

  const username = message.chat && 'username' in message.chat ? message.chat.username : 'unknown';
  const messageUrl = username !== 'unknown' 
    ? `https://t.me/${username}/${message.id}` 
    : `https://t.me/c/${message.chatId}/${message.id}`;

    // استخراج بيانات الوظيفة
  const jobData = {
    title: extractTitle(text),
    company: null,
    description: text,
    source: `telegram:${username}`,
    url: messageUrl,
    postedAt: new Date(message.date * 1000).toISOString(),
    category: getJobCategory(text), // 👈 إضافة التصنيف هنا
  };

  console.log("\n[SUCCESS] New message received!");
  console.log("   Title:", jobData.title);
  console.log("   URL:", jobData.url);

  // إرسال البيانات إلى Next.js
  try {
    const res = await fetch("sy-jobs-production.up.railway.app", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(jobData),
    });
    
    if (res.ok) {
      console.log("   ✅ Sent to Next.js successfully.");
    } else {
      console.log("   ⚠️ Failed to send to Next.js (status: " + res.status + ")");
    }
  } catch (err) {
    console.error("   ❌ Error sending to Next.js:", err);
  }
}

async function main() {
  console.log(">> Starting Telegram worker...");
  await client.connect();
  console.log(">> Connected to Telegram.");

  // جلب آخر رسالتين من كل قناة عند بدء التشغيل
  for (const channel of CHANNELS) {
    try {
      console.log(`\n>> Fetching last 2 messages from: ${channel}...`);
      // جلب آخر رسالتين (limit: 2)
      const messages = await client.getMessages(channel, { limit: 2 });
      
      for (const msg of messages) {
        // نمرر الرسالة للمعالج يدوياً
        await handler({ message: msg } as NewMessageEvent);
      }
    } catch (err) {
      console.error(`Failed to fetch messages from ${channel}:`, err);
    }
  }

  console.log("\n>> Listening for new messages...");
  client.addEventHandler(handler, new NewMessage({ chats: CHANNELS }));

  console.log(`>> Listening to: ${CHANNELS.join(", ")}`);
  console.log(">> Worker is running... (Press Ctrl+C to stop)");
}

main().catch(console.error);
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import input from "input";
import "dotenv/config";

const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH!;

// جلسة فارغة لأننا نسجل الدخول لأول مرة
const stringSession = new StringSession("");

const client = new TelegramClient(stringSession, apiId, apiHash, {
  connectionRetries: 5,
});

(async () => {
  console.log("⏳ جاري الاتصال بتليجرام...");
  
  await client.start({
    phoneNumber: async () => await input.text("📱 أدخل رقم هاتفك (مع رمز الدولة، مثال: +9639xxxxxxxx): "),
    password: async () => await input.text("🔐 أدخل كلمة مرور التحقق بخطوتين (إذا لم تفعلها اضغط Enter): "),
    phoneCode: async () => await input.text("💬 أدخل الكود الذي وصلك على تيليجرام: "),
    onError: (err) => console.log("❌ خطأ:", err),
  });

  console.log("\n✅ تم تسجيل الدخول بنجاح!\n");
  
  // هذا هو أهم سطر: سيُطبع الجلسة التي سنحفظها
  console.log("👇 انسخ النص التالي بالكامل واحفظه في ملف .env بجانب TELEGRAM_SESSION=\n");
  console.log(client.session.save());
  console.log("\n");
  
  await client.disconnect();
  process.exit(0);
})();
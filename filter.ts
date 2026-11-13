// filter.ts — نظام فلترة وظائف Full Stack (ملف واحد)
// الاستخدام: import { classifyJob } from "./filter";
import { createHash } from "node:crypto";


// ═══════════════ normalize ═══════════════
const DIACRITICS = /[\u064B-\u065F\u0670\u06D6-\u06ED]/g;
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

/** توحيد الحروف العربية: تشكيل، تطويل، همزات، ى→ي، ة→ه، أرقام هندية → لاتينية */
export function normalizeArabic(s: string): string {
  return s
    .replace(DIACRITICS, "")
    .replace(/\u0640/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ک/g, "ك")
    .replace(/ی/g, "ي")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/**
 * النص الجاهز للمطابقة: lowercase + تطبيع عربي + إزالة الروابط والإيميلات
 * والإيموجي. بنحافظ على + # . / - لتبقى c++ و c# و next.js و ui/ux سليمة.
 */
export function normalizeForMatch(text: string): string {
  return normalizeArabic(text.normalize("NFKC").replace(INVISIBLE, ""))
    .toLowerCase()
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, " ") // emails
    .replace(/(?:https?:\/\/|www\.|t\.me\/)\S+/g, " ") // urls
    .replace(/@\w+/g, " ") // @handles
    .replace(/[^\p{L}\p{N}+#.\/\-\s]/gu, " ") // emoji + punctuation
    .replace(/\s+/g, " ")
    .trim();
}

const AR = "\\u0621-\\u064A";
const SEP = "[\\s\\-_./]";
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * يحوّل كلمة مفتاحية لـ RegExp آمن (بدون substring خاطئ):
 *  - لاتيني: حدود كلمة + جمع اختياري (s/es) + فواصل مرنة
 *      "full stack" ← fullstack | full-stack | full_stack | full stack
 *      "ui" ما بتطابق "recruitment" ولا "building"
 *  - عربي: حدود حروف عربية + سوابق (و ف ب ل ك ال) + لواحق (ه ين ون ات ان ي يه هات)
 *      "مبرمج" ← المبرمجين | للمبرمجة | ومبرمج
 * لازم تنطبق نفس normalizeForMatch على النص.
 */
export function compileKeyword(kw: string): RegExp {
  const norm = normalizeArabic(kw.toLowerCase()).trim();

  if (/[\u0621-\u064A]/.test(norm)) {
    const words = norm.split(/\s+/).map(esc).join("\\s+(?:ال)?");
    return new RegExp(
      `(?<![${AR}])(?:و|ف)?(?:ب|ل|ك)?(?:ال)?${words}(?:ها|هات|ات|ان|ين|ون|يه|ه|ي)?(?![${AR}])`
    );
  }

  const parts = norm.split(/[\s\-_./]+/).filter(Boolean).map(esc);
  return new RegExp(`(?<![a-z0-9])${parts.join(`${SEP}?`)}(?:s|es)?(?![a-z0-9])`);
}

/** بصمة للـ dedup: نفس الإعلان بتوصل من عدة قنوات (أو بتتكرر بنفس القناة) */
export function fingerprint(text: string): string {
  const n = normalizeForMatch(text).replace(/\d+/g, "#").slice(0, 400);
  return createHash("sha1").update(n).digest("hex").slice(0, 16);
}


// ═══════════════ rules ═══════════════
export type Category = "tech" | "engineering" | "video" | "design" | "other";
export type TargetCategory = Exclude<Category, "other">;
export type TechTag =
  | "fullstack" | "frontend" | "backend" | "web" | "software"   // core
  | "mobile" | "devops" | "data" | "qa" | "security"             // adjacent
  | "it";                                                        // IT support / شبكات / ERP

/** Rule = [كلمة أو RegExp جاهز (على النص المطبّع), الوزن] */
export type Rule = readonly [pattern: string | RegExp, weight: number];

// الأوزان: R = المسمى الوظيفي نفسه | S = أداة/تقنية | G = كلمة عامة | W = إشارة ضعيفة
const R = 5, S = 3, G = 2, W = 1;

// ───────────────────────── Tech ─────────────────────────
export const TECH_RULES: Record<TechTag, Rule[]> = {
  fullstack: [
    ["full stack", R], ["فول ستاك", R], ["فل ستاك", R],
    ["mern", S], ["mean stack", S], ["t3 stack", S],
  ],
  frontend: [
    ["front end", R], ["فرونت اند", R], ["واجهات امامي", R], ["واجهه امامي", R], ["مطور واجهات", R],
    ["ui developer", R], ["react", S], ["next.js", S], ["vue", S], ["angular", S], ["svelte", S],
    ["nuxt", S], ["tailwind", S], ["redux", S], ["رياكت", S],
    ["javascript", S], ["جافا سكريبت", S], ["typescript", S], ["html", G], ["css", G],
    ["bootstrap", G], ["jquery", G],
  ],
  backend: [
    ["back end", R], ["باك اند", R], ["node", S], ["nestjs", S], ["express.js", S],
    ["laravel", S], ["لارافيل", S], ["django", S], ["flask", S], ["fastapi", S], ["spring boot", S],
    ["php", S], ["python", S], ["بايثون", S], ["java", S], ["جافا", S], ["golang", S],
    ["ruby on rails", S], ["c#", S], [/(?<![a-z0-9])(?:asp\.net|\.net|dotnet)(?![a-z0-9])/, S],
    ["graphql", S], ["rest api", S], ["restful", S], ["microservice", S], ["api", G],
    ["postgres", S], ["postgresql", S], ["mysql", S], ["mongodb", S], ["sql server", S],
    ["sql", G], ["redis", G], ["firebase", G], ["supabase", S], ["prisma", S],
    ["database", G], ["قواعد بيانات", G],
  ],
  web: [
    ["web developer", R], ["مطور ويب", R], ["مطور مواقع", R], ["تطوير ويب", R], ["تطوير مواقع", R],
    ["web app", S], ["wordpress", S], ["ووردبريس", S], ["woocommerce", S], ["shopify", S],
    ["web", G], ["ويب", G], ["cms", G], ["saas", G],
  ],
  software: [
    ["software developer", R], ["software engineer", R], ["programmer", R], ["مبرمج", R],
    ["مهندس برمجيات", R], ["مطور برمجيات", R], ["مطور تطبيقات", R], ["تطوير برمجيات", R],
    ["تطوير تطبيقات", R], ["tech lead", R], ["technical lead", R], ["cto", R],
    ["software architect", R], ["solution architect", R], ["solutions architect", R],
    ["developer", 4], ["مطور", 4], ["برمجه", 4], ["coder", S], ["coding", S], ["programming", S],
    ["برمجيات", S], ["software", G], ["git", G], ["github", G], ["oop", G], ["algorithm", G],
    ["system design", G],
  ],
  mobile: [
    ["mobile developer", R], ["android developer", R], ["ios developer", R], ["flutter", S],
    ["react native", 4], ["kotlin", S], ["swiftui", S], ["dart", S], ["xcode", G],
    ["android", G], ["ios", G], ["mobile app", S], ["اندرويد", S],
    ["تطبيقات موبايل", S], ["تطبيقات جوال", S], ["تطبيقات هاتف", S],
  ],
  devops: [
    ["devops", R], ["site reliability", R], ["sre", S], ["cloud engineer", R],
    ["system administrator", R], ["sysadmin", R], ["server administrator", R],
    ["مدير انظمه", R], ["مدير سيرفرات", R], ["ادارة خوادم", R],
    ["docker", S], ["kubernetes", S], ["k8s", S], ["ci/cd", S], ["jenkins", S], ["terraform", S],
    ["ansible", S], ["aws", S], ["azure", S], ["gcp", S], ["google cloud", S], ["nginx", S],
    ["linux", G], ["cloud", G], ["سيرفر", G], ["خوادم", S],
  ],
  data: [
    ["data scientist", R], ["data analyst", R], ["data engineer", R], ["machine learning", R],
    ["ml engineer", R], ["ai engineer", R], ["bi developer", R], ["محلل بيانات", R],
    ["تحليل بيانات", R], ["علم البيانات", R], ["علوم البيانات", R], ["ذكاء اصطناعي", 4],
    ["تعلم الاله", R], ["deep learning", 4], ["business intelligence", 4], ["power bi", 4],
    ["nlp", S], ["llm", S], ["tensorflow", S], ["pytorch", S], ["pandas", S], ["tableau", S],
    ["etl", S], ["big data", S], ["data warehouse", S],
  ],
  qa: [
    ["qa engineer", R], ["software tester", R], ["quality assurance engineer", R],
    ["اختبار برمجيات", R], ["test automation", 4], ["selenium", S], ["cypress", S],
    ["playwright", S], ["jest", G], ["tester", G], ["qa", W],
  ],
  security: [
    ["cyber security", R], ["information security", R], ["infosec", R], ["security engineer", R],
    ["security analyst", R], ["soc analyst", R], ["ethical hacker", R], ["pentest", R],
    ["penetration", 4], ["owasp", S], ["امن سيبراني", R], ["امن معلومات", R], ["اختبار اختراق", R],
  ],
  it: [
    ["it support", R], ["help desk", R], ["it specialist", R], ["it manager", R], ["it officer", R],
    ["it technician", R], ["it admin", R], ["network engineer", R], ["network administrator", R],
    ["مهندس شبكات", R], ["مهندس حاسوب", R], ["مهندس حاسب", R], ["هندسه حاسوب", R],
    ["هندسه معلوماتيه", R], ["تكنولوجيا معلومات", R], ["تقنيه معلومات", R], ["نظم معلومات", 4],
    ["technical support", S], ["tech support", S], ["دعم تقني", 4], ["دعم فني", S],
    ["ccna", 4], ["ccnp", 4], ["mikrotik", 4], ["cisco", S], ["fortigate", S], ["voip", S],
    ["firewall", S], ["tcp/ip", S], ["networking", S], ["شبكات", S], ["erp", S], ["odoo", S],
    ["sap", G], ["حاسوب", G], ["معلوماتيه", S], ["تقني", G], ["تكنولوجيا", W],
  ],
};

// ───────────────────────── Engineering ─────────────────────────
const SW_CTX =
  "software|computer|network|data|cloud|security|devops|ai|ml|qa|test|front[\\s-]?end|back[\\s-]?end|full[\\s-]?stack|web|mobile|it|systems?";

/** "engineer" لكن مو software engineer / network engineer … (هدول بتروح لـ tech) */
const ENGINEER_EN = new RegExp(
  `(?<![a-z0-9])(?<!(?:${SW_CTX})\\s)engineers?(?![a-z0-9])`
);
const ENGINEERING_EN = new RegExp(
  `(?<![a-z0-9])(?<!(?:${SW_CTX})\\s)engineering(?![a-z0-9])`
);
const ARCHITECT_EN =
  /(?<![a-z0-9])(?<!(?:software|solutions?|cloud|enterprise|technical|data|systems?|information|security|network)\s)architects?(?![a-z0-9])/;
/** "مهندس" لكن مو "مهندس برمجيات/حاسوب/شبكات…" */
const ENGINEER_AR = new RegExp(
  "(?<![\\u0621-\\u064A])(?:و|ف)?(?:ب|ل|ك)?(?:ال)?مهندس(?:ه|ين|ات|ون)?" +
    "(?!\\s+(?:ال)?(?:برمجيات|حاسوب|حاسب|حواسيب|معلوماتيه|شبكات|بيانات|ذكاء|software|computer|network|data|ai|devops|it)(?![a-z0-9\\u0621-\\u064A]))" +
    "(?![\\u0621-\\u064A])"
);

export const ENGINEERING_RULES: Rule[] = [
  ["civil engineer", R], ["مهندس مدني", R], ["هندسه مدني", R], ["site engineer", R], ["مهندس موقع", R],
  ["مهندس تنفيذ", R], ["مهندس اشراف", R], ["quantity surveyor", R], ["مهندس كميات", R],
  ["structural engineer", R], ["مهندس انشائي", R], ["مهندس معماري", R], ["معماري", 4],
  ["architectural", 4], [ARCHITECT_EN, R],
  ["mechanical engineer", R], ["مهندس ميكانيك", R], ["electrical engineer", R], ["مهندس كهرباء", R],
  ["electronics engineer", R], ["مهندس الكترون", R], ["مهندس اتصالات", R], ["telecom engineer", R],
  ["industrial engineer", R], ["مهندس صناعي", R], ["agricultural engineer", R], ["مهندس زراعي", R],
  ["chemical engineer", R], ["مهندس كيميائي", R], ["petroleum engineer", R], ["مهندس نفط", R],
  ["مهندس بترول", R], ["biomedical engineer", R], ["مهندس طبي", R], ["مهندس تكييف", R],
  ["مهندس صيانه", R], ["maintenance engineer", R], ["production engineer", R], ["مهندس انتاج", R],
  ["quality engineer", R], ["مهندس جوده", R], ["project engineer", R], ["مهندس مشاريع", R],
  ["مساح", 4], ["surveyor", 4],
  [ENGINEER_EN, 3], [ENGINEER_AR, 3], [ENGINEERING_EN, G], ["هندسه", G], ["هندسي", G],
  ["autocad", S], ["revit", S], ["solidworks", S], ["sap2000", S], ["etabs", S], ["staad", S],
  ["primavera", S], ["ms project", G], ["bim", S], ["boq", S], ["catia", S], ["ansys", S],
  ["plc", S], ["scada", S], ["hvac", S], ["arcgis", S], ["gis", G], ["matlab", G],
];

// ───────────────────────── Video ─────────────────────────
export const VIDEO_RULES: Rule[] = [
  ["video editor", R], ["video editing", R], ["محرر فيديو", R], ["تحرير فيديو", R],
  ["مونتير", R], ["مونتاج", R], ["montage", R], ["youtube editor", R],
  ["motion graphics", R], ["motion designer", R], ["موشن جرافيك", R], ["موشن غرافيك", R],
  ["animator", R], ["animation", S], ["انيميشن", 4], ["رسوم متحركه", 4], ["vfx", 4], ["colorist", 4],
  ["videographer", R], ["مصور فيديو", R], ["صانع محتوى", S], ["content creator", S],
  ["premiere", S], ["after effects", S], ["final cut", S], ["davinci", S], ["capcut", S],
  ["filmora", S], ["vegas pro", S], ["reels", G], ["editing", W], ["يوتيوب", W], ["tiktok", W],
];

// ───────────────────────── Design & Photography ─────────────────────────
export const DESIGN_RULES: Rule[] = [
  ["graphic designer", R], ["مصمم جرافيك", R], ["مصمم غرافيك", R], ["ui ux", 4], ["ux designer", R],
  ["ui designer", R], ["product designer", R], ["visual designer", R], ["web designer", R],
  ["brand designer", R], ["motion designer", G], ["interior designer", R], ["مصمم داخلي", R],
  ["مصمم ديكور", R], ["مصمم مواقع", R], ["مصمم ويب", R], ["مصمم واجهات", R],
  ["art director", R], ["creative director", R],
  ["designer", 4], ["مصمم", 4], ["photographer", R], ["مصور", 4], ["videographer", S],
  ["مصور فيديو", S], ["illustrator", 4], ["رسام", S], ["تصوير", S], ["ديكور", S],
  ["photoshop", S], ["indesign", S], ["figma", S], ["adobe xd", S], ["canva", S], ["coreldraw", S],
  ["lightroom", S], ["procreate", S], ["blender", S], ["3ds max", S], ["sketchup", S], ["lumion", S],
  ["maya", G], ["جرافيك", S], ["غرافيك", S], ["هويه بصريه", S], ["visual identity", S],
  ["واجهات مستخدم", S], ["branding", G], ["logo", G], ["design", G], ["تصميم", G], ["تصاميم", G],
  ["ui", G], ["ux", G], ["شعار", W], ["camera", W], ["كاميرا", W],
];

// ───────────────────────── Negative phrases ─────────────────────────
/** عبارات بتنحذف من النص قبل المطابقة لأنها بتعطي false positives */
export const NEGATIVE_PHRASES: string[] = [
  // "Developer" ≠ مبرمج
  "business development", "business developer", "sales development", "real estate developer",
  "property developer", "talent development", "career development", "professional development",
  "community development", "organizational development", "child development",
  "مطور اعمال", "تطوير اعمال", "تطوير الاعمال", "مطور عقاري", "تطوير عقاري", "مطور مبيعات",
  "تطوير مبيعات", "تطوير الذات", "تطوير مهارات", "تطوير الموارد", "تطوير القدرات", "تطوير الاداء",
  "تطوير منتجات",
  // "شبكات" = social networks
  "شبكات التواصل", "شبكات اجتماعيه", "social network", "networking skills", "networking event",
  // "تصوير" طبي/مستندات
  "تصوير شعاعي", "تصوير طبقي", "تصوير مقطعي", "تصوير الاشعه", "تصوير بالرنين", "تصوير طبي",
  "تصوير الصدي", "مصور شعاعي", "تصوير مستندات", "تصوير وطباعه", "مصور مستندات",
];

// ───────────────────────── Blockers (وظائف مو من مجالك) ─────────────────────────
/** إذا ظهرت بالعنوان وما في أي تصنيف قوي بالعنوان → نخفّض أثر كلمات النص (body) */
export const BLOCKER_TERMS: string[] = [
  "sales", "salesman", "telesales", "account manager", "account management", "accountant",
  "accounting", "cashier", "driver", "cleaner", "cook", "chef", "barista", "waiter", "nurse",
  "doctor", "pharmacist", "teacher", "receptionist", "secretary", "storekeeper", "warehouse",
  "hr", "human resources", "recruitment", "recruiter", "customer service", "call center",
  "marketing", "merchandiser", "security guard", "data entry", "office manager", "travel agent",
  "reservation", "business development",
  "مبيعات", "مندوب", "بائع", "كاشير", "محاسب", "محاسبه", "سائق", "عامل", "عمال", "نظافه", "منظف",
  "طباخ", "معلم", "مدرس", "ممرض", "طبيب", "صيدلاني", "حارس", "سكرتير", "استقبال", "موارد بشريه",
  "خدمه عملاء", "مدخل بيانات", "امين مستودع", "مستودع", "بوفيه", "مخبز", "فرن", "تسويق", "مسوق",
  "خياط", "نجار", "حداد", "سباك",
];

// ───────────────────────── Is it even a job? ─────────────────────────
export const HIRING_STRONG: string[] = [
  "مطلوب", "تعلن", "نبحث عن", "نحتاج", "بحاجه", "لتعيين", "لتوظيف", "لرفد", "شاغر", "شواغر",
  "توظيف", "hiring", "we are looking", "looking for", "vacancy", "vacancies", "job title",
  "المسمي الوظيفي", "نوع الدوام", "للتقديم", "ارسال السيره", "السيره الذاتيه", "cv", "resume",
  "apply", "job description", "responsibilities", "requirements", "qualifications", "الشركه",
  "الجهه", "الراتب", "salary",
];
export const HIRING_WEAK: string[] = ["وظيفه", "وظائف", "فرصه عمل", "دوام", "تعيين", "خبره"];
export const PROMO_TERMS: string[] = [
  "انضم", "اشترك", "تابعونا", "join", "subscribe", "follow us", "قناه", "قنوات", "كروب", "جروب",
  "مجموعه", "group", "channel",
];

export const SYRIAN_CITIES = [
  "دمشق", "ريف دمشق", "حلب", "حمص", "حماه", "اللاذقيه", "طرطوس", "ادلب", "درعا", "السويداء",
  "القنيطره", "دير الزور", "الرقه", "الحسكه", "القامشلي", "جرمانا", "الساحل",
];

// ───────────────────────── Compile once ─────────────────────────
export interface CompiledRule {
  re: RegExp;
  w: number;
  cat: TargetCategory;
  tag?: TechTag;
  label: string;
}

const toRe = (p: string | RegExp) => (typeof p === "string" ? compileKeyword(p) : p);
const label = (p: string | RegExp) => (typeof p === "string" ? p : "(regex)");

export const COMPILED: CompiledRule[] = [
  ...(Object.entries(TECH_RULES) as [TechTag, Rule[]][]).flatMap(([tag, rules]) =>
    rules.map(([p, w]) => ({ re: toRe(p), w, cat: "tech" as const, tag, label: label(p) }))
  ),
  ...ENGINEERING_RULES.map(([p, w]) => ({ re: toRe(p), w, cat: "engineering" as const, label: label(p) })),
  ...VIDEO_RULES.map(([p, w]) => ({ re: toRe(p), w, cat: "video" as const, label: label(p) })),
  ...DESIGN_RULES.map(([p, w]) => ({ re: toRe(p), w, cat: "design" as const, label: label(p) })),
];

const anyOf = (terms: string[]) => terms.map(compileKeyword);
export const NEGATIVE_RES = anyOf(NEGATIVE_PHRASES).map((r) => new RegExp(r.source, "g"));
export const BLOCKER_RES = anyOf(BLOCKER_TERMS);
export const HIRING_STRONG_RES = anyOf(HIRING_STRONG);
export const HIRING_WEAK_RES = anyOf(HIRING_WEAK);
export const PROMO_RES = anyOf(PROMO_TERMS);


// ═══════════════ extract ═══════════════
export interface JobFields {
  title: string;
  titleGuess: boolean; // true = ما لقينا عنوان واضح، أخدنا أول النص
  company?: string;
  location?: string;
  workMode?: "remote" | "hybrid" | "onsite";
  phones: string[];
  emails: string[];
  links: string[];
  handles: string[];
}

// ───────────── تنظيف ─────────────
const BOILERPLATE = [
  /💼?\s*فرصة\s+عمل\s+جديدة/gu, // هيدر القناة
  /التفاصيل\s*←/gu,
  /➖+\s*المصدر.*$/gmu,
];

export function stripBoilerplate(raw: string): string {
  let t = raw.normalize("NFKC").replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "");
  for (const re of BOILERPLATE) t = t.replace(re, " ");
  return t.replace(/[ \t]+/g, " ").trim();
}

/** يشيل علامات الماركداون والهاشتاغ ويرجّع نص عادي */
export function stripMarkup(s: string): string {
  return s.replace(/\*\*|__|`/g, " ").replace(/#(\S+)/g, (_, w: string) => w.replace(/_/g, " ")).replace(/[ \t]+/g, " ").trim();
}

const tidy = (s: string) =>
  s.replace(/[#*_`]/g, " ").replace(/\s+/g, " ").trim();

// أماكن بنقطع عندها العنوان
const CUT =
  /[\n\r|*،؛;]|\p{Extended_Pictographic}|\s[-–—]\s|\.\s|:\s|\s(?:للانضمام|للعمل|لدى|ضمن|بشركة|لشركة|وفق|حسب|للتواصل|في|داخل|لصالح|عند)\s|\s(?:at|@)\s/iu;

function cutTitle(s: string, max = 120): string {
  const m = CUT.exec(s);
  const cut = tidy(m ? s.slice(0, m.index) : s);
  return (cut.length >= 3 ? cut : tidy(s)).slice(0, max);
}

// ───────────── العنوان ─────────────
const LEAD = String.raw`^[\s*]*(?:#\S+[\s*]*)*`;
const RE_PREFIX = new RegExp(
  LEAD +
    String.raw`(?:إعلان\s+)?(?:فرصة\s+عمل|شاغر\s+وظيفي|وظيفة\s+شاغرة|وظيفة|job\s+opportunity|job|hiring|vacancy)\s*[|:：\-–—]\s*([^\n]+)`,
  "iu"
);
const RE_BOLD = /\*\*\s*([^*\n]{3,140}?)\s*\*\*/gu;
const RE_LABEL = /(?:المسمى\s*الوظيفي|job\s*title|المسمى)\s*[:：\-–]?\s*([^\n]+)/iu;
const AR_L = "\\u0600-\\u06FF";
const RE_REQUEST = new RegExp(
  String.raw`(?:(?<![${AR_L}])مطلوب(?:ة|ون|ين|ات)?(?![${AR_L}])|نبحث\s+عن|نحتاج(?:\s+(?:إلى|الى))?|بحاجة\s+(?:إلى|الى)|بحاجة|يلزم|` +
    String.raw`عن\s+حاجتها(?:\s+(?:إلى|الى|لتعيين|لتوظيف|لرفد\s+كوادرها\s+ب|لرفد\s+كادرها\s+ب))?|لتعيين|لتوظيف|للتعيين|` +
    String.raw`(?:we\s+are|is)\s+(?:hiring|looking\s+for)|looking\s+for|hiring)\s*[:：\-–]?\s*([^\n]+)`,
  "iu"
);

export function extractTitle(stripped: string): { title: string; guess: boolean } {
  let m = RE_PREFIX.exec(stripped);
  if (m) return { title: cutTitle(m[1]), guess: false };

  for (const b of stripped.matchAll(RE_BOLD)) {
    if ((b.index ?? 0) < 250 && /\p{L}{2}/u.test(b[1])) return { title: cutTitle(b[1]), guess: false };
  }

  m = RE_LABEL.exec(stripped);
  if (m) return { title: cutTitle(m[1]), guess: false };

  m = RE_REQUEST.exec(stripped);
  if (m) return { title: cutTitle(m[1], 100), guess: false };

  const first = tidy(stripped.replace(/^[\s*]*(?:#\S+[\s*]*)*/u, "")).slice(0, 140);
  return { title: first, guess: true };
}

// ───────────── باقي الحقول ─────────────
const labelValue = (text: string, label: RegExp, dash = true): string | undefined => {
  const m = label.exec(text);
  if (!m) return undefined;
  const stop = dash
    ? /[\n\r|*]|\p{Extended_Pictographic}|\s[-–—]\s/u
    : /[\n\r|*]|\p{Extended_Pictographic}/u;
  const v = m[1];
  const s = stop.exec(v);
  const out = tidy(s ? v.slice(0, s.index) : v).slice(0, 80);
  return out.length >= 2 ? out : undefined;
};

export function extractFields(stripped: string): JobFields {
  const text = stripMarkup(stripped);
  const { title, guess } = extractTitle(stripped);

  const company = labelValue(
    stripped,
    /(?:اسم\s+الشركة|الشركة|الجهة|company)\s*[:：]?\s*([^\n]+)/iu
  );

  let location = labelValue(
    stripped,
    /(?:📍|مكان\s+العمل|الموقع|location)\s*[:：]?\s*([^\n]+)/iu,
    false
  );
  if (!location) {
    for (const h of stripped.matchAll(/#([^\s#*]+)/gu)) {
      const tag = normalizeArabic(h[1].replace(/_/g, " "));
      if (SYRIAN_CITIES.some((c) => normalizeArabic(c) === tag)) {
        location = h[1].replace(/_/g, " ");
        break;
      }
    }
  }

  const n = normalizeForMatch(text);
  const workMode: JobFields["workMode"] =
    /(?<![a-z])(?:remote|work from home|wfh)(?![a-z])|عن بعد|اونلاين|من المنزل/.test(n)
      ? "remote"
      : /(?<![a-z])hybrid(?![a-z])|هجين/.test(n)
      ? "hybrid"
      : /on[\s-]?site|حضوري|عمل مكتبي/.test(n)
      ? "onsite"
      : undefined;

  const digits = normalizeArabic(text);
  const uniq = (a: string[]) => [...new Set(a.map((x) => x.trim()))];
  const emails = uniq(digits.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? []);
  const phones = uniq(
    (digits.match(/(?:\+|00)?(?:963[\s-]?|0)9[\s-]?\d{2}[\s-]?\d{3}[\s-]?\d{3}/g) ?? []).map((p) =>
      p.replace(/[\s-]/g, "")
    )
  );
  const links = uniq(digits.match(/(?:https?:\/\/|t\.me\/|www\.)[^\s)]+/g) ?? []);
  const handles = uniq(digits.match(/(?<![\w.@])@[A-Za-z0-9_]{4,}/g) ?? []);

  return { title, titleGuess: guess, company, location, workMode, phones, emails, links, handles };
}

// ───────────── إعلان بعدة وظائف (1- ... 2- ... 3- ...) ─────────────
const PLURAL_CUE =
  /الوظائف|الشواغر|شواغر|الاختصاصات|الاختصاصات|بوظائف|jobs|positions|vacancies|roles|openings/iu;
const DETAIL_CUE = /المهام|المتطلبات|المسؤوليات|الشروط|الواجبات|responsibilities|requirements|duties/iu;

export function splitMultiJob(plain: string): string[] | null {
  const re = /(?<!\d)(\d{1,2})\s*[-–.)]\s+(?=[^\d\s])/g;
  const marks: { idx: number; end: number }[] = [];
  let expect = 1;
  for (const m of plain.matchAll(re)) {
    if (Number(m[1]) === expect) {
      marks.push({ idx: m.index!, end: m.index! + m[0].length });
      expect++;
    }
  }
  if (marks.length < 3) return null;

  const header = plain.slice(Math.max(0, marks[0].idx - 160), marks[0].idx);
  if (!PLURAL_CUE.test(header) || DETAIL_CUE.test(header.slice(-60))) return null;

  return marks.map((m, i) => plain.slice(m.end, marks[i + 1]?.idx ?? plain.length).trim());
}

/** عنوان مختصر لبند من قائمة */
export const itemTitle = (item: string) => cutTitle(item, 80);


// ═══════════════ classify ═══════════════
export type Status = "match" | "maybe" | "no";
export type Relevance = "core" | "adjacent" | "other_tech" | "none";

export interface Classification {
  isJob: boolean;
  status: Status;                      // match = اعرضها | maybe = راجعها/ابعتها للـ LLM | no = تجاهل
  category: Category;                  // التصنيف الأساسي (متوافق مع الكود القديم)
  categories: TargetCategory[];        // كل التصنيفات يلي status=match
  maybeCategories: TargetCategory[];   // تصنيفات محتملة
  relevance: Relevance;                // مدى قرب الوظيفة من Full Stack (إذا tech)
  techTags: TechTag[];
  scores: Record<TargetCategory, number>;
  matched: string[];                   // الكلمات يلي سببت التصنيف (للـ debugging)
  needsLLM: boolean;
  fields: JobFields;
  items?: { title: string; category: Category }[]; // إذا الإعلان فيه عدة وظائف
  fingerprint: string;
}

// ───────── ثوابت الضبط (غيّرها بعد ما تراقب النتائج) ─────────
const MATCH = 6;       // ≥ → status=match
const MAYBE = 3;       // ≥ → status=maybe
const TITLE_X = 2;     // مضاعف الكلمات بالعنوان
const BODY_X = 0.5;    // مضاعف الكلمات بباقي النص
const TITLE_CAP = 14;
const BODY_CAP = 5;    // النص لحاله ما بيوصل match، لازم دعم من العنوان
const BLOCKED_BODY = 0.3;

const CATS: TargetCategory[] = ["tech", "engineering", "video", "design"]; // ترتيب الأولوية عند التعادل
const CORE: TechTag[] = ["fullstack", "frontend", "backend", "web", "software"];
const ADJACENT: TechTag[] = ["mobile", "devops", "data", "qa", "security"];

const zero = () => ({ tech: 0, engineering: 0, video: 0, design: 0 }) as Record<TargetCategory, number>;
const prep = (s: string) => NEGATIVE_RES.reduce((t, re) => t.replace(re, " "), normalizeForMatch(s));

interface Segment {
  total: Record<TargetCategory, number>;
  tags: Partial<Record<TechTag, number>>;
  matched: string[];
}

function scoreSegment(titleRaw: string, bodyRaw: string): Segment {
  const t = prep(titleRaw);
  const b = prep(bodyRaw);
  const title = zero(), body = zero();
  const tags: Segment["tags"] = {};
  const matched: string[] = [];

  for (const r of COMPILED) {
    const inT = r.re.test(t);
    const inB = r.re.test(b);
    if (!inT && !inB) continue;
    if (inT) { title[r.cat] += r.w * TITLE_X; matched.push(`${r.cat}:${r.label}@title`); }
    else matched.push(`${r.cat}:${r.label}`);
    if (inB) body[r.cat] += r.w * BODY_X;
    if (r.tag) tags[r.tag] = (tags[r.tag] ?? 0) + (inT ? r.w * TITLE_X : r.w * BODY_X);
  }

  const titleMax = Math.max(...CATS.map((c) => Math.min(title[c], TITLE_CAP)));
  const blocked = BLOCKER_RES.some((re) => re.test(t)) && titleMax < MATCH;

  const total = zero();
  for (const c of CATS) {
    total[c] = Math.min(title[c], TITLE_CAP) + Math.min(body[c], BODY_CAP) * (blocked ? BLOCKED_BODY : 1);
  }
  return { total, tags, matched };
}

function hiringScore(norm: string) {
  const strong = HIRING_STRONG_RES.filter((re) => re.test(norm)).length;
  const weak = HIRING_WEAK_RES.filter((re) => re.test(norm)).length;
  return { strong, score: strong * 2 + weak };
}

const statusOf = (s: number): Status => (s >= MATCH ? "match" : s >= MAYBE ? "maybe" : "no");

export function classifyJob(input: string | { text: string; hasMedia?: boolean }): Classification {
  const { text, hasMedia = false } = typeof input === "string" ? { text: input } : input;

  const stripped = stripBoilerplate(text);
  const fields = extractFields(stripped);
  const plain = stripMarkup(stripped);
  const norm = normalizeForMatch(plain);

  // ── تقييم المقاطع (إعلان واحد أو عدة وظائف) ──
  const itemTexts = splitMultiJob(plain);
  let seg: Segment;
  let items: Classification["items"];

  if (itemTexts) {
    const segs = itemTexts.map((it) => ({ title: itemTitle(it), seg: scoreSegment(itemTitle(it), it) }));
    const total = zero();
    const tags: Segment["tags"] = {};
    for (const { seg: s } of segs) {
      for (const c of CATS) total[c] = Math.max(total[c], s.total[c]);
      for (const [k, v] of Object.entries(s.tags) as [TechTag, number][]) tags[k] = Math.max(tags[k] ?? 0, v);
    }
    seg = { total, tags, matched: segs.flatMap((s) => s.seg.matched) };
    items = segs.map(({ title, seg: s }) => ({ title, category: pickPrimary(s.total) }));
    fields.title = items.slice(0, 4).map((i) => i.title).join(" • ");
    fields.titleGuess = false;
  } else {
    seg = scoreSegment(fields.title, plain);
  }

  const { total } = seg;
  const categories = CATS.filter((c) => total[c] >= MATCH);
  const maybeCategories = CATS.filter((c) => total[c] >= MAYBE && total[c] < MATCH);
  const status: Status = categories.length ? "match" : maybeCategories.length ? "maybe" : "no";
  const category = pickPrimary(total);

  // ── هل هي وظيفة أصلاً؟ ──
  const hire = hiringScore(norm);
  const hasLink = /t\.me\/|https?:\/\/|@\w{4,}/.test(plain);
  const promo = hasLink && hire.strong === 0 && PROMO_RES.some((re) => re.test(norm));
  const topScore = Math.max(...CATS.map((c) => total[c]));
  const isJob = !promo && (hire.score >= 2 || (hire.score >= 1 && topScore >= MATCH));

  // ── صلة الوظيفة بـ Full Stack ──
  let techTags = (Object.entries(seg.tags) as [TechTag, number][])
    .filter(([, v]) => v >= 2).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  if (!techTags.length && total.tech >= MAYBE) {
    const best = (Object.entries(seg.tags) as [TechTag, number][]).sort((a, b) => b[1] - a[1])[0];
    if (best) techTags = [best[0]];
  }
  // "مطور / Developer" كلمة عامة: إذا في تاغ أدق (Flutter, DevOps...) بنخليه يتقدم عليها
  if (techTags.some((t) => t !== "software")) techTags = techTags.filter((t) => t !== "software");
  const relevance: Relevance =
    total.tech < MAYBE ? "none"
    : techTags.some((t) => CORE.includes(t)) ? "core"
    : techTags.some((t) => ADJACENT.includes(t)) ? "adjacent"
    : "other_tech";

  // ── متى نستعين بالـ LLM؟ ──
  const nonZero = CATS.filter((c) => total[c] >= MAYBE).sort((a, b) => total[b] - total[a]);
  const conflict = nonZero.length >= 2 && total[nonZero[0]] - total[nonZero[1]] < 4;
  const imageOnly = hasMedia && plain.length < 60;
  const needsLLM = imageOnly || (isJob && (status === "maybe" || conflict));

  return {
    isJob,
    status: isJob ? status : "no",
    category: isJob ? category : "other",
    categories: isJob ? categories : [],
    maybeCategories: isJob ? maybeCategories : [],
    relevance: isJob ? relevance : "none",
    techTags: isJob ? techTags : [],
    scores: Object.fromEntries(CATS.map((c) => [c, Math.round(total[c] * 10) / 10])) as Record<TargetCategory, number>,
    matched: [...new Set(seg.matched)].slice(0, 12),
    needsLLM,
    fields,
    items,
    fingerprint: fingerprint(text),
  };
}

function pickPrimary(total: Record<TargetCategory, number>): Category {
  let best: TargetCategory | null = null;
  for (const c of CATS) if (total[c] >= MAYBE && (best === null || total[c] > total[best])) best = c;
  return best ?? "other";
}

/** رجوع متوافق مع الدالة القديمة */
export const getJobCategory = (text: string): Category => classifyJob(text).category;
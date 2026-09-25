# CLAUDE.md — ملف التسليم لأي جلسة جديدة

> اقرأ هذا الملف أولاً في أي جلسة جديدة، من أي جهاز. فيه كل ما يلزم لإكمال العمل دون الرجوع إلى المحادثات السابقة.
> المالك: مشتاق كريم — مساعد رئيس الجامعة للشؤون الإدارية والقانونية، جامعة العميد، كربلاء. يتواصل بالعربية.

## الحالة الحالية (آخر تحديث: 2026-09-25)
- النظام **يعمل على الإنتاج**: https://mushtaqaelk.github.io/ameed-vehicles/
- قاعدة البيانات: Firebase، والمشروع `ameed-vehicles` على الخطة المجانية Spark. قاعدة Firestore هي `(default)` في `eur3`، وتسجيل الدخول بـ Email/Password.
- `firebaseConfig` موجود داخل `index.html`. مفتاح الويب ليس سرّاً، فالحماية بقواعد `firestore.rules`.
- النشر: GitHub Pages من الفرع `main` والمجلد `/ (root)`. أي دمج في `main` يُنشر تلقائياً خلال دقيقة أو دقيقتين.
- آخر طلبي دمج: [#1](https://github.com/mushtaqaelk/ameed-vehicles/pull/1) للبناء الأول، و[#2](https://github.com/mushtaqaelk/ameed-vehicles/pull/2) للنقاط السنوية وملف السائق ومدير القسم.

## بنية المشروع
| الملف | المحتوى |
|---|---|
| `index.html` | التطبيق كله: HTML + CSS + JS عادي (ES5)، دون أي بناء أو إطار عمل |
| `firestore.rules` | قواعد الأمان حسب الدور. **عند أي تعديل يجب أن ينشرها المستخدم يدوياً**، والطريقة في قسم "دليل النشر" أدناه |
| `sw.js`, `manifest.webmanifest` | التثبيت على الهاتف (PWA) والعمل دون إنترنت |
| `assets/logo-*.png` | شعار الجامعة، منقول من مستودع `ameed-room-booking` |
| `tests/smoke.test.js` | اختبار Playwright شامل على قاعدة البيانات التجريبية (83 فحصاً) |
| `docs/ameed-vehicles-brief.md` | الموجز الأصلي للمشروع (المتطلبات والأسئلة والأجوبة المقترحة) |
| `docs/ameed-system-project-context.md` | سياق نظام القاعات السابق ودروسه المستفادة |

### خريطة الكود داخل `index.html` (بالترتيب)
- `firebaseConfig` و`DEMO`، ويُفعَّل الوضع التجريبي بـ `?demo=1`، ثم الثوابت: `ROLES`، `REQ_TYPE`، `STATUS_LABEL`، `POINT_CAT`، `GARAGE='كراج العتبة'`.
- أدوات: `el()`، وتنسيق الأرقام الغربية (`fmtNum`، `fmtIQD`)، وتواريخ معزولة LTR (`fmtDate`/`fmtDT` تضيف علامات LRI/PDI، و`stripIsolates` تزيلها).
- `makeDemoFirebase()`: Firestore وAuth وهميان داخل المتصفح، للوضع التجريبي والاختبارات.
- الحالة `S` و`tabState`، والصلاحيات (`role`، `isFleet`، `isFinance`، `canManagePoints`، `tabsForRole`).
- `computeDerived()`: الرحلات، والحالة الآنية، والعداد، ومعدل الوقود، وطلبات التأخير المعتمدة. `driverScore(driverId, year)` يحسب النقاط السنوية.
- `formModal()`: بانٍ عام للنماذج، أنواع حقوله: text/number/date/select/textarea/file/checks/toggle/**stepper**، مع `ctx.show()` لإظهار الحقول الشرطية.
- التبويبات في `PANELS`، ولكل تبويب `build()` مرة واحدة و`refresh()` عند تغيّر البيانات: `home`، `gate`، `requests`، `vehicles`، `drivers`، `me` (السائق)، `finance`، `reports`، `admin`.
- التقارير: كل تقرير يُبنى كوصف بيانات (`*ReportSpec`)، ثم `renderReport()` يعرضه ويطبعه بـ `buildReportHead()`، و`exportReportExcel()` يصدّره.
- `buildDemoData()`: البيانات التجريبية، وكلها معلَّمة `demo:true`.

## الأدوار
`admin` مدير النظام · `fleet` مدير الآليات · `supervisor` مدير القسم (يضيف النقاط لسائقي قسمه فقط، والربط عبر `drivers.supervisorId`) · `gate` الاستعلامات (في مواقعه فقط) · `finance` المالية · `driver` سائق (يُربط بسجله عبر `users.driverId`) · `viewer` الإدارة العليا (عرض فقط).

## نموذج البيانات (Firestore)
`config/general` (المواقع والإعدادات) · `users/{uid}` · `vehicles` · `drivers` (فيها phone وaddress وphotoId وsupervisorId) · `movements` (خروج ودخول) · `requests` (أنواعها: fuel|maintenance|wash|delay|assist) · `driverPoints` (kind: manual|stars، وcategory: thanks|penalty|other، مع year وdelta) · `attachments` (صور مضغوطة نحو 150KB كنص base64) · `audit` (إضافة فقط).

## قواعد العمل المتفق عليها (التزم بها)
1. **ملف واحد** `index.html` دون أي خطوة بناء. طابِق أسلوب الكود القائم: `var` و`function` و`el()`.
2. الواجهة عربية بالكامل، من اليمين لليسار، بالأرقام الغربية 0–9 والدينار بفواصل الآلاف، ومصممة للهاتف أولاً.
3. الشعار في التقارير عنصر `<img>` حقيقي، وليس خلفية CSS (حتى يظهر عند الطباعة).
4. تعديل البيانات **إضافي فقط**. لا تحذف بيانات حقيقية دون طلب صريح، والبيانات التجريبية معلَّمة `demo:true`.
5. عند الغموض **اسأل المستخدم** بدل الافتراض.
6. قبل كل رفع شغّل:
   ```bash
   awk '/^<script>$/{f=1;next} /^<\/script>$/{f=0} f' index.html > /tmp/app.js && node --check /tmp/app.js
   node tests/smoke.test.js     # إن لم يتوفر cdnjs: XLSX_PATH=/path/to/xlsx.full.min.js (من npm pack xlsx@0.18.5)
   ```
   وحدّث الاختبار عند إضافة أي ميزة.
7. سير العمل: فرع ثم طلب دمج إلى `main`. المستخدم يطلب عادةً أن يدمج Claude الطلب بنفسه، **لكن اسأله أولاً**.
8. أسماء ملفات Excel المصدَّرة لاتينية، لأن بعض المتصفحات تتجاهل الأسماء العربية عند التنزيل.

## دليل النشر: قواعد الأمان
واجهة Firebase Console الجديدة تعيد المستخدم إلى الصفحة الرئيسية عند فتح روابط Firestore المباشرة. استخدم Google Cloud Console بدلاً منها:
https://console.cloud.google.com/firestore/databases/-default-/security/rules?project=ameed-vehicles
أرسل للمستخدم نص القواعد **دون التعليقات العربية** (`grep -v '^\s*//' firestore.rules`) ليلصقه ثم يضغط Publish.

## ما زال ينتظر المستخدم
- [ ] أسماء المواقع والبوابات الفعلية. الحالية مؤقتة: البوابة الرئيسية، والبوابة الخلفية، ومرآب الجامعة، وتُعدَّل من تبويب الإدارة.
- [ ] ملف Excel بالعجلات والسائقين الحقيقيين، للاستيراد من **الإدارة ← استيراد**.
- [ ] حذف البيانات التجريبية من الإنتاج بعد عرض النظام، إن أُضيفت (زر في تبويب الإدارة).

## أفكار مؤجلة (لم تُطلب بعد)
- إشعارات واتساب أو تلغرام (خارج المرحلة الأولى حسب الموجز).
- الربط بنظام VMD الحالي (WPF + Supabase).
- إعادة تعيين كلمة مرور الموظف من داخل النظام؛ تتم حالياً من Firebase Console.

## سجل المراحل
- **المرحلة 1** ([#1](https://github.com/mushtaqaelk/ameed-vehicles/pull/1)): النظام الكامل (الأدوار، والجدول الآني، والحركة، والوقود والصيانة والغسل مع دورة الموافقة، والتقارير، وExcel، وPWA) مع الربط بـ Firebase.
- **المرحلة 2** ([#2](https://github.com/mushtaqaelk/ameed-vehicles/pull/2)): إلغاء التأمين؛ الورشة ومكان الغسل صارا كراج العتبة أو خارجي؛ النقاط سنوية تبدأ من صفر وتُدار يدوياً (شكر أو عقوبة بعدّاد)؛ ملف السائق مع تقرير كل السنوات؛ دور مدير القسم؛ تبويب "ملفي" للسائق مع طلب التأخير وطلب المساعدة.

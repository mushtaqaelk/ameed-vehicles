/*
 * اختبار شامل لنظام متابعة العجلات بمتصفح Chromium (Playwright) على قاعدة
 * البيانات التجريبية المدمجة (Firestore وهمي داخل المتصفح)، دون لمس أي قاعدة حقيقية.
 *
 * التشغيل:  node tests/smoke.test.js
 * اللقطات تُحفظ في tests/screenshots/
 */
'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');
let playwright;
try { playwright = require('playwright'); } catch (e) { playwright = require('/opt/node22/lib/node_modules/playwright'); }

const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(__dirname, 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

let failures = 0, passes = 0;
function check(cond, msg) {
  if (cond) { passes++; console.log('  ✓ ' + msg); }
  else { failures++; console.log('  ✗ ' + msg); }
}

async function login(page, username) {
  if (await page.locator('#logoutBtn').isVisible()) {
    await page.click('#logoutBtn');
  }
  await page.waitForSelector(`[data-demo-user="${username}"]`);
  await page.click(`[data-demo-user="${username}"]`);
  await page.waitForSelector('#tabs:not([hidden])');
  await page.waitForTimeout(150);
}
async function tabNames(page) {
  return page.$$eval('#tabs .tab', (els) => els.map((e) => e.dataset.tab));
}
async function goTab(page, t) {
  await page.click(`#tabs .tab[data-tab="${t}"]`);
  await page.waitForSelector(`#panel-${t}`);
  await page.waitForTimeout(100);
}
async function fillModal(page, values) {
  for (const [name, val] of Object.entries(values)) {
    const sel = `.modal [name="${name}"]`;
    const tag = await page.$eval(sel, (e) => e.tagName);
    if (tag === 'SELECT') await page.selectOption(sel, val);
    else await page.fill(sel, String(val));
  }
}
async function submitModal(page) {
  await page.click('.modal button[type=submit]');
  await page.waitForTimeout(250);
}

(async () => {
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await playwright.chromium.launch({ executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? undefined : undefined });
  const errors = [];

  // ---------- هاتف (375px): تدفق كامل عبر الأدوار ----------
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, locale: 'ar-IQ', timezoneId: 'Asia/Baghdad' });
  // لا حاجة لمكتبات Firebase في الوضع التجريبي
  await ctx.route(/gstatic\.com\/firebasejs/, (r) => r.abort());
  // إن لم يتوفر الوصول إلى cdnjs: XLSX_PATH=/path/to/xlsx.full.min.js (من حزمة npm xlsx@0.18.5)
  if (process.env.XLSX_PATH) await ctx.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/xlsx/, (r) => r.fulfill({ path: process.env.XLSX_PATH, contentType: 'text/javascript' }));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push(m.text()); });
  page.on('dialog', (d) => d.accept());

  console.log('\n[1] شاشة الدخول والوضع التجريبي');
  await page.goto(base);
  await page.waitForSelector('[data-demo-user="admin"]');
  check(await page.isVisible('#demoBanner'), 'شريط الوضع التجريبي ظاهر');
  check(await page.$eval('html', (h) => h.dir) === 'rtl', 'الاتجاه من اليمين لليسار');
  await page.screenshot({ path: path.join(SHOTS, '01-login-mobile.png'), fullPage: true });

  console.log('\n[2] التبويبات حسب الدور');
  const expected = {
    admin: ['home', 'gate', 'requests', 'vehicles', 'drivers', 'finance', 'reports', 'admin'],
    fleet: ['home', 'gate', 'requests', 'vehicles', 'drivers', 'reports'],
    gate: ['home', 'gate'],
    finance: ['home', 'requests', 'finance', 'reports'],
    driver: ['home', 'requests'],
    viewer: ['home', 'vehicles', 'drivers', 'finance', 'reports'],
  };
  for (const [role, tabs] of Object.entries(expected)) {
    await login(page, role);
    const got = await tabNames(page);
    check(JSON.stringify(got) === JSON.stringify(tabs), `${role}: ${got.join(',')}`);
    await page.screenshot({ path: path.join(SHOTS, `02-home-${role}-mobile.png`), fullPage: true });
  }

  console.log('\n[3] الجدول الآني والتنبيهات (مدير النظام)');
  await login(page, 'admin');
  const cards = await page.$$eval('#panel-home .v-card', (e) => e.length);
  check(cards === 8, `الجدول الآني يعرض 8 عجلات (${cards})`);
  const outCount = await page.$$eval('#panel-home .v-card[data-status="out"], #panel-home .v-card[data-status="late"]', (e) => e.length);
  check(outCount >= 2, `عجلات خارج الجامعة: ${outCount}`);
  const lateCount = await page.$$eval('#panel-home .v-card[data-status="late"]', (e) => e.length);
  check(lateCount >= 1, `عجلة متأخرة واحدة على الأقل: ${lateCount}`);
  const alertText = await page.$eval('#panel-home', (e) => e.textContent);
  check(/السنوية/.test(alertText), 'تنبيه انتهاء السنوية');
  check(/تبديل الدهن/.test(alertText), 'تنبيه تبديل الدهن');
  check(/خارج الجامعة منذ/.test(alertText), 'تنبيه تأخر الإرجاع');
  check(!/[٠-٩]/.test(alertText), 'لا أرقام هندية (٠-٩) في الواجهة');

  console.log('\n[4] الاستعلامات: تسجيل خروج ودخول في موقعه فقط');
  await login(page, 'gate');
  await goTab(page, 'gate');
  await page.click('#gateOutBtn');
  const locOptions = await page.$$eval('.modal [name="locationId"] option', (o) => o.map((x) => x.value));
  check(JSON.stringify(locOptions) === '["gate-main"]', `موظف الاستعلامات يرى موقعه فقط: ${locOptions}`);
  // عجلة داخل الجامعة: الهايلوكس (demo-veh-1)
  const inVehicle = await page.evaluate(() => {
    const d = window.__ameedVehicles.derived();
    return Object.keys(d.live).find((k) => d.live[k].where === 'in' && d.live[k].vehicle.status === 'active');
  });
  await page.selectOption('.modal [name="vehicleId"]', inVehicle);
  await page.waitForTimeout(50);
  const drv = await page.inputValue('.modal [name="driver"]');
  check(drv.length > 0, `السائق الافتراضي يُملأ تلقائياً: ${drv}`);
  await page.fill('.modal [name="driver"]', 'سائق من خارج القائمة');
  await page.fill('.modal [name="purpose"]', 'اختبار — مهمة رسمية');
  await page.fill('.modal [name="odometer"]', '999999');
  await submitModal(page);
  let live = await page.evaluate((v) => window.__ameedVehicles.derived().live[v].where, inVehicle);
  check(live === 'out', 'العجلة أصبحت خارج الجامعة');
  const mv = await page.evaluate((v) => window.__ameedVehicles.S.movements.filter((m) => m.vehicleId === v).sort((a, b) => b.at.localeCompare(a.at))[0], inVehicle);
  check(mv.driverName === 'سائق من خارج القائمة' && !mv.driverId && mv.by === 'u_gate', 'سائق خارج القائمة + اسم المسجِّل محفوظ');
  await goTab(page, 'home');
  await page.click(`#panel-home [data-move="${inVehicle}"]`);
  await page.waitForSelector('.modal');
  check((await page.inputValue('.modal [name="direction"]')) === 'in', 'الاتجاه المقترح: دخول');
  await submitModal(page);
  live = await page.evaluate((v) => window.__ameedVehicles.derived().live[v].where, inVehicle);
  check(live === 'in', 'سُجّل الدخول من بطاقة العجلة');
  await goTab(page, 'gate');
  await page.screenshot({ path: path.join(SHOTS, '03-gate-mobile.png'), fullPage: true });

  console.log('\n[5] السائق: طلب وقود مع صورة وصل');
  await login(page, 'driver');
  await page.click('[data-new-request="fuel"]');
  await page.waitForSelector('.modal');
  const pre = await page.inputValue('.modal [name="vehicleId"]');
  check(!!pre, 'العجلة المخصصة للسائق مختارة تلقائياً');
  const lastOdo = await page.evaluate((v) => window.__ameedVehicles.derived().odo[v], pre);
  await fillModal(page, { liters: 40, amount: 26000, odometer: lastOdo + 250000, station: 'محطة الاختبار' });
  await submitModal(page);
  check(/3,000/.test(await page.textContent('.modal')), 'تحذير عند قراءة عداد غير منطقية');
  await fillModal(page, { odometer: lastOdo + 320 });
  // صورة وصل صغيرة (PNG 1x1)
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await page.setInputFiles('.modal [name="receipt"]', { name: 'r.png', mimeType: 'image/png', buffer: png });
  await submitModal(page);
  await page.waitForTimeout(300);
  const myReq = await page.evaluate(() => window.__ameedVehicles.S.requests.find((r) => r.station === 'محطة الاختبار'));
  check(myReq && myReq.status === 'new' && myReq.driverId === 'demo-drv-0', 'طلب الوقود أُنشئ بحالة "جديد" باسم السائق');
  check(myReq && !!myReq.receiptId, 'صورة الوصل محفوظة كمرفق');
  await page.click('[data-new-request="maintenance"]');
  await fillModal(page, { description: 'اختبار صيانة — صوت في المكابح', estCost: 100000 });
  await submitModal(page);
  await page.screenshot({ path: path.join(SHOTS, '04-driver-home-mobile.png'), fullPage: true });

  console.log('\n[6] مدير الآليات: الموافقة ودورة الصيانة');
  await login(page, 'fleet');
  await goTab(page, 'requests');
  await page.click(`[data-request="${myReq.id}"] [data-action="approve"]`);
  await page.waitForTimeout(200);
  let st = await page.evaluate((id) => window.__ameedVehicles.S.requests.find((r) => r.id === id).status, myReq.id);
  check(st === 'awaiting_finance', 'طلب الوقود أُحيل إلى المالية');
  const mReq = await page.evaluate(() => window.__ameedVehicles.S.requests.find((r) => r.description === 'اختبار صيانة — صوت في المكابح'));
  await page.click(`[data-request="${mReq.id}"] [data-action="approve"]`);
  await page.waitForTimeout(200);
  await page.click(`[data-request="${mReq.id}"] [data-action="start"]`);
  await page.waitForTimeout(250);
  let vst = await page.evaluate((v) => window.__ameedVehicles.S.vehicles.find((x) => x.id === v).status, mReq.vehicleId);
  check(vst === 'maintenance', 'العجلة تحولت تلقائياً إلى "في الصيانة"');
  await page.click(`[data-request="${mReq.id}"] [data-action="finish"]`);
  await fillModal(page, { actualCost: 90000 });
  await submitModal(page);
  st = await page.evaluate((id) => window.__ameedVehicles.S.requests.find((r) => r.id === id).status, mReq.id);
  vst = await page.evaluate((v) => window.__ameedVehicles.S.vehicles.find((x) => x.id === v).status, mReq.vehicleId);
  check(st === 'awaiting_finance' && vst === 'active', 'الصيانة انتهت: بانتظار المالية والعجلة عادت فعّالة');
  // رفض طلب مع سبب
  const washNew = await page.evaluate(() => window.__ameedVehicles.S.requests.find((r) => r.type === 'wash' && r.status === 'new'));
  await page.click(`[data-request="${washNew.id}"] [data-action="reject"]`);
  await page.fill('.modal [name="reason"]', 'اختبار الرفض');
  await submitModal(page);
  st = await page.evaluate((id) => window.__ameedVehicles.S.requests.find((r) => r.id === id), washNew.id);
  check(st.status === 'rejected' && st.rejectReason === 'اختبار الرفض', 'الرفض مع السبب');
  await page.screenshot({ path: path.join(SHOTS, '05-requests-fleet-mobile.png'), fullPage: true });

  console.log('\n[7] مدير الآليات: النقاط والتقييم');
  await goTab(page, 'drivers');
  const before = await page.evaluate(() => window.__ameedVehicles.S.points.length);
  await page.click('[data-points="demo-drv-0"]');
  await fillModal(page, { delta: -7, reason: 'اختبار خصم يدوي' });
  await submitModal(page);
  await page.click('[data-stars="demo-drv-0"]');
  await fillModal(page, { stars: '2' });
  await submitModal(page);
  const after = await page.evaluate(() => window.__ameedVehicles.S.points.length);
  check(after === before + 2, 'حُفظ الخصم اليدوي والتقييم بالنجوم');
  const ranks = await page.$$eval('[data-driver-rank]', (e) => e.length);
  check(ranks === 6, `لوحة ترتيب السائقين: ${ranks}`);
  await page.screenshot({ path: path.join(SHOTS, '06-drivers-mobile.png'), fullPage: true });

  console.log('\n[8] المالية: التأييد');
  await login(page, 'finance');
  await goTab(page, 'requests');
  await page.click(`[data-request="${myReq.id}"] [data-action="finance-approve"]`);
  await page.click('.modal .btn-primary');
  await page.waitForTimeout(250);
  const fin = await page.evaluate((id) => window.__ameedVehicles.S.requests.find((r) => r.id === id), myReq.id);
  check(fin.status === 'done' && fin.financeApprovedAmount === 26000, 'طلب الوقود منجز بعد تأييد المالية');
  const hasFleetBtn = await page.$(`[data-request] [data-action="approve"]`);
  check(!hasFleetBtn, 'المالية لا ترى أزرار موافقة مدير الآليات');
  await goTab(page, 'finance');
  await page.waitForSelector('#printableReport');
  await page.screenshot({ path: path.join(SHOTS, '07-finance-mobile.png'), fullPage: true });

  console.log('\n[9] المشاهد: عرض فقط');
  await login(page, 'viewer');
  await goTab(page, 'vehicles');
  check(!(await page.$('#addVehicleBtn')) && !(await page.$('[data-edit-vehicle]')), 'لا أزرار إضافة أو تعديل للمشاهد');
  check(!(await page.$('[data-move]')), 'لا تسجيل حركة للمشاهد');

  console.log('\n[10] مدير النظام: المستخدمون والمواقع والإعدادات');
  await login(page, 'admin');
  await goTab(page, 'admin');
  await page.click('#addLocationBtn');
  await fillModal(page, { name: 'بوابة كلية الطب' });
  await submitModal(page);
  const locs = await page.evaluate(() => window.__ameedVehicles.S.config.locations.map((l) => l.name));
  check(locs.includes('بوابة كلية الطب'), 'أُضيف موقع جديد');
  await page.click('#addUserBtn');
  await fillModal(page, { name: 'موظف اختبار', username: 'test.gate', password: 'secret123', role: 'gate' });
  await page.click('.modal .checks label:first-child input');
  await submitModal(page);
  await page.waitForTimeout(200);
  const nu = await page.evaluate(() => window.__ameedVehicles.S.users.find((u) => u.username === 'test.gate'));
  check(nu && nu.role === 'gate' && nu.locations.length === 1, 'أُنشئ حساب استعلامات جديد بموقع');
  await page.click('#editSettingsBtn');
  await fillModal(page, { overdueHours: 10 });
  await submitModal(page);
  const oh = await page.evaluate(() => window.__ameedVehicles.S.config.settings.overdueHours);
  check(oh === 10, 'حُفظ إعداد مدة التنبيه');
  const auditN = await page.evaluate(() => window.__ameedVehicles.S.audit.length);
  check(auditN >= 8, `سجل التدقيق يحوي العمليات (${auditN})`);
  await page.screenshot({ path: path.join(SHOTS, '08-admin-mobile.png'), fullPage: true });
  // الدخول بالحساب الجديد
  await page.click('#logoutBtn');
  await page.fill('#loginUser', 'test.gate');
  await page.fill('#loginPass', 'secret123');
  await page.click('.login-wrap button[type=submit]');
  await page.waitForSelector('#tabs:not([hidden])');
  check(JSON.stringify(await tabNames(page)) === '["home","gate"]', 'الحساب الجديد يدخل بدور الاستعلامات');
  await page.click('#logoutBtn');
  await page.fill('#loginUser', 'test.gate');
  await page.fill('#loginPass', 'wrong-pass');
  await page.click('.login-wrap button[type=submit]');
  await page.waitForTimeout(200);
  check(/غير صحيحة/.test(await page.textContent('.login-wrap')), 'رسالة خطأ لكلمة مرور خاطئة');

  console.log('\n[11] التقارير + الطباعة');
  await login(page, 'admin');
  await goTab(page, 'reports');
  const reports = ['vehicle', 'driver', 'finance', 'requests', 'movements'];
  for (const r of reports) {
    await page.click(`[data-report="${r}"]`);
    if (r === 'vehicle') await page.selectOption('#repVehicle', 'demo-veh-0');
    if (r === 'driver') await page.selectOption('#repDriver', 'demo-drv-0');
    if (r !== 'finance') await page.fill('#repFrom', '2020-01-01');
    await page.click('#runReportBtn');
    await page.waitForSelector('#printableReport');
    const txt = await page.textContent('#printableReport');
    const rows = await page.$$eval('#printableReport tbody tr', (e) => e.length);
    check(rows > 0 && /جامعة العميد/.test(txt), `تقرير ${r}: ${rows} صف`);
  }
  await page.click('[data-report="vehicle"]');
  await page.selectOption('#repVehicle', 'demo-veh-0');
  await page.fill('#repFrom', '2020-01-01');
  await page.click('#runReportBtn');
  await page.waitForSelector('#printableReport');
  const logoOk = await page.$eval('#printableReport img.report-logo-light', (i) => i.complete && i.naturalWidth > 0);
  check(logoOk, 'شعار التقرير عنصر <img> محمّل فعلاً');
  await page.setViewportSize({ width: 1123, height: 794 });
  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(200);
  const logoVisible = await page.$eval('#printableReport img.report-logo-light', (i) => getComputedStyle(i).display !== 'none' && getComputedStyle(i).visibility === 'visible');
  check(logoVisible, 'الشعار ظاهر في وضع الطباعة');
  const tabsHidden = await page.$eval('#tabs', (t) => getComputedStyle(t).visibility === 'hidden');
  check(tabsHidden, 'عناصر الواجهة مخفية في الطباعة');
  await page.screenshot({ path: path.join(SHOTS, '09-report-vehicle-print.png'), fullPage: true });
  await page.emulateMedia({ media: 'screen' });
  await page.setViewportSize({ width: 375, height: 812 });

  // تصدير Excel (إن حُمّلت المكتبة من CDN)
  const hasXlsx = await page.evaluate(() => !!window.XLSX);
  if (hasXlsx) {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#excelReportBtn')]);
    check(/\.xlsx$/.test(dl.suggestedFilename()), 'تصدير Excel: ' + dl.suggestedFilename());
  } else {
    console.log('  - تُجوِّز اختبار Excel: مكتبة SheetJS لم تُحمَّل (لا اتصال بالـ CDN)');
  }

  console.log('\n[12] العجلات: إضافة وتفاصيل');
  await goTab(page, 'vehicles');
  await page.click('#addVehicleBtn');
  await fillModal(page, { plate: '99999 ز', make: 'تويوتا', model: 'كامري', year: 2023, odometer: 1200, fuelType: 'petrol' });
  await submitModal(page);
  const nv = await page.evaluate(() => window.__ameedVehicles.S.vehicles.find((v) => v.plate === '99999 ز'));
  check(!!nv, 'أُضيفت عجلة جديدة');
  await page.click('#addVehicleBtn');
  await fillModal(page, { plate: '99999 ز', make: 'تويوتا' });
  await submitModal(page);
  check(/مسجّل مسبقاً/.test(await page.textContent('.modal')), 'منع تكرار رقم اللوحة');
  await page.click('.modal-head button');
  await page.click(`[data-vehicle="demo-veh-0"] .btn`);
  await page.waitForSelector('.modal .kv');
  await page.screenshot({ path: path.join(SHOTS, '10-vehicle-details-mobile.png'), fullPage: true });
  await page.click('.modal-head button');

  console.log('\n[13] حذف البيانات التجريبية');
  await goTab(page, 'admin');
  await page.click('#deleteDemoBtn');
  await page.click('.modal .btn-danger');
  await page.waitForTimeout(400);
  const left = await page.evaluate(() => ({ v: window.__ameedVehicles.S.vehicles.map((v) => v.plate), demoReq: window.__ameedVehicles.S.requests.filter((r) => r.demo).length }));
  check(left.v.length === 1 && left.v[0] === '99999 ز' && left.demoReq === 0, 'حُذفت التجريبية فقط وبقيت العجلة الحقيقية');

  console.log('\n[13ب] استيراد العجلات والسائقين من Excel');
  if (hasXlsx) {
    const [tpl] = await Promise.all([page.waitForEvent('download'), page.click('#importTemplateBtn')]);
    const tplPath = path.join(SHOTS, 'import-template.xlsx');
    await tpl.saveAs(tplPath);
    await page.setInputFiles('#importFile', tplPath);
    await page.waitForSelector('#commitImportBtn');
    await page.screenshot({ path: path.join(SHOTS, '12-import-preview-mobile.png'), fullPage: true });
    await page.click('#commitImportBtn');
    await page.waitForTimeout(400);
    const imp = await page.evaluate(() => {
      const S = window.__ameedVehicles.S;
      const v = S.vehicles.find((x) => x.plate === '45821 ب');
      const d = S.drivers.find((x) => x.name === 'علي حسين');
      return { v: !!v, d: !!d, link: v && d && v.defaultDriverId === d.id, fuel: v && v.fuelType, exp: v && v.registrationExpiry };
    });
    check(imp.v && imp.d && imp.link, 'استُورد السائق والعجلة وربط السائق الافتراضي');
    check(imp.fuel === 'diesel' && imp.exp === '2027-03-01', 'نوع الوقود والتاريخ صحيحان: ' + imp.fuel + ' ' + imp.exp);
    fs.unlinkSync(tplPath);
  } else {
    console.log('  - تُجوِّز: مكتبة SheetJS غير متاحة');
  }

  // ---------- سطح المكتب: لقطات بالوضع الداكن ----------
  console.log('\n[14] سطح المكتب + الوضع الداكن');
  const dctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark' });
  await dctx.route(/gstatic\.com\/firebasejs/, (r) => r.abort());
  const dp = await dctx.newPage();
  dp.on('pageerror', (e) => errors.push(e.message));
  await dp.goto(base);
  await login(dp, 'admin');
  await dp.screenshot({ path: path.join(SHOTS, '11-home-admin-desktop-dark.png'), fullPage: true });
  const bg = await dp.$eval('body', (b) => getComputedStyle(b).backgroundColor);
  check(bg === 'rgb(16, 22, 20)', 'الوضع الداكن مطبّق: ' + bg);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  check(overflow, 'لا تمرير أفقي على عرض 375px');

  console.log('\n[15] أخطاء JavaScript');
  check(errors.length === 0, 'لا أخطاء في الصفحة' + (errors.length ? ': ' + errors.join(' | ') : ''));

  await browser.close();
  srv.close();
  console.log(`\nالنتيجة: ${passes} نجح، ${failures} فشل`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

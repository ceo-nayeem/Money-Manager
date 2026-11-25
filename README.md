# FinVault

> **ডিজাইন:** ৪টা থিম প্যালেট (Volt লাইম · Cobalt নীল · Ember কমলা · Violet বেগুনি), প্রতিটা ডার্ক ও লাইট — ওপরে-ডানের চাঁদ/সূর্য আইকন থেকে বদলানো যায়। সার্চ খুলতে **Ctrl/Cmd + K** বা **/** চাপুন। রঙ বদলাতে `style.css` → `SECTION 01 · THEMES`।

প্রাইভেট মানি-ম্যানেজার ওয়েব অ্যাপ — Google লগইন (সেভ থাকে), Firebase সিঙ্ক, চার্ট, বাজেট, গোল, অফলাইন, PWA ইনস্টল।
কোনো বিল্ড-টুল লাগে না: ফাইল আপলোড করলেই চলে।

---

## ফাইল স্ট্রাকচার

```
finvault/
├── index.html              ← পেজের কাঠামো (সাইডবার, টপবার, ৯টা পেজ, মোডাল)
├── style.css               ← সব ডিজাইন (১৪টা সেকশন)
├── app.js                  ← সব লজিক (২১টা সেকশন)
│
├── manifest.webmanifest    ← অ্যাপের নাম/রঙ/আইকন (PWA)
├── sw.js                   ← অফলাইন সাপোর্ট (সার্ভিস ওয়ার্কার)
├── icons/                  ← অ্যাপ আইকন
├── services/               ← আপনার আগের services/ ফোল্ডার (index.js) এখানে রাখুন
├── firebase.json           ← Firebase Hosting সেটিং (ঐচ্ছিক)
├── tools/make_icons.py     ← আইকন নতুন করে বানানোর স্ক্রিপ্ট (ঐচ্ছিক)
├── .gitignore
└── README.md
```

**মূল ৩টা ফাইল:** কিছু বদলাতে হলে প্রায় সবসময় এই তিনটার একটা (বা দুটো) বদলায় — বাকিগুলো সাধারণত ছোঁয়াই লাগে না।

| বদলাতে চান | কোন ফাইল |
|---|---|
| রঙ, ফন্ট, চেহারা, স্পেসিং, মোবাইল লেআউট | `style.css` |
| ফিচারের আচরণ, হিসাব, লগইন, ডেটা সেভ, চার্ট | `app.js` |
| নতুন বাটন/ফিল্ড/পেজ/মোডাল বসানো, লেখা বদলানো | `index.html` (সাথে দরকার হলে `style.css` / `app.js`) |
| Firebase কী | `app.js` → `SECTION 01 · CONFIG` |
| অ্যাপের নাম/আইকন | `index.html` + `manifest.webmanifest` + `icons/` |

---

## ফাইলের ভেতরে কোনটা কোথায় (সার্চ করুন: `SECTION`)

প্রতিটা বড় ফাইলে সেকশনের শিরোনাম আছে। যেমন `style.css`-এ **“SECTION 06 · DASHBOARD”** সার্চ করলেই ড্যাশবোর্ডের ডিজাইন পাবেন।
`index.html`-এ পেজ/মোডাল খুঁজতে সার্চ করুন `PAGE:` বা `MODAL:` (যেমন `PAGE: budgets`)।

### style.css

| # | সেকশন | কী আছে |
|---|---|---|
| 01 | THEMES | Colour palettes: dark/light × volt (lime), cobalt (blue), ember (orange), violet. Edit colours here. |
| 02 | BASE | Fonts, radius/shadow/spacing variables, reset, page background (glow + dot grid). |
| 03 | LAYOUT | App shell, floating sidebar, top bar (search, New, profile), dropdown menus. |
| 04 | COMPONENTS | Buttons, chips, segmented tabs, cards, progress bars, form fields, toast. |
| 05 | LOGIN & LOADING | Login screen and the loading splash. |
| 06 | DASHBOARD | Dashboard: quick actions, notched stat cards, charts, activity table, accounts, debts, budgets, goals. |
| 07 | TRANSACTIONS | Transactions page. |
| 08 | ACCOUNTS | Accounts page and payment cards. |
| 09 | BUDGETS · GOALS · INVESTMENTS · REPORTS | Budgets, goals, investments and reports pages. |
| 10 | DATA & BACKUP · PROFILE | Data & backup page and profile page. |
| 11 | MODALS & PICKERS | Modals, date picker, time picker. |
| 12 | MOBILE TAB BAR | Floating pill navigation on phones. |
| 13 | RESPONSIVE | Tablet/phone breakpoints (mobile hero card, bottom sheets). Keep this AFTER the page sections. |
| 14 | INSTALL APP | “Install app” card/modal and session-restore helper. |

### app.js

| # | সেকশন | কী আছে |
|---|---|---|
| 01 | CONFIG | Firebase keys, owner email, App Check key — edit when the Firebase project changes. |
| 02 | STORAGE | Local save/load, default data, chart colour helpers. |
| 03 | BACKUP | Export / import / restore / per-section reset (Data & Backup page). |
| 04 | STATE | Categories, the DATA object, formatters, transaction helpers. |
| 05 | UI | Toast, modals, global search, date & time pickers. |
| 06 | TRANSACTION FORM | Add/edit transaction form, save, delete. |
| 07 | FORMS | Pay-off modal; budget / goal / investment save & delete. |
| 08 | PROFILE PAGE | Avatar, personal details, delete account. |
| 09 | NAVIGATION | switchPage, sidebar, header menus. |
| 10 | THEME | Light/dark mode and palette switching. |
| 11 | DASHBOARD | Stats, charts, KPI tiles, dashboard widgets. |
| 12 | TRANSACTIONS PAGE | List, filters, drag-and-drop ordering. |
| 13 | BUDGETS · GOALS · INVESTMENTS · REPORTS | The four planning pages. |
| 14 | ACCOUNTS | Payment cards, account tabs, transfers, renderAll(). |
| 15 | LOGIN & SESSION | Google sign-in, saved (persistent) session, onboarding, user data load. |
| 16 | CATEGORY MANAGER | Add / edit / reorder categories. |
| 17 | FIREBASE & CLOUD SAVE | Firebase bootstrap, Firestore, cloud save. |
| 18 | INSTALL APP (PWA) | Service-worker registration and the “Install app” feature. |
| 19 | APP CONFIG | Global branding/config loaded from Firestore. |
| 20 | GROUP TRANSACTIONS | Split items inside one transaction. |
| 21 | BOOT | Runs last: restores the saved login (auto-login). Keep at the very end. |

> সেকশনের ক্রম বদলাবেন না: `style.css`-এ পরের সেকশন আগেরটাকে ওভাররাইড করতে পারে, আর `app.js`-এর শেষ সেকশন (BOOT) সবার শেষে থাকতে হবে।

---

## Claude দিয়ে আপডেট করার সহজ নিয়ম

1. **কী বদলাবেন সেটা বলুন, আর শুধু সংশ্লিষ্ট ফাইল দিন।** শুধু রঙ/ডিজাইন → `style.css`; ফিচার/লজিক → `app.js`; কাঠামো → `index.html`।
2. **ফাইল বড় (`app.js` ≈ ২০০ KB)।** তাই বলতে পারেন: “শুধু `SECTION 10 · DASHBOARD` বদলাও, বাকি যেমন আছে তেমন রাখো” — Claude শুধু ওই অংশ ঠিক করে দেবে।
3. **Claude আপডেটেড ফাইল দিলে** সেটা একই নামে পুরনোটার জায়গায় বসান।
4. **নতুন ফাইল যোগ করলে** (যেমন নতুন ছবি/ফাইল যেটা অফলাইনে লাগবে): `sw.js`-এর `SHELL` তালিকায় নাম যোগ করুন আর `VERSION` এক বাড়ান (`fv-v4` → `fv-v5`)। শুধু আগের ফাইল বদলালে এটা লাগে না।

---

## GitHub-এ আপডেট

**ব্রাউজার দিয়ে (সবচেয়ে সহজ):** রিপোজিটরি → **Add file → Upload files** → যে ফাইলগুলো বদলেছে শুধু সেগুলো ড্র্যাগ করুন (একই নাম হলে আপনা-আপনি পুরনোটা বদলে যায়) → **Commit changes**।

**টার্মিনাল দিয়ে:**
```bash
git add .
git commit -m "ড্যাশবোর্ডের রঙ বদলালাম"
git push
```
প্রথমবার: `git init` → `git add .` → `git commit -m "first version"` → `git branch -M main` → `git remote add origin <রিপোর লিংক>` → `git push -u origin main`।

> ⚠️ `app.js`-এর শুরুতে Firebase ওয়েব কী আছে (এগুলো পাবলিক আইডেন্টিফায়ার; আসল সুরক্ষা Firestore Rules থেকে আসে)। তবু রিপোজিটরি **Private** রাখা নিরাপদ।

---

## লাইভ করা (হোস্টিং)

- **GitHub Pages:** রিপো → Settings → Pages → Branch `main` / root।
- **Firebase Hosting:** `firebase deploy` (`firebase.json` দেওয়া আছে)।
- **Netlify / Vercel:** রিপো কানেক্ট করুন, কোনো বিল্ড কমান্ড লাগবে না।

সাইট **https://** হতে হবে, আর সেই ডোমেইন Firebase Console → Authentication → Settings → **Authorized domains**-এ যোগ করতে হবে (লগইনের জন্য)।

নিজের কম্পিউটারে দেখতে: `python -m http.server 8080` চালিয়ে `http://localhost:8080` খুলুন (`index.html` ডবল-ক্লিক করলে লগইন/PWA চলবে না)।

---

## লগইন সেভ থাকা ও অ্যাপ ইনস্টল

- একবার লগইন করলে সেভ থাকে — ব্রাউজার বন্ধ করে খুললেও। লগআউট হয় শুধু প্রোফাইল মেনুর **Logout** দিলে, বা ব্রাউজারের কুকি/সাইট ডেটা মুছলে। ইনকগনিটোতে সেভ থাকে না।
- iPhone Safari ৭ দিন সাইট না খুললে ডেটা মুছতে পারে — Home Screen-এ ইনস্টল করলে এই সীমা থাকে না।
- ইনস্টল: সাইডবারের নিচের কার্ড / প্রোফাইল মেনু → **Install app** / Profile পেজ → **App & offline**।
- অফলাইনে অ্যাপ খোলে; নেট ফিরলে সিঙ্ক হয়।

---

## সমস্যা হলে

| সমস্যা | করণীয় |
|---|---|
| বদলেছি কিন্তু সাইটে দেখা যাচ্ছে না | রিলোড দিন (Ctrl/Cmd + Shift + R)। হোস্টিং ডিপ্লয় শেষ হয়েছে কিনা দেখুন। |
| সাদা/ফাঁকা পেজ | F12 → Console দেখুন। সাধারণত কোনো ফাইলে বন্ধনী (`}`) বাদ পড়েছে বা ফাইল পুরোটা আপলোড হয়নি। |
| “Install app” আসছে না | সাইট https-এ আছে কিনা, `manifest.webmanifest` ও `icons/` আপলোড হয়েছে কিনা দেখুন। |
| লগইন ব্যর্থ | ডোমেইনটা Authorized domains-এ আছে কিনা দেখুন। |

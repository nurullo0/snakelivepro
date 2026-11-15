# Snake LIVE PRO: o‘zbekcha qo‘llanma

Bu YouTube JONLI efirlari uchun o‘zi o‘ynaydigan Snake o‘yini (vertikal 9:16). Tomoshabinlar yuborgan sovg‘a, Super Chat, Super Sticker va like o‘yinga real vaqtda ta’sir qiladi.

Tizim shunday ishlaydi:

```
Telefondagi o‘yin  <->  Server (backend)  <->  YouTube
```

- YouTube bilan aloqani faqat **server** qiladi. Maxfiy kalitlar o‘yin ichida ko‘rinmaydi.
- O‘yin ham, server ham **bitta manzilda** ishlaydi. Siz bitta havolani telefonda ochasiz.

## Nima sinalgan, nima sinalmagan

**Sinalgan** (soxta YouTube va soxta brauzer bilan, kompyuterda): Google login jarayoni, efirni avtomatik topish, eski xabarlarni o‘tkazib yuborish, takror sovg‘ani olib tashlash, internet uzilib qayta ulanish, kvotani hisoblash, parol himoyasi, to‘liq o‘yin leveli, barcha sovg‘a effektlari, sovg‘alar navbati.

**Hali sinalmagan** (sizning haqiqiy akkauntlaringiz kerak): haqiqiy Google login, haqiqiy efir, YouTube yuboradigan sovg‘alarning aniq nomlari, telefon ekranini efirga uzatish, telefonning bir necha soat qizimasdan ishlashi. Shuning uchun birinchi marta kichik sinov efirini qiling, keyin asosiy efirga o‘ting.

## Tayyorgarlik (birinchi marta taxminan 40 daqiqa)

Saytlardagi tugma nomlari ba’zan biroz boshqacha bo‘ladi. Aniq shunday nom topilmasa, eng o‘xshashini tanlang.

### 1-qadam. Fayllarni GitHub’ga yuklash

1. github.com ga kiring va bepul hisob oching.
2. **New repository** ni bosing. Nomi: `snake-live-pro`. **Private** (yopiq) qoldiring. **Create repository** ni bosing.
3. Zip faylni telefonda ochib (Fayllar ilovasi → zip’ni bosib → Extract/Ochish) papkani chiqarib oling.
4. Repozitoriyda **Add file → Upload files** ni bosing va mana bu fayllarni tanlang: `index.html`, `style.css`, `game.js`, `gift-system.js`, `youtube.js`, `panel.js`, `README.md`, `README.uz.md`, `config.example`. Pastdagi **Commit changes** ni bosing.
5. `backend` papkasidagi 2 ta faylni alohida yarating. **Add file → Create new file** ni bosing. Fayl nomi joyiga `backend/server.js` deb yozing (qiya chiziq papkani o‘zi yaratadi). Ichiga `server.js` faylining butun matnini nusxalab qo‘ying va **Commit changes** ni bosing.
6. Xuddi shunday `backend/package.json` faylini yarating.

### 2-qadam. Google Cloud’da ruxsat olish

1. console.cloud.google.com ga kiring (YouTube kanalingiz bog‘langan Google akkaunt bilan).
2. Yuqoridan **yangi loyiha** (New project) yarating, nomi: `Snake LIVE`.
3. **APIs & Services → Library** ga o‘ting. **YouTube Data API v3** ni qidiring va **Enable** ni bosing.
4. **OAuth consent screen** bo‘limiga o‘ting:
   - User type: **External**.
   - Ilova nomi: `Snake LIVE`.
   - **Test users** bo‘limiga o‘z Google pochtangizni qo‘shing.
   - Scope sifatida `youtube.readonly` ni qo‘shing.
5. **Credentials → Create credentials → OAuth client ID** ga o‘ting. Turi: **Web application**. Redirect (qaytish) manzilini hozircha bo‘sh qoldiring.
6. Chiqqan **Client ID** va **Client secret** ni biror yopiq joyga yozib qo‘ying. Ularni hech kimga ko‘rsatmang.

Eslatma: Google “Testing” holatidagi ilovalar uchun kirish ruxsatini taxminan 7 kunga cheklashi mumkin (men bilganimcha). Holat `Error` bo‘lib “login expired” chiqsa, shunchaki **Connect YouTube** ni qayta bosing.

### 3-qadam. Serverga joylash (hosting)

Serverga doimiy ishlaydigan Node.js hosting kerak, chunki u chatni doim kuzatib turadi. Oddiy “serverless funksiyalar” bunga yaramaydi. **Render** (Web Service) misol sifatida mos keladi:

1. render.com da hisob oching va **New → Web Service** ni tanlang. GitHub’dagi `snake-live-pro` repozitoriyasini ulang.
2. Sozlamalar: Runtime: **Node**. **Start Command**: `node backend/server.js`. Build command bo‘sh qoladi.
3. Xizmat yaratilgach Render sizga manzil beradi, masalan `https://snake-live-pro.onrender.com`. Uni nusxalang.
4. **Environment** (muhit o‘zgaruvchilari) bo‘limiga mana bu 4 tasini qo‘shing:
   - `GOOGLE_CLIENT_ID` = 2-qadamdagi Client ID
   - `GOOGLE_CLIENT_SECRET` = 2-qadamdagi Client secret
   - `PUBLIC_URL` = Render bergan manzil (oxirida `/` bo‘lmasin)
   - `ADMIN_PASSWORD` = o‘zingiz o‘ylab topgan uzun parol
5. Saqlang. Render xizmatni qayta ishga tushiradi.

Eslatma: bepul tariflarda xizmat uzoq faol bo‘lmasa uxlab qolishi va qayta ishga tushganda disk tozalanishi mumkin (hosting shartlarini o‘zingiz tekshirib ko‘ring). Saqlangan login yo‘qolsa, **Connect YouTube** ni yana bosasiz.

### 4-qadam. Google’ga qaytish manzilini kiritish

Google Cloud’ga qayting → OAuth mijozingizni oching → **Authorized redirect URIs** → **Add URI** ni bosing va shuni yozing:

`https://snake-live-pro.onrender.com/auth/callback`

(o‘zingizning manzilingiz + `/auth/callback`). Saqlang.

## Birinchi ishga tushirish

1. Telefonda Chrome’da o‘z manzilingizni oching. Birinchi sahifa boshqaruv paneli.
2. **Admin password** joyiga 3-qadamdagi parolni yozing. **Connect YouTube** ni bosing, Google’da kanalingiz akkauntini tanlang va ruxsat bering. O‘yin sahifasiga qaytasiz. Holat `Connected` bo‘lishi kerak.
3. **▶ START GAME** ni bosing.
4. Chrome menyusidan **Add to Home screen** ni bossangiz, ilova kabi to‘liq ekranda ochiladi.

Boshqaruv panelini keyin qayta ochish uchun: **chap yuqori burchakni 1.5 soniya bosib turing**.

## Efirga chiqish

1. YouTube ilovasida odatdagidek jonli efir boshlang (ekranni uzatish orqali).
2. O‘yin faol efirni, uning video ID sini va chatini **o‘zi topadi**. Holat `LIVE Active` bo‘ladi.
3. O‘zi topmasa: efir havolasidan video ID ni nusxalang, panelda **Connect LIVE** bo‘limidagi Video ID joyiga qo‘yib, **Connect LIVE** ni bosing.

## Efirdan oldin sinov ro‘yxati

1. Panel → **Tests** bo‘limi: Test Gift, Test Super Chat, Test Super Sticker, Test Membership Gift, Test Like, Test Subscriber, Queue stress test, Simulate internet loss. Sinov hodisalari `[TEST]` deb belgilanadi va haqiqiy like sonini o‘zgartirmaydi.
2. **Yopiq (unlisted)** qisqa efir qiling: kanal nomi, like va `LIVE Active` holatini tekshiring.
3. **Gift Reader** bo‘limida barcha hodisalar ko‘rinadi. YouTube yuborgan sovg‘a nomi 8 ta o‘yin sovg‘asidan birortasiga mos kelmasa, “Unmapped YouTube gift names” ro‘yxatida chiqadi. Uni **Gift Mapping** bo‘limida kerakli sovg‘aning “YouTube names” joyiga qo‘shing. Sovg‘alar narxiga qarab taxmin qilinmaydi.
4. Sovg‘alar (Jewels) faqat mos kanal va mamlakatlar uchun mavjud (YouTube Studio → Earn bo‘limida tekshiring). Sovg‘a yoqilmagan bo‘lsa, **Allow chat commands** ni yoqing. Tomoshabinlar chatga `!estrella`, `!chuche`, `!moneda`, `!f`, `!gorro`, `!zorro` yozadi. Har tomoshabin 20 soniyada 1 marta yubora oladi. Disco va Super GG bepul buyruq bilan ishlamaydi.

## YouTube nima beradi va nima bermaydi

- **Sovg‘alar, Super Chat, Super Sticker, a’zolik sovg‘alari:** rasmiy hujjatda bor, o‘yin ularni qabul qiladi.
- **Yangi obunachi:** chatda buning uchun xabar turi **yo‘q**. Shuning uchun server kanal obunachilar sonini har daqiqada solishtiradi va taxminiy “yangi obunachi” xabarini chiqaradi (ismsiz, 1 daqiqagacha kechikadi, son yashirin bo‘lsa ishlamaydi).
- **Like:** har 20 soniyada yangilanadi, bir zumda emas.
- **Super Chat va Super Sticker effekti:** darajalar (1–5) o‘yinning o‘z jadvali bo‘yicha Estrella, Chuche, Moneda, Gorro, Zorro ga o‘tadi. Bu YouTube qoidasi emas, bizning o‘yin qoidamiz.

## Kvota (kunlik chegara)

YouTube API kuniga odatda 10 000 birlik beradi. Chat o‘qish har so‘rovda 5 birlik oladi. Standart sozlamada (har 8 soniyada) soatiga taxminan 2 500 birlik ketadi, ya’ni kuniga taxminan **4 soat** efirga yetadi. Paneldagi YouTube bo‘limida sarflangan kvota ko‘rinadi. Uzoqroq efir kerak bo‘lsa, Google’dan kvotani oshirishni so‘rang yoki `CHAT_POLL_MS` qiymatini kattalashtiring.

## Xavfsizlik

- Boshqaruv tugmalari `ADMIN_PASSWORD` bilan himoyalangan. 8 marta xato kiritilsa, 10 daqiqaga bloklanadi.
- Faqat `youtube.readonly` (faqat o‘qish) ruxsati so‘raladi.
- Tomoshabin ismlari faqat oddiy matn sifatida chiqariladi.
- Chatdan faqat `!buyruq` ko‘rinishidagi xabarlar o‘tkaziladi.
- Haqiqiy kalitlarni hech qachon GitHub’ga yoki kodga yozmang. Faqat hosting sozlamalariga kiriting.

## Muammo bo‘lsa

| Holat | Nima qilish kerak |
|---|---|
| Holat `Disconnected`, “Backend not reachable” | O‘yinni fayl sifatida emas, server manzili orqali (https://...) oching. |
| “Not logged in” yoki “login expired” | **Connect YouTube** ni qayta bosing. |
| “ADMIN_PASSWORD is not set” | Hostingda `ADMIN_PASSWORD` o‘zgaruvchisini qo‘shing. |
| Google login sahifasida “redirect_uri_mismatch” | 4-qadamdagi manzil `PUBLIC_URL + /auth/callback` bilan aynan bir xil bo‘lsin. |
| Efir bor, lekin holat `Connected` | **Connect LIVE** bilan video ID ni qo‘lda kiriting. |
| “Daily API quota is used up” | Kvota tugadi. U Tinch okean vaqti bilan yarim tunda yangilanadi. |
| Kamera ochilmadi | Kamera faqat `https://` manzilda ishlaydi va brauzerda ruxsat berilgan bo‘lishi kerak. |

## Fayllar

| Fayl | Vazifasi |
|---|---|
| `index.html`, `style.css` | Sahna (1080x1920) va dizayn |
| `game.js` | O‘yin mexanikasi, tovushlar, musiqa, sovg‘a effektlari |
| `gift-system.js` | 8 ta sovg‘a, navbat, tarix, popuplar, like, sinov hodisalari |
| `youtube.js` | Serverga ulanish, holat, qayta ulanish |
| `panel.js` | Boshqaruv paneli va ilovaning ishga tushishi |
| `backend/server.js` | Google login, efirni topish, chat o‘qish, kvota |
| `backend/test/`, `tests/` | Avtomatik sinovlar |
| `config.example` | Sozlama nomlari namunasi (maxfiy qiymatlarsiz) |

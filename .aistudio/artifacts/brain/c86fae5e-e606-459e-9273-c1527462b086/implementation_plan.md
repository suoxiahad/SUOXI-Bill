# Google Sheets Live Sync Integration (Pre-Consultation & Post-Consultation)

Automated live synchronization of daily Pre-consultation and Post-consultation patient records to Google Sheets via Google Sheets API, organized in monthly spreadsheets with daily date tabs and manageable via the Settings panel.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> Please review the refined structure, exact column mappings, and configuration flow below before approving execution.

- **Spreadsheet Structure (প্রতি মাসের জন্য আলাদা স্প্রেডশিট & প্রতিদিনের জন্য নতুন ট্যাব)**:
  - **মাসিক স্প্রেডশিট**: প্রতি ইংরেজি মাসের জন্য ১টি পৃথক Google Spreadsheet তৈরি হবে (যেমন: `Suoxi Hospital - October 2026`)।
  - **দৈনিক তারিখভিত্তিক ট্যাব**: সেই মাসিক ফাইলের ভেতরে প্রতিদিনের তারিখ অনুযায়ী একটি নতুন ট্যাব/ওয়ার্কশিট তৈরি হবে (যেমন: `2026-10-13` বা `13-10-2026`)।
  - **দৈনিক ট্যাবের ভেতরের বিন্যাস**: প্রতিটি দৈনিক ট্যাবে দুটি আলাদা টেবিল সাজানো থাকবে—
    1. **Pre-Consultation টেবিল** (১০টি নির্দিষ্ট কলাম)
    2. **Post-Consultation টেবিল** (১০টি নির্দিষ্ট কলাম)
- **সরাসরি Google Sheet API দিয়ে লাইভ সেভ ও আপডেট**:
  - অ্যাপে যখনই কোনো প্রি-কনসালটেশন পেশেন্ট কনফার্ম হবে বা পোস্ট-কনসালটেশনে ডাক্তার ডায়াগনোসিস/কমেন্ট/একশন আপডেট করবেন, তখনই ব্যাকগ্রাউন্ডে কোনো ল্যাগ ছাড়াই Google Sheet-এ রিয়েলটাইমে রো যোগ বা আপডেট হবে।
- **Settings কনফিগারেশন প্যানেল**:
  - সেটিংস (Catalog/Settings) পেজে নতুন **"Google Sheets Sync"** ট্যাব থাকবে।
  - সেখান থেকে Google Sheets API সংযোগ (OAuth / API Credentials), স্প্রেডশিট ফোল্ডার, অটো-সিঙ্ক অন/অফ, এবং ম্যানুয়াল টেস্ট সিঙ্ক বাটন থাকবে।
- **কোড এখনই নয়**: পরিকল্পনা অনুমোদনের পর কোড বাস্তবায়ন শুরু হবে।

---

## 1. Overview & Core Concept

### উদ্দেশ্য ও কার্যকারিতা
হাসপাতালের অভ্যর্থনা (Reception) ও ডাক্তারদের কনসালটেশন চেম্বারে রোগী আসার সাথে সাথে এবং কনসালটেশন শেষে তাদের প্রয়োজনীয় ১০টি করে ফিল্ড সরাসরি গুগল শিটে স্বয়ংক্রিয়ভাবে সংরক্ষিত হবে। এতে কোনো ধরনের ম্যানুয়াল এক্সপোর্ট বা ডেটা হারানোর ঝুঁকি থাকবে না।

### মূল বৈশিষ্ট্যসমূহ:
1. **স্বয়ংক্রিয় মাসিক ফাইল ম্যানেজমেন্ট**: প্রতি মাসের শুরুতে নতুন ফাইল তৈরির প্রয়োজন হলে সিস্টেম নিজে থেকে সেই মাসের স্প্রেডশিট ফাইল নিশ্চিত বা তৈরি করবে।
2. **স্বয়ংক্রিয় দৈনিক শিট তৈরি**: প্রতিদিনের প্রথম রোগীর এন্ট্রি হওয়ার সাথে সাথে ঐ দিনের তারিখের নামে নতুন ট্যাব খুলে কলাম হেডার সহ ফরম্যাটেড টেবিল তৈরি হবে।
3. **লাইভ আপডেটিং**: রোগী যদি প্রি-কনসালটেশন থেকে পোস্ট-কনসালটেশনে যায় অথবা ডাক্তারের কমেন্ট পরিবর্তিত হয়, সাথে সাথে সংশ্লিষ্ট শিটের রো-তে তথ্য আপডেট হয়ে যাবে।
4. **জিরো ইউজার ব্লক (Zero UI Freeze)**: ব্যাকগ্রাউন্ড কিউ মেকানিজমের মাধ্যমে অ্যাপ সুপারফাস্ট থাকবে, ব্যাকগ্রাউন্ডে গুগল শিটে ডেটা সিঙ্ক সম্পন্ন হবে।

---

## 2. কলাম ম্যাপিং ও শিট স্ট্রাকচার (Exact Column Specifications)

### ২.১ Pre-Consultation কলামসমূহ (১০টি কলাম)

| Column # | কলামের নাম (Header) | ডেটা ফিল্ডের বিবরণ |
| :---: | :--- | :--- |
| **A** | `SL NO.` | রোগীর দৈনিক প্রি-কনসালটেশন ক্রমিক নং (Daily Serial) |
| **B** | `Patient Name` | রোগীর পূর্ণ নাম |
| **C** | `Phone Number` | রোগীর মোবাইল নাম্বার |
| **D** | `Gender` | রোগীর লিঙ্গ (Male / Female / Other) |
| **E** | `Age` | রোগীর বয়স |
| **F** | `Address` | রোগীর ঠিকানা / জেলা |
| **G** | `disease` | প্রাথমিক চিহ্নিত বা নির্বাচিত রোগ/সমস্যা |
| **H** | `profession` | রোগীর পেশা (Profession) |
| **I** | `doctor` | রেফার্ড বা দায়িত্বপ্রাপ্ত ডাক্তারের নাম |
| **J** | `Consultation Action` | প্রি-কনসালটেশন বর্তমান স্ট্যাটাস/একশন |

---

### ২.২ Post-Consultation কলামসমূহ (১১টি কলাম - কমেন্ট ও ডাক্তার পৃথক কলামে)

| Column # | কলামের নাম (Header) | ডেটা ফিল্ডের বিবরণ |
| :---: | :--- | :--- |
| **A** | `SL NO.` | পোস্ট-কনসালটেশন ক্রমিক নং |
| **B** | `Patient Name` | রোগীর পূর্ণ নাম |
| **C** | `Phone Number` | রোগীর মোবাইল নাম্বার |
| **D** | `Gender` | রোগীর লিঙ্গ |
| **E** | `Age` | রোগীর বয়স |
| **F** | `Address` | রোগীর ঠিকানা |
| **G** | `disease` | ডাক্তার কর্তৃক চূড়ান্ত বা কনফার্মকৃত রোগ |
| **H** | `profession` | রোগীর পেশা |
| **I** | `comment` | ডাক্তারের পরামর্শ বা মন্তব্য (Consultation comment / decision) |
| **J** | `doctor` | কনসালটেশন প্রদানকারী ডাক্তারের নাম (Doctor name) |
| **K** | `Consultation Action` | কনসালটেশনের চূড়ান্ত একশন (Confirmed / Quotation Created / In Consultation) |

---

## 3. Google Sheets ফাইলিং ও লেআউট আর্কিটেকচার

### ৩.১ গুগল ড্রাইভ ও শিট ফাইলিং হায়ারার্কি

```
[Google Drive Account / Clinic Folder]
   │
   ├── Monthly Spreadsheet: "Suoxi Hospital - October 2026"
   │      │
   │      ├── Tab: "2026-10-13" (আজকের তারিখ)
   │      │      ├── Section 1: Pre-Consultation Table (Row 1-N)
   │      │      │     └── [SL NO. | Patient Name | Phone Number | Gender | Age | Address | disease | profession | doctor | Consultation Action] (10 Cols)
   │      │      └── Section 2: Post-Consultation Table (Row N+4...)
   │      │            └── [SL NO. | Patient Name | Phone Number | Gender | Age | Address | disease | profession | comment | doctor | Consultation Action] (11 Cols)
   │      │
   │      ├── Tab: "2026-10-14" (পরবর্তী দিনের নতুন ট্যাব)
   │      └── Tab: "..."
   │
   └── Monthly Spreadsheet: "Suoxi Hospital - November 2026" (পরবর্তী মাসে স্বয়ংক্রিয়ভাবে নতুন ফাইল)
```

---

## 4. Settings কনফিগারেশন প্যানেল ডিজাইন

Settings ট্যাবে একটি নতুন সাব-মেনু থাকবে: **"Google Sheets Integration" (গুগল শিট সিঙ্ক)**

### সেটিংসের অপশনসমূহ:
1. **Google Sheets API Connection Status**:
   - Status Badge: `সংযুক্ত (Active)` / `সংযোগ বিচ্ছিন্ন (Disconnected)`
   - এক ক্লিকে "Connect Google Account / Authorize" বাটন।
2. **Spreadsheet Naming & Folder Setting**:
   - স্প্রেডশিট প্রিফিক্স নাম: যেমন `Suoxi Hospital - {Month} {Year}`
   - তারিখ ফরম্যাট অপশন: `YYYY-MM-DD` (যেমন `2026-10-13`) অথবা `DD-MM-YYYY` (যেমন `13-10-2026`)
   - চলতি মাসের স্প্রেডশিট সরাসরি ওপেন করার লিংক ("Open Current Month Sheet in Google Sheets")
3. **Auto Sync Controls**:
   - `Pre-consultation রোগী কনফার্ম হলে স্বয়ংক্রিয়ভাবে সিঙ্ক হবে` (Toggle Switch)
   - `Post-consultation তথ্য আপডেট হলে সাথে সাথে লাইভ সিঙ্ক হবে` (Toggle Switch)
4. **টেস্টিং ও ব্যাকআপ বাটন**:
   - `Test Connection` বাটন: সাথে সাথে একটি টেস্ট শিট বানিয়ে সংযোগ পরীক্ষা করবে।
   - `Sync Today's All Data Now` বাটন: আজকের সকল প্রি ও পোস্ট কনসালটেশন ডেটা একসাথে শিটে পুশ করবে।
   - লাস্ট সিঙ্কের সময় ও লগ হিস্ট্রি ডিসপ্লে।

---

## 5. টেকনিক্যাল ওয়ার্কফ্লো (Technical Architecture)

```
[ব্যবহারকারী অ্যাকশন]
  │
  ├─ 1. রিসেপশনে রোগীর অ্যাপয়েন্টমেন্ট কনফার্ম ──────┐
  │                                                  ▼
  └─ 2. ডাক্তার কনসালটেশনে রোগ/পেশা/কমেন্ট আপডেট ───> [লোকাল স্টেট ও ডেটাবেজ সেভ (1ms)]
                                                     │
                                                     ▼
                                        [Sheets Sync Queue Engine]
                                                     │
                                                     ├─ Check/Create Month Spreadsheet (e.g. "October 2026")
                                                     ├─ Check/Create Today's Date Tab (e.g. "2026-10-13")
                                                     ├─ Ensure Column Headers (Pre vs Post)
                                                     └─ Google Sheets API v4 Batch Update (Upsert Row)
```

---

## 6. বাস্তবায়ন ধাপসমূহ (Implementation Steps)

1. **ধাপ ১: Google Sheets API ক্লায়েন্ট ও সিঙ্ক সার্ভিস তৈরি (`src/utils/googleSheetsSync.ts`)**
   - মাস ও দিনের শিট খুঁজে বের করা বা স্বয়ংক্রিয়ভাবে তৈরি করার মেথড।
   - Pre-consultation এবং Post-consultation ডেটা ফরম্যাট করে API কলের মাধ্যমে রো যোগ/আপডেট করা।
2. **ধাপ ২: Settings প্যানেলে কনফিগারেশন UI যুক্ত করা (`CatalogSettings.tsx`)**
   - ব্যবহারকারী যাতে সেটিংস থেকে গুগল শিট কানেক্ট, টগল এবং টেস্ট করতে পারে।
3. **ধাপ ৩: প্রি ও পোস্ট কনসালটেশন অ্যাকশনের সাথে ব্যাকগ্রাউন্ড সিঙ্ক যুক্ত করা**
   - অ্যাপয়েন্টমেন্ট কনফার্মেশনের সময় Pre-consultation সিঙ্ক ট্রিগার।
   - কনসালটেশন সেভ বা অ্যাকশন পরিবর্তনের সময় Post-consultation সিঙ্ক ট্রিগার।
4. **ধাপ ৪: ভেরিফিকেশন ও টেস্ট**
   - টেস্ট কানেকশন, রো আপডেট এবং লাইভ সিঙ্কের কার্যকারিতা যাচাই।

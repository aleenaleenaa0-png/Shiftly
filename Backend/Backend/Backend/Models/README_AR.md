# دليل Shiftly للمختبر (عربي)

هذا الملف ملخص سريع. التعليقات التفصيلية داخل ملفات الكود.

## ماذا يفعل التطبيق؟

**Shiftly** يساعد مدير المتجر على جدولة العمال، والعامل على تحديد متى يستطيع العمل.

| الدور | ماذا يرى | ماذا يختبر |
|------|----------|------------|
| **مدير (Manager)** | لوحة أسبوعية + سحب عمال للمناوبات | تسجيل دخول، عرض توفر العمال، تعيين مناوبة، نشر الجدول |
| **عامل (Employee)** | توفره + جدوله النهائي | تسجيل حساب، تحديد توفر، رؤية المناوبات بعد النشر |

## قاعدة البيانات (Microsoft Access)

- `Users` — حسابات المديرين
- `Employees` — العمال
- `Shifts` — 14 مناوبة أسبوعياً (7 أيام × صباح/مساء)
- `Availabilities` — هل العامل متاح لكل مناوبة؟

**رقم الفتحة (Slot 1–14):**  
1=الإثنين صباحاً، 2=الإثنين مساءً، … 14=الأحد مساءً.

## تشغيل للاختبار

1. أغلق Access إن كان مفتوحاً
2. شغّل Backend: `dotnet run` من مجلد `Backend/Backend/Backend`
3. شغّل Frontend: `npm run dev` من مجلد `Frontend`
4. مدير افتراضي: `manager@shiftly.com` / `manager123`

## مسار API الرئيسي

- `POST /api/account/login` — دخول
- `POST /api/account/signup` — تسجيل عامل
- `GET /api/shifts?weekStart=` — مناوبات الأسبوع (للمدير)
- `POST /api/availabilities/set-availability` — عامل يحدد توفره
- `GET /api/availabilities/manager-summary` — المدير يرى توفر الجميع
- `POST /api/shifts/{id}/assign` — تعيين عامل لمناوبة
- `POST /api/schedule/publish` — نشر الجدول للعمال

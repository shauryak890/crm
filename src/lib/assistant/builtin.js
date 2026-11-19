// What Brighty knows without any database row: how to do things in this
// CRM. These ship with the app, so every outlet has them from day one.
// HQ can still override any of them by adding a rule with the same title
// in HQ → Brighty → Price list & rules.
//
// keywords: phrases staff might type (Hinglish included). Matching is
// forgiving about spelling, so each phrase only needs to be listed once.
// go: the page to open with one tap.

export const BUILTIN_RULES = [
  {
    item: "How to make a bill", go: "pos",
    keywords: ["bill kaise", "bill banana", "bill banaye", "new bill", "naya bill", "billing kaise", "order kaise", "new order", "naya order", "how to bill", "make a bill", "create order", "new sale"],
    answer: "Open Point of Sale. Type the customer's phone number (a returning customer's name fills in by itself). Tap each item, choose the service and quantity, then press Pay & Bill (F2) if they pay now, or Save Unpaid (F4) if they'll pay at pickup. Tip: press / to search for an item.",
  },
  {
    item: "Customer will pay later", go: "pos",
    keywords: ["pay later", "baad me payment", "baad mein paisa", "save unpaid", "unpaid bill", "udhar", "udhaar", "pickup pe payment", "payment baad"],
    answer: "On the billing screen press Save Unpaid (F4). The bill is saved with nothing collected. Collect it when they come for pickup: Sales → open the order → Collect.",
  },
  {
    item: "Advance / part payment", go: "pos",
    keywords: ["advance", "advance payment", "part payment", "partial payment", "aadha payment", "thoda payment", "half payment"],
    answer: "On the billing screen, type what they paid in “Amount received” before pressing Pay & Bill. The bill is saved as Partial and the balance shows on the order. Collect the rest later from Sales → open the order → Collect.",
  },
  {
    item: "Collect payment on an old bill", go: "sales",
    keywords: ["collect payment", "payment collect", "payment lena", "paisa lena", "payment kaise le", "record payment", "balance collect", "baki payment", "payment received", "mark paid", "paid kaise"],
    answer: "Open Sales, find the order (or press Ctrl+K and type the bill number or phone), open it and press Collect. Choose how they paid (UPI, cash, card, cheque). You can also collect from the Delivery List when handing the clothes over.",
  },
  {
    item: "Change or correct a bill", go: "sales",
    keywords: ["edit bill", "bill edit", "bill change", "bill galat", "wrong bill", "galat bill", "bill theek", "item add in bill", "bill me item", "correct bill", "edit order", "order edit", "price change in bill"],
    answer: "Sales → open the order → Edit. Only an outlet admin sees the Edit button, and every change is recorded. If you're not an admin, ask your admin to correct it.",
  },
  {
    item: "Cancel or delete a bill", go: "sales",
    keywords: ["cancel order", "order cancel", "bill cancel", "cancel bill", "delete bill", "bill delete", "delete order", "order delete", "cancel kaise", "order hatana", "bill hatana"],
    answer: "Walk-in bills can't be cancelled by staff. An outlet admin can delete a wrong bill: Sales → open the order → Delete (this can't be undone, and it's logged). If the customer just changed their mind about one item, ask the admin to Edit the bill instead.",
  },
  {
    item: "Change the delivery date", go: "sales",
    keywords: ["delivery date change", "change date", "date change", "date badalna", "date aage", "delay", "late hoga", "order late", "due date change", "postpone"],
    answer: "Sales → open the order → Change date. Pick the new date and the reason. You can then send the customer the ready-made WhatsApp message about the delay.",
  },
  {
    item: "Hand over clothes / mark delivered", go: "delivery",
    keywords: ["mark delivered", "delivered kaise", "deliver kaise", "hand over", "handover", "customer ko dena", "kapde dena", "delivery mark", "order complete", "order close"],
    answer: "Open the Delivery List: it shows what's due today and what's overdue. When the customer collects, collect any balance, then mark the order Delivered. Note: an order's damage photos are deleted once it's delivered.",
  },
  {
    item: "Update where an order is", go: "orderstatus",
    keywords: ["order status change", "status change", "status update", "status kaise", "order status kaise", "ready mark", "ready kaise", "move order", "packing", "processing"],
    answer: "Open Order Status. Each order is a card; move it to the next stage (Order Placed → … → Packing & Dispatch → Out for Delivery → Delivered). You can also change the status from Sales by opening the order.",
  },
  {
    item: "Print the invoice or garment tags", go: "sales",
    keywords: ["print bill", "bill print", "invoice print", "print invoice", "tag print", "print tag", "tags", "barcode", "receipt print", "reprint", "dobara print"],
    answer: "Sales → open the order → Invoice / Tags → Print. The invoice opens automatically right after billing too.",
  },
  {
    item: "Tell the customer their order is ready", go: "sales",
    keywords: ["ready message", "ready whatsapp", "customer ko message", "whatsapp message", "inform customer", "customer ko batana", "ready ho gaya message", "pickup message"],
    answer: "Sales → open the order → “Ready” on WhatsApp. WhatsApp opens with the message written; you just press send.",
  },
  {
    item: "Add a customer / save a birthday", go: "customers",
    keywords: ["add customer", "new customer add", "customer add", "customer kaise", "birthday add", "birthday save", "anniversary add", "customer details", "customer edit", "phone change"],
    answer: "A new customer is saved automatically when you make their first bill. To add or edit one yourself, open Customers → Add Customer (or open the customer and edit). Save their birthday and anniversary there so the 15% / 10% offer shows up at billing.",
  },
  {
    item: "Sell a monthly plan", go: "pos",
    keywords: ["sell plan", "plan sell", "plan kaise", "subscription sell", "subscription kaise", "plan bechna", "membership dena", "plan activate", "plan renew", "renew plan"],
    answer: "On Point of Sale, enter the customer's phone number first (they must already be saved). A Sell plan button appears under their name: pick Silver, Gold, Platinum or Elite Family. Their kilos are then deducted automatically on every per-kg bill.",
  },
  {
    item: "Check a customer's plan balance", go: "subscriptions",
    keywords: ["plan balance", "kg left", "kitna kg bacha", "kg bacha", "plan remaining", "subscription balance", "plan khatam", "plan expiry", "plan kab khatam"],
    answer: "Type the customer's phone on Point of Sale: their plan and the kilos left show under their name. The Subscriptions page lists every plan with what's used and when it expires.",
  },
  {
    item: "Add an expense", go: "expenses",
    keywords: ["add expense", "expense add", "kharcha", "kharcha add", "expense kaise", "expense entry", "bill payment entry", "petty cash"],
    answer: "Open Expenses → Add Expense. Enter what it was for, the amount and the date. Admins can edit or delete a wrong entry.",
  },
  {
    item: "Order supplies from HQ", go: "supplies",
    keywords: ["reorder", "stock order", "supply order", "hanger order", "chemical order", "packing material", "stock khatam", "saman mangana", "poly bag", "detergent order", "order to hq"],
    answer: "Open Reorder Stock, enter the quantity next to each item you need and press Send order to HQ. HQ approves and dispatches it; mark it received when it arrives.",
  },
  {
    item: "App orders: weigh before billing", go: "apporders",
    keywords: ["app order", "app orders", "online order", "weigh", "weight kaise", "tolna", "wazan", "at outlet", "driver pickup", "pickup order app"],
    answer: "Orders from the customer app appear in App Orders. When the clothes reach the outlet, weigh them there first: the bill is recalculated from the real weight. Only then move the order to “At outlet”.",
  },
  {
    item: "Item missing on the billing screen", go: "pos",
    keywords: ["item nahi mil raha", "item missing", "product add", "add product", "add item", "new item", "item add kaise", "product nahi hai", "billing me nahi"],
    answer: "Ask me its price first: I'll add it to the bill for you, even if it isn't in the list. An outlet admin can also add it permanently with New item on the billing screen, or in Catalogue.",
  },
  {
    item: "Find a bill or customer fast",
    keywords: ["search", "find bill", "bill dhundna", "order dhundna", "customer dhundna", "search order", "bill number search", "kaise dhunde", "find customer"],
    answer: "Press Ctrl+K anywhere and type the bill number, phone number or name. Or just ask me: type the bill number (like RKP-1073) or the phone number here.",
  },
  {
    item: "Record damage on a garment", go: "pos",
    keywords: ["damage note", "damage photo", "photo kaise", "stain note", "daag note", "phata hua note", "damage record", "garment photo"],
    answer: "On the billing screen, write the stain or tear in the damage note and add a photo (camera button) before saving the bill. It prints on the invoice so the customer has agreed to it.",
  },
  {
    item: "Repeat a customer's last order", go: "pos",
    keywords: ["repeat order", "same order", "last order", "pichla order", "wahi order", "repeat last"],
    answer: "Enter the customer's phone on Point of Sale and tap “Repeat last order” under their name. Their last items are added at today's prices.",
  },
  {
    item: "Give a discount", go: "pos",
    keywords: ["discount kaise", "discount dena", "give discount", "discount add", "manual discount", "extra discount", "chhoot", "discount kitna de"],
    answer: "First-order (25%) and birthday / anniversary offers apply by themselves. For anything else, type the percentage in the Disc box on the billing screen. Don't give extra discounts without your admin's OK.",
  },
  {
    item: "“This day is full” message", go: "pos",
    keywords: ["day full", "din full", "capacity", "full hai", "date full", "250 clothes", "cannot bill date"],
    answer: "Each outlet can process about 250 clothes a day. If the delivery date you picked is full, the billing screen tells you the earliest free day: choose that date and bill again.",
  },
  {
    item: "Login or password problem", go: "settings",
    keywords: ["password", "login", "log in", "sign in", "password bhool", "forgot password", "password change", "login nahi", "account locked"],
    answer: "Change your own password in Settings. If you can't sign in at all, ask your outlet admin: they manage staff logins in System Users.",
  },
];

// Extra rule-style answers that aren't in the database seed.
export const BUILTIN_FACTS = [
  {
    item: "What I can do",
    keywords: ["what can you do", "kya kar sakte", "kya kya", "help", "madad", "features", "how to use you", "tum kya", "aap kya"],
    answer: "Ask me:\n• Any price: “lehenga heavy kitna”, “3 piece suit press”\n• A quote: “120 shirt 60 pant press urgent”, “new customer 2 saree heavy”\n• A rate list: “kids ke sab rate”, “steam press rate list”\n• A rule: pickup, express, offers, plans, delivery time\n• An order or customer: a bill number, phone number or name\n• Today's numbers: “aaj ka sale”, “due today”, “unpaid orders”\n• How to do something here: “bill kaise banaye”, “payment kaise le”\nYou can also send a photo of the garment.",
  },
];

// Extra ways staff ask about rules that live in the database. Added to the
// rule's own keywords when the title matches, so HQ's wording stays theirs.
export const EXTRA_KEYWORDS = {
  "Delivery time": ["delivery kab", "kab hogi", "kab hoga", "kab ready", "ready kab", "kitne din lagenge", "kitna din", "kab tak milega", "kab denge", "wapas kab", "return kab", "time kitna lagega", "kitne ghante"],
  "Free pickup & delivery": ["pickup free", "pickup charge", "delivery charge", "ghar se le jayenge", "ghar aake", "home pickup", "pickup karoge", "pickup available", "lene aaoge", "door step", "doorstep"],
  "Express / urgent orders": ["urgent me kitna", "jaldi chahiye", "ek din me", "one day", "same day delivery", "emergency", "express kitna"],
  "First-order discount": ["discount hai kya", "koi offer", "offer kya hai", "kitna discount", "discount milega", "new customer offer", "pehli baar"],
  "Monthly plans (subscriptions)": ["monthly pack", "mahine ka", "monthly plan", "package kya hai", "plan details", "plan rate", "subscription rate"],
  "Payment methods": ["online payment", "card chalega", "upi chalega", "cash only", "phonepe chalega", "paytm chalega", "qr code", "scan karke"],
  "Damage & stains at the counter": ["daag nahi gaya", "stain nahi", "kapda kharab", "kapda phat gaya", "color nikal gaya", "rang nikal", "shrink", "chhota ho gaya", "damage ho gaya", "complaint", "customer complaint", "compensation"],
  "Helmet cleaning": ["helmet clean", "helmet wash"],
  "Pamphlet ₹99 price": ["99 rupees", "99 me", "99 wala offer", "pamphlet rate"],
  "What to call our service": ["dry cleaning bolna", "service ka naam"],
  "Item not in the list": ["rate nahi pata", "price nahi pata", "kya charge karu", "kitna charge karu", "rate nahi hai"],
};

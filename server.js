const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const ejs = require('ejs');

const app = express();
const PORT = 5000;

// ========== تنظیمات ==========
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use(session({
    secret: 'pharmacy-secret-key-2024',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// ========== دیتابیس ==========
const db = new sqlite3.Database('pharmacy.db');

// ========== توابع کمکی ==========
function hashPassword(password) {
    return bcrypt.hashSync(password, 10);
}

function checkPassword(password, hash) {
    return bcrypt.compareSync(password, hash);
}

function getCurrentDate() {
    return new Date().toISOString();
}

// ========== مقداردهی اولیه دیتابیس ==========
function initDB() {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        is_full_user INTEGER DEFAULT 0,
        pharmacy_display_name TEXT NOT NULL,
        created_at TEXT NOT NULL
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS drugs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        type TEXT NOT NULL,
        priority INTEGER DEFAULT 4,
        created_at TEXT NOT NULL,
        ordered INTEGER DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        company TEXT NOT NULL,
        drug_name TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        ordered_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS inventory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        batch_number TEXT,
        expiry_date TEXT,
        manufacturer TEXT,
        location TEXT,
        created_at TEXT,
        invoice_number TEXT,
        supplier TEXT,
        purchase_price REAL,
        category TEXT DEFAULT 'other',
        FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        drug_name TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        sale_date TEXT,
        expiry_date TEXT,
        invoice_number TEXT,
        customer_name TEXT,
        price REAL,
        location TEXT,
        created_at TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS companies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS exchanges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        buyer_name TEXT NOT NULL,
        drug_name TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        expiry_date TEXT,
        location TEXT,
        exchange_date TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        batch_number TEXT,
        invoice_number TEXT,
        target_pharmacy_id INTEGER DEFAULT NULL,
        category TEXT DEFAULT 'other',
        sender_categories TEXT DEFAULT '',
        my_items_json TEXT DEFAULT '',
        target_items_json TEXT DEFAULT '',
        source_pharmacy_id INTEGER DEFAULT NULL,
        source_pharmacy_name TEXT DEFAULT '',
        FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS user_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE,
        categories TEXT DEFAULT '',
        FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS hidden_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        item_id INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS interviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pharmacist_name TEXT NOT NULL,
        pharmacy_name TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        image_url TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        is_published INTEGER DEFAULT 1,
        views INTEGER DEFAULT 0
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS announcements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        is_active INTEGER DEFAULT 1
    )`);

    // ===== ایجاد کاربران پیش‌فرض =====
    const users = [
        { username: 'admin', password: 'admin123', display: 'مدیر سیستم', is_full: 1 },
        { username: 'nosratabadi', password: 'admin123', display: 'داروخانه نصرت‌آبادی', is_full: 1 },
        { username: 'soleymani', password: 'soleymani123', display: 'داروخانه سلیمانی', is_full: 1 },
        { username: 'A101', password: 'drsaboori', display: 'داروخانه A101', is_full: 1 },
        { username: 'A102', password: 'drjafari', display: 'داروخانه A102', is_full: 1 }
    ];

    users.forEach(u => {
        db.get("SELECT COUNT(*) as count FROM users WHERE username = ?", [u.username], (err, row) => {
            if (!err && row.count === 0) {
                db.run("INSERT INTO users (username, password_hash, is_full_user, pharmacy_display_name, created_at) VALUES (?, ?, ?, ?, ?)",
                    [u.username, hashPassword(u.password), u.is_full, u.display, getCurrentDate()]);
            }
        });
    });

    const companies = ['داروپخش', 'البرز', 'اکسیر', 'رازی'];
    companies.forEach(c => {
        db.run("INSERT OR IGNORE INTO companies (name) VALUES (?)", [c]);
    });

    // ===== ایجاد مصاحبه نمونه =====
    db.get("SELECT COUNT(*) as count FROM interviews", (err, row) => {
        if (!err && row.count === 0) {
            db.run(`INSERT INTO interviews (pharmacist_name, pharmacy_name, title, content, created_at, is_published)
                    VALUES (?, ?, ?, ?, ?, ?)`,
                ['دکتر محمد رضایی', 'داروخانه مرکزی', 'نقش داروساز در جامعه مدرن',
                'داروسازان امروز فراتر از یک توزیع‌کننده دارو هستند.', getCurrentDate(), 1]);
        }
    });
}

// ========== Middleware ==========
function loginRequired(req, res, next) {
    if (!req.session.logged_in) {
        return res.redirect('/login');
    }
    next();
}

function adminRequired(req, res, next) {
    if (!req.session.logged_in) {
        return res.redirect('/login');
    }
    if (req.session.username !== 'admin') {
        return res.status(403).send('⛔ دسترسی غیرمجاز.');
    }
    next();
}

// ========== HTML قالب ==========
const HTML_TEMPLATE = `<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><%= title %></title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Tahoma', sans-serif; background: #f5f5f5; }
        .topbar {
            background: #1a1a1a;
            color: white;
            padding: 8px 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            z-index: 9999;
            flex-wrap: wrap;
            gap: 10px;
        }
        .topbar .brand { font-size: 18px; font-weight: bold; color: white; text-decoration: none; }
        .topbar .brand span { color: #4fc3f7; }
        .topbar .nav-links { display: flex; gap: 15px; align-items: center; flex-wrap: wrap; }
        .topbar .nav-links a {
            color: #e0e0e0;
            text-decoration: none;
            font-size: 13px;
            padding: 4px 10px;
            border-radius: 6px;
            transition: all 0.3s;
        }
        .topbar .nav-links a:hover { background: #333; color: white; }
        .topbar .nav-links .btn-login { background: #4fc3f7; color: #1a1a1a; padding: 4px 16px; border-radius: 6px; font-weight: bold; }
        .topbar .nav-links .btn-register { background: #28a745; color: white; padding: 4px 16px; border-radius: 6px; font-weight: bold; }
        .topbar .nav-links .btn-logout { background: #dc3545; color: white; padding: 4px 14px; border-radius: 6px; }
        .topbar .user-badge { background: #333; padding: 4px 12px; border-radius: 20px; font-size: 12px; color: #aaa; }
        .topbar .user-badge strong { color: white; }
        .sidebar {
            position: fixed;
            right: 0;
            top: 52px;
            width: 220px;
            height: calc(100% - 52px);
            background: #1a1a1a;
            color: white;
            z-index: 1000;
            overflow-y: auto;
        }
        .sidebar-menu { list-style: none; padding: 10px 0; }
        .sidebar-menu a {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 10px 18px;
            color: #e0e0e0;
            text-decoration: none;
            transition: all 0.3s;
            font-size: 13px;
        }
        .sidebar-menu a:hover { background: #333; color: white; }
        .main-content {
            margin-right: 220px;
            margin-top: 52px;
            padding: 20px;
            min-height: calc(100vh - 52px);
        }
        .header {
            background: white;
            border-radius: 12px;
            padding: 12px 20px;
            margin-bottom: 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .page-title { font-size: 18px; font-weight: 600; }
        .card {
            background: white;
            border-radius: 12px;
            padding: 18px;
            margin-bottom: 20px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .card-title {
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 2px solid #e0e0e0;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
            gap: 15px;
            margin-bottom: 20px;
        }
        .stat-card {
            background: white;
            padding: 12px;
            border-radius: 12px;
            text-align: center;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .stat-card .number { font-size: 24px; font-weight: bold; }
        .stat-card .label { color: #666; font-size: 12px; margin-top: 5px; }
        .form-row {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
            margin-bottom: 12px;
            align-items: center;
        }
        .form-row input, .form-row select, .form-row textarea {
            flex: 1;
            min-width: 130px;
            padding: 8px 10px;
            border: 1px solid #ddd;
            border-radius: 8px;
            font-size: 13px;
        }
        button {
            background: #1a1a1a;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 13px;
        }
        .btn-danger { background: #dc3545; }
        .btn-success { background: #28a745; }
        .btn-warning { background: #ffc107; color: #1a1a1a; }
        .btn-sm { padding: 4px 10px; font-size: 11px; }
        .table-responsive { overflow-x: auto; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        table th, table td { padding: 10px 12px; text-align: center; border-bottom: 1px solid #eee; }
        table th { background: #f0f0f0; font-weight: bold; }
        .badge {
            display: inline-block;
            padding: 2px 10px;
            border-radius: 20px;
            font-size: 11px;
        }
        .badge-success { background: #d4edda; color: #155724; }
        .badge-danger { background: #f8d7da; color: #721c24; }
        @media (max-width: 768px) {
            .sidebar { width: 60px; }
            .sidebar .menu-text { display: none; }
            .main-content { margin-right: 60px; padding: 12px; }
        }
    </style>
</head>
<body>
    <div class="topbar">
        <a href="/" class="brand">💊 <span>دارو</span>خانه</a>
        <div class="nav-links">
            <a href="/">🏠 صفحه اصلی</a>
            <% if (session.logged_in) { %>
                <a href="/dashboard">📊 داشبورد</a>
                <a href="/inventory">📦 انبارداری</a>
                <a href="/exchange">🔄 تبادل</a>
                <a href="/deficit">📋 کسری</a>
                <% if (session.username === 'admin') { %>
                    <a href="/admin" style="color:#ffc107;">👑 ادمین</a>
                <% } %>
                <span class="user-badge">👤 <strong><%= session.pharmacy_display_name || session.username %></strong></span>
                <a href="/logout" class="btn-logout">🚪 خروج</a>
            <% } else { %>
                <a href="/login" class="btn-login">🔐 ورود</a>
                <a href="/register" class="btn-register">📝 ثبت‌نام</a>
            <% } %>
        </div>
    </div>
    <div class="sidebar">
        <ul class="sidebar-menu">
            <li><a href="/"><span>🏠</span> <span class="menu-text">صفحه اصلی</span></a></li>
            <% if (session.logged_in) { %>
                <li><a href="/dashboard"><span>📊</span> <span class="menu-text">داشبورد</span></a></li>
                <li><a href="/inventory"><span>📦</span> <span class="menu-text">انبارداری</span></a></li>
                <li><a href="/exchange"><span>🔄</span> <span class="menu-text">تبادل دارو</span></a></li>
                <li><a href="/deficit"><span>📋</span> <span class="menu-text">دفتر کسری</span></a></li>
                <% if (session.username === 'admin') { %>
                    <li><a href="/admin"><span>👑</span> <span class="menu-text">پنل ادمین</span></a></li>
                <% } %>
            <% } %>
        </ul>
    </div>
    <div class="main-content">
        <div class="header">
            <div class="page-title"><%= pageTitle %></div>
            <div class="user-info">
                <% if (session.logged_in) { %>
                    <span>👤 <%= session.pharmacy_display_name || session.username %></span>
                <% } else { %>
                    <span>👤 مهمان</span>
                <% } %>
            </div>
        </div>
        <%- content %>
    </div>
</body>
</html>`;

// ========== روت‌ها ==========

app.get('/', (req, res) => {
    db.all("SELECT * FROM interviews WHERE is_published = 1 ORDER BY created_at DESC", (err, interviews) => {
        db.all("SELECT * FROM announcements WHERE is_active = 1 ORDER BY created_at DESC LIMIT 3", (err2, announcements) => {
            const content = `
                <div class="card">
                    <div class="card-title">🎙️ مصاحبه با داروسازان</div>
                    ${interviews && interviews.length > 0 ? interviews.map(i => `
                        <div style="background:white;border-radius:12px;padding:16px;margin-bottom:15px;border:1px solid #e0e0e0;">
                            <h3>${i.title}</h3>
                            <div style="font-size:12px;color:#666;margin-bottom:10px;">👤 ${i.pharmacist_name} | 🏥 ${i.pharmacy_name} | 📅 ${i.created_at.substring(0,10)}</div>
                            <div style="font-size:14px;line-height:1.8;">${i.content}</div>
                        </div>
                    `).join('') : '<p style="text-align:center;padding:30px;color:#999;">هنوز مصاحبه‌ای ثبت نشده است</p>'}
                </div>
            `;
            res.send(ejs.render(HTML_TEMPLATE, {
                title: 'صفحه اصلی',
                pageTitle: 'صفحه اصلی',
                content: content,
                session: req.session
            }));
        });
    });
});

app.get('/login', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html dir="rtl" lang="fa">
    <head><meta charset="UTF-8"><title>ورود</title>
    <style>
        body { font-family: Tahoma, sans-serif; background: #f5f5f5; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
        .login-box { background: white; padding: 30px; border-radius: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); width: 340px; text-align: center; }
        .login-box h2 { margin-bottom: 20px; color: #1a1a1a; }
        .login-box input { width: 100%; padding: 10px; margin: 10px 0; border: 1px solid #ddd; border-radius: 8px; font-size: 14px; }
        .login-box button { width: 100%; padding: 10px; background: #1a1a1a; color: white; border: none; border-radius: 8px; font-size: 14px; cursor: pointer; }
        .back-link { display: block; margin-top: 15px; color: #007bff; text-decoration: none; }
    </style>
    </head>
    <body>
    <div class="login-box">
        <h2>🏥 ورود</h2>
        <form method="post" action="/login">
            <input type="text" name="username" placeholder="نام کاربری" required>
            <input type="password" name="password" placeholder="رمز عبور" required>
            <button type="submit">ورود</button>
        </form>
        <a href="/" class="back-link">← بازگشت به صفحه اصلی</a>
    </div>
    </body>
    </html>
    `);
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
        if (err || !user || !checkPassword(password, user.password_hash)) {
            return res.send('❌ نام کاربری یا رمز عبور اشتباه است');
        }
        req.session.logged_in = true;
        req.session.user_id = user.id;
        req.session.username = user.username;
        req.session.pharmacy_display_name = user.pharmacy_display_name;
        res.redirect('/');
    });
});

app.get('/register', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html dir="rtl" lang="fa">
    <head><meta charset="UTF-8"><title>ثبت‌نام</title>
    <style>
        body { font-family: Tahoma, sans-serif; background: #f5f5f5; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
        .register-box { background: white; padding: 30px; border-radius: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); width: 340px; text-align: center; }
        .register-box h2 { margin-bottom: 20px; color: #1a1a1a; }
        .register-box input { width: 100%; padding: 10px; margin: 10px 0; border: 1px solid #ddd; border-radius: 8px; font-size: 14px; }
        .register-box button { width: 100%; padding: 10px; background: #28a745; color: white; border: none; border-radius: 8px; font-size: 14px; cursor: pointer; }
        .back-link { display: block; margin-top: 15px; color: #007bff; text-decoration: none; }
    </style>
    </head>
    <body>
    <div class="register-box">
        <h2>📝 ثبت‌نام</h2>
        <form method="post" action="/register">
            <input type="text" name="username" placeholder="نام کاربری" required>
            <input type="password" name="password" placeholder="رمز عبور" required>
            <input type="text" name="pharmacy_name" placeholder="نام داروخانه" required>
            <button type="submit">ثبت‌نام</button>
        </form>
        <a href="/login" class="back-link">← قبلاً ثبت‌نام کرده‌اید؟ ورود</a>
    </div>
    </body>
    </html>
    `);
});

app.post('/register', (req, res) => {
    const { username, password, pharmacy_name } = req.body;
    if (!username || !password || !pharmacy_name) {
        return res.send('❌ همه فیلدها اجباری هستند');
    }
    db.get("SELECT COUNT(*) as count FROM users WHERE username = ?", [username], (err, row) => {
        if (row.count > 0) {
            return res.send('❌ این نام کاربری قبلاً ثبت شده است');
        }
        db.run("INSERT INTO users (username, password_hash, is_full_user, pharmacy_display_name, created_at) VALUES (?, ?, ?, ?, ?)",
            [username, hashPassword(password), 0, pharmacy_name, getCurrentDate()],
            function(err) {
                if (err) return res.send('❌ خطا در ثبت‌نام');
                res.send(`
                <!DOCTYPE html>
                <html dir="rtl" lang="fa">
                <head><meta charset="UTF-8"><title>ثبت‌نام</title>
                <style>
                    body { font-family: Tahoma, sans-serif; background: #f5f5f5; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                    .success-box { background: white; padding: 30px; border-radius: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); width: 340px; text-align: center; }
                    .success-box h2 { color: #28a745; margin-bottom: 15px; }
                    .success-box .back-link { display: block; margin-top: 15px; color: #007bff; text-decoration: none; }
                </style>
                </head>
                <body>
                <div class="success-box">
                    <h2>✅ ثبت‌نام با موفقیت انجام شد</h2>
                    <p>اکنون می‌توانید با نام کاربری خود وارد شوید</p>
                    <a href="/login" class="back-link">🔐 ورود به سیستم →</a>
                </div>
                </body>
                </html>
                `);
            }
        );
    });
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// ========== پنل ادمین ==========

app.get('/admin', adminRequired, (req, res) => {
    db.get("SELECT COUNT(*) as count FROM users", (err, totalUsers) => {
        db.get("SELECT COUNT(*) as count FROM drugs", (err2, totalDrugs) => {
            db.get("SELECT SUM(quantity) as total FROM inventory", (err3, totalInventory) => {
                db.get("SELECT COUNT(*) as count FROM orders", (err4, totalOrders) => {
                    db.get("SELECT COUNT(*) as count FROM exchanges", (err5, totalExchanges) => {
                        db.all("SELECT * FROM users ORDER BY created_at DESC", (err6, users) => {
                            db.all("SELECT * FROM interviews ORDER BY created_at DESC", (err7, interviews) => {
                                db.all("SELECT * FROM announcements ORDER BY created_at DESC", (err8, announcements) => {
                                    const content = `
                                        <div class="stats-grid">
                                            <div class="stat-card"><div class="number">${totalUsers.count}</div><div class="label">👤 کاربران</div></div>
                                            <div class="stat-card"><div class="number">${totalDrugs.count}</div><div class="label">💊 داروهای کسری</div></div>
                                            <div class="stat-card"><div class="number">${totalInventory.total || 0}</div><div class="label">📦 موجودی انبار</div></div>
                                            <div class="stat-card"><div class="number">${totalOrders.count}</div><div class="label">📋 سفارشات</div></div>
                                            <div class="stat-card"><div class="number">${totalExchanges.count}</div><div class="label">🔄 تبادلات</div></div>
                                        </div>
                                        <div class="card">
                                            <div class="card-title">👤 مدیریت کاربران</div>
                                            <div class="table-responsive">
                                                <table>
                                                    <thead><tr><th>#</th><th>نام کاربری</th><th>نام داروخانه</th><th>نقش</th><th>عملیات</th></tr></thead>
                                                    <tbody>
                                                        ${users.map(u => `
                                                            <tr>
                                                                <td>${u.id}</td>
                                                                <td><strong>${u.username}</strong></td>
                                                                <td>${u.pharmacy_display_name}</td>
                                                                <td>${u.username === 'admin' ? '<span class="badge badge-danger">ادمین</span>' : '<span class="badge badge-success">کاربر</span>'}</td>
                                                                <td>${u.username !== 'admin' ? `<button onclick="deleteUser(${u.id})" class="btn-danger btn-sm">🗑️</button>` : 'غیرقابل حذف'}</td>
                                                            </tr>
                                                        `).join('')}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                        <div class="card">
                                            <div class="card-title">🎙️ مدیریت مصاحبه‌ها</div>
                                            <form method="post" action="/admin/add_interview" style="margin-bottom:20px;padding:15px;background:#f8f9fa;border-radius:12px;">
                                                <div class="form-row">
                                                    <input type="text" name="pharmacist_name" placeholder="نام داروساز" required>
                                                    <input type="text" name="pharmacy_name" placeholder="نام داروخانه" required>
                                                    <input type="text" name="title" placeholder="عنوان مصاحبه" required>
                                                </div>
                                                <div class="form-row">
                                                    <textarea name="content" placeholder="متن مصاحبه..." required></textarea>
                                                </div>
                                                <button type="submit" class="btn-success">➕ افزودن مصاحبه</button>
                                            </form>
                                            <div class="table-responsive">
                                                <table>
                                                    <thead><tr><th>عنوان</th><th>داروساز</th><th>وضعیت</th><th>عملیات</th></tr></thead>
                                                    <tbody>
                                                        ${interviews.map(i => `
                                                            <tr>
                                                                <td><strong>${i.title}</strong></td>
                                                                <td>${i.pharmacist_name}</td>
                                                                <td>${i.is_published ? '✅ منتشر شده' : '⏳ پیش‌نویس'}</td>
                                                                <td>
                                                                    <button onclick="toggleInterview(${i.id})" class="btn-warning btn-sm">${i.is_published ? '🔒' : '✅'}</button>
                                                                    <button onclick="deleteInterview(${i.id})" class="btn-danger btn-sm">🗑️</button>
                                                                </td>
                                                            </tr>
                                                        `).join('')}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                        <script>
                                            function deleteUser(id) {
                                                if(!confirm('حذف شود؟')) return;
                                                fetch('/admin/delete_user/'+id, {method:'POST'}).then(()=>location.reload());
                                            }
                                            function deleteInterview(id) {
                                                if(!confirm('حذف شود؟')) return;
                                                fetch('/admin/delete_interview/'+id, {method:'POST'}).then(()=>location.reload());
                                            }
                                            function toggleInterview(id) {
                                                fetch('/admin/toggle_interview/'+id, {method:'POST'}).then(()=>location.reload());
                                            }
                                        </script>
                                    `;
                                    res.send(ejs.render(HTML_TEMPLATE, {
                                        title: 'پنل ادمین',
                                        pageTitle: '👑 پنل ادمین',
                                        content: content,
                                        session: req.session
                                    }));
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});

// ========== روت‌های API ادمین ==========

app.post('/admin/delete_user/:id', adminRequired, (req, res) => {
    const userId = req.params.id;
    db.get("SELECT username FROM users WHERE id = ?", [userId], (err, user) => {
        if (!user || user.username === 'admin') {
            return res.json({ success: false, error: 'نمی‌توان ادمین را حذف کرد' });
        }
        db.run("DELETE FROM users WHERE id = ?", [userId]);
        db.run("DELETE FROM drugs WHERE user_id = ?", [userId]);
        db.run("DELETE FROM inventory WHERE user_id = ?", [userId]);
        db.run("DELETE FROM orders WHERE user_id = ?", [userId]);
        db.run("DELETE FROM sales WHERE user_id = ?", [userId]);
        db.run("DELETE FROM exchanges WHERE user_id = ?", [userId]);
        res.json({ success: true });
    });
});

app.post('/admin/add_interview', adminRequired, (req, res) => {
    const { pharmacist_name, pharmacy_name, title, content } = req.body;
    if (!pharmacist_name || !pharmacy_name || !title || !content) {
        return res.status(400).send('❌ همه فیلدها اجباری هستند');
    }
    db.run(`INSERT INTO interviews (pharmacist_name, pharmacy_name, title, content, created_at, is_published)
            VALUES (?, ?, ?, ?, ?, 1)`,
        [pharmacist_name, pharmacy_name, title, content, getCurrentDate()],
        function(err) {
            if (err) return res.status(500).send('خطا');
            res.redirect('/admin');
        });
});

app.post('/admin/delete_interview/:id', adminRequired, (req, res) => {
    db.run("DELETE FROM interviews WHERE id = ?", [req.params.id], function(err) {
        res.json({ success: !err });
    });
});

app.post('/admin/toggle_interview/:id', adminRequired, (req, res) => {
    db.get("SELECT is_published FROM interviews WHERE id = ?", [req.params.id], (err, interview) => {
        if (!interview) return res.json({ success: false });
        const newStatus = interview.is_published ? 0 : 1;
        db.run("UPDATE interviews SET is_published = ? WHERE id = ?", [newStatus, req.params.id], function(err) {
            res.json({ success: !err });
        });
    });
});

// ========== روت‌های کاربری ==========

app.get('/dashboard', loginRequired, (req, res) => {
    const content = `
        <div class="card">
            <div class="card-title">📊 داشبورد</div>
            <p style="text-align:center;padding:20px;color:#666;">به داشبورد خوش آمدید.</p>
        </div>
    `;
    res.send(ejs.render(HTML_TEMPLATE, {
        title: 'داشبورد',
        pageTitle: '📊 داشبورد',
        content: content,
        session: req.session
    }));
});

app.get('/inventory', loginRequired, (req, res) => {
    db.all("SELECT * FROM inventory WHERE user_id = ? ORDER BY created_at DESC", [req.session.user_id], (err, items) => {
        const content = `
            <div class="card">
                <div class="card-title">📦 لیست انبار</div>
                <div class="table-responsive">
                    <table>
                        <thead><tr><th>#</th><th>نام دارو</th><th>تعداد</th><th>تاریخ انقضا</th><th>مکان</th></tr></thead>
                        <tbody>
                            ${items && items.length > 0 ? items.map((item, index) => `
                                <tr>
                                    <td>${index + 1}</td>
                                    <td><strong>${item.name}</strong></td>
                                    <td>${item.quantity}</td>
                                    <td>${item.expiry_date || '-'}</td>
                                    <td>${item.location === 'warehouse' ? 'انبار' : 'داروخانه'}</td>
                                </tr>
                            `).join('') : '<tr><td colspan="5" style="text-align:center;padding:20px;color:#999;">انبار خالی است</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        res.send(ejs.render(HTML_TEMPLATE, {
            title: 'انبارداری',
            pageTitle: '📦 انبارداری',
            content: content,
            session: req.session
        }));
    });
});

app.get('/exchange', loginRequired, (req, res) => {
    const content = `
        <div class="card">
            <div class="card-title">🔄 تبادل دارو</div>
            <p style="text-align:center;padding:20px;color:#666;">در حال توسعه...</p>
        </div>
    `;
    res.send(ejs.render(HTML_TEMPLATE, {
        title: 'تبادل دارو',
        pageTitle: '🔄 تبادل دارو',
        content: content,
        session: req.session
    }));
});

app.get('/deficit', loginRequired, (req, res) => {
    db.all("SELECT * FROM drugs WHERE user_id = ? ORDER BY created_at DESC", [req.session.user_id], (err, drugs) => {
        const content = `
            <div class="card">
                <div class="card-title">📋 دفتر کسری</div>
                <div class="table-responsive">
                    <table>
                        <thead><tr><th>#</th><th>نام دارو</th><th>تعداد</th><th>نوع</th><th>اولویت</th></tr></thead>
                        <tbody>
                            ${drugs && drugs.length > 0 ? drugs.map((d, index) => `
                                <tr>
                                    <td>${index + 1}</td>
                                    <td><strong>${d.name}</strong></td>
                                    <td>${d.quantity}</td>
                                    <td>${d.type === 'quota' ? 'سهمیه ای' : 'عادی'}</td>
                                    <td>${d.priority}</td>
                                </tr>
                            `).join('') : '<tr><td colspan="5" style="text-align:center;padding:20px;color:#999;">لیست کسری خالی است</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        res.send(ejs.render(HTML_TEMPLATE, {
            title: 'دفتر کسری',
            pageTitle: '📋 دفتر کسری',
            content: content,
            session: req.session
        }));
    });
});

// ========== API ==========

app.get('/api/get_current_user', loginRequired, (req, res) => {
    res.json({
        id: req.session.user_id,
        username: req.session.username,
        pharmacy_display_name: req.session.pharmacy_display_name
    });
});

app.get('/api/get_drugs', loginRequired, (req, res) => {
    db.all("SELECT * FROM drugs WHERE user_id = ? AND ordered = 0 ORDER BY priority ASC", 
        [req.session.user_id], (err, drugs) => {
            res.json({ drugs: drugs || [] });
        });
});

app.get('/api/get_orders', loginRequired, (req, res) => {
    db.all("SELECT * FROM orders WHERE user_id = ? ORDER BY ordered_at DESC", 
        [req.session.user_id], (err, orders) => {
            res.json({ orders: orders || [] });
        });
});

app.post('/api/place_order', loginRequired, (req, res) => {
    const { selected_ids, company, quantities } = req.body;
    if (!selected_ids || selected_ids.length === 0) {
        return res.json({ success: false, error: 'هیچ دارویی انتخاب نشده است' });
    }
    const placeholders = selected_ids.map(() => '?').join(',');
    db.all(`SELECT * FROM drugs WHERE id IN (${placeholders}) AND user_id = ?`, 
        [...selected_ids, req.session.user_id], (err, drugs) => {
            if (err) return res.json({ success: false, error: err.message });
            const stmt = db.prepare("INSERT INTO orders (user_id, company, drug_name, quantity, ordered_at) VALUES (?, ?, ?, ?, ?)");
            drugs.forEach(drug => {
                const qty = quantities && quantities[drug.id] ? parseInt(quantities[drug.id]) : drug.quantity;
                stmt.run(req.session.user_id, company, drug.name, qty, getCurrentDate());
                if (drug.type !== 'quota') {
                    db.run("UPDATE drugs SET ordered = 1 WHERE id = ?", [drug.id]);
                }
            });
            stmt.finalize();
            db.run("DELETE FROM drugs WHERE ordered = 1 AND user_id = ? AND type != 'quota'", [req.session.user_id]);
            res.json({ success: true });
        });
});

app.get('/api/search_with_stock', loginRequired, (req, res) => {
    const q = req.query.q || '';
    db.all(`SELECT DISTINCT name FROM inventory WHERE user_id = ? AND name LIKE ? LIMIT 10`, 
        [req.session.user_id, `%${q}%`], (err, names) => {
            if (!names || names.length === 0) return res.json([]);
            const result = [];
            let completed = 0;
            names.forEach((row) => {
                const name = row.name;
                db.get("SELECT SUM(quantity) as total FROM inventory WHERE user_id = ? AND name = ? AND location = 'warehouse'", 
                    [req.session.user_id, name], (err, warehouse) => {
                        db.get("SELECT SUM(quantity) as total FROM inventory WHERE user_id = ? AND name = ? AND location = 'pharmacy'", 
                            [req.session.user_id, name], (err2, pharmacy) => {
                                result.push({
                                    name: name,
                                    warehouse_qty: warehouse ? warehouse.total || 0 : 0,
                                    pharmacy_qty: pharmacy ? pharmacy.total || 0 : 0
                                });
                                completed++;
                                if (completed === names.length) res.json(result);
                            });
                    });
            });
        });
});

app.post('/api/add_drug', loginRequired, (req, res) => {
    const { name, quantity, type, priority } = req.body;
    if (!name || !quantity) {
        return res.json({ success: false, error: 'نام و تعداد اجباری است' });
    }
    db.run(`INSERT INTO drugs (user_id, name, quantity, type, priority, created_at, ordered)
            VALUES (?, ?, ?, ?, ?, ?, 0)`,
        [req.session.user_id, name, parseInt(quantity), type || 'normal', parseInt(priority) || 4, getCurrentDate()],
        function(err) {
            if (err) return res.json({ success: false, error: err.message });
            res.json({ success: true });
        });
});

app.post('/api/delete_drug/:id', loginRequired, (req, res) => {
    db.run("DELETE FROM drugs WHERE id = ? AND user_id = ?", [req.params.id, req.session.user_id], function(err) {
        res.json({ success: !err });
    });
});

app.post('/api/delete_drugs', loginRequired, (req, res) => {
    const { drug_ids } = req.body;
    if (!drug_ids || drug_ids.length === 0) {
        return res.json({ success: false, error: 'هیچ دارویی انتخاب نشده است' });
    }
    const placeholders = drug_ids.map(() => '?').join(',');
    db.run(`DELETE FROM drugs WHERE id IN (${placeholders}) AND user_id = ?`, 
        [...drug_ids, req.session.user_id], function(err) {
            res.json({ success: !err });
        });
});

app.get('/api/get_all_drugs', loginRequired, (req, res) => {
    db.all("SELECT * FROM drugs WHERE user_id = ? ORDER BY created_at DESC", 
        [req.session.user_id], (err, drugs) => {
            res.json({ drugs: drugs || [] });
        });
});

app.post('/api/delete_inventory/:id', loginRequired, (req, res) => {
    db.run("DELETE FROM inventory WHERE id = ? AND user_id = ?", [req.params.id, req.session.user_id], function(err) {
        res.json({ success: !err });
    });
});

// ========== راه‌اندازی سرور ==========

initDB();

app.listen(PORT, '0.0.0.0', () => {
    console.log('='.repeat(50));
    console.log('✅ داروخانه با موفقیت راه اندازی شد');
    console.log('='.repeat(50));
    console.log(`🌐 آدرس: http://0.0.0.0:${PORT}`);
    console.log('👑 ادمین: admin / admin123');
    console.log('='.repeat(50));
});
